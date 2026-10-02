-- The guest trip page (2 Oct 2026). NOT APPLIED until the owner says yes.
--
-- A live schema change needs his explicit OK and goes in BEFORE the code that
-- needs it: deploy the trip page first and every message a guest writes fails
-- against a table that is not there.
--
-- Additive only. Nothing is dropped, renamed or rewritten; every existing row
-- keeps working, and the old code runs unchanged against the new shape. Safe to
-- run twice (IF NOT EXISTS throughout). Matches prisma/schema.prisma.

-- 1. Messages on a trip page, both ways.
CREATE TABLE IF NOT EXISTS public."TripMessage" (
  "id"        TEXT         NOT NULL,
  "bookingId" TEXT         NOT NULL,
  "fromGuest" BOOLEAN      NOT NULL,
  "author"    TEXT,
  "body"      TEXT         NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readAt"    TIMESTAMP(3),
  "emailedAt" TIMESTAMP(3),
  CONSTRAINT "TripMessage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "TripMessage_bookingId_createdAt_idx"
  ON public."TripMessage" ("bookingId", "createdAt");

-- Every new table gets RLS (see the header of schema.prisma). The app reaches
-- the database through Prisma as the table owner, which RLS does not restrict;
-- this closes the table to Supabase's public API, where it would otherwise be
-- readable with the anon key.
ALTER TABLE public."TripMessage" ENABLE ROW LEVEL SECURITY;

-- 2. Where an upload came from, and the words its sender agreed to.
ALTER TABLE public."GuestUpload" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'share';
ALTER TABLE public."GuestUpload" ADD COLUMN IF NOT EXISTS "consentText" TEXT;
