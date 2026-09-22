// A Story must reach a Story, and must never quietly reach the feed.
//
//     node scripts/test-story-posts.js
//
// Owner, 21 Sep 2026: "Yes let's build that for the stories and lift the
// Instagram still block."
//
// TWO FAULTS THIS COVERS.
//
// The first is the one that made his own rule unfollowable. Borderline material
// is supposed to go to Stories rather than the feed -- it reaches the people
// already following him, expires in a day, and never sits in the grid above a
// family charter. Nothing anywhere could ask for a Story: Instagram was
// hardcoded to mediaType "reel" and Facebook was sent no mediaType at all. The
// rule had been recommended twice in a week against a route that did not exist.
//
// The second is a block that was not true. Every Instagram draft carrying a
// still was refused with "a still has to go up by hand", on the belief that
// Blotato reaches Instagram only as reels and stories. Blotato's own docs list
// images and carousels for Instagram and say of mediaType: "Has no effect on
// image posts." The stills would have published.
//
// AND THE REASON THE STORY CHECK FAILS CLOSED. That same sentence -- mediaType
// has no effect on image posts -- means an IMAGE asking to be a Story is most
// likely ignored and published to the FEED. That is the exact outcome choosing
// a Story is meant to prevent, and it fails silently: he would believe
// something borderline had expired overnight while it sat in the grid. So an
// image Story is blocked until somebody has watched one publish and confirmed
// where it landed.
const { buildPost, blockedReason, isStory } = require("../lib/socialPosting");

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

console.log("");

// --- what actually gets sent -------------------------------------------------

const igFeed = buildPost(draft({ platform: "instagram" }));
ok("instagram feed video is a reel", igFeed.mediaType, "reel");
truthy("instagram feed keeps collaborators", igFeed.collaborators);

const igStory = buildPost(draft({ platform: "instagram", postType: "story" }));
ok("instagram story asks for a story", igStory.mediaType, "story");
// Collaborator puts one post on two grids. A Story has no grid to join, so
// sending it is at best ignored and at worst an error.
falsy("instagram story drops collaborators", igStory.collaborators);

const fbVideo = buildPost(draft({ platform: "facebook" }));
ok("facebook video says reel", fbVideo.mediaType, "reel");
ok("facebook keeps its pageId", fbVideo.pageId, "630671406805108");

const fbImage = buildPost(draft({ platform: "facebook", mediaType: "image", mediaUrl: IMAGE }));
falsy("facebook image sends no mediaType", fbImage.mediaType);

const fbStory = buildPost(draft({ platform: "facebook", postType: "story" }));
ok("facebook story asks for a story", fbStory.mediaType, "story");

// --- the block that was lifted ----------------------------------------------

falsy("an instagram still is no longer blocked",
  blockedReason(draft({ platform: "instagram", mediaType: "image", mediaUrl: IMAGE })));
falsy("an instagram video is still fine",
  blockedReason(draft({ platform: "instagram" })));

// --- the block that was added, and why ---------------------------------------

truthy("an image story is blocked rather than published to the feed",
  blockedReason(draft({ platform: "instagram", postType: "story", mediaType: "image", mediaUrl: IMAGE })));
truthy("a facebook image story is blocked too",
  blockedReason(draft({ platform: "facebook", postType: "story", mediaType: "image", mediaUrl: IMAGE })));
falsy("a video story passes",
  blockedReason(draft({ platform: "instagram", postType: "story" })));

truthy("tiktok has no stories",
  blockedReason(draft({ platform: "tiktok", postType: "story" })));
truthy("tiktok still refuses a still",
  blockedReason(draft({ platform: "tiktok", mediaType: "image", mediaUrl: IMAGE })));
falsy("an ordinary tiktok video passes", blockedReason(draft({ platform: "tiktok" })));

// --- nothing written before today changes behaviour --------------------------

falsy("a draft with no postType is not a story", isStory(draft({ platform: "instagram" })));
ok("a draft with no postType still goes out as a reel",
  buildPost(draft({ platform: "instagram" })).mediaType, "reel");
falsy("undefined postType is not a story", isStory({ platform: "instagram" }));
falsy("null postType is not a story", isStory({ platform: "instagram", postType: null }));

// --- the older guards have not moved -----------------------------------------

truthy("a draft with no media is still blocked",
  blockedReason({ id: "x", platform: "instagram", caption: "c", mediaUrl: null }));
truthy("an unknown platform is still blocked",
  blockedReason({ id: "x", platform: "threads", caption: "c", mediaUrl: VIDEO }));

console.log("  " + pass + " passed, " + fails.length + " failed");
for (const f of fails) console.log("   FAIL  " + f);
console.log("");
process.exitCode = fails.length ? 1 : 0;
