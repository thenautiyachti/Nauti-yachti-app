// The crew: who runs on a schedule, when, and what they are for.
//
// These live in code rather than the database because the agents themselves are
// files on the owner's PC (C:\Users\immex\.claude\scheduled-tasks\*\SKILL.md)
// which the browser cannot read. The `name` here must match the name each agent
// logs under, or its runs will not attach to its card.
//
// Only one of them acts outside the business. That is deliberate and worth
// keeping visible, so it is a field rather than a footnote.

const CREW = [
  {
    name: "Nauti Pearl",
    avatar: "/crew/pearl.jpg",
    title: "Chief of Staff",
    rank: "First Mate",
    taskId: "daily-exec-review",
    schedule: "Every day, 8:21am",
    job: "Reads the day, and decides what actually reaches you. The other seven report through her.",
    lead: true,
    acts: false,
    accent: "#4FBF8B",
  },
  {
    name: "Nauti Coral",
    avatar: "/crew/coral.jpg",
    title: "Content Producer",
    rank: "Ship's Photographer",
    taskId: "daily-media-agent",
    schedule: "Every day, 9:15am",
    job: "Drafts a social post from real fleet photos, and audits the queue she already built.",
    reportsTo: "Nauti Siren",
    acts: false,
    accent: "#E86AA8",
  },
  {
    name: "Nauti Siren",
    avatar: "/crew/siren.jpg",
    title: "Publishing & Brand Safety",
    rank: "Signals Officer",
    taskId: "daily-social-publisher",
    schedule: "Every day, 9:44am",
    job: "The last gate before anything is public. Screens every post, then publishes what passes.",
    acts: true,
    accent: "#CB6CE6",
  },
  {
    name: "Nauti Joy",
    avatar: "/crew/joy.jpg",
    title: "Guest Relations",
    rank: "Chief Steward",
    taskId: "weekly-review-reminder",
    schedule: "Mondays, 10:21am",
    job: "Guests — who to ask for a review, and who was left hanging without one.",
    acts: false,
    accent: "#FFB454",
  },
  {
    name: "Nauti Penny",
    avatar: "/crew/penny.jpg",
    title: "Accounts Receivable",
    rank: "Purser",
    taskId: "weekly-booking-audit",
    schedule: "Every day, 8:49am",
    job: "Money in. Payouts against the ledger, and anything paid for that never ran.",
    acts: false,
    accent: "#4FF3FF",
  },
  {
    name: "Nauti Reef",
    avatar: "/crew/reef.jpg",
    title: "Revenue Growth",
    rank: "Navigator",
    taskId: "weekly-revenue-ideas",
    schedule: "Mondays, 11:26am",
    job: "Looks for money the business is not collecting and proposes what to do about it.",
    acts: false,
    accent: "#7FE0B8",
  },
  {
    name: "Nauti Shelly",
    avatar: "/crew/shelly.jpg",
    title: "Accounts Payable",
    rank: "Quartermaster",
    taskId: "monthly-spend-audit",
    schedule: "Mondays, 11:44am",
    job: "Money out. Compares what is being paid for against what is actually used.",
    acts: false,
    accent: "#E8934A",
  },
  {
    name: "Nauti Nova",
    avatar: "/crew/nova.jpg",
    title: "Market Research",
    rank: "Lookout",
    taskId: "weekly-nova-research",
    schedule: "Mondays, 12:19pm",
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
function latestStatus(activity, name) {
  return (activity || [])
    .filter((a) => a.agentName === name && isStatusRow(a))
    .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))[0] || null;
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

module.exports = { CREW, AGENT_STATUS, STATUS_KIND, isStatusRow, crewInitials, latestRun, latestStatus, statusLines, isToday, isStale, isStalled };
