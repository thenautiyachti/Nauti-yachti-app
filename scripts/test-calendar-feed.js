// The bookings calendar feed (lib/calendarFeed.js): which bookings appear,
// what an event says, and that it is valid iCalendar.
//
//   node scripts/test-calendar-feed.js
const path = require("path");
const F = require(path.join(__dirname, "..", "lib", "calendarFeed.js"));
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.log("  FAIL " + n); } };

const today = "2026-10-09";
const ext = [
  { id: "a", date: "2026-10-10", startTime: "10:00", hours: 4, status: "booked", packageName: "Birthday Party", vesselName: "Nauti Explorer", partySize: 9, guestName: "Jamie Rivera", bookingId: "NY-20261010-01", platform: "Website", paymentStatus: "paid", phone: "(936) 555-0101", email: "jamie@example.com" },
  { id: "b", date: "2026-10-11", startTime: "22:00", hours: 3, status: "booked", packageName: "Night Cruise", vesselName: "Nauti Yachti", guestName: "Sam", bookingId: "NY-20261011-01", platform: "Boatsetter", paymentStatus: "unpaid" },
  { id: "c", date: "2026-10-12", status: "cancelled", packageName: "X", vesselName: "Y", guestName: "Gone" },
  { id: "d", date: "2026-08-01", status: "completed", packageName: "Old", vesselName: "Y", guestName: "Past" },
  { id: "e", date: "2026-09-20", status: "completed", startTime: "12:00", hours: 2, packageName: "Recent", vesselName: "Y", guestName: "Recent" },
];
const inq = [
  { id: "i1", date: "2026-10-15", vesselId: "islander", vesselName: "Nauti Islander", status: "booked", packageName: "Party Cove", name: "Taylor Bennett", bookingId: "NY-20261015-01", paymentStatus: "paid", partySize: "6" },
  { id: "i2", date: "2026-10-10", vesselId: "explorer", status: "booked", bookingId: "NY-20261010-01", name: "dup" },
  { id: "i3", date: "2026-10-16", vesselId: "x", status: "new", name: "Just asking" },
];
const ev = F.feedEvents({ externalBookings: ext, inquiries: inq, today });
const ids = ev.map((e) => e.uid);
ok("booked website and platform bookings appear", ids.includes("ext-a") && ids.includes("ext-b"));
ok("cancelled bookings drop out", !ids.includes("ext-c"));
ok("older than 30 days drops out", !ids.includes("ext-d"));
ok("recent completed charters stay", ids.includes("ext-e"));
ok("text-message bookings appear", ids.includes("inq-i1"));
ok("an enquiry already in the diary is not doubled", !ids.includes("inq-i2"));
ok("plain enquiries are not bookings", !ids.includes("inq-i3"));

const ics = F.buildIcs(ev, { now: new Date("2026-10-09T15:00:00Z") });
ok("is a calendar", ics.startsWith("BEGIN:VCALENDAR\r\n") && ics.trim().endsWith("END:VCALENDAR"));
ok("CRLF line endings only", !/[^\r]\n/.test(ics));
ok("no line longer than 75 octets", ics.split("\r\n").every((l) => Buffer.byteLength(l) <= 75));
ok("timed event in Lake Conroe time", ics.includes("DTSTART;TZID=America/Chicago:20261010T100000") && ics.includes("DTEND;TZID=America/Chicago:20261010T140000"));
ok("late charter rolls past midnight", ics.includes("DTEND;TZID=America/Chicago:20261012T010000"));
ok("no start time -> all-day", ics.includes("DTSTART;VALUE=DATE:20261015") && ics.includes("DTEND;VALUE=DATE:20261016"));
const unfolded = ics.replace(/\r\n /g, "");
ok("summary shows package, boat and party", unfolded.includes("SUMMARY:Birthday Party · Nauti Explorer (9 guests)"));
ok("first name only", unfolded.includes("Guest: Jamie") && !unfolded.includes("Rivera"));
ok("no phone or email in the feed", !unfolded.includes("555-0101") && !unfolded.includes("example.com"));
ok("booking number in the description", unfolded.includes("Booking: NY-20261010-01"));

const saved = process.env.SESSION_SECRET;
process.env.SESSION_SECRET = "test-secret";
const t = F.feedToken();
ok("token is 32 hex", /^[0-9a-f]{32}$/.test(t));
ok("right token accepted", F.tokenMatches(t));
ok("wrong token refused", !F.tokenMatches(t.replace(/.$/, t.endsWith("0") ? "1" : "0")) && !F.tokenMatches("") && !F.tokenMatches(undefined));
delete process.env.SESSION_SECRET;
ok("no secret, no feed", F.feedToken() === null && !F.tokenMatches(t));
if (saved !== undefined) process.env.SESSION_SECRET = saved;

console.log(`  calendar feed: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
