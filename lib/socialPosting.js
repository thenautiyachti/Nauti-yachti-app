// What is due to go out, and whether it actually can.
//
// Approving a draft and giving it a date is the decision to publish it — the
// owner said so explicitly, and this module is what that decision means in
// practice. Nothing here posts anything: it decides what is due, and refuses
// the ones that would fail, so a post never silently doesn't happen.
//
// WHERE "approved" BECOMES "scheduled". dueDrafts below considers ONLY status
// "scheduled" — deliberately, because the status history is worth keeping: a
// row that reads proposed -> approved -> scheduled -> posted can be read back
// afterwards, and one that jumps straight from approved to posted cannot say
// when it was cleared to go.
//
// The promotion is therefore a real step, done by Siren at the top of every
// run via Jarvis-Voice-UI/promote-approved.js. Until 12 Sep 2026 nothing did
// it, and the paragraph above was a promise this file did not keep: the
// Facebook copy of a post went out at 10:30 and the Instagram and TikTok
// copies of the same post, same date, same time, sat at "approved" and were
// never even considered. No error, no log.
//
// So if you are reading this because a post did not go out: check its STATUS
// first, and check that Siren is still running the promotion.

// The connected Blotato accounts. Facebook needs its page id; TikTok needs a
// fistful of flags it will not accept a post without.
const ACCOUNTS = {
  facebook: { accountId: "49334", platform: "facebook", pageId: "630671406805108" },
  instagram: { accountId: "67877", platform: "instagram" },
  tiktok: { accountId: "57393", platform: "tiktok" },
};

// The owner's personal Instagram, tagged as a COLLABORATOR on every business
// post. A collab is not a repost: Instagram puts the one post on both profiles'
// feeds and grids, and the likes and comments pool instead of splitting across
// two copies. He accepts a notification the first time on each post.
//
// This lives in code rather than in an agent's brief on purpose. A brief can be
// forgotten on a run; buildPost cannot. Nothing else can add it either -- the
// posting APIs cannot write to a personal account at all, on any platform, so
// this is the only automated route that exists.
//
// Instagram only. Facebook removed app posting to personal profiles in 2018 and
// TikTok's API writes solely to the authorised account.
// Instagram caps this at THREE collaborators per post. Each one has to accept
// on their own phone, and the post then sits on their personal grid -- so an
// account only belongs here if its owner actually wants business posts on
// their profile.
//
// brookeashley_05_ REMOVED 11 Sep 2026, on the owner's instruction. Instagram
// rejected every post carrying it -- "The following user(s) cannot be accessed:
// brookeashley_05_" -- and because a collaborator list is all-or-nothing, one
// unreachable handle failed the WHOLE post. Christina's review sat unpublished
// for two days that way while the Facebook and TikTok copies went out clean.
//
// A collaborator that cannot be resolved is not a tag that gets skipped, it is
// a post that does not happen. Do not re-add a handle here until it has been
// confirmed reachable from the business account.
const IG_COLLABORATORS = ["austinhefty"];

// Deliberately conservative defaults. Public, comments open — a charter
// business wants replies — and honest about the content not being AI-generated,
// since the media is real footage of the real fleet.
const TIKTOK_DEFAULTS = {
  privacyLevel: "PUBLIC_TO_EVERYONE",
  disabledComments: false,
  disabledDuet: false,
  disabledStitch: false,
  isBrandedContent: false,
  isYourBrand: true,
  isAiGenerated: false,
};

function accountFor(platform) {
  return ACCOUNTS[String(platform || "").trim().toLowerCase()] || null;
}

function isVideo(draft) {
  if (draft.mediaType === "video") return true;
  return /\.(mp4|mov|webm|m4v)(\?|$)/i.test(draft.mediaUrl || "");
}

// "both" (the default), "feed" or "story". Anything unset or unrecognised is
// "both" — the owner's answer to being asked which he wanted was that he did
// not want to be asked.
function postTypeOf(draft) {
  const t = String((draft && draft.postType) || "both").toLowerCase();
  return t === "feed" || t === "story" ? t : "both";
}
const wantsFeed = (draft) => postTypeOf(draft) !== "story";
const wantsStory = (draft) => postTypeOf(draft) !== "feed";

