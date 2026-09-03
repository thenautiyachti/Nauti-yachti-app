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
    taskId: "daily-exec-review",
    schedule: "Every day, 8:21am",
    job: "Reads the day — new enquiries, maintenance, unpaid bookings, and what is on the calendar.",
    acts: false,
    accent: "#4FBF8B",
  },
  {
    name: "Nauti Coral",
    avatar: "/crew/coral.jpg",
    taskId: "daily-media-agent",
    schedule: "Every day, 9:15am",
    job: "Drafts a social post from real fleet photos. Never posts anything herself.",
    acts: false,
    accent: "#E86AA8",
  },
  {
    name: "Nauti Siren",
    avatar: "/crew/siren.jpg",
    taskId: "daily-social-publisher",
    schedule: "Every day, 9:44am",
    job: "Publishes the scheduled posts that are due, to TikTok, Instagram and Facebook.",
    acts: true,
    accent: "#CB6CE6",
  },
  {
    name: "Nauti Joy",
    avatar: "/crew/joy.jpg",
    taskId: "weekly-review-reminder",
    schedule: "Mondays, 10:21am",
    job: "Works out which past guests to ask for a Google review, and emails you the list.",
    acts: false,
    accent: "#FFB454",
  },
  {
    name: "Nauti Penny",
    avatar: "/crew/penny.jpg",
    taskId: "weekly-booking-audit",
    schedule: "Mondays, 10:54am",
    job: "Reads Boatsetter and GetMyBoat email and flags any booking or payout missing from the ledger.",
    acts: false,
    accent: "#4FF3FF",
  },
  {
    name: "Nauti Reef",
    avatar: "/crew/reef.jpg",
    taskId: "weekly-revenue-ideas",
    schedule: "Mondays, 11:26am",
    job: "Looks for money the business is not collecting and proposes what to do about it.",
    acts: false,
    accent: "#7FE0B8",
  },
  {
    name: "Nauti Shelly",
    avatar: "/crew/shelly.jpg",
    taskId: "monthly-spend-audit",
    schedule: "4th of the month, 11:40am",
    job: "Compares what is being paid for against what is actually used.",
    acts: false,
    accent: "#E8934A",
  },
  {
    name: "Nauti Nova",
    avatar: "/crew/nova.jpg",
    taskId: null, // not built yet
    schedule: "Not built yet",
    job: "Standing research for opportunities worth acting on. Reports nothing unless it clears a high bar.",
    acts: false,
    accent: "#8AA2B4",
    pending: true,
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
};

// Two letters for the avatar until real images exist: "Nauti Pearl" -> "NP".
function crewInitials(name) {
  const parts = String(name || "").trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return String(name || "?").slice(0, 2).toUpperCase();
}

// The newest run for an agent, matched on the name it logs under.
function latestRun(activity, name) {
  return (activity || [])
    .filter((a) => a.agentName === name)
    .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))[0] || null;
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

module.exports = { CREW, AGENT_STATUS, crewInitials, latestRun, isStale };
