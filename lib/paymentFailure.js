// A payment that was tried and did not work, in words the owner can act on.
//
// WHY THIS EXISTS. Sarah Griffith tried to pay $100 for two glow seats at
// 10:47pm on 12 Sep 2026. Her bank declined it for insufficient funds. Our
// console said `status: new, paymentStatus: unpaid` -- which was true, and
// indistinguishable from somebody who never opened the link at all. The Stripe
// webhook only ever listened for success, so the attempt left no trace anywhere
// the owner would look. He found it by going into Stripe himself.
//
// Those two guests need opposite messages. One has decided to book and been
// stopped by her bank, and wants to hear "your seats are still there, try
// another card". The other has not decided anything and wants a nudge. Telling
// them apart is the whole value of recording this.
//
// WHOSE FAULT IT WAS is the other half. A declined card is the bank's answer and
// says nothing about our checkout -- but some failures ARE ours (a bad API key,
// an amount Stripe will not take), and those must not be softened into "their
// card didn't work" while a guest sits there unable to pay.

// Stripe's decline codes, in plain English, with who needs to do something.
//
// `ours` means the guest cannot fix it by trying again and we have to act.
// Anything not listed is treated as the bank's answer but NOT claimed to be
// understood -- see describeFailure.
const DECLINES = {
  insufficient_funds: { says: "not enough on the card", ours: false, advise: "Ask them to try another card, or the same one later." },
  generic_decline: { says: "their bank declined it without saying why", ours: false, advise: "Their bank is the only one who can say why. Another card usually works." },
  card_declined: { says: "their bank declined it", ours: false, advise: "Suggest another card." },
  do_not_honor: { says: "their bank refused it", ours: false, advise: "Nothing wrong on our side. Another card, or they ring their bank." },
  lost_card: { says: "the bank reports the card lost", ours: false, advise: "Do not ask again for this card. They need a different one." },
  stolen_card: { says: "the bank reports the card stolen", ours: false, advise: "Do not ask again for this card. They need a different one." },
  fraudulent: { says: "Stripe or the bank flagged it as fraud", ours: false, advise: "Do not retry this card. If you know the guest, take the money another way." },
  expired_card: { says: "the card has expired", ours: false, advise: "Ask for current card details." },
  incorrect_cvc: { says: "the security code was wrong", ours: false, advise: "They can simply try again, carefully." },
  incorrect_number: { says: "the card number was wrong", ours: false, advise: "They can simply try again, carefully." },
  incorrect_zip: { says: "the billing postcode did not match", ours: false, advise: "Ask for the postcode on the card's billing address." },
  processing_error: { says: "the bank had a technical problem", ours: false, advise: "Not their card and not us. Trying again shortly usually works." },
  card_not_supported: { says: "the card cannot be used for this", ours: false, advise: "Ask for a different card." },
  currency_not_supported: { says: "the card cannot pay in dollars", ours: false, advise: "Ask for a different card." },
  withdrawal_count_limit_exceeded: { says: "they have hit their card's limit", ours: false, advise: "Another card, or the same one tomorrow." },
  authentication_required: { says: "their bank wanted an extra confirmation that was not completed", ours: false, advise: "Ask them to run the link again and finish the bank's prompt." },
};

// The ones that are OUR problem. A guest cannot retry their way out of any of
// these, and a cheerful "try another card" would be a lie.
const OURS = {
  api_key_expired: "Our Stripe key is no longer valid — NOBODY CAN PAY until it is replaced.",
  amount_too_small: "The amount is below what Stripe will take.",
  amount_too_large: "The amount is above what Stripe will take.",
  payment_intent_authentication_failure: "The payment could not be set up properly on our side.",
};

/**
 * A failed Stripe payment, described for a person.
 *
 * @param {object} err a PaymentIntent's `last_payment_error`
 * @returns {{ summary: string, advise: string, ours: boolean, code: string|null, understood: boolean }}
 */
function describeFailure(err) {
  const code = (err && (err.decline_code || err.code)) || null;

  if (code && OURS[code]) {
    return { summary: "THIS ONE IS OURS: " + OURS[code], advise: "Fix it before telling the guest anything — they cannot.", ours: true, code, understood: true };
  }

  const known = code ? DECLINES[code] : null;
  if (known) {
    return { summary: "Card declined — " + known.says + ".", advise: known.advise, ours: known.ours, code, understood: true };
  }

  // NOT PRETENDING TO KNOW. An unrecognised code gets Stripe's own message
  // verbatim and says so, rather than being filed under a cheerful "their card
  // didn't work" that might be hiding a fault of ours. Stripe adds codes; a
  // lookup table that silently absorbs the unknown ones would go stale without
  // anybody finding out.
  // Stripe's messages already end in a full stop, so one is not added twice.
  const raw = ((err && err.message) || "").trim().replace(/\.$/, "") || null;
  return {
    summary: "Payment failed" + (code ? " (" + code + ")" : "") + (raw ? " — " + raw : "") + ".",
    advise: "This code is not one we have words for — read it in Stripe before replying.",
    ours: false,
    code,
    understood: false,
  };
}

/** One line for a console badge. */
function shortLabel(err) {
  const d = describeFailure(err);
  if (d.ours) return "Payment failed — OUR PROBLEM";
  if (!d.understood) return "Payment failed";
  return d.summary.replace(/^Card declined — /, "Declined: ").replace(/\.$/, "");
}

module.exports = { describeFailure, shortLabel, DECLINES, OURS };