// Whether a Story is actually POSSIBLE here, which is a different question from
// whether one was asked for.
//
// Two things stop it. TikTok has no Stories at all. And an image cannot be one:
// Blotato documents Instagram's mediaType as having "no effect on image posts",
// so a picture asking to be a Story is ignored and lands in the feed — which on
// a "both" draft means the same picture posted to the grid twice. Dropping the
// leg is the right failure; duplicating the feed post is not.
function canStory(draft) {
  const account = accountFor(draft.platform);
  if (!account || account.platform === "tiktok") return false;
  return isVideo(draft);
}

// Kept for callers that still ask the old yes/no question.
function isStory(draft) {
  return postTypeOf(draft) === "story";
}

// Why a scheduled post cannot go out, or null when it can. Every reason here is
// a real platform constraint, not a guess — the point is that the owner sees
// "this one needs a video" days ahead rather than finding out on the day.
function blockedReason(draft) {
  const account = accountFor(draft.platform);
  if (!account) {
    return draft.platform
      ? `No connected account for "${draft.platform}" — Blotato has Facebook, Instagram and TikTok.`
      : "No platform set on this draft.";
  }
  if (!draft.mediaUrl) {
    return "No photo or clip attached. Every one of these platforms needs media.";
  }
  if (account.platform === "tiktok" && !isVideo(draft)) {
    return "TikTok needs a video, and the attached media is an image.";
  }
  // EVERYTHING BELOW ONLY BITES A DRAFT THAT ASKED FOR A STORY AND NOTHING
  // ELSE. The default is "both", and a "both" draft that cannot carry a Story
  // simply does not get that leg -- it still publishes to the feed, so there is
  // nothing to block and nothing for the owner to decide.
  //
  // TikTok has no Stories at all; its API takes videos and image carousels.
  if (account.platform === "tiktok" && isStory(draft)) {
    return "TikTok has no Stories — it takes videos and image carousels. Leave this one on “both” or “feed”.";
  }
  // An image cannot be a Story. Blotato documents Instagram's mediaType as
  // having "no effect on image posts", so a picture asking to be a Story is
  // ignored and published to the FEED -- the one outcome choosing a Story is
  // meant to prevent, arriving silently. On a "both" draft the leg is dropped;
  // here there is no other leg, so there is nothing left to publish.
  if (isStory(draft) && !isVideo(draft)) {
    return "A Story needs a video — an image marked Story-only would publish to the feed instead, which is the one thing a Story is chosen to avoid. Attach a clip, or leave it on “both”.";
  }
  // Last guard: whatever the combination, if it produces no publish at all then
  // it must not sit in the queue looking ready.
  if (buildPosts(draft).length === 0) {
    return "Nothing to publish — this combination of platform, media and post type produces no post.";
  }
  return null;
}

// A scheduled time as minutes past midnight, or null if there is not a usable
// one. Stored as "7:00 PM" / "10:30 AM"; anything else returns null and the
// draft is treated as due for its whole day, which is how this behaved before
// times were honoured at all.
function minutesOfDay(t) {
  const m = String(t || "").trim().match(/^(\d{1,2}):(\d{2})\s*([AaPp])\.?[Mm]\.?$/);
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (m[3].toLowerCase() === "p") h += 12;
  return h * 60 + Number(m[2]);
}

