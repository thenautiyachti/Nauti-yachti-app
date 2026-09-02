import NavBar from "../../components/NavBar";
import PageFooter from "../../components/PageFooter";
import { pageMetadata } from "../../lib/seo";

export const metadata = pageMetadata({
  title: "Terms & Cancellation Policy",
  description:
    "The Nauti Yachti's booking terms for Lake Conroe charters: cancellation and refund windows, the weather-cancellation policy, and rescheduling rules.",
  path: "/terms",
});

const SECTIONS = [
  {
    title: "1. Overview",
    body: [
      `These Terms & Cancellation Policy ("Terms") govern charter bookings made with The Nauti Yachti LLC ("The Nauti Yachti," "we," "us," or "our") on Lake Conroe, TX. By submitting a booking or inquiry, you agree to these Terms, including the cancellation policy and liability waiver below.`,
    ],
  },
  {
    title: "2. Cancellation & Refund Policy",
    body: [
      "This policy is subject to the weather exception in Section 3 below — weather-related cancellations initiated by The Nauti Yachti are not subject to these guest-cancellation terms.",
    ],
    bullets: [
      "24 hours or more before your charter date/time: 100% refund of amounts paid.",
      "Less than 24 hours before your charter (day-of cancellation), with communication from the guest: 60% refund of amounts paid.",
      "No-show — no communication at all once the reserved charter time has passed: 0% refund, non-refundable.",
    ],
  },
  {
    title: "3. Weather-Related Cancellations & Rescheduling",
    body: [
      "If The Nauti Yachti determines, in its sole discretion, that weather conditions (including thunderstorms, dangerously high wind, or a lake advisory) make a scheduled charter unsafe, we may cancel or reschedule the charter. When The Nauti Yachti initiates a cancellation for weather, guests will be offered either a full refund or the option to reschedule to another available date, at the guest's choice. The Nauti Yachti is not liable for charter disruptions caused by weather.",
    ],
  },
  {
    title: "4. Rescheduling by Guest",
    body: [
      "Guests may request to reschedule an upcoming charter to a different available date. Requests made 2 or more days before the original charter date will generally be accommodated at no charge, subject to availability. Requests made closer to the charter date are subject to the cancellation terms above.",
    ],
  },
  {
    title: "5. Release and Waiver of Liability, Assumption of Risk, and Indemnification",
    emphasis: true,
    body: [
      "READ CAREFULLY — THIS AFFECTS YOUR LEGAL RIGHTS.",
      `By confirming a booking with The Nauti Yachti LLC ("Company," "we," "us") — through our website, by phone, by message, or through a third-party booking platform — I accept this Agreement on behalf of myself and every member of my party, including any minors in my care. I confirm that I have authority to accept it for every member of my party and that I have made its terms available to them.`,

      "1. Assumption of Risk. I understand that boating and watersports activities carry inherent risks that cannot be eliminated regardless of the care taken by the Company. These risks include, but are not limited to: capsizing, collision with other vessels, submerged objects, or the shoreline; sudden or severe weather changes, including wind, lightning, and rough water; falls, slips, and impact injuries on a moving or wet vessel deck; injury from watersports equipment (tubing, wakeboarding, skiing, swimming, diving) including collision, drowning, or near-drowning; mechanical or equipment failure; injury caused by the action or inaction of other passengers or other watercraft operators, including the effects of alcohol consumption by any person aboard or on the water; and exposure to sun, heat, cold, and water-borne hazards. I VOLUNTARILY AND KNOWINGLY ASSUME ALL SUCH RISKS, known and unknown, whether arising from the negligence of the Company or otherwise, and understand that participation is entirely voluntary.",

      "2. Release of Claims — Express Negligence Acknowledgment. I EXPRESSLY RELEASE, WAIVE, AND DISCHARGE THE NAUTI YACHTI LLC, ITS OWNERS, MEMBERS, EMPLOYEES, CAPTAINS, AGENTS, AND CONTRACTORS (COLLECTIVELY, THE \"RELEASED PARTIES\") FROM ANY AND ALL CLAIMS, DEMANDS, OR CAUSES OF ACTION ARISING FROM THE RELEASED PARTIES' OWN NEGLIGENCE, INCLUDING PERSONAL INJURY, DEATH, OR PROPERTY DAMAGE ARISING OUT OF OR IN CONNECTION WITH THE ACTIVITY, TO THE FULLEST EXTENT PERMITTED BY TEXAS LAW.",

      "3. What Is NOT Released — Gross Negligence & Intentional Acts. This Agreement does not release, and Guest does not waive, any claim arising from the Released Parties' gross negligence, willful or wanton misconduct, or intentional acts. Under Texas law, liability for gross negligence and intentional misconduct cannot be waived in advance, and nothing in this Agreement is intended to do so.",

      "4. Indemnification. To the extent permitted by Texas law, I agree to indemnify and hold harmless the Released Parties from any claims, losses, or expenses (including reasonable attorney's fees) arising from my own acts or omissions, or those of a minor in my care, during the Activity, except to the extent caused by the Released Parties' gross negligence or intentional misconduct.",

      "5. Medical Treatment Authorization. In the event of injury or medical emergency during the Activity, I authorize the Company's crew to arrange or administer first aid and to seek emergency medical treatment on my behalf (or on behalf of a minor in my care) if I am unable to consent at the time, and I agree to be responsible for any resulting medical costs.",

      "6. Participants Under 18 Years of Age. I certify that I am the parent or legal guardian of the minor(s) in my party, and I have full authority to consent on their behalf to their participation in the Activity. I acknowledge and assume, on behalf of the minor(s), the risks described in Section 1, and I agree to the indemnification obligations in Section 4 with respect to the minor(s)' own acts or omissions during the Activity.",

      "7. Alcohol Acknowledgment. I understand that alcohol may be present or consumed by members of my party during the Activity at their own choice and risk, that Texas Parks & Wildlife boating-while-intoxicated laws apply on the water the same as on the road, and that the Company reserves the right to refuse service or end the charter early for any guest who is visibly intoxicated or behaving unsafely, with no refund owed for time lost as a result.",

      "8. Photo, Video & Media Release. I grant the Company permission to photograph or video record my charter and to use those images for marketing purposes (website, social media, advertising), without compensation to me, unless I notify the Company in writing before the charter that I decline this permission.",

      "9. Governing Law & Venue. This Agreement is governed by the laws of the State of Texas, without regard to conflict-of-law principles. Any dispute arising from this Agreement or the Activity shall be brought exclusively in the state or federal courts located in Montgomery County, Texas.",

      "10. Severability. If any provision of this Agreement is held unenforceable, the remaining provisions remain in full force and effect, and the unenforceable provision shall be modified to the minimum extent necessary to make it enforceable while preserving its original intent.",

      "11. Entire Agreement. This Agreement, together with the Company's posted Terms & Cancellation Policy, constitutes the entire agreement between the parties regarding the Activity and supersedes any prior oral or written understanding.",

      "By confirming a booking with The Nauti Yachti LLC, I acknowledge that I have read this Agreement, that I understand it, and that I accept it voluntarily on behalf of myself and every member of my party. I understand that by doing so I am giving up certain legal rights, including the right to sue the Released Parties for their own negligence, except as expressly preserved in Section 3 above.",
    ],
  },
  {
    title: "6. Changes to These Terms",
    body: [
      "These Terms may be updated from time to time. The current version in effect is the one posted on this page at the time of your booking.",
    ],
  },
  {
    title: "7. Contact",
    body: [
      "Questions about these Terms or your booking:",
      "The Nauti Yachti LLC — TheNautiYachti@Gmail.com — 832-948-2912",
    ],
  },
];

