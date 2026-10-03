// Our photos of a guest's trip: the rules both sides share. No database here.
//
// Owner, 2 Oct 2026: guests should see the photos of their completed trip that
// are "good enough to publish". Coral proposes, he approves, and only approved
// ones reach the trip page. Photos only for now: the free storage plan holds
// 1 GB, and recap videos would fill it within a season.

// Web-sized copies live in the private guest-uploads bucket under this prefix.
// scripts/pull-guest-uploads.js only ever touches GuestUpload rows, so nothing
// here is pulled to the PC or deleted by it.
const PREFIX = "trip-photos/";

// A charter's worth, not its whole camera roll. Enough for a good gallery and
// little enough that he will actually look at each one before approving.
const MAX_PER_CHARTER = 40;

// The library's own markers for media that may never be published. Same
// pattern as Crew/_Scripts/media-guard.js, which is the definition; repeated
// here because the app cannot load a crew script. Add to both, never one.
const FORBIDDEN = /\bNDA\b|NO MEDIA|DO NOT POST|NOT FOR (?:POST|PUBLIC|USE)|\bNOT USED?\b/i;

function isRestricted(folder, fileName) {
  return FORBIDDEN.test(String(folder || "")) || FORBIDDEN.test(String(fileName || ""));
}

// ",NY-20260919-03,NY-20260919-04," -- comma-wrapped so a contains-match on
// ",<ref>," can never match NY-20260919-0 inside NY-20260919-03.
function refsField(refs) {
  const list = [...new Set((refs || []).map((r) => String(r).trim().toUpperCase()).filter(Boolean))].sort();
  return list.length ? "," + list.join(",") + "," : "";
}

function refsList(field) {
  return String(field || "").split(",").map((s) => s.trim()).filter(Boolean);
}

function refNeedle(ref) {
  return "," + String(ref || "").trim().toUpperCase() + ",";
}

function photoPathFor(charterDate, id) {
  return PREFIX + charterDate + "/" + id + ".jpg";
}

// Photos only, and only what a browser can show. HEIC and video wait.
function acceptableName(fileName) {
  return /\.(jpe?g|png)$/i.test(String(fileName || ""));
}

// Which of a date's completed bookings a charter folder's photos belong to.
// Two separate charters on one date each have their own folder, named after
// its guest (owner, 3 Oct 2026: "Chance and Ivy ... are two separate
// bookings"). So when a date has several bookings, a photo goes only to those
// whose guest the folder names. A folder naming none of them, a glow night's
// "Boatz and Glowz second run", is everyone's night, and goes to them all.
const NOT_A_NAME = new Set(["and", "the", "with", "for", "crew", "party", "night", "outing"]);
function nameWords(s) {
  return String(s || "").toLowerCase().split(/[^a-z0-9']+/).filter((w) => w.length > 2 && !NOT_A_NAME.has(w));
}
function bookingsForFolder(folder, bookings) {
  const list = bookings || [];
  if (list.length < 2) return list;
  // "2026-08-15 Chance (birthday, party cove)" -> "Chance": the date and the
  // bracketed tags are not names.
  const words = new Set(nameWords(String(folder || "").replace(/^\d{4}-\d{2}-\d{2}\s*/, "").replace(/\s*[([].*$/, "")));
  const named = list.filter((b) => nameWords(b.guestName).some((w) => words.has(w)));
  return named.length ? named : list;
}

// Who will see a photo, said plainly before he approves it. One booking is the
// normal case. Several on one date are fine for a seat-sale night (everyone was
// on the same boats); several private charters on one date mean two parties
// would see each other's photos, and he should know that before he says yes.
function sharingWarning(bookings) {
  const list = bookings || [];
  if (list.length < 2) return null;
  const privateOnes = list.filter((b) => !/glow/i.test(String(b.packageName || "")));
  if (privateOnes.length < 2) return null;
  return "Visible to " + list.length + " separate bookings on this date. Approve only if they were one party.";
}

module.exports = {
  PREFIX, MAX_PER_CHARTER, FORBIDDEN,
  isRestricted, refsField, refsList, refNeedle, photoPathFor, acceptableName, sharingWarning,
  bookingsForFolder,
};
