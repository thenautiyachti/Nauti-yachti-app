// A suggested answer to a message written on a trip page. NOTHING HERE SENDS.
//
// Owner, 2 Oct 2026, choosing how the AI handles the trip page's message board:
// "Drafts, you send." So this writes a draft the moment a guest asks something,
// and the owner reads it, changes it if he likes, and presses Send himself.
//
// WHY IT CAN BE INSTANT. A trip page message is about one booking we already
// hold, so the three questions guests actually ask -- what time, where, what do
// we bring -- have their answers on the row. The draft is assembled from the
// same tripView the guest is looking at, never written freehand, so it cannot
// promise anything the page itself does not already say.
//
// WHAT IS HELD. Everything lib/messageTriage.js holds (complaints, safety,
// money already moved, anything unrecognised), and on top of that any question
// about price or availability: on a booked trip those are about changing the
// booking or the bill, which is the owner's conversation to have.
const { triage } = require("./messageTriage");

const ANSWERABLE = ["schedule", "where", "whats-included"];
const MAX = 1000;

function scheduleLine(v) {
  const d = v.directions || {};
  if (!d.startTime) return null;
  let s = "We push off at " + d.startTime + (v.when ? " on " + v.when : "");
  if (d.arriveBy) s += d.glow ? ", with check-in from " + d.arriveBy : ", so please be there by " + d.arriveBy;
  if (d.backAt) s += ", and we're back " + (d.glow ? d.backAt : "around " + d.backAt);
  return s + ".";
}

function whereLine(v) {
  const d = v.directions || {};
  if (d.glow && d.meetingPoint) return "We meet at " + d.meetingPoint + ". " + (d.note || "");
  if (!d.address) return null;
  return "We leave from " + d.address + "."
    + (d.gateByText ? " We'll text you the gate code on the morning of your charter." : "");
}

function includedLine(v) {
  const parts = [];
  if (Array.isArray(v.included) && v.included.length) {
    parts.push("Included: " + v.included.join("; ") + ".");
  }
  if (v.bring && Array.isArray(v.bring.list) && v.bring.list.length) {
    parts.push("Worth bringing: " + v.bring.list.join("; ") + ".");
  } else if (v.bring && v.bring.text) {
    parts.push(v.bring.text);
  }
  return parts.length ? parts.join(" ") : null;
}

/**
 * Returns { action: "draft" | "hold", reason, intents, suggestion }.
 * `reason` is shown to the owner on the thread, so it is written for him.
 */
function draftTripReply(text, view) {
  const v = view || {};
  const t = triage(text, { dateResolved: true });
  if (t.action !== "reply") {
    return { action: "hold", reason: t.reason, intents: t.intents || [], suggestion: null };
  }
  const intents = t.intents || [];
  if (intents.includes("price") || intents.includes("availability")) {
    return {
      action: "hold",
      reason: "it asks about price or another date, which changes the booking or the bill",
      intents, suggestion: null,
    };
  }

  const lines = [];
  for (const id of intents.filter((i) => ANSWERABLE.includes(i))) {
    const line = id === "schedule" ? scheduleLine(v) : id === "where" ? whereLine(v) : includedLine(v);
    if (!line) {
      return {
        action: "hold",
        reason: id === "schedule" ? "there is no start time on this booking to quote"
          : id === "where" ? "there is no meeting point on file for this boat"
          : "there is nothing on file about what this package includes",
        intents, suggestion: null,
      };
    }
    lines.push(line.trim());
  }
  if (!lines.length) {
    return { action: "hold", reason: "nothing in it matches a question the booking can answer", intents, suggestion: null };
  }

  const greeting = "Hi " + (v.firstName || "there") + "! ";
  const suggestion = (greeting + lines.join(" ") + " See you on the water.").slice(0, MAX);
  return { action: "draft", reason: t.reason, intents, suggestion };
}

module.exports = { draftTripReply };
