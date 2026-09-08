// WHY a draft was sent back or killed.
//
// Asked for on 8 Sep 2026: "what if I do want a post but maybe just not that
// video?" and "if I select don't post, should I disclose why so it can be ruled
// why it didn't work?"
//
// Both questions have the same root. The queue had three answers — approve,
// needs work, deny — and only the middle one recorded anything. So a killed
// post left no trace of what was wrong with it, and "the caption is fine, the
// clip is not" had nowhere to go at all: the owner had to either accept a post
// he did not want or kill a caption he did.
//
// A FIXED LIST, not free text, because the point is counting. "Six of the last
// ten were killed for the wrong clip" is a fact that changes what the media
// agent does next week; ten sentences saying roughly that are not. The prose
// still exists — reviewNote — and the two are written together.
//
// KEEP THIS SHORT. A dropdown nobody reads to the end gets whatever is at the
// top, and then the data says everything is a media problem.

const REVIEW_REASONS = [
  {
    id: "wrong-media",
    label: "Wrong photo or clip",
    // The one the owner actually asked for. The post survives; the media does
    // not — which is why this is a "needs work", never a kill.
    hint: "It does not match the post — wrong guest, wrong trip, wrong thing happening.",
    keepsThePost: true,
  },
  {
    id: "better-shot",
    label: "Find a better one",
    // NOT the same as "wrong". Added 8 Sep 2026 after the 10 September
    // Christina draft: "this video is just meh. we can find a better one."
    //
    // The clip was from the right guest on the right day and still was not good
    // enough, and the only nearby label said "wrong" — which is a different
    // instruction and sends whoever picks the replacement to a different
    // folder. Wrong means find the RIGHT one; this means find a BETTER one,
    // usually from the same shoot.
    hint: "Right footage, weak shot. There is better in the same folder.",
    keepsThePost: true,
  },
  {
    id: "caption",
    label: "Caption needs work",
    hint: "Wording, tone, hashtags or a wrong detail.",
    keepsThePost: true,
  },
  {
    id: "timing",
    label: "Wrong day or time",
    hint: "Right post, wrong slot.",
    keepsThePost: true,
  },
  {
    id: "repetitive",
    label: "Too similar to another post",
    hint: "Same clip, same angle or same message as something already queued.",
    keepsThePost: false,
  },
  {
    id: "guest-privacy",
    label: "Guest or privacy problem",
    hint: "Someone in it should not be, or it names the wrong guest.",
    keepsThePost: false,
  },
  {
    id: "off-brand",
    label: "Not right for us",
    hint: "Wrong message for the business, whatever the media.",
    keepsThePost: false,
  },
  {
    id: "other",
    label: "Something else",
    hint: "Say what in the note.",
    keepsThePost: false,
  },
];

const REVIEW_REASON_IDS = REVIEW_REASONS.map((r) => r.id);

function reviewReasonLabel(id) {
  const found = REVIEW_REASONS.find((r) => r.id === id);
  return found ? found.label : null;
}

// Does this reason mean the post itself is still wanted? Drives which button
// the form recommends — and stops "find a better clip" being treated as a kill.
function reasonKeepsThePost(id) {
  const found = REVIEW_REASONS.find((r) => r.id === id);
  return found ? found.keepsThePost : false;
}

module.exports = { REVIEW_REASONS, REVIEW_REASON_IDS, reviewReasonLabel, reasonKeepsThePost };
