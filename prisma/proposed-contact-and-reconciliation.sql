-- ============================================================================
-- PROPOSED schema changes — NOT APPLIED. Nothing in this file has been run
-- against the live database.
--
-- Context: 53 bookings hold zero guest email addresses, and no income row in
-- the ledger joins to a booking. The reconciliation view added to the owner
-- console works around the second problem by matching on date + amount, which
-- is good enough to audit the past but is guesswork, not a link. These four
-- changes make the link real going forward.
--
-- HOW TO APPLY (owner / whoever owns the database):
--   1. Take a Supabase backup first.
--   2. Run sections 1-4 below. They are additive: every column is nullable
--      or has a default, no existing row changes value, and nothing is
--      dropped or rewritten. The app keeps working untouched while they run.
--   3. THEN edit prisma/schema.prisma to add the matching fields (the exact
--      lines are quoted in each section), and run `prisma generate`.
--      Order matters — adding the Prisma fields BEFORE the columns exist
--      makes every query against these models fail.
--   4. Section 5 is an OPTIONAL backfill. Read its warning before running it.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. ExternalBooking.phone — capture a phone number alongside the email
-- ----------------------------------------------------------------------------
-- Why: Inquiry (site bookings) already requires a phone number; ExternalBooking
-- (every one of the 53 real bookings) has no phone field at all. That asymmetry
-- is the reason platform guests are unreachable even when the owner has their
-- number written down somewhere. For a local leisure business, SMS is the
-- channel guests actually answer, and it survives an email address going stale.
-- Nullable because most historical rows will never get one.

ALTER TABLE public."ExternalBooking" ADD COLUMN "phone" TEXT;

-- prisma/schema.prisma — in model ExternalBooking, next to `email`:
--   phone String? // guest phone, when known — SMS is the channel that actually gets answered


-- ----------------------------------------------------------------------------
-- 2. ExternalBooking.platformRef — the platform's own reservation number
-- ----------------------------------------------------------------------------
-- Why this is the highest-value change of the four: the ledger ALREADY stores
-- these. LedgerEntry.bookingId currently holds values like '4609513' and
-- '4615817' (GetMyBoat) — the platform's reservation numbers, not this app's
-- 'NY-YYYYMMDD-NN' ids. The Boatsetter equivalents ('qqfxxjd', 'pmcmmkl',
-- 'ntwjcqr', 'tcltscm', 'pghstzr', 'svfszld', 'nwkzjmr', 'wnzszjc') exist too,
-- but are buried in prose inside ExternalBooking.note.
--
-- Giving the booking a first-class column for that number means a payout
-- statement row and a booking can be matched on the identifier both systems
-- already agree on, instead of on date-and-amount heuristics. It is also the
-- key the owner can actually look up in the Boatsetter/GetMyBoat dashboard
-- when a figure is disputed at tax time.
--
-- Not UNIQUE: the same reservation can legitimately produce more than one
-- booking row if a charter is split, and a bad paste should not throw a
-- constraint error in the owner's face.

ALTER TABLE public."ExternalBooking" ADD COLUMN "platformRef" TEXT;
CREATE INDEX "ExternalBooking_platformRef_idx" ON public."ExternalBooking" ("platformRef");

-- prisma/schema.prisma — in model ExternalBooking:
--   platformRef String? // the platform's own reservation number, e.g. GetMyBoat "4609513" or Boatsetter "qqfxxjd"
--   @@index([platformRef])


-- ----------------------------------------------------------------------------
-- 3. LedgerEntry.externalBookingId — a real foreign key to the booking
-- ----------------------------------------------------------------------------
-- Why: LedgerEntry.bookingId is free text and is already polluted — it mixes
-- platform reservation numbers with (in exactly one row) an 'NY-' id. Nothing
-- stops a typo, and nothing guarantees the booking it names exists. The
-- console's existing "Profit by booking" panel groups on that free-text field,
-- which is why it currently reports on reservation numbers that match no
-- booking in the system.
--
-- A nullable FK to ExternalBooking.id makes the link checked by the database:
-- a ledger row either points at a booking that exists, or points at nothing.
-- ON DELETE SET NULL so deleting a booking never destroys the financial record
-- of money that was actually received — the row survives, merely unlinked.
--
-- bookingId is deliberately left in place, not renamed or dropped: it is the
-- only record of those platform reservation numbers until section 5 moves them.

