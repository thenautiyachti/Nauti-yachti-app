// Arithmetic for money that gets multiplied by percentages several times before
// anybody sees it.
//
// WHY CENTS AND BASIS POINTS. A dollar on this platform passes through four
// multiplications before it lands: the platform's 20%, the creator's split, the
// 2.5% royalty, and the partner share. Done in floats, each one contributes a
// little error in the same direction, and the visible symptom is a statement
// whose lines do not add up to its own total. Nobody ever believes the total
// after that, which is the actual cost — not the penny.
//
// So: money is an integer number of cents, percentages are integer basis points
// (10000 bp = 100%), and every division happens exactly once, here.

// Apply a basis-point rate to an amount of cents.
//
// Rounds half AWAY FROM ZERO rather than JavaScript's half-up. Math.round(-0.5)
// is -0, so half-up is asymmetric across zero: a -$0.005 line rounds to 0 while
// +$0.005 rounds to 1. In a month where the agency lost money — which happens,
// and is exactly when the figures get checked — that asymmetry makes a loss
// look smaller than it was.
function applyBp(cents, bp) {
  const exact = (cents * bp) / 10000;
  return exact < 0 ? -Math.round(-exact) : Math.round(exact);
}

// Split `totalCents` across `weights` so the parts sum to EXACTLY the total.
//
// The obvious implementation — round each share independently — loses or
// invents cents. Two partners at 50/50 on an odd total either both get the
// rounded-down half (a cent vanishes) or both get the rounded-up half (a cent
// appears). Over a year of monthly draws that is a handful of cents and an
// argument, because the partner who checks is the partner who is short.
//
// Largest remainder instead: floor everything, then hand the leftover cents out
// one at a time to whoever was closest to earning another. Deterministic, and
// the parts always reconcile to the total.
//
// Negative totals are allocated by sign-flipping rather than by flooring
// downward, so a loss divides the same way a profit does.
function allocate(totalCents, weights) {
  const list = weights.map((w) => (Number.isFinite(w) && w > 0 ? w : 0));
  const weightSum = list.reduce((a, b) => a + b, 0);
  if (weightSum <= 0) return list.map(() => 0);

  const sign = totalCents < 0 ? -1 : 1;
  const magnitude = Math.abs(totalCents);

  const exact = list.map((w) => (magnitude * w) / weightSum);
  const parts = exact.map(Math.floor);
  let leftover = magnitude - parts.reduce((a, b) => a + b, 0);

  // Biggest fractional part first; ties go to the earlier index so the result
  // does not depend on sort stability.
  const order = exact
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index);

  for (let i = 0; leftover > 0; i = (i + 1) % order.length) {
    parts[order[i].index] += 1;
    leftover -= 1;
  }

  return parts.map((p) => p * sign);
}

// Cents -> "$1,234.56". Negative renders as "-$12.34", not "$-12.34".
function formatCents(cents) {
  const n = Number.isFinite(cents) ? Math.trunc(cents) : 0;
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const dollars = Math.floor(abs / 100).toLocaleString("en-US");
  return `${sign}$${dollars}.${String(abs % 100).padStart(2, "0")}`;
}

// Basis points -> "50%", "2.5%", "33.33%". Trailing zeros dropped, because
// "20.00%" on a dashboard reads as more precision than a round number has.
function formatBp(bp) {
  const n = Number.isFinite(bp) ? bp : 0;
  return `${parseFloat((n / 100).toFixed(2))}%`;
}

// Anything a human or a CSV might write for an amount -> integer cents.
//
// Accepts "$1,234.56", "1234.56", "(45.00)" for negative — accounting
// parentheses turn up in exported statements and silently parse as zero
// otherwise, which reads as a missing refund rather than a wrong one.
// Returns null for anything it cannot read, never 0: a row that failed to parse
// and a row that was genuinely zero have to be distinguishable at the import.
function parseMoneyToCents(input) {
  if (typeof input === "number") {
    return Number.isFinite(input) ? Math.round(input * 100) : null;
  }
  if (typeof input !== "string") return null;

  let text = input.trim();
  if (!text) return null;

  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  text = text.replace(/[$\s,]/g, "");
  if (text.startsWith("-")) {
    negative = true;
    text = text.slice(1);
  }
  if (!/^\d+(\.\d+)?$/.test(text)) return null;

  const cents = Math.round(parseFloat(text) * 100);
  if (!Number.isFinite(cents)) return null;
  return negative ? -cents : cents;
}

module.exports = { applyBp, allocate, formatCents, formatBp, parseMoneyToCents };
