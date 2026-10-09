const { NextResponse } = require("next/server");
const { isAdminAuthenticated } = require("../../../../lib/auth-guard");
const { prisma } = require("../../../../lib/db");
const { parsePackage } = require("../../../../lib/serialize");
const { availabilityProblem } = require("../../../../lib/availabilityQuery");
const { extensionQuote, endLabel, extensionText } = require("../../../../lib/extendBooking");
const { siteBase } = require("../../../../lib/demo");

// POST { id, extraHours } -- "Add time" on a booking (lib/extendBooking.js).
// Creates the separate charge for the extra hours and returns its /pay link
// and a ready-to-send text. Charges nothing by itself: the guest pays when
// they open the link.
const dynamic = "force-dynamic";

async function POST(req) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const extra = Number(body.extraHours);
  const b = await prisma.externalBooking.findUnique({ where: { id: String(body.id || "") } });
  if (!b) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  if (b.status !== "booked") {
    return NextResponse.json({ error: "Only a booked charter can be extended." }, { status: 400 });
  }

  const pkgRow = b.packageId ? await prisma.package.findUnique({ where: { id: b.packageId } }) : null;
  const pkg = pkgRow ? parsePackage(pkgRow) : null;
  const q = extensionQuote(pkg, { vesselId: b.vesselId, date: b.date, hours: b.hours, extraHours: extra, platform: b.platform });
  if (q.error) return NextResponse.json({ error: q.error }, { status: 400 });

  // Room on the boat that day: the site's own rule (hours already booked plus
  // these must fit the day), then a direct check that nobody else is booked to
  // start inside the added hours.
  const dayProblem = await availabilityProblem({
    pkg, vesselId: b.vesselId, vesselName: b.vesselName, date: b.date, hours: extra, includeHolds: true,
  });
  if (dayProblem) return NextResponse.json({ error: dayProblem.message || "The boat is not free for that long." }, { status: 409 });
  const toMin = (t) => { const m = String(t || "").match(/^(\d{1,2}):(\d{2})$/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  const start = toMin(b.startTime);
  if (start != null) {
    const winFrom = start + Number(b.hours) * 60, winTo = winFrom + extra * 60;
    const others = await prisma.externalBooking.findMany({
      where: { vesselId: b.vesselId, date: b.date, status: "booked", id: { not: b.id } },
      select: { startTime: true, guestName: true },
    });
    const clash = others.find((o) => { const s = toMin(o.startTime); return s != null && s >= winFrom && s < winTo; });
    if (clash) {
      return NextResponse.json({ error: `${clash.guestName || "Another booking"} starts at ${clash.startTime} on this boat, inside the extra time.` }, { status: 409 });
    }
  }

  // A double click must not make two charges.
  const recent = await prisma.inquiry.findFirst({
    where: {
      date: b.date, vesselId: b.vesselId, priceQuoted: q.amount, paymentStatus: "unpaid",
      message: { contains: b.bookingId || b.id }, submittedAt: { gte: new Date(Date.now() - 5 * 60000) },
    },
  });
  const end = endLabel(b.startTime, q.to);
  const label = `Extra ${extra === 1 ? "hour" : extra + " hours"}${end ? ` (to ${end})` : ""}, ${b.packageName || pkg.name}`;
  const ext = recent || await prisma.inquiry.create({
    data: {
      name: b.guestName || "Guest",
      email: b.email || "",
      phone: b.phone || "",
      packageId: b.packageId,
      packageName: label,
      vesselId: b.vesselId,
      vesselName: b.vesselName,
      date: b.date,
      hours: extra,
      partySize: b.partySize != null ? String(b.partySize) : null,
      message: `Add time on ${b.bookingId || b.id}: ${q.from} to ${q.to} hours. ` +
        `$${q.after} for ${q.to} hours less $${q.before} for ${q.from} = $${q.amount}.`,
      priceQuoted: q.amount,
      status: "booked",
      paymentStatus: "unpaid",
      referralSource: "Repeat guest (text)",
    },
  });
  if (!recent) {
    await prisma.externalBooking.update({
      where: { id: b.id },
      data: { note: (b.note ? b.note + "\n" : "") + `Extended by ${extra} h${end ? ` to ${end}` : ""} on ${new Date().toISOString().slice(0, 10)}: billed separately at $${q.amount}, inquiry ${ext.id}.` },
    });
  }
  const url = `${siteBase()}/pay/${ext.id}`;
  return NextResponse.json({
    ok: true, id: ext.id, amount: q.amount, url, end,
    phone: b.phone || null,
    text: extensionText({ guestName: b.guestName, extra, amount: q.amount, end, url }),
  });
}

module.exports = { POST, dynamic };