ALTER TABLE public."LedgerEntry" ADD COLUMN "externalBookingId" TEXT;

ALTER TABLE public."LedgerEntry"
  ADD CONSTRAINT "LedgerEntry_externalBookingId_fkey"
  FOREIGN KEY ("externalBookingId")
  REFERENCES public."ExternalBooking"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

CREATE INDEX "LedgerEntry_externalBookingId_idx" ON public."LedgerEntry" ("externalBookingId");

-- prisma/schema.prisma:
--   model LedgerEntry {
--     ...
--     externalBookingId String?
--     booking           ExternalBooking? @relation(fields: [externalBookingId], references: [id], onDelete: SetNull)
--     @@index([externalBookingId])
--   }
--   model ExternalBooking {
--     ...
--     ledgerEntries LedgerEntry[]
--   }


-- ----------------------------------------------------------------------------
-- 4. ExternalBooking.marketingOptOut — do not email this guest
-- ----------------------------------------------------------------------------
-- Why: the entire point of collecting these addresses is to market to past
-- guests. The moment that starts, the business needs a record of who asked to
-- be left alone, and it needs to be a column rather than a note someone has to
-- read. An unsubscribe request that lives only in the owner's memory is how a
-- small operator ends up with a CAN-SPAM complaint. Defaults to false so every
-- existing row keeps today's behaviour.

ALTER TABLE public."ExternalBooking"
  ADD COLUMN "marketingOptOut" BOOLEAN NOT NULL DEFAULT false;

-- prisma/schema.prisma — in model ExternalBooking:
--   marketingOptOut Boolean @default(false) // guest asked not to be contacted for marketing


-- ============================================================================
-- 5. OPTIONAL BACKFILL — review before running
-- ============================================================================
-- Moves the Boatsetter reservation reference out of the free-text note and
-- into platformRef, for the 8 rows whose note contains "Booking ID xxxxxxx".
-- Verify with the SELECT first; only run the UPDATE if the output looks right.
--
-- The GetMyBoat rows are NOT backfillable this way — their notes record the
-- listing title, not a reservation number. Those have to come off the GetMyBoat
-- payout statement by hand.

-- Preview:
SELECT "bookingId", "date", "guestName", "platform",
       (regexp_match("note", 'Booking ID ([a-z0-9]+)'))[1] AS extracted_ref,
       "note"
FROM public."ExternalBooking"
WHERE "note" ~ 'Booking ID [a-z0-9]+'
ORDER BY "date";

-- Apply (only after the preview looks correct):
-- UPDATE public."ExternalBooking"
-- SET "platformRef" = (regexp_match("note", 'Booking ID ([a-z0-9]+)'))[1]
-- WHERE "note" ~ 'Booking ID [a-z0-9]+'
--   AND "platformRef" IS NULL;


-- ============================================================================
-- DELIBERATELY NOT PROPOSED
-- ============================================================================
-- * Making ExternalBooking.email UNIQUE or NOT NULL. A repeat guest legitimately
--   has several bookings under one address, and 53 of 53 rows are currently
--   null, so NOT NULL cannot be satisfied without inventing data.
-- * A separate Guest/Customer table keyed on email. It is the right long-term
--   shape, but with zero addresses on file it would be an empty table plus a
--   migration risk. Revisit once a few dozen real addresses have accumulated.
-- * Extra marketing fields (birthday, referral source, preferred vessel).
--   Nothing in the current workflow captures them, so they would ship as
--   permanently-null columns. Add one only when there is a screen that fills it.
