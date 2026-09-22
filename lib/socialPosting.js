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

// Feed post or Story. Anything that has not said counts as a feed post, which
// is what every draft written before 21 Sep 2026 meant.
function isStory(draft) {
  return String(draft && draft.postType) === "story";
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
  // TikTok has no Stories at all — its API takes videos and image carousels.
  // Marking one as a Story would silently publish it to the feed.
  if (account.platform === "tiktok" && isStory(draft)) {
    return "TikTok has no Stories — it takes videos and image carousels. Send this one to Instagram or Facebook, or make it a feed post.";
  }
  // A STORY MUST BE VIDEO, AND THIS FAILS CLOSED ON PURPOSE.
  //
  // Blotato's Instagram target documents mediaType as: 'Default: "reel". Has no
  // effect on image posts.' Read plainly, that means an IMAGE carrying
  // mediaType "story" is not made into a Story — the field is ignored and the
  // picture lands in the feed.
  //
  // That is the one failure this whole feature exists to prevent. A Story is
  // chosen precisely so something does NOT join the permanent grid, so a Story
  // that quietly becomes a feed post is worse than no Story at all: the owner
  // would believe borderline material had expired in 24 hours while it sat
  // above the family charters indefinitely.
  //
  // The docs are ambiguous rather than clear — elsewhere they say "Story posts
  // require one video or image attachment" — so this blocks until somebody has
  // watched one real image Story publish and confirmed where it landed. One
  // verified publish and this check can go.
  if (isStory(draft) && !isVideo(draft)) {
    return "A Story needs a video. Blotato's docs say mediaType has no effect on image posts, so an image marked as a Story would most likely publish to the FEED instead — the one thing choosing a Story is meant to avoid. Attach a clip, or make it a feed post.";
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
        // Feed or Story, surfaced so the console and Siren's report can both
        // say which one this is without re-deriving it.
        postType: isStory(d) ? "story" : "feed",
        title: d.title || null,
        campaign: d.campaign || null,
        overdue: d.scheduledDate < today,
        ready: reason === null,
        blockedReason: reason,
        // Exactly what Blotato needs, so the caller does not have to know the
        // per-platform rules a second time.
        post: reason ? null : buildPost(d),
      };
    });
}

function buildPost(draft) {
  const account = accountFor(draft.platform);
  const base = {
    accountId: account.accountId,
    platform: account.platform,
    text: draft.caption,
    mediaUrls: draft.mediaUrl ? [draft.mediaUrl] : [],
  };
  if (account.platform === "facebook") {
    // Facebook takes mediaType "reel" or "story". Its own docs say regular feed
    // videos are no longer supported, so a video MUST say reel — this has been
    // working without it because Blotato defaults it, which is luck rather than
    // intent. An ordinary image post takes neither value.
    const mediaType = isStory(draft) ? "story" : isVideo(draft) ? "reel" : null;
    return { ...base, pageId: account.pageId, ...(mediaType ? { mediaType } : {}) };
  }
  if (account.platform === "instagram") {
    if (isStory(draft)) {
      // No collaborators on a Story. Collaborator is a feed-and-reel feature —
      // it puts one post on two profiles' grids — and a Story has no grid to
      // join, so sending it is at best ignored and at worst an error.
      return { ...base, mediaType: "story" };
    }
    return { ...base, mediaType: "reel", collaborators: IG_COLLABORATORS };
  }
  if (account.platform === "tiktok") return { ...base, ...TIKTOK_DEFAULTS };
  return base;
}

module.exports = {
  minutesOfDay, ACCOUNTS, TIKTOK_DEFAULTS, IG_COLLABORATORS, accountFor, isVideo, isStory, blockedReason, dueDrafts, buildPost };
