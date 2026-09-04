// Turning written shorthand into something a voice can say.
//
// A card is skimmed: you can glance back, and "20 Sept x3" is compact and
// clear. Speech is linear and you cannot glance back at all, so the same line
// came out as "twenty sept x three" and meant nothing. Worse was
// "7 Facebook drafts on BrandCrowd total: 4, 8, 10, 12, 16, 17, 18 Sept",
// which read aloud is a string of bare digits with nothing marking them as
// dates.
//
// This only changes what is SPOKEN. The card text is never touched — the
// shorthand is right where it is.

const MONTHS = {
  jan: "January", feb: "February", mar: "March", apr: "April", may: "May",
  jun: "June", jul: "July", aug: "August", sep: "September", sept: "September",
  oct: "October", nov: "November", dec: "December",
};

const MONTH_ALT = "jan|feb|mar|apr|may|jun|jul|aug|sept|sep|oct|nov|dec";

function ordinal(n) {
  const v = Number(n);
  const tens = v % 100;
  if (tens >= 11 && tens <= 13) return v + "th";
  return v + ({ 1: "st", 2: "nd", 3: "rd" }[v % 10] || "th");
}

function toSpokenForm(text) {
  let t = String(text || "");

  // "x3" -> "3 of them". Read literally it became "x three", which was the
  // single worst thing the voice did.
  t = t.replace(/\b[x×]\s?(\d+)\b/gi, (m, n) => n + " of them");

  // A run of bare days followed by a month is a list of dates. As ordinals it
  // is obviously a list of dates; as digits it is noise.
  t = t.replace(
    new RegExp("\\b(\\d{1,2}(?:\\s*,\\s*\\d{1,2})+)\\s+(" + MONTH_ALT + ")\\b\\.?", "gi"),
    (m, list, mon) => {
      const days = list.split(/\s*,\s*/).map(ordinal);
      const last = days.pop();
      return "the " + days.join(", ") + " and " + last + " of " + MONTHS[mon.toLowerCase()];
    }
  );

  // A single "11 Jul" the same way.
  t = t.replace(
    new RegExp("\\b(\\d{1,2})\\s+(" + MONTH_ALT + ")\\b\\.?", "gi"),
    (m, d, mon) => "the " + ordinal(d) + " of " + MONTHS[mon.toLowerCase()]
  );

  // Dashes are a beat in writing and a stumble in speech.
  t = t.replace(/\s*[—–]\s*/g, ", ").replace(/\s--\s/g, ", ");

  // Shorthand with no spoken form at all. Anchored on word boundaries so
  // "mo" does not eat the middle of "months" and "IG" does not eat a name.
  t = t
    .replace(/\bw\/\b/gi, "with")
    .replace(/\s&\s/g, " and ")
    .replace(/\bIG\b/g, "Instagram")
    .replace(/\bFB\b/g, "Facebook")
    .replace(/\bTT\b/g, "TikTok")
    .replace(/\bhrs?\b/gi, "hours")
    .replace(/\bmo\b/gi, "months");

  // Collapse the punctuation the substitutions leave behind.
  return t.replace(/,\s*,/g, ",").replace(/\s{2,}/g, " ").trim();
}

module.exports = { toSpokenForm, ordinal };
