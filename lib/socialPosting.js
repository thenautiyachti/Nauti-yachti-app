// What is due to go out, and whether it actually can.
//
// Approving a draft and giving it a date is the decision to publish it — the
// owner said so explicitly, and this module is what that decision means in
// practice. Nothing here posts anything: it decides what is due, and refuses
// the ones that would fail, so a post never silently doesn't happen.

// The connected Blotato accounts. Facebook needs its page id; TikTok needs a
// fistful of flags it will not accept a post without.
const ACCOUNTS = {
  facebook: { accountId: "49334", platform: "facebook", pageId: "630671406805108" },
  instagram: { accountId: "67877", platform: "instagram" },
  tiktok: { accountId: "57393", platform: "tiktok" },
};

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
  if (account.platform === "instagram" && !isVideo(draft)) {
    // Blotato can reach Instagram as a story or a reel, and both want video.
    // A still to the main feed is not something it can do at all.
    return "Instagram can only be posted as a reel or a story, both of which need video — a still has to go up by hand.";
  }
  return null;
}

// Everything scheduled on or before `today`, oldest first, each tagged with
// whether it can actually be published. Overdue items come first because they
// are the ones already late.
function dueDrafts(drafts, today) {
  return (drafts || [])
    .filter((d) => d.status === "scheduled" && d.scheduledDate && d.scheduledDate <= today)
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
  if (account.platform === "facebook") return { ...base, pageId: account.pageId };
  if (account.platform === "instagram") return { ...base, mediaType: "reel" };
  if (account.platform === "tiktok") return { ...base, ...TIKTOK_DEFAULTS };
  return base;
}

module.exports = { ACCOUNTS, TIKTOK_DEFAULTS, accountFor, isVideo, blockedReason, dueDrafts, buildPost };
