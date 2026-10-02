// A booking number is never issued twice — not even after the booking is
// deleted.
//
// Owner, 1 Oct 2026, approving the fix: a deleted booking's number must never
// be given to somebody else. Runs lib/bookingId.js against an in-memory stand-in
// for the three tables it touches, so no database is needed.
const { generateBookingId, rememberBookingId, nextSequence, formatId, prefixFor } = require("../lib/bookingId");

let pass = 0, fail = 0;
function ok(what, got, want) {
  const good = JSON.stringify(got) === JSON.stringify(want);
  console.log("   " + (good ? "ok  " : "FAIL") + "  " + what.padEnd(62) +
    (good ? "" : "\n         got " + JSON.stringify(got) + "  want " + JSON.stringify(want)));
  good ? pass++ : fail++;
}

// Just enough of Prisma for generateBookingId.
function fakeDb({ failMarkWrites = false } = {}) {
  const tables = { inquiry: [], externalBooking: [] };
  const settings = new Map();
  const table = (name) => ({
    findMany: async ({ where }) => tables[name]
      .filter((r) => r.bookingId && r.bookingId.startsWith(where.bookingId.startsWith))
      .map((r) => ({ bookingId: r.bookingId })),
  });
  return {
    tables, settings,
    inquiry: table("inquiry"),
    externalBooking: table("externalBooking"),
    consoleSetting: {
      findUnique: async ({ where }) => (settings.has(where.key) ? { key: where.key, value: settings.get(where.key) } : null),
      upsert: async ({ where, create, update }) => {
        if (failMarkWrites) throw new Error("database unavailable");
        settings.set(where.key, settings.has(where.key) ? update.value : create.value);
      },
    },
    // Create the row the way the routes do: draw a number, then insert.
    async book(kind, date) {
      const bookingId = await generateBookingId(date, this);
      this.tables[kind].push({ id: kind + this.tables[kind].length, bookingId });
      return bookingId;
    },
    remove(bookingId) {
      for (const k of Object.keys(this.tables)) this.tables[k] = this.tables[k].filter((r) => r.bookingId !== bookingId);
    },
  };
}

(async () => {
  const DAY = "2026-10-18";

  console.log("\n  THE SEQUENCE\n");
  ok("format", formatId(prefixFor(DAY), 7), "NY-20261018-07");
  ok("a day past 99 keeps counting", formatId(prefixFor(DAY), 100), "NY-20261018-100");
  ok("next is one past the highest still in the tables",
    nextSequence(["NY-20261018-01", "NY-20261018-03"], prefixFor(DAY), 0), 4);
  ok("  or one past the mark when the mark is higher",
    nextSequence(["NY-20261018-01"], prefixFor(DAY), 5), 6);
  ok("another day's numbers do not count",
    nextSequence(["NY-20261019-09"], prefixFor(DAY), 0), 1);
  ok("no date, no number", await generateBookingId(null, fakeDb()), null);

  console.log("\n  DELETING NEVER FREES A NUMBER\n");
  const db = fakeDb();
  const a = await db.book("inquiry", DAY);
  const b = await db.book("externalBooking", DAY);
  ok("both tables share one counter", [a, b], ["NY-20261018-01", "NY-20261018-02"]);
  db.remove(b);
  const c = await db.book("inquiry", DAY);
  ok("the highest deleted, the next guest does NOT get its number", c, "NY-20261018-03");
  db.remove(a); db.remove(c);
  const d = await db.book("inquiry", DAY);
  ok("every booking that day deleted, still no reuse", d, "NY-20261018-04");
  ok("the mark is kept per day", db.settings.get("bookingIdHigh:NY-20261018"), "4");
  ok("a different day starts at 01", await db.book("inquiry", "2026-10-19"), "NY-20261019-01");

  console.log("\n  A BOOKING NUMBERED BEFORE THE MARK EXISTED\n");
  const old = fakeDb();
  // Rows from before 1 Oct 2026: in the tables, but no mark recorded.
  old.tables.inquiry.push({ id: "x1", bookingId: "NY-20261020-01" }, { id: "x2", bookingId: "NY-20261020-02" });
  await rememberBookingId("NY-20261020-02", old); // what the delete routes do first
  old.remove("NY-20261020-02");
  ok("deleted through the console, its number is still retired", await old.book("inquiry", "2026-10-20"), "NY-20261020-03");
  await rememberBookingId("NY-20261020-01", old);
  ok("remembering a lower number never lowers the mark", old.settings.get("bookingIdHigh:NY-20261020"), "3");
  await rememberBookingId("not-a-booking-number", old);
  ok("a malformed number is ignored", old.settings.size, 1);

  console.log("\n  WHEN THE MARK CANNOT BE WRITTEN\n");
  const broken = fakeDb({ failMarkWrites: true });
  const origError = console.error;
  console.error = () => {};
  const e = await broken.book("inquiry", DAY);
  console.error = origError;
  ok("the booking still gets a number (never refused for this)", e, "NY-20261018-01");

  console.log("\n  " + pass + " passed, " + fail + " failed\n");
  process.exit(fail ? 1 : 0);
})();
