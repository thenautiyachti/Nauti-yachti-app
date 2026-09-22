// Is the queue about to say the same thing twice?
//
//     node scripts/check-queue-repetition.js
//     node scripts/check-queue-repetition.js --days 45
//
// Owner, 21 Sep 2026: "it seems like we keep repeating some posts." He is
// right, and he had already been saying so through the proper channel -- four
// drafts rejected with reviewReason "repetitive", one of them noted "We may
// have already posted this." Nothing read those, and nothing compared a new
// draft against what was queued or already out, so the same observation had to
// be made by hand every time.
//
// On the morning this was written the queue ran: 22 Sep tubing, 23 Sep tubing,
// 26 Sep tubing, 27 Sep tubing. Four of the next six days, plus two captions
// that were nearly the same sentence -- "Got a Saturday open this month?" and
// "Got a Saturday and no plan?".
//
// WHAT COUNTS AS A REPEAT, and what deliberately does not. One post goes out on
// Facebook, Instagram and TikTok, so the SAME media on the SAME date is the
// design, not a fault. It is the same media on DIFFERENT dates, the same theme
// stacked across consecutive days, and two captions that open the same way that
// are worth a look.
//
// This reports. It changes nothing -- which draft dies is the owner's call, and
// "repetitive" is already one of the reasons he can give.
require("C:/Users/immex/Documents/_MyFiles/Jarvis-Voice-UI/paths.js").loadSecrets();
const { PrismaClient } = require("../node_modules/@prisma/client");
const db = new PrismaClient();

const argv = process.argv.slice(2);
const DAYS = Number((argv[argv.indexOf("--days") + 1] || 0)) || 30;

// The opening of a caption, stripped to words. Two posts that begin the same
// way read as the same post however differently they end.
function opener(caption) {
  return String(caption || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 7)
    .join(" ");
}

const line = (s) => console.log("  " + s);

(async () => {
  const since = new Date(Date.now() - DAYS * 86400000).toISOString().slice(0, 10);
  const rows = await db.mediaDraft.findMany({
    where: {
      OR: [
        { status: { in: ["proposed", "approved", "scheduled"] } },
        { status: "posted", postedAt: { gte: new Date(since) } },
      ],
    },
    orderBy: [{ scheduledDate: "asc" }, { createdAt: "asc" }],
  });

  const live = rows.filter((r) => r.status !== "posted");
  const posted = rows.filter((r) => r.status === "posted");
  console.log("\n  " + live.length + " queued, " + posted.length + " posted in the last " + DAYS + " days\n");

  let findings = 0;

  // --- the same clip or picture on more than one DATE --------------------------
  const byMedia = new Map();
  for (const r of rows) {
    if (!r.mediaUrl) continue;
    if (!byMedia.has(r.mediaUrl)) byMedia.set(r.mediaUrl, []);
    byMedia.get(r.mediaUrl).push(r);
  }
  for (const [url, list] of byMedia) {
    // Same date across platforms is the intended fan-out.
    const dates = [...new Set(list.map((r) => r.scheduledDate || (r.postedAt || "").toString().slice(0, 10)))].filter(Boolean);
    if (dates.length < 2) continue;
    findings++;
    console.log("  SAME MEDIA ON " + dates.length + " DIFFERENT DATES");
    line("  " + url.slice(-44));
    for (const r of list) {
      line("    " + String(r.scheduledDate || "(posted " + String(r.postedAt).slice(0, 10) + ")").padEnd(22)
        + String(r.status).padEnd(10) + String(r.platform).padEnd(10)
        + String(r.caption).replace(/\s+/g, " ").slice(0, 48));
    }
    console.log("");
  }

  // --- the same theme stacked on consecutive days ------------------------------
  const byDate = new Map();
  for (const r of live) {
    if (!r.scheduledDate) continue;
    if (!byDate.has(r.scheduledDate)) byDate.set(r.scheduledDate, new Set());
    byDate.get(r.scheduledDate).add(r.theme || "(none)");
  }
  const days = [...byDate.keys()].sort();
  let run = [];
  const flushRun = () => {
    if (run.length >= 3) {
      findings++;
      console.log("  THE SAME THEME " + run.length + " DAYS RUNNING: " + run[0].theme);
      for (const d of run) line("    " + d.date);
      console.log("");
    }
    run = [];
  };
  for (const d of days) {
    const themes = [...byDate.get(d)];
    const theme = themes.length === 1 ? themes[0] : null;
    if (theme && run.length && run[run.length - 1].theme === theme) run.push({ date: d, theme });
    else { flushRun(); if (theme) run = [{ date: d, theme }]; }
  }
  flushRun();

  // --- captions that open the same way -----------------------------------------
  const byOpener = new Map();
  for (const r of rows) {
    const o = opener(r.caption);
    if (o.split(" ").length < 4) continue;
    if (!byOpener.has(o)) byOpener.set(o, []);
    byOpener.get(o).push(r);
  }
  for (const [o, list] of byOpener) {
    const dates = [...new Set(list.map((r) => r.scheduledDate || String(r.postedAt).slice(0, 10)))].filter(Boolean);
    if (dates.length < 2) continue;
    findings++;
    console.log("  TWO CAPTIONS OPEN THE SAME WAY");
    line('  "' + o + '..."');
    for (const r of list) {
      line("    " + String(r.scheduledDate || "(posted)").padEnd(22) + String(r.status).padEnd(10) + String(r.platform));
    }
    console.log("");
  }

  // --- what he already told us, which nothing was reading ----------------------
  const flagged = await db.mediaDraft.findMany({
    where: { reviewReason: "repetitive" },
    orderBy: { reviewedAt: "desc" },
    take: 8,
  });
  if (flagged.length) {
    console.log("  HE HAS ALREADY CALLED " + flagged.length + " OF THESE REPETITIVE");
    for (const r of flagged) {
      line("    " + String(r.reviewedAt).slice(4, 16) + "  " + String(r.platform).padEnd(10)
        + String(r.caption).replace(/\s+/g, " ").slice(0, 46)
        + (r.reviewNote ? "   [" + r.reviewNote.slice(0, 34) + "]" : ""));
    }
    console.log("");
  }

  console.log("  " + (findings ? findings + " thing(s) worth a look" : "nothing repeating") + "\n");
})().catch((e) => { console.error("ERR " + e.message); process.exitCode = 1; })
  .finally(() => db.$disconnect());
