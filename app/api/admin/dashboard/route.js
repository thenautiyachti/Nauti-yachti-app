const { NextResponse } = require("next/server");
const { prisma } = require("../../../../lib/db");
const { isAdminAuthenticated } = require("../../../../lib/auth-guard");
const { localDateKey } = require("../../../../lib/pricing");

// pg/Prisma returns "YYYY-MM-DD" date-only columns as plain strings here.
// Take that prefix directly rather than routing through `new Date(str)`
// (which parses as UTC midnight) + local getters — that combo silently
// shifts the date by a day for any timezone behind UTC (i.e. all of the US).
// This exact bug was already found and fixed once in the standalone
// Jarvis-Voice-UI server; don't reintroduce it here.
function bookingDateKey(dateVal) {
  if (typeof dateVal === "string") return dateVal.slice(0, 10);
  return localDateKey(new Date(dateVal));
}

// Lake Conroe, TX
const WEATHER_LAT = 30.3935;
const WEATHER_LON = -95.5836;
const WEATHER_CACHE_MS = 30 * 60 * 1000; // 30 min — plenty fresh for a daily forecast, easy on the free API
let weatherCache = { fetchedAt: 0, byDate: null };

// Thunderstorm WMO codes, and rain codes heavy enough to matter for a charter.
const THUNDERSTORM_CODES = new Set([95, 96, 99]);
const HEAVY_RAIN_CODES = new Set([65, 67, 82]);

// Fetches a 7-day daily forecast for Lake Conroe from Open-Meteo (free, no
// API key) and returns a map of "YYYY-MM-DD" -> { risk, reason }.
async function fetchLakeConroeWeatherRisk() {
  if (weatherCache.byDate && Date.now() - weatherCache.fetchedAt < WEATHER_CACHE_MS) {
    return weatherCache.byDate;
  }

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${WEATHER_LAT}&longitude=${WEATHER_LON}` +
    `&daily=weathercode,windspeed_10m_max,precipitation_probability_max,precipitation_sum` +
    `&timezone=America%2FChicago&forecast_days=7&windspeed_unit=mph`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Open-Meteo request failed: ${res.status}`);
  }
  const data = await res.json();
  const daily = data.daily;
  if (!daily || !Array.isArray(daily.time)) {
    throw new Error("Open-Meteo response missing daily data");
  }

  const byDate = {};
  for (let i = 0; i < daily.time.length; i++) {
    const code = daily.weathercode[i];
    const windMph = daily.windspeed_10m_max[i];
    const precipProb = daily.precipitation_probability_max[i];
    const precipSum = daily.precipitation_sum[i];

    const thunderstorm = THUNDERSTORM_CODES.has(code);
    const heavyRain = HEAVY_RAIN_CODES.has(code) || (precipSum != null && precipSum >= 10);
    const highWind = windMph != null && windMph > 20;

    const reasons = [];
    if (thunderstorm) reasons.push("thunderstorms");
    if (heavyRain) reasons.push(`${precipProb != null ? precipProb + "% " : ""}heavy rain`);
    if (highWind) reasons.push(`wind to ${Math.round(windMph)}mph`);

    byDate[daily.time[i]] = reasons.length
      ? { risk: true, reason: reasons.join(", ") }
      : { risk: false };
  }

  weatherCache = { fetchedAt: Date.now(), byDate };
  return byDate;
}

// GET /api/admin/dashboard -> upcoming confirmed bookings (site + external)
// with a weather-risk flag, a "needs attention" summary, and the pending
// media-draft queue. Ported from the standalone Jarvis-Voice-UI server's
// /api/dashboard handler, querying via this repo's own Prisma client instead
// of raw pg.
async function GET() {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const today = localDateKey(new Date());

  try {
    const [siteBookings, externalBookings, newInquiries, unpaidConfirmed, maintenanceItems, maxHoursRow, mediaQueueRows] = await Promise.all([
      prisma.inquiry.findMany({
        where: {
          date: { gte: today },
          OR: [{ status: "confirmed" }, { paymentStatus: "paid" }],
        },
        select: { name: true, packageName: true, vesselName: true, date: true, partySize: true, priceQuoted: true, paymentStatus: true },
        orderBy: { date: "asc" },
        take: 10,
      }),
      prisma.externalBooking.findMany({
        where: { date: { gte: today }, status: "confirmed" },
        select: { guestName: true, vesselName: true, date: true, partySize: true, platform: true },
        orderBy: { date: "asc" },
        take: 10,
      }),
      prisma.inquiry.count({ where: { status: "new" } }),
      prisma.inquiry.count({ where: { status: "confirmed", paymentStatus: "unpaid" } }),
      prisma.maintenanceItem.findMany({
        select: { label: true, intervalHours: true, intervalMonths: true, lastDoneDate: true, lastDoneHours: true },
      }),
      prisma.engineHoursLog.aggregate({ _max: { hours: true } }),
      prisma.mediaDraft.findMany({
        where: { status: { in: ["pending", "discussing"] } },
        select: { id: true, theme: true, mediaUrl: true, mediaType: true, caption: true, platform: true, status: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ]);

    const bookings = [
      ...siteBookings.map((r) => ({
        source: "Site",
        name: r.name,
        label: r.packageName,
        vessel: r.vesselName,
        date: r.date,
        partySize: r.partySize,
        note: r.paymentStatus === "paid" ? "Paid" : r.paymentStatus,
      })),
      ...externalBookings.map((r) => ({
        source: r.platform,
        name: r.guestName || "Guest",
        label: r.platform,
        vessel: r.vesselName,
        date: r.date,
        partySize: r.partySize != null ? String(r.partySize) : null,
        note: null,
      })),
    ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)).slice(0, 10);

    try {
      const weatherByDate = await fetchLakeConroeWeatherRisk();
      for (const b of bookings) {
        const key = bookingDateKey(b.date);
        if (weatherByDate[key]) b.weatherRisk = weatherByDate[key];
      }
    } catch (err) {
      console.error("[dashboard] weather fetch failed, omitting weatherRisk:", err);
    }

    const currentHours = maxHoursRow._max.hours || 0;
    const now = new Date();
    let overdueMaintenance = 0;
    for (const item of maintenanceItems) {
      if (item.lastDoneHours == null && !item.lastDoneDate) continue;
      let overdue = false;
      if (item.lastDoneHours != null && item.intervalHours != null) {
        if (currentHours - item.lastDoneHours >= item.intervalHours) overdue = true;
      }
      if (item.lastDoneDate && item.intervalMonths != null) {
        const monthsSince = (now - new Date(item.lastDoneDate)) / (1000 * 60 * 60 * 24 * 30.44);
        if (monthsSince >= item.intervalMonths) overdue = true;
      }
      if (overdue) overdueMaintenance++;
    }

    const mediaQueue = mediaQueueRows.map((r) => ({
      id: r.id,
      theme: r.theme,
      mediaUrl: r.mediaUrl,
      mediaType: r.mediaType,
      caption: r.caption,
      captionPreview: r.caption.length > 60 ? `${r.caption.slice(0, 60)}…` : r.caption,
      platform: r.platform,
      status: r.status,
      createdAt: r.createdAt,
    }));

    return NextResponse.json({
      bookings,
      needsAttention: {
        newInquiries,
        unpaidConfirmed,
        overdueMaintenance,
      },
      mediaQueue,
      asOf: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[dashboard] query failed:", err);
    return NextResponse.json({ error: "Query failed", detail: String(err) }, { status: 500 });
  }
}

module.exports = { GET };
