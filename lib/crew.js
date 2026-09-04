// The crew: who runs on a schedule, when, and what they are for.
//
// These live in code rather than the database because the agents themselves are
// files on the owner's PC (C:\Users\immex\.claude\scheduled-tasks\*\SKILL.md)
// which the browser cannot read. The `name` here must match the name each agent
// logs under, or its runs will not attach to its card.
//
// Only one of them acts outside the business. That is deliberate and worth
// keeping visible, so it is a field rather than a footnote.

// An ElevenLabs voice ID is a public identifier, not a secret, so these live
// here rather than in nine environment variables. They were env vars first, and
// that meant production silently fell back to one shared voice for all eight
// until every one of them had been copied into Vercel by hand -- a feature that
// works locally and is quietly wrong in production is the worst kind. Here they
// deploy with the code. ELEVENLABS_VOICE_<NAME> still overrides, for trying a
// voice without a deploy.
//
// All eight agents are female. The first pass proposed two male voices, which
// the owner had to point out.

// Written shorthand read aloud is a stream of bare numbers. Speech needs the
// words the shorthand stands in for; the cards keep the shorthand.
const { toSpokenForm } = require("./spokenForm");

const CREW = [
  {
    name: "Nauti Pearl",
    voice: "Xb7hH8MSUJpSbSDYk0k2", // Alice
    avatar: "/crew/pearl.jpg",
    greeting: "Morning, Captain",
    title: "Chief of Staff",
    rank: "First Mate",
    taskId: "nauti-pearl",
    schedule: "Every day, 11am",
    job: "Reads the day, and decides what actually reaches you. The other seven report through her.",
    lead: true,
    acts: false,
    accent: "#4FBF8B",
  },
  {
    name: "Nauti Coral",
    voice: "cgSgspJ2msm6clMCkdW9", // Jessica
    avatar: "/crew/coral.jpg",
    greeting: "Fresh off the camera",
    title: "Content Producer",
    rank: "Ship's Photographer",
    taskId: "nauti-coral",
    schedule: "Every day, 8:30am",
    job: "Drafts a social post from real fleet photos, and audits the queue she already built.",
    reportsTo: "Nauti Siren",
    // She gates Coral going out; Coral audits what Siren actually published.
    checks: "Nauti Siren",
    acts: false,
    accent: "#E86AA8",
  },
  {
    name: "Nauti Siren",
    voice: "XB0fDUnXU5powFXDhCwa", // Charlotte
    avatar: "/crew/siren.jpg",
    greeting: "Before it goes live",
    title: "Publishing & Brand Safety",
    rank: "Signals Officer",
    taskId: "nauti-siren",
      // Hourly, not daily. She used to run once at 09:04 and publish anything
      // dated that day, which sent a post the owner had set for 7pm out at nine
      // in the morning. She now runs every hour and publishes only once a post’s
      // own time has come, so most runs find nothing -- the design, not a fault.
      schedule: "Twice a day, 11:15am and 7:15pm",
    job: "The last gate before anything is public. Screens every post, then publishes what passes.",
    acts: true,
    accent: "#CB6CE6",
  },
  {
    name: "Nauti Joy",
    voice: "pFZP5JQG7iQjIQuC4Bku", // Lily
    avatar: "/crew/joy.jpg",
    greeting: "From our guests",
    title: "Guest Relations",
    rank: "Chief Steward",
    taskId: "nauti-joy",
    schedule: "Mondays and Fridays, 9am",
    job: "Guests — who to ask for a review, and who paid for a charter that never ran.",
    acts: false,
    accent: "#FFB454",
  },
  {
    name: "Nauti Penny",
    voice: "XrExE9yKIg1WjnnlVkGX", // Matilda
    avatar: "/crew/penny.jpg",
    greeting: "Books are open",
    title: "Accounts Receivable",
    rank: "Purser",
    taskId: "nauti-penny",
    schedule: "Every day, 8am",
      job: "Money in. Payouts against the ledger, anything paid for that never ran, and she keeps the shared inbox labelled so the others can find things.",
    acts: false,
    accent: "#4FF3FF",
  },
  {
    name: "Nauti Reef",
    voice: "FGY2WhTYpPnrIDTdsKH5", // Laura
    avatar: "/crew/reef.jpg",
    greeting: "Chart's laid out",
    title: "Revenue Growth",
    rank: "Navigator",
    taskId: "nauti-reef",
    schedule: "Mondays and Fridays, 9:30am",
    job: "Looks for money the business is not collecting and proposes what to do about it.",
    acts: false,
    accent: "#7FE0B8",
  },
  {
    name: "Nauti Shelly",
    voice: "EXAVITQu4vr4xnSDxMaL", // Sarah
    avatar: "/crew/shelly.jpg",
    greeting: "The ledger says",
    title: "Accounts Payable",
    rank: "Quartermaster",
    taskId: "nauti-shelly",
    schedule: "Mondays and Fridays, 10am",
    job: "Money out. Compares what is being paid for against what is actually used.",
    acts: false,
    accent: "#E8934A",
  },
  {
    name: "Nauti Nova",
    voice: "SAz9YHcvj6GT2YYXdXww", // River
    avatar: "/crew/nova.jpg",
    greeting: "From the crow's nest",
    title: "Market Research",
    rank: "Lookout",
    taskId: "nauti-nova",
    schedule: "Mondays, 10:30am",
    job: "Standing research for opportunities worth acting on. Reports nothing unless it clears a high bar.",
    // Nova is the one whose silence is correct. Every other agent going quiet
    // is a fault; hers is the design, so the card says so rather than leaving
    // the owner to read an empty week as a broken one.
    quietIsNormal: true,
    acts: false,
    accent: "#8AA2B4",
  },
];

