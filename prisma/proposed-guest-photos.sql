-- Our photos of a guest's trip, approved by the owner (2 Oct 2026).
-- APPLIED 2 Oct 2026 on the owner's yes ("Yes you can update the database change"),
-- as Supabase migration "guest_trip_photos", before the code that needs it shipped.
--
-- A live schema change needs his explicit OK and goes in BEFORE the code that
-- needs it. Additive only: one new table, nothing existing touched. Safe to run
-- twice. Matches the TripPhoto model in prisma/schema.prisma.

CREATE TABLE IF NOT EXISTS public."TripPhoto" (
  "id"          TEXT         NOT NULL,
  "charterDate" TEXT         NOT NULL,
  "folder"      TEXT         NOT NULL,
  "fileName"    TEXT         NOT NULL,
  "storagePath" TEXT         NOT NULL,
  "bytes"       INTEGER      NOT NULL DEFAULT 0,
  "bookingRefs" TEXT         NOT NULL,
  "status"      TEXT         NOT NULL DEFAULT 'pending',
  "proposedBy"  TEXT         NOT NULL DEFAULT 'Nauti Coral',
  "note"        TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedAt"   TIMESTAMP(3),
  CONSTRAINT "TripPhoto_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TripPhoto_storagePath_key" ON public."TripPhoto" ("storagePath");
CREATE INDEX IF NOT EXISTS "TripPhoto_charterDate_status_idx" ON public."TripPhoto" ("charterDate", "status");

-- Closed to Supabase's public API, like every table (see schema.prisma's header).
ALTER TABLE public."TripPhoto" ENABLE ROW LEVEL SECURITY;
