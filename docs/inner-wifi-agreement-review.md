# Inner Wifi Sales Agreement — review

**Document:** "Inner Wifi Sales Agreement", dated 18 September 2026
**Source:** esignatures.com/sign/2888d596-2b8e-48d9-843a-a32c1db53886
**Seller side:** Nathan Felstein, InnerWifi, mgmt@innerwifi.com
**Buyer side:** blank in the document; signature line reads "Sign | David Rodgers"
**Status when reviewed:** Nathan Felstein signed 18 Sep 2026, 7:09 pm. The buyer
signature block was still open.

> This is a commercial read of the document, not legal advice. Items 1, 2, 4 and
> 7 are the ones worth paying a lawyer an hour for before anyone signs.

---

## What is actually being bought

$3,900 up front, plus **2.5% of the agency, monthly, with no end date**, for:

- agency website design + an Instagram build-out (initial post design, and
  "Instagram Social Proof Provided (Likes & Followers)")
- the management system and its contents — SOPs for model onboarding, VA
  sourcing, VA training, post scheduling, housekeeping
- an online course hosted on Teachable
- 1:1 support/consulting with the founders
- bonus: sales call involvement until the first client signs, with ad spend paid
  by the buyer

The $3,900 is the small number in this contract. The 2.5% is the deal.

---

## The four things to fix before signing

### 1. The royalty clause contradicts itself

Clause 4: *"2.5% Net Profit Share Of Agency Revenue"*.

Net profit and revenue are different numbers and the clause names both. On
$250,000 of agency revenue at a 30% margin:

| Reading | Annual cost |
|---|---|
| 2.5% of **revenue** | $6,250 |
| 2.5% of **net profit** | $1,875 |

A 3.3x spread, every year, forever, decided by whichever reading a court
prefers. Clause 19 says the agreement can only be modified in a writing signed
by all parties — so this gets fixed now or it does not get fixed.

**Ask for:** a single defined term. Recommended — *"2.5% of Agency Net Profit,
where Agency Net Profit means gross agency commissions received from model
management clients less directly attributable operating expenses (contractor and
VA compensation, advertising spend, platform and software fees, payment
processing fees)."*

This platform computes both readings side by side and shows the gap, so the
exposure is visible in dollars while the wording is still open. See
`lib/agency/split.js`.

### 2. The royalty is perpetual and the license is not

Clause 4 creates a monthly obligation with no term, no cap, no sunset and no
buyout. Clauses 7–10 give a license the Seller can terminate on any breach.

So the Seller can end the license and keep collecting 2.5%. That asymmetry is
the single worst term in the document, and it survives a total breakdown of the
relationship.

**Ask for one of:** a fixed term (24–36 months), a cumulative cap (e.g. royalty
ends at 3x the purchase price), a buyout figure the buyer can elect at any time,
or termination of the royalty if the license ends for any reason.

### 3. There is no reporting, no deadline, no audit, no currency

Clause 4 says "Paid To Inner Wifi Monthly" and stops. Missing: the day it is
due, what a statement has to show, which currency, what happens if it is late,
and whether the Seller may audit.

Silence cuts both ways, but it reliably produces a dispute two years in when
the number gets large enough to argue about.

**Ask for:** payment by the 15th for the prior calendar month, in USD, against a
standard statement; Seller audit rights once per year on 30 days' notice at
Seller's cost, shifting to the buyer only if an audit finds an underpayment over
5%.

The remittance ledger in this platform produces that statement whether or not
the clause requires one. Having the paper trail is the cheap side of the trade.

### 4. The governing-law clause does not point at a real forum

Clause 20: *"the laws of the Country of Canada"* and *"the Courts of the Country
of Canada."*

Canadian contract law is provincial, not federal, and there is no federal court
of general contract jurisdiction to attorn to. As drafted, the forum is
undefined — which means a fight about where to fight, before any fight about
money, and a US-based buyer litigating in an unnamed foreign country.

