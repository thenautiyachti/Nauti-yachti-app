// A post goes to the feed AND the Story, wherever that is possible.
//
//     node scripts/test-story-posts.js
//
// Owner, 21 Sep 2026, having been given a Feed/Story toggle he did not want:
// "I don't want to choose feed or story I just want both."
//
// So "both" is the default and the choice is gone. A draft publishes to the
// feed and is also shared to the Story, except where that cannot happen:
//
//   TikTok  has no Stories at all -- videos and image carousels only.
//   Images  cannot be one. Blotato documents Instagram's mediaType as having
//           "no effect on image posts", so a picture asking to be a Story is
//           ignored and lands in the FEED. On a "both" draft that would mean
//           the same picture posted to the grid twice, so the leg is dropped
//           instead. Dropping is the right failure; duplicating is not.
//
// Neither case blocks anything. The draft still publishes to the feed and the
// owner is not asked a question. "feed" and "story" survive as deliberate
// overrides -- story-only is how something borderline expires in 24 hours
// without ever joining the grid -- and only story-only can be blocked, because
// only it can end up with nothing to publish.
//
// THE OTHER HALF OF THIS FILE. Every Instagram draft carrying a still used to
// be refused with "a still has to go up by hand", on the belief that Blotato
// reaches Instagram only as reels and stories. Its docs list images and
// carousels for Instagram. Those stills would always have published.
const {
  buildPost, buildPosts, blockedReason, isStory, postTypeOf, canStory,
} = require("../lib/socialPosting");

let pass = 0;
const fails = [];
function ok(label, got, want) {
  if (JSON.stringify(got) === JSON.stringify(want)) { pass++; return; }
  fails.push(label + "\n        got  " + JSON.stringify(got) + "\n        want " + JSON.stringify(want));
}
function truthy(label, v) { if (v) pass++; else fails.push(label + "  (expected something, got " + JSON.stringify(v) + ")"); }
function falsy(label, v) { if (!v) pass++; else fails.push(label + "  (expected nothing, got " + JSON.stringify(v) + ")"); }

const VIDEO = "https://example.com/clip.mp4";
const IMAGE = "https://example.com/frame.jpg";
const draft = (o) => ({ id: "x", caption: "c", mediaType: "video", mediaUrl: VIDEO, ...o });
const legs = (d) => buildPosts(d).map((l) => l.leg);

console.log("");

// --- the default: nobody chooses anything ------------------------------------

ok("no postType at all means both", postTypeOf({}), "both");
ok("an unrecognised value falls back to both", postTypeOf({ postType: "banana" }), "both");
ok("instagram video goes to both", legs(draft({ platform: "instagram" })), ["feed", "story"]);
ok("facebook video goes to both", legs(draft({ platform: "facebook" })), ["feed", "story"]);

// --- where a Story is not possible, the feed post still happens --------------

ok("tiktok video is feed only, and not blocked", legs(draft({ platform: "tiktok" })), ["feed"]);
falsy("tiktok video is not blocked", blockedReason(draft({ platform: "tiktok" })));

ok("an instagram image is feed only",
  legs(draft({ platform: "instagram", mediaType: "image", mediaUrl: IMAGE })), ["feed"]);
falsy("an instagram image is NOT blocked",
  blockedReason(draft({ platform: "instagram", mediaType: "image", mediaUrl: IMAGE })));
ok("a facebook image is feed only",
  legs(draft({ platform: "facebook", mediaType: "image", mediaUrl: IMAGE })), ["feed"]);

// --- what each leg actually sends --------------------------------------------

const igBoth = buildPosts(draft({ platform: "instagram" }));
ok("instagram feed leg is a reel", igBoth[0].mediaType, "reel");
truthy("instagram feed leg keeps collaborators", igBoth[0].collaborators);
ok("instagram story leg asks for a story", igBoth[1].mediaType, "story");
// Collaborator puts one post on two grids. A Story has no grid to join.
falsy("instagram story leg drops collaborators", igBoth[1].collaborators);

const fbBoth = buildPosts(draft({ platform: "facebook" }));
ok("facebook feed leg says reel", fbBoth[0].mediaType, "reel");
ok("facebook feed leg keeps its pageId", fbBoth[0].pageId, "630671406805108");
ok("facebook story leg says story", fbBoth[1].mediaType, "story");
ok("facebook story leg keeps its pageId", fbBoth[1].pageId, "630671406805108");

falsy("a facebook image sends no mediaType",
  buildPosts(draft({ platform: "facebook", mediaType: "image", mediaUrl: IMAGE }))[0].mediaType);

truthy("tiktok keeps its required flags",
  buildPosts(draft({ platform: "tiktok" }))[0].privacyLevel);

// --- the deliberate overrides -------------------------------------------------

ok("feed-only is one leg", legs(draft({ platform: "instagram", postType: "feed" })), ["feed"]);
ok("story-only is one leg", legs(draft({ platform: "instagram", postType: "story" })), ["story"]);
falsy("story-only with a video is fine",
  blockedReason(draft({ platform: "instagram", postType: "story" })));

// Only story-only can end up with nothing to publish, so only it can block.
truthy("story-only with an image is blocked",
  blockedReason(draft({ platform: "instagram", postType: "story", mediaType: "image", mediaUrl: IMAGE })));
truthy("story-only on tiktok is blocked",
  blockedReason(draft({ platform: "tiktok", postType: "story" })));
ok("a blocked story-only produces no legs at all",
  legs(draft({ platform: "tiktok", postType: "story" })), []);

// --- canStory says why, on its own -------------------------------------------

truthy("a video on instagram can be a story", canStory(draft({ platform: "instagram" })));
falsy("an image cannot be a story", canStory(draft({ platform: "instagram", mediaType: "image", mediaUrl: IMAGE })));
falsy("tiktok can never be a story", canStory(draft({ platform: "tiktok" })));

// --- the old single-post shape still answers ---------------------------------

ok("buildPost still returns the feed leg", buildPost(draft({ platform: "instagram" })).mediaType, "reel");
ok("buildPost on a story-only draft returns the story",
  buildPost(draft({ platform: "instagram", postType: "story" })).mediaType, "story");
falsy("isStory is false for a both draft", isStory(draft({ platform: "instagram" })));
truthy("isStory is true only when story-only", isStory(draft({ platform: "instagram", postType: "story" })));

// --- the older guards have not moved -----------------------------------------

truthy("a draft with no media is still blocked",
  blockedReason({ id: "x", platform: "instagram", caption: "c", mediaUrl: null }));
truthy("an unknown platform is still blocked",
  blockedReason({ id: "x", platform: "threads", caption: "c", mediaUrl: VIDEO }));
truthy("tiktok still refuses a still",
  blockedReason(draft({ platform: "tiktok", mediaType: "image", mediaUrl: IMAGE })));

console.log("  " + pass + " passed, " + fails.length + " failed");
for (const f of fails) console.log("   FAIL  " + f);
console.log("");
process.exitCode = fails.length ? 1 : 0;