// Everything due now, oldest first, each tagged with whether it can actually be
// published. Overdue items come first because they are the ones already late.
//
// `nowMinutes` is minutes past local midnight. A draft dated today is due only
// once that moment has passed; a draft dated earlier is due regardless of its
// time, because it is already late and holding it until 7pm tomorrow helps
// nobody. A draft with no time, or an unparseable one, is due for its whole day
// -- the behaviour before times meant anything, so nothing silently stops
// publishing.
function dueDrafts(drafts, today, nowMinutes) {
  const nowMin = typeof nowMinutes === "number" ? nowMinutes : null;
  return (drafts || [])
    .filter((d) => {
      if (d.status !== "scheduled" || !d.scheduledDate) return false;
      if (d.scheduledDate < today) return true;      // already late
      if (d.scheduledDate > today) return false;     // not yet its day
      if (nowMin === null) return true;              // caller does not care about time
      const at = minutesOfDay(d.scheduledTime);
      return at === null || nowMin >= at;            // no time set means all day
    })
    .sort((a, b) => (a.scheduledDate < b.scheduledDate ? -1 : a.scheduledDate > b.scheduledDate ? 1 : (a.postNumber || 0) - (b.postNumber || 0)))
    .map((d) => {
      const reason = blockedReason(d);
      return {
        id: d.id,
        platform: d.platform,
        scheduledDate: d.scheduledDate,
        scheduledTime: d.scheduledTime || null,
        caption: d.caption,
        mediaUrl: d.mediaUrl || null,
        mediaType: isVideo(d) ? "video" : d.mediaUrl ? "image" : null,
        // What was asked for, and what will actually happen — they differ when
        // a "both" draft carries an image, which cannot be a Story.
        postType: postTypeOf(d),
        goesTo: reason ? [] : buildPosts(d).map((l) => l.leg),
        title: d.title || null,
        campaign: d.campaign || null,
        overdue: d.scheduledDate < today,
        ready: reason === null,
        blockedReason: reason,
        // Exactly what Blotato needs, so the caller does not have to know the
        // per-platform rules a second time. `posts` is the real answer — one
        // entry, or two when the feed post is also shared to the Story.
        // `post` is the feed leg alone, kept so anything reading the old shape
        // keeps working rather than silently publishing nothing.
        posts: reason ? [] : buildPosts(d),
        post: reason ? null : buildPost(d),
      };
    });
}

// Every publish this draft should make, in order. One entry for an ordinary
// post; two when it goes to the feed AND the Story.
//
// Each leg carries `leg` so the caller can record which is which, and so a
// report can say "feed and story" rather than "published twice".
function buildPosts(draft) {
  const account = accountFor(draft.platform);
  if (!account) return [];
  const base = {
    accountId: account.accountId,
    platform: account.platform,
    text: draft.caption,
    mediaUrls: draft.mediaUrl ? [draft.mediaUrl] : [],
  };

  const legs = [];

  if (wantsFeed(draft)) {
    if (account.platform === "facebook") {
      // Facebook takes mediaType "reel" or "story". Its own docs say regular
      // feed videos are no longer supported, so a video MUST say reel -- this
      // had been working without it only because Blotato defaults it, which is
      // luck rather than intent. An ordinary image post takes neither value.
      const mediaType = isVideo(draft) ? "reel" : null;
      legs.push({ leg: "feed", ...base, pageId: account.pageId, ...(mediaType ? { mediaType } : {}) });
    } else if (account.platform === "instagram") {
      legs.push({ leg: "feed", ...base, mediaType: "reel", collaborators: IG_COLLABORATORS });
    } else if (account.platform === "tiktok") {
      legs.push({ leg: "feed", ...base, ...TIKTOK_DEFAULTS });
    } else {
      legs.push({ leg: "feed", ...base });
    }
  }

  // The Story leg, only where one is possible. canStory() rules out TikTok and
  // rules out images -- see the comment there for why an image Story would
  // otherwise put the same picture in the grid twice.
  if (wantsStory(draft) && canStory(draft)) {
    if (account.platform === "facebook") {
      legs.push({ leg: "story", ...base, pageId: account.pageId, mediaType: "story" });
    } else {
      // No collaborators on a Story. Collaborator is a feed-and-reel feature --
      // it puts one post on two profiles' grids -- and a Story has no grid to
      // join, so sending it is at best ignored and at worst an error.
      legs.push({ leg: "story", ...base, mediaType: "story" });
    }
  }

  return legs;
}

// The feed leg on its own. Kept because it is the single-post shape callers
// already understand; buildPosts is the one that knows about Stories.
function buildPost(draft) {
  const legs = buildPosts(draft);
  return legs.find((l) => l.leg === "feed") || legs[0] || null;
}

module.exports = {
  minutesOfDay, ACCOUNTS, TIKTOK_DEFAULTS, IG_COLLABORATORS, accountFor, isVideo, isStory, postTypeOf, wantsFeed, wantsStory, canStory, blockedReason, dueDrafts, buildPost, buildPosts };