export default function TermsPage() {
  return (
    <div>
      <NavBar />

      <div style={{ background: "var(--ink)", padding: "60px 24px 40px" }}>
        <div style={{ maxWidth: 780, margin: "0 auto" }}>
          <div className="mono" style={{ color: "var(--purple)", fontSize: 13, letterSpacing: "0.15em", marginBottom: 14 }}>
            LEGAL
          </div>
          <h1 className="display" style={{ fontSize: "clamp(32px, 5vw, 48px)", margin: 0, lineHeight: 1, fontWeight: 800, color: "var(--text)" }}>
            Terms & Cancellation Policy
          </h1>
          <div style={{ fontSize: 13.5, color: "var(--muted)", marginTop: 12 }}>Status: Cancellation & rescheduling policy confirmed — liability release published, awaiting final attorney sign-off</div>
        </div>
      </div>

      <div style={{ background: "var(--ink-soft)", padding: "10px 24px 60px" }}>
        <div style={{ maxWidth: 780, margin: "0 auto", display: "grid", gap: 26 }}>

          <div style={{ border: "1px solid #F0555C", background: "rgba(240,85,92,0.1)", borderRadius: 10, padding: "16px 18px" }}>
            <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.06em", color: "#FF7A80", marginBottom: 6 }}>
              ⚠ AWAITING FINAL ATTORNEY SIGN-OFF
            </div>
            <p style={{ fontSize: 14, color: "var(--text)", opacity: 0.9, lineHeight: 1.6, margin: 0 }}>
              The cancellation and rescheduling policy below is confirmed. Section 5 now carries the full Release and Waiver of Liability, drafted from Texas statute and under review by a licensed attorney — it is published here so it can be read in place, and is not yet signed off. Remove this notice once the attorney approves it.
            </p>
          </div>

          {SECTIONS.map((s) => (
            <div key={s.title}>
              <h2 className="display" style={{ fontSize: 19, color: "var(--purple)", marginBottom: 8, fontWeight: 700 }}>{s.title}</h2>

              {s.draftWarning && (
                <div style={{ border: "1px solid #F0555C", background: "rgba(240,85,92,0.1)", borderRadius: 8, padding: "10px 14px", marginBottom: 10 }}>
                  <p style={{ fontSize: 13.5, fontWeight: 700, color: "#FF7A80", margin: 0, lineHeight: 1.5 }}>
                    DRAFT — this section has not been reviewed by an attorney and must not be relied on as a binding legal waiver until it has been.
                  </p>
                </div>
              )}

              {s.example && (
                <div style={{ display: "inline-block", fontSize: 11.5, fontWeight: 700, letterSpacing: "0.06em", color: "#FFB454", border: "1px solid rgba(255,180,84,0.5)", background: "rgba(255,180,84,0.08)", borderRadius: 4, padding: "2px 8px", marginBottom: 8 }}>
                  EXAMPLE — NOT YET CONFIRMED
                </div>
              )}

              {s.body.map((p, i) => (
                <p key={i} style={{ fontSize: 14.5, color: "var(--text)", opacity: 0.85, lineHeight: 1.65, margin: "0 0 8px" }}>{p}</p>
              ))}
              {s.bullets && (
                <ul style={{ margin: "8px 0 0", paddingLeft: 20, display: "grid", gap: 6 }}>
                  {s.bullets.map((b, i) => (
                    <li key={i} style={{ fontSize: 14.5, color: "var(--text)", opacity: 0.85, lineHeight: 1.55 }}>{b}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>

      <PageFooter />
    </div>
  );
}
