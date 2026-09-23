// Give already-published drafts their Blotato post id, so comments on posts
// that went out BEFORE this field existed can still name their post.
//
//   node scripts/backfill-blotato-post-ids.js            what it would do
//   ALLOW_PROD_WRITES=1 node scripts/backfill-blotato-post-ids.js --apply
//
// WHY. Owner, 22 Sep 2026: "it would also be nice to see which post the comments
// belong to." The join is MediaDraft.blotatoPostId against the postId every
// comment carries. Siren writes that field from now on — but every post already
// out there has a NULL, which means the whole existing comment queue would read
// "post not identified" on day one and the feature would look broken.
//
// The match is on postUrl, which is the only value both sides already hold.
//
// EXPECT MISSES AND DO NOT TREAT THEM AS FAILURES. Anything published by hand
// from the phone has no MediaDraft at all, and nothing here can invent one.
require("C:/Users/immex/Documents/_MyFiles/Jarvis-Voice-UI/paths.js").loadSecrets();
const { PrismaClient } = require("../node_modules/@prisma/client");
const db = new PrismaClient();

const APPLY = process.argv.includes("--apply");
const BASE = "https://backend.blotato.com/v2";

async function blotato(path) {
  const res = await fetch(BASE + path, {
    headers: { "blotato-api-key": process.env.BLOTATO_API_KEY || "", "Content-Type": "application/json" },
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) throw new Error("blotato " + res.status + " " + text.slice(0, 200));
  return text ? JSON.parse(text) : null;
}

(async () => {
  if (!process.env.BLOTATO_API_KEY) {
    console.error("\n  BLOTATO_API_KEY is not set here.\n");
    process.exitCode = 1;
    return;
  }

  const body = await blotato("/posts?limit=200");
  const posts = (body && body.items) || [];
  console.log("\n  " + posts.length + " published post(s) known to Blotato");

  // Blotato returns the live URL under state.postUrl; our drafts store the same
  // string in postUrl. Normalise, because one side carries a trailing slash and
  // the other sometimes does not.
  const norm = (u) => String(u || "").trim().replace(/\/+$/, "").toLowerCase();
  const byUrl = new Map();
  for (const p of posts) {
    const url = norm(p.state && p.state.postUrl);
    if (url) byUrl.set(url, p);
  }

  const drafts = await db.mediaDraft.findMany({
    where: { postUrl: { not: null }, blotatoPostId: null },
    select: { id: true, platform: true, postUrl: true, caption: true, postedAt: true },
  });
  console.log("  " + drafts.length + " published draft(s) with no blotatoPostId yet\n");

  const hits = [], misses = [];
  for (const d of drafts) {
    const p = byUrl.get(norm(d.postUrl));
    if (p) hits.push({ d, p }); else misses.push(d);
  }

  for (const { d, p } of hits) {
    console.log("  match  " + String(d.platform).padEnd(10) + String(p.id).padEnd(10)
      + String(d.caption).replace(/\s+/g, " ").slice(0, 46));
  }
  if (misses.length) {
    console.log("\n  " + misses.length + " draft(s) had no matching Blotato post:");
    for (const d of misses.slice(0, 8)) {
      console.log("      " + String(d.platform).padEnd(10)
        + String(d.caption).replace(/\s+/g, " ").slice(0, 52));
    }
    if (misses.length > 8) console.log("      … and " + (misses.length - 8) + " more");
  }

  if (!APPLY) {
    console.log("\n  dry run. Re-run with ALLOW_PROD_WRITES=1 and --apply\n");
    return;
  }

  let done = 0;
  for (const { d, p } of hits) {
    await db.mediaDraft.update({ where: { id: d.id }, data: { blotatoPostId: String(p.id) } });
    done++;
  }
  console.log("\n  " + done + " draft(s) now carry their post id.");
  console.log("  Comments on anything older, or posted by hand, will still read");
  console.log("  \"post not identified\" — that is correct rather than broken.\n");
})().catch((e) => { console.error("\n  ERR " + e.message + "\n"); process.exitCode = 1; })
  .finally(() => db.$disconnect());