**Ask for:** a named province (e.g. "the laws of the Province of Ontario and the
courts of Ontario"), or — better for a US buyer — the buyer's own state.

---

## Other findings, in order of how much they can cost

### 5. The Instagram "social proof" deliverable is a liability, not an asset

*"Instagram Social Proof Provided (Likes & Followers)"* describes purchased
engagement. That breaches Instagram's Terms of Use, and the penalty lands on the
account — restriction, reach suppression, or removal — not on the seller who
supplied it.

Accepting it puts the agency's primary marketing asset at risk on day one, and
inflated follower counts also misrepresent the agency to prospective clients.

**Recommendation:** decline this specific line item in writing before signing,
and ask for the deliverable to be struck. The price should not move — it costs
the Seller almost nothing to supply.

### 6. The default clause may accelerate a number nobody can calculate

Clause 5 lets the Seller declare *"the entire Purchase Price owing under this
Agreement at that time to be immediately due and payable"* on any default.

Clause 2 defines the Purchase Price as $3,900, but clause 4 puts the 2.5%
royalty inside the payment schedule for that Purchase Price. Read together, a
missed month arguably accelerates an unbounded stream of future royalties into a
single immediate debt — of an amount that cannot be computed, because it depends
on revenue that has not happened.

**Ask for:** acceleration limited expressly to unpaid amounts already due.

### 7. Clauses 5 and 13(a) are template leftovers

Both reference shipments — clause 13(a) lets the Seller cancel *"if the Buyer
fails to pay for any shipment when due."* Nothing ships; clause 6 delivers by
email. Harmless on its own, but it signals the document was assembled from a
goods-sale template without being read, which is why clauses 4, 5 and 20 are in
the state they are in.

### 8. "As is" and the satisfaction guarantee contradict each other

Clause 11 disclaims all warranties including fitness for a particular purpose.
Clause 15(b) guarantees the product meets the description at delivery.

The narrower, later clause probably wins, which leaves exactly one promise: the
deliverables match their description on the day they arrive. If the SOPs do not
produce a working agency, there is no remedy — that is a fitness question, and
fitness is disclaimed.

**Do this regardless of signing:** on delivery day, screenshot and archive every
deliverable against the clause 1 list. That list is the entire warranty.

### 9. Acceptance happens on delivery, and there are no refunds

Clause 15(b) makes acceptance of delivery full satisfaction; 15(c) makes all
sales final. There is no inspection window between the two. Delivery is to the
buyer's email (clause 6), so the email arriving is effectively the acceptance.

**Ask for:** a 7-day review period before acceptance is deemed given.

### 10. Assignment is blocked in one direction only

Clause 18 bars the Buyer from assigning without the Seller's consent. Clause 22
binds successors and assigns generally, and nothing restricts the Seller.

Consequences: selling the agency later requires Nathan's consent, and the 2.5%
can be sold to a third party the buyer never chose to deal with.

**Ask for:** consent not to be unreasonably withheld, a carve-out for assignment
to an affiliate or to a buyer of substantially all the business, and mutual
restriction on the Seller's side.

### 11. Nothing here is owned, and derivative works are barred

Clause 8 keeps all IP with the Seller. Clause 9.2 bars modifying, adapting or
creating derivative works from the Goods. Clause 10 bars public distribution.

Clause 8 does carve out that ownership *"does not include the ownership of the
management agency itself"* — the business is the buyer's, the materials are not.

**This constrains the platform in this repository.** It is independently written
and contains none of InnerWifi's SOP text, templates, course material or
document structure, and it must stay that way. Do not paste their SOPs into the
app, the database or the README. Build from the business requirements; a
workflow everyone in the industry uses is not their property, but their
expression of it is.

Clause 10 also means this console stays private — behind the admin gate, not
published.

### 12. Confirm who the Buyer is, and sign as an entity

The document's Seller block is blank and the Buyer block still shows its
placeholders (*"\* Full Name of Company \* Email Address"*). Nathan Felstein
appears in the first-part block, which the template labels "the Seller", and the
only signature line reads "Sign | David Rodgers".

A perpetual royalty signed by a natural person is a personal obligation that
outlives the business.

**Do:** fill the Buyer block with an LLC, and sign as its officer. If the entity
does not exist yet, form it first. This is the cheapest protection available and
it is available only until someone clicks Sign.

### 13. The bonus deliverable has no service level

*"Sales Call involvement until first client signed (advertising spend covered by
the buyer)"* — no definition of involvement, no response time, no cap on the ad
spend the buyer funds, and an open-ended trigger. If the first client takes nine
months, that reads as nine months of buyer-funded advertising.

**Ask for:** a defined commitment (e.g. up to 10 joint calls within 90 days) and
a stated ad-spend budget the buyer approves in advance.

### 14. No confidentiality and no data-protection terms

Neither side owes the other confidentiality, and nothing addresses personal
data. That second gap matters more than usual here: this business handles
performers' government ID documents and tax forms, and the SOPs being licensed
describe how that data gets processed.

---

## The carve-out, and why the books stay separate

Clause 4 excludes *"all business ventures unrelated to the Model management
industry or model management-related businesses that do not utilize the agency &
agency resources that Inner Wifi provides."*

Read literally, two things are outside the 2.5%: ventures unrelated to model
management, and model-management businesses that do not use InnerWifi's
resources. The second limb is favourable to the buyer and is also the ambiguous
one — it is a double negative in a clause about money, and it will be argued
about.

What follows from it:

- **Nauti Yachti charter revenue is plainly outside the royalty.** It is
  unrelated to model management and uses none of the Seller's resources. It must
  never be commingled into an agency revenue figure.
- **Per-account attribution matters.** An account signed, run and serviced
  without InnerWifi's system arguably sits outside the royalty too. That is a
  position worth being able to evidence rather than assert.

This platform enforces both: agency figures are computed only from agency
records, and every account carries a `royaltyCovered` flag with a written reason
so the attribution is a recorded decision at the time, not a reconstruction
during a dispute.

---

## Recommended sequence

1. Do not sign yet. Nathan has signed; the buyer signature is the remaining
   leverage and it only exists once.
2. Send an addendum covering items 1, 2, 3 and 4, plus striking the purchased
   Instagram engagement (item 5). Clause 19 requires a signed writing, so the
   addendum is the mechanism.
3. Confirm the Buyer entity and sign as an officer of it (item 12).
4. Archive every deliverable on the day it arrives (item 8).
5. Keep agency books separate from every other venture from the first dollar.
