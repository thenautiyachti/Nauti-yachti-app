const { NextResponse } = require("next/server");
const { prisma } = require("../../../../lib/db");
const { isAdminAuthenticated } = require("../../../../lib/auth-guard");
const { localDateKey } = require("../../../../lib/pricing");
const { CREW_LIST_PACKAGE_ID } = require("../../../../lib/crewList");

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
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const today = localDateKey(new Date());

  try {
    const thirtyDaysAgo = localDateKey(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));

    const [siteBookings, externalBookings, newInquiries, unpaidConfirmed, maintenanceItems, maxHoursRow, mediaQueueRows, recentLedger, dueSubscriptions] = await Promise.all([
      prisma.inquiry.findMany({
        where: {
          date: { gte: today },
          status: { notIn: ["cancelled", "completed"] },
          OR: [{ status: "booked" }, { paymentStatus: "paid" }],
        },
        select: { name: true, packageName: true, vesselName: true, date: true, hours: true, partySize: true, priceQuoted: true, paymentStatus: true },
        orderBy: { date: "asc" },
        take: 10,
      }),
      prisma.externalBooking.findMany({
        where: { date: { gte: today }, status: "booked" },
        select: { guestName: true, vesselName: true, date: true, startTime: true, hours: true, partySize: true, platform: true },
        orderBy: { date: "asc" },
        take: 10,
      }),
      // Crew-list signups share the Inquiry table (see lib/crewList.js) but
      // are mailing-list contacts, not leads needing a reply — they must not
      // show up on the dashboard as unactioned new inquiries.
      prisma.inquiry.count({ where: { status: "new", packageId: { not: CREW_LIST_PACKAGE_ID } } }),
      prisma.inquiry.count({ where: { status: "booked", paymentStatus: "unpaid" } }),
      prisma.maintenanceItem.findMany({
        select: { label: true, intervalHours: true, intervalMonths: true, lastDoneDate: true, lastDoneHours: true },
      }),
      prisma.engineHoursLog.aggregate({ _max: { hours: true } }),
      // The Jarvis Media Queue panel scrolls through recent drafts of any
      // status, not just pending ones -- the owner wants at least the last
      // three visible so an approved or rejected draft can still be reviewed
      // after the fact.
      prisma.mediaDraft.findMany({
        select: { id: true, theme: true, mediaUrl: true, mediaType: true, caption: true, platform: true, status: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 12,
      }),
      prisma.ledgerEntry.findMany({
        where: { date: { gte: thirtyDaysAgo } },
        select: { type: true, amount: true },
      }),
      prisma.subscription.findMany({
        where: { active: true, nextDueDate: { not: null } },
        select: { name: true, amount: true, billingCycle: true, nextDueDate: true },
        orderBy: { nextDueDate: "asc" },
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
        startTime: null, // site inquiries don't currently capture a start time
        hours: r.hours,
        partySize: r.partySize,
        note: r.paymentStatus === "paid" ? "Paid" : r.paymentStatus,
      })),
      ...externalBookings.map((r) => ({
        source: r.platform,
        name: r.guestName || "Guest",
        label: r.platform,
        vessel: r.vesselName,
        date: r.date,
        startTime: r.startTime,
        hours: r.hours,
        partySize: r.partySize != null ? String(r.partySize) : null,
        note: null,
      })),
    ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)).slice(0, 10);

    // The owner console shows three booking rows at all times. Upcoming
    // charters come first; when there are fewer than three (a quiet stretch
    // between bookings is normal), we pad with the most recently completed
    // ones so the panel is never empty and always gives recent context.
    let panelBookings = bookings.map((b) => ({ ...b, isPast: false }));
    if (panelBookings.length < 3) {
      const need = 3 - panelBookings.length;
      const [pastExternal, pastSite] = await Promise.all([
        prisma.externalBooking.findMany({
          where: { date: { lt: today } },
          select: { guestName: true, vesselName: true, date: true, startTime: true, hours: true, partySize: true, platform: true, status: true },
          orderBy: { date: "desc" },
          take: need,
        }),
        prisma.inquiry.findMany({
          where: { date: { lt: today }, status: "completed" },
          select: { name: true, packageName: true, vesselName: true, date: true, hours: true, partySize: true },
          orderBy: { date: "desc" },
          take: need,
        }),
      ]);
      const past = [
        ...pastExternal.map((r) => ({
          source: r.platform, name: r.guestName || "Guest", label: r.platform, vessel: r.vesselName,
          date: r.date, startTime: r.startTime, hours: r.hours,
          partySize: r.partySize != null ? String(r.partySize) : null,
          note: r.status === "completed" ? null : r.status, isPast: true,
        })),
        ...pastSite.map((r) => ({
          source: "Site", name: r.name, label: r.packageName, vessel: r.vesselName,
          date: r.date, startTime: null, hours: r.hours,
          partySize: r.partySize, note: null, isPast: true,
        })),
      ]
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
        .slice(0, need);
      // Past rows stay newest-first and sit *below* the upcoming ones, so the
      // top of the panel is always the most immediately relevant charter:
      // the next one booked, or failing that the one that just happened.
      panelBookings = [...panelBookings, ...past];
    }

    try {
      const weatherByDate = await fetchLakeConroeWeatherRisk();
      for (const b of panelBookings) {
        const key = bookingDateKey(b.date);
        if (weatherByDate[key]) b.weatherRisk = weatherByDate[key];
      }
    } catch (err) {
      console.error("[dashboard] weather fetch failed, omitting weatherRisk:", err);
    }

    const currentHours = maxHoursRow._max.hours || 0;
    const now = new Date();
    let overdueMaintenance = 0;
    const overdueMaintenanceItems = [];
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
      if (overdue) {
        overdueMaintenance++;
        overdueMaintenanceItems.push(item.label);
      }
    }

    // Last-30-days income/expense pulse, straight off the same LedgerEntry
    // rows the Ledger and Tax Report tabs use — a quick "how's the business
    // doing right now" snapshot for the Jarvis dashboard.
    let revenue30dIncome = 0;
    let revenue30dExpense = 0;
    for (const entry of recentLedger) {
      if (entry.type === "income") revenue30dIncome += Number(entry.amount || 0);
      else if (entry.type === "expense") revenue30dExpense += Number(entry.amount || 0);
    }

    const todayKey = localDateKey(now);
    const subscriptionsDueSoon = dueSubscriptions.map((s) => ({
      name: s.name,
      amount: s.amount,
      billingCycle: s.billingCycle,
      nextDueDate: s.nextDueDate,
      daysUntilDue: Math.round((new Date(s.nextDueDate + "T00:00:00") - new Date(todayKey + "T00:00:00")) / (1000 * 60 * 60 * 24)),
    }));

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
      bookings: panelBookings,
      needsAttention: {
        newInquiries,
        unpaidConfirmed,
        overdueMaintenance,
        overdueMaintenanceItems,
      },
      revenue30d: {
        income: revenue30dIncome,
        expense: revenue30dExpense,
        net: revenue30dIncome - revenue30dExpense,
      },
      subscriptionsDueSoon,
      mediaQueue,
      asOf: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[dashboard] query failed:", err);
    return NextResponse.json({ error: "Query failed", detail: String(err) }, { status: 500 });
  }
}

module.exports = { GET };