// How each status should read to the owner. "needs-input" is the one that
// matters: it means a run stopped and is waiting on a decision.
const AGENT_STATUS = {
  running: { label: "Working", color: "#4FF3FF" },
  completed: { label: "Done", color: "#7FE0B8" },
  failed: { label: "Failed", color: "#E2685F" },
  "needs-input": { label: "Needs you", color: "#E8934A" },
  idle: { label: "Waiting for next run", color: "var(--muted)" },
  unbuilt: { label: "Not built yet", color: "var(--muted)" },
  // Distinct from "failed": nothing reported an error, the run just stopped.
  stalled: { label: "Stopped mid-run", color: "#E2685F" },
};

// Two letters for the avatar until real images exist: "Nauti Pearl" -> "NP".
function crewInitials(name) {
  const parts = String(name || "").trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return String(name || "?").slice(0, 2).toUpperCase();
}

// Two different things get logged against a crew member, and conflating them
// was the bug this separates out: a RUN is the agent doing its job, a STATUS is
// the daily standup line saying where things stand. A weekly agent has a status
// every morning and a run once a week, and the card needs to show both without
// the standup pretending she ran.
const STATUS_KIND = "status";

const isStatusRow = (a) => a && a.status === STATUS_KIND;

// The newest actual run for an agent, matched on the name it logs under.
function latestRun(activity, name) {
  return (activity || [])
    .filter((a) => a.agentName === name && !isStatusRow(a))
    .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))[0] || null;
}

// The newest standup line for an agent.
// The most recent thing an agent actually said.
//
// This used to look ONLY at rows written by the standup, which meant a real
// finding filed by a RUN was invisible on the card that exists to show it.
// Nova reported a $500k insurance exposure on 4 September and her card still
// read "nothing has cleared the bar" from a standup written the day before.
// The owner spotted it: her card and her research did not line up.
//
// A completed run IS a status in every sense that matters, so whichever is
// newer wins.
function latestStatus(activity, name) {
  const mine = (activity || []).filter((a) => a.agentName === name);
  const newest = (rows) => rows.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))[0] || null;
  const filed = newest(mine.filter((a) => isStatusRow(a)));
  const ran = newest(mine.filter((a) => a.status === "completed" && a.detail));
  if (!filed) return ran;
  if (!ran) return filed;
  return new Date(ran.startedAt) > new Date(filed.startedAt) ? ran : filed;
}

// Standup detail is written as one point per line. Blank lines and stray
// bullet characters are tolerated because eight agents write these by hand.
function statusLines(row) {
  if (!row || !row.detail) return [];
  return String(row.detail)
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*[-*•]\s*/, "").trim())
    .filter(Boolean);
}

// A standup line written before today is last night's news. Say so rather than
// letting a stale line read as this morning's.
function isToday(row) {
  if (!row) return false;
  const d = new Date(row.startedAt);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

// A run that opened a row and never closed it. Agents are killed mid-flight
// more often than they fail cleanly -- the run stops on an unanswered tool
// call and the row is left saying "running" forever, which the console was
// happily reporting as "Working". None of these take an hour.
function isStalled(run) {
  if (!run || run.status !== "running") return false;
  return (Date.now() - new Date(run.startedAt)) / 3600000 > 2;
}

// A run older than roughly two schedule cycles has quietly stopped reporting.
// Silence looks identical to health, which is the failure this catches.
function isStale(run, schedule) {
  if (!run) return false;
  const days = (Date.now() - new Date(run.startedAt)) / 86400000;
  if (/day/i.test(schedule)) return days > 2;
  if (/monday|week/i.test(schedule)) return days > 9;
  if (/month/i.test(schedule)) return days > 38;
  return false;
}

module.exports = {
  toSpokenForm, CREW, AGENT_STATUS, STATUS_KIND, isStatusRow, crewInitials, latestRun, latestStatus, statusLines, isToday, isStale, isStalled };
