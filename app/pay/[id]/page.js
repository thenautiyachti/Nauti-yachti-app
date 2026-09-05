import NavBar from "../../../components/NavBar";
import PageFooter from "../../../components/PageFooter";
import PayButton from "../../../components/PayButton";
import { prisma } from "../../../lib/db";
import { currency } from "../../../lib/pricing";

// thenautiyachti.com/pay/<booking id>
//
// Where a guest pays for a charter that was agreed somewhere else — WhatsApp,
// a phone call, a conversation at the dock. Most bookings arrive that way.
//
// WHY A PAGE AND NOT JUST THE STRIPE LINK. A raw checkout.stripe.com URL pasted
// into WhatsApp is a long string of random characters from a domain the guest
// has never heard of, asking for a card. That is indistinguishable from a scam,
// and the more careful the customer, the less likely they are to click it. This
// page is on the domain they were already talking to us about, shows them the
// charter they agreed to, and hands off to Stripe from there.
//
// THE ID IN THE URL IS THE KEY. It is a cuid — unguessable, and known only to
// whoever was sent the link. The booking reference (NY-20260906-01) is
// deliberately NOT used for this: those run in sequence and somebody could walk
// them to read other people's charters.
export const metadata = {
  title: "Complete your booking",
  robots: { index: false, follow: false },
};

// Always read the live row: a booking that was paid a minute ago must not show
// a Pay button because a cached page said it was unpaid.
export const dynamic = "force-dynamic";

function Line({ label, value }) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "9px 0", borderBottom: "1px solid rgba(203,108,230,0.12)" }}>
      <span style={{ color: "var(--muted)", fontSize: 13.5 }}>{label}</span>
      <span style={{ color: "var(--text)", fontSize: 13.5, fontWeight: 600, textAlign: "right" }}>{value}</span>
    </div>
  );
}

function Shell({ children }) {
  return (
    <div>
      <NavBar />
      <div style={{ background: "var(--ink-soft)", minHeight: "60vh", padding: "48px 24px 64px" }}>
        <div style={{ maxWidth: 520, margin: "0 auto" }}>{children}</div>
      </div>
      <PageFooter />
    </div>
  );
}

export default async function PayPage({ params }) {
  const { id } = await params;

  let booking = null;
  try {
    booking = await prisma.inquiry.findUnique({ where: { id } });
  } catch {
    booking = null;
  }

  if (!booking) {
    return (
      <Shell>
        <h1 className="display" style={{ fontSize: 30, color: "var(--text)", margin: "0 0 10px" }}>
          This link is no longer valid
        </h1>
        <p style={{ color: "var(--text)", opacity: 0.85, lineHeight: 1.65, fontSize: 15 }}>
          We could not find a booking for this link. It may have been cancelled, or the
          address may have been copied incompletely. Give us a call or text on{" "}
          <a href="tel:+18329482912" style={{ color: "var(--purple)" }}>(832) 948-2912</a>{" "}
          and we will sort it out.
        </p>
      </Shell>
    );
  }

  if (booking.paymentStatus === "paid") {
    return (
      <Shell>
        <div className="mono" style={{ color: "var(--purple)", fontSize: 13, letterSpacing: "0.15em", marginBottom: 12 }}>
          ALREADY PAID
        </div>
        <h1 className="display" style={{ fontSize: 30, color: "var(--text)", margin: "0 0 10px" }}>
          You&rsquo;re all set
        </h1>
        <p style={{ color: "var(--text)", opacity: 0.85, lineHeight: 1.65, fontSize: 15 }}>
          This charter is paid for — there is nothing more to do. We will be in touch
          before your day on the water with the meeting point and timing.
        </p>
      </Shell>
    );
  }

  const when = booking.date
    ? new Date(booking.date + "T00:00:00").toLocaleDateString("en-US", {
        weekday: "long", month: "long", day: "numeric", year: "numeric",
      })
    : null;
  const firstName = String(booking.name || "").trim().split(/\s+/)[0];

  return (
    <Shell>
      <div className="mono" style={{ color: "var(--purple)", fontSize: 13, letterSpacing: "0.15em", marginBottom: 12 }}>
        COMPLETE YOUR BOOKING
      </div>
      <h1 className="display" style={{ fontSize: "clamp(28px, 5vw, 38px)", color: "var(--text)", margin: "0 0 8px", lineHeight: 1.05 }}>
        {firstName ? `Almost there, ${firstName}` : "Almost there"}
      </h1>
      <p style={{ color: "var(--text)", opacity: 0.85, lineHeight: 1.65, fontSize: 15, margin: "0 0 24px" }}>
        Here is the charter we put together for you. Once this is paid, your date is
        locked in and we will send you the meeting point.
      </p>

      <div
        style={{
          background: "var(--card)", border: "1px solid rgba(203,108,230,0.25)",
          borderRadius: 12, padding: "18px 20px 20px", marginBottom: 20,
        }}
      >
        <Line label="Charter" value={booking.packageName} />
        <Line label="Boat" value={booking.vesselName} />
        <Line label="Date" value={when} />
        <Line label="Hours" value={booking.hours ? `${booking.hours} hours` : null} />
        <Line label="Guests" value={booking.partySize} />
        <Line label="Reference" value={booking.bookingId} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16, paddingTop: 16 }}>
          <span style={{ color: "var(--text)", fontSize: 15, fontWeight: 700 }}>Total</span>
          <span className="display" style={{ color: "var(--text)", fontSize: 30, fontWeight: 800 }}>
            {currency(booking.priceQuoted)}
          </span>
        </div>
        <div style={{ fontSize: 12.5, color: "var(--muted)", textAlign: "right", marginTop: 2 }}>
          the whole boat, not per person
        </div>
      </div>

      <PayButton bookingId={booking.id} amount={booking.priceQuoted} />

      <p style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.6, marginTop: 22, textAlign: "center" }}>
        Something not right? Call or text{" "}
        <a href="tel:+18329482912" style={{ color: "var(--purple)" }}>(832) 948-2912</a>{" "}
        before paying and we will fix it.
      </p>
    </Shell>
  );
}
