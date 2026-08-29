"use client";

import { useState, useEffect, useRef } from "react";
import { currency, tierPrice, dayTypeForDate, imageFocus, imageFit, imageZoom } from "../lib/pricing";
import NavBar from "./NavBar";
import PageFooter from "./PageFooter";
import AvailabilityMonthGrid from "./AvailabilityMonthGrid";

const SOCIALS = [
  { label: "Facebook", url: "https://www.facebook.com/profile.php?id=61577960573366" },
  { label: "TikTok", url: "https://www.tiktok.com/@the.nauti.yachti" },
  { label: "Instagram", url: "https://www.instagram.com/thenautiyachtillc/" },
  { label: "GetMyBoat — Nauti Explorer", url: "https://www.getmyboat.com/trips/5Yr13eya/" },
  { label: "GetMyBoat — Nauti Yachti", url: "https://www.getmyboat.com/trips/2aM5DkWa/" },
  { label: "GetMyBoat — Nauti Islander", url: "https://www.getmyboat.com/trips/RNRjo5AN/" },
  { label: "Boatsetter — Nauti Explorer", url: "https://www.boatsetter.com/boats/nwfblfv" },
  { label: "GetMyBoat — Yolo, Lake Conroe", url: "https://www.getmyboat.com/trips/GaZ8b2dK/" },
];

const HERO_PARAGRAPHS = [
  "You can't buy happiness, but you can rent a boat. Whether you want to celebrate a special occasion, catch sunrays on a regular outing, or get a little wild on the waves, The Nauti Yachti has the perfect boat available for your boat adventure! Our skilled captains are guaranteed to turn heads and maybe even some other things while they steer you towards adventure, excitement, and maybe even a little bit of romance. We aim to provide exceptional experiences for all occasions while ensuring safety is a top priority. The Nauti Yachti therefore adheres to Lake Conroe’s boating regulations by providing proper safety gear & knowledge.",
  "Book a boat rental and prepare for a day of sun, smiles, and perhaps a touch of something special, let our captains show you the ropes for any of your special occasions such as Tubing/Wakeboarding adventures, Birthday parties, Bachelor/Bachelorette parties, Night cruises, an Epic Party Cove experience, or the unique once a year Boatz & Glowz party.",
];

function WakeLine({ flip }) {
  return (
    <svg
      viewBox="0 0 1200 60"
      preserveAspectRatio="none"
      style={{ width: "100%", height: 44, display: "block", transform: flip ? "scaleY(-1)" : "none" }}
    >
      <path
        d="M0,30 C150,10 300,50 450,30 C600,10 750,50 900,30 C1050,10 1150,45 1200,30 L1200,60 L0,60 Z"
        fill="var(--ink)"
        opacity="0.9"
      />
      <path
        d="M0,34 C150,16 300,52 450,34 C600,16 750,52 900,34 C1050,16 1150,48 1200,34"
        fill="none"
        stroke="var(--purple)"
        strokeWidth="2"
        opacity="0.6"
      />
    </svg>
  );
}

export default function SiteView({ initialPackages, initialVessels, initialGallery, initialBlocked, initialPartialDates, forecast, initialTestimonials, initialAddOns }) {
  const [packages] = useState(initialPackages);
  const [vessels] = useState(initialVessels);
  const [gallery] = useState(initialGallery);
  const [blocked] = useState(initialBlocked);
  const [partialDates] = useState(initialPartialDates || {});
  const [testimonials] = useState(initialTestimonials || []);
  const [addOns] = useState(initialAddOns || []);
  const [selectedVessel, setSelectedVessel] = useState(initialVessels[0]?.id);
  const [activePackage, setActivePackage] = useState(initialPackages[0]?.id || null);
  const [prefill, setPrefill] = useState(null);
  const [toast, setToast] = useState(null);

  function flashToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  }

  function handleBook(pkgId, selection) {
    setActivePackage(pkgId);
    setPrefill(selection);
    document.getElementById("inquire")?.scrollIntoView({ behavior: "smooth" });
  }

  async function submitPlainInquiry(form) {
    const res = await fetch("/api/inquiries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      flashToast("Something went wrong sending that — please try again or call us directly.");
      return false;
    }
    flashToast("Inquiry sent — we'll be in touch soon.");
    return true;
  }

  async function submitCheckout(form) {
    // Pay-now path: send the customer to Stripe Checkout to pay in full at
    // booking time. If Stripe isn't configured yet (503 — no keys added),
    // fall back silently to the plain inquiry flow so the site keeps working
    // for real customers in the meantime.
    try {
      const checkoutRes = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (checkoutRes.ok) {
        const data = await checkoutRes.json();
        if (data.url) {
          if (form.couponCode) {
            // Give the toast a beat on screen before the redirect to Stripe
            // carries the customer away from this page entirely.
            flashToast(data.couponApplied ? "Coupon applied!" : "That coupon code didn't work — charging full price.");
            setTimeout(() => { window.location.href = data.url; }, 900);
          } else {
            window.location.href = data.url;
          }
          return true; // navigating away
        }
      }

      if (checkoutRes.status !== 503) {
        flashToast("Something went wrong starting checkout — please try again or call us directly.");
        return false;
      }
      // else: 503 "not configured" — fall through to the plain inquiry flow below.
    } catch {
      flashToast("Something went wrong starting checkout — please try again or call us directly.");
      return false;
    }

    return submitPlainInquiry(form);
  }

  async function submitTestimonial(form) {
    const res = await fetch("/api/testimonials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      flashToast("Something went wrong sending that — please try again.");
      return false;
    }
    flashToast("Thanks for the review! It's pending review and will appear here once approved.");
    return true;
  }

  return (
    <div>
      <NavBar />

      {/* HERO */}
      <div style={{ background: "var(--ink)", color: "var(--text)", padding: "28px 24px 0", position: "relative" }}>
        <div
          aria-hidden="true"
          style={{
            position: "absolute", inset: 0,
            backgroundImage: "linear-gradient(rgba(10,6,18,0.86), rgba(10,6,18,0.93)), url(/hero-watermark.jpg)",
            backgroundSize: "cover", backgroundPosition: "center 22%", backgroundRepeat: "no-repeat",
          }}
        />
        <div style={{ maxWidth: 900, margin: "0 auto", textAlign: "center", position: "relative", zIndex: 1 }}>
          <img
            src="/logo.jpg"
            alt="The Nauti Yachti"
            style={{ width: 280, maxWidth: "70%", height: "auto", display: "inline-block", marginBottom: 20 }}
          />
          <div className="mono" style={{ color: "var(--purple)", fontSize: 13, letterSpacing: "0.15em", marginBottom: 14 }}>
            LAKE CONROE, TEXAS
          </div>
          <h1 className="display" style={{ fontSize: "clamp(42px, 8vw, 76px)", margin: 0, lineHeight: 0.95, fontWeight: 800 }}>
            Life is better<br />on a boat
          </h1>
          <div style={{ maxWidth: 800, margin: "22px auto 32px", textAlign: "left" }}>
            {HERO_PARAGRAPHS.map((p, i) => (
              <p key={i} style={{ fontSize: 16.5, opacity: 0.85, lineHeight: 1.65, margin: "0 0 14px" }}>{p}</p>
            ))}
          </div>
          <a
            href="#inquire"
            style={{
              display: "inline-block", background: "linear-gradient(135deg, var(--purple), var(--pink))", color: "#0A0612", fontWeight: 700,
              padding: "13px 28px", borderRadius: 6, textDecoration: "none", fontSize: 15,
            }}
          >
            Check availability
          </a>
        </div>
        <div style={{ height: 40 }} />
      </div>
      <WakeLine />

      {/* VESSELS */}
      <div style={{ background: "var(--ink-soft)", padding: "10px 24px 50px" }}>
        <div style={{ maxWidth: 1400, margin: "0 auto" }}>
          <h2 className="display" style={{ fontSize: 30, color: "var(--text)", marginBottom: 4 }}>Pick your vessel</h2>
          <p style={{ color: "var(--muted)", marginTop: 0, marginBottom: 22, fontSize: 14 }}>Each slip shows what that boat is built for.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px,1fr))", gap: 16 }}>
            {vessels.map((v) => {
              const active = v.id === selectedVessel;
              return (
                <button
                  key={v.id}
                  className="slip-card"
                  onClick={() => setSelectedVessel(v.id)}
                  style={{
                    textAlign: "left", border: active ? "2px solid var(--purple)" : "2px solid rgba(203,108,230,0.15)",
                    background: "var(--card)", color: "var(--text)", borderRadius: 10, padding: 0, overflow: "hidden",
                  }}
                >
                  {v.image && (
                    <img src={v.image} alt={v.name} style={{ width: "100%", aspectRatio: "4 / 3", objectFit: "cover", objectPosition: imageFocus(v.image), display: "block" }} />
                  )}
                  <div style={{ padding: 18 }}>
                    <div className="mono" style={{ color: "var(--purple)", fontSize: 12, letterSpacing: "0.12em" }}>{v.slip}</div>
                    <div className="display" style={{ fontSize: 24, fontWeight: 700, margin: "4px 0" }}>{v.name}</div>
                    <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 8 }}>
                      Capacity: {v.capacity} {v.note && v.note.toLowerCase().includes("captainless") ? "(no captain required)" : "(incl. captain)"}
                    </div>
                    <div style={{ fontSize: 13, opacity: 0.7, lineHeight: 1.4 }}>{v.note}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* PACKAGES */}
      <div id="packages" style={{ background: "var(--ink)", padding: "50px 24px" }}>
        <div style={{ maxWidth: 1400, margin: "0 auto" }}>
          <h2 className="display" style={{ fontSize: 30, color: "var(--text)", marginBottom: 22 }}>Packages & pricing</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(270px,1fr))", gap: 16 }}>
            {packages.map((p) => (
              <PackageCard
                key={p.id}
                pkg={p}
                vessels={vessels}
                defaultVesselId={selectedVessel}
                onBook={(selection) => handleBook(p.id, selection)}
              />
            ))}
          </div>
        </div>
      </div>
      <WakeLine flip />

      {/* AVAILABILITY */}
      <div id="availability" style={{ padding: "50px 24px", background: "var(--ink-soft)" }}>
        <div style={{ maxWidth: 1400, margin: "0 auto", textAlign: "center" }}>
          <h2 className="display" style={{ fontSize: 30, color: "var(--text)", marginBottom: 6 }}>
            Availability — {vessels.find((v) => v.id === selectedVessel)?.name}
          </h2>
          <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 0, marginBottom: 10 }}>
            This updates live from the owner console.
          </p>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "center", fontSize: 12.5, color: "var(--muted)", marginBottom: 18 }}>
            <span><span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 3, background: "var(--purple)", verticalAlign: "middle", marginRight: 5 }} />Open</span>
            <span><span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 3, background: "repeating-linear-gradient(45deg, #E8934A, #E8934A 3px, #C97633 3px, #C97633 6px)", verticalAlign: "middle", marginRight: 5 }} />Partially booked</span>
            <span><span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 3, background: "#3A2E40", verticalAlign: "middle", marginRight: 5 }} />Fully booked</span>
          </div>
          <AvailabilityCalendar blockedDates={blocked[selectedVessel] || []} partialDates={partialDates[selectedVessel] || {}} />
        </div>
      </div>

      {/* WEATHER */}
      {forecast && forecast.length > 0 && (
        <div style={{ padding: "50px 24px", background: "var(--ink)" }}>
          <div style={{ maxWidth: 1400, margin: "0 auto", textAlign: "center" }}>
            <h2 className="display" style={{ fontSize: 30, color: "var(--text)", marginBottom: 6 }}>
              Lake Conroe — 7-day forecast
            </h2>
            <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 0, marginBottom: 22 }}>
              Planning a trip? Here's what the water's looking like this week.
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
              {forecast.map((d) => (
                <div
                  key={d.date}
                  style={{
                    background: "var(--card)", border: "1px solid rgba(203,108,230,0.18)", borderRadius: 10,
                    padding: "16px 14px", width: 128, flexShrink: 0,
                  }}
                >
                  <div style={{ fontSize: 12.5, color: "var(--purple)", fontWeight: 700, letterSpacing: "0.05em", marginBottom: 8 }}>
                    {d.day.toUpperCase()}
                  </div>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>{d.icon}</div>
                  <div style={{ fontSize: 13, color: "var(--text)", marginBottom: 4 }}>{d.label}</div>
                  <div style={{ fontSize: 14, color: "var(--text)" }}>
                    <span style={{ fontWeight: 700 }}>{d.high}°</span>
                    <span style={{ color: "var(--muted)" }}> / {d.low}°</span>
                  </div>
                  {d.precipProb >= 30 && (
                    <div style={{ fontSize: 11.5, color: "var(--pink)", marginTop: 4 }}>💧 {d.precipProb}%</div>
                  )}
                </div>
              ))}
            </div>

            <div style={{ marginTop: 34 }}>
              <h3 className="display" style={{ fontSize: 18, color: "var(--text)", marginBottom: 4 }}>
                Live radar
              </h3>
              <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 0, marginBottom: 14 }}>
                Zoomed in on Lake Conroe — updates automatically.
              </p>
              <iframe
                title="Live weather radar centered on Lake Conroe"
                src="https://embed.windy.com/embed2.html?lat=30.394&lon=-95.584&detailLat=30.394&detailLon=-95.584&width=650&height=450&zoom=10&level=surface&overlay=radar&menu=&message=true&marker=&calendar=now&pressure=&type=map&location=coordinates&detail=&metricWind=default&metricTemp=default&radarRange=-1"
                style={{ width: "100%", maxWidth: 560, height: 400, border: "1px solid rgba(203,108,230,0.18)", borderRadius: 10 }}
                loading="lazy"
              />
            </div>
          </div>
        </div>
      )}

      {/* GALLERY */}
      <div id="gallery" style={{ background: "var(--ink)", padding: "50px 24px" }}>
        <div style={{ maxWidth: 1400, margin: "0 auto" }}>
          <h2 className="display" style={{ fontSize: 30, color: "var(--text)", marginBottom: 6 }}>On the water</h2>
          <p style={{ color: "var(--purple)", fontSize: 14, marginTop: 0, marginBottom: 18 }}>
            Follow along for the full photo & video library.
          </p>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 30 }}>
            {SOCIALS.map((s) => (
              <a
                key={s.label}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--text)", border: "1px solid var(--purple)", borderRadius: 20, padding: "7px 16px", fontSize: 13, textDecoration: "none" }}
              >
                {s.label} ↗
              </a>
            ))}
          </div>
          {(() => {
            const byCategory = gallery.reduce((acc, g) => {
              (acc[g.category] = acc[g.category] || []).push(g);
              return acc;
            }, {});
            // Show gallery sections in the same order as the packages above,
            // rather than whatever order categories first appeared in.
            const orderedCategories = [
              ...packages.map((p) => p.id).filter((id) => byCategory[id]),
              ...Object.keys(byCategory).filter((c) => !packages.some((p) => p.id === c)),
            ];
            return orderedCategories.map((category) => {
              const items = byCategory[category];
              const pkgName = packages.find((p) => p.id === category)?.name || category;
              return (
                <div key={category} style={{ marginBottom: 26 }}>
                  <div className="mono" style={{ color: "var(--purple)", fontSize: 12.5, letterSpacing: "0.08em", marginBottom: 10, textTransform: "uppercase" }}>
                    {pkgName}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px,1fr))", gap: 14 }}>
                    {items.map((g) => (
                      <div key={g.id} style={{ borderRadius: 10, overflow: "hidden", background: "var(--card)", border: "1px solid rgba(203,108,230,0.15)" }}>
                        <div style={{ aspectRatio: "3 / 4", overflow: "hidden" }}>
                          <img src={g.image} alt={g.caption} style={{ width: "100%", height: "100%", objectFit: imageFit(g.image), objectPosition: imageFocus(g.image), transform: `scale(${imageZoom(g.image)})`, display: "block" }} />
                        </div>
                        <div style={{ color: "var(--text)", fontSize: 12, fontWeight: 600, padding: "8px 10px" }}>
                          {g.caption}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            );
            });
          })()}
        </div>
      </div>

      {/* TESTIMONIALS */}
      <div id="testimonials" style={{ background: "var(--ink-soft)", padding: "50px 24px" }}>
        <div style={{ maxWidth: 1400, margin: "0 auto" }}>
          <h2 className="display" style={{ fontSize: 30, color: "var(--text)", marginBottom: 6 }}>What our guests say</h2>
          {testimonials.length > 0 && (
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 22, fontWeight: 800, color: "var(--text)" }}>
                {(testimonials.reduce((s, t) => s + t.rating, 0) / testimonials.length).toFixed(1)}
              </span>
              <span style={{ color: "#E8934A", fontSize: 16, letterSpacing: 2 }}>★★★★★</span>
              <span style={{ color: "var(--muted)", fontSize: 13.5 }}>
                average from {testimonials.length} review{testimonials.length === 1 ? "" : "s"}
              </span>
            </div>
          )}
          <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 0, marginBottom: 22 }}>
            Real reviews from real charters — and we'd love to hear about yours.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,2fr) minmax(280px,1fr)", gap: 30, alignItems: "start" }}>
            <div style={{ columns: "240px 3", columnGap: 16 }}>
              {testimonials.length === 0 && (
                <div style={{ color: "var(--muted)", fontSize: 14 }}>No reviews yet — be the first to share your experience!</div>
              )}
              {testimonials.map((t) => <TestimonialCard key={t.id} t={t} />)}
            </div>
            <TestimonialForm onSubmit={submitTestimonial} />
          </div>
        </div>
      </div>

      {/* INQUIRY */}
      <div id="inquire" style={{ background: "var(--ink-soft)", padding: "56px 24px 80px" }}>
        <div style={{ maxWidth: 1400, margin: "0 auto", display: "grid", gridTemplateColumns: "minmax(260px,1fr) minmax(360px,720px)", gap: 44, alignItems: "start" }}>
          <div style={{ paddingTop: 6 }}>
            <h2 className="display" style={{ fontSize: 30, color: "var(--text)", marginBottom: 6 }}>Check availability & inquire</h2>
            <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 0, marginBottom: 26 }}>
              We'll get back to you fast — this goes straight to our dashboard and email.
            </p>
            <div style={{ display: "grid", gap: 16 }}>
              <div style={{ background: "var(--card)", border: "1px solid rgba(203,108,230,0.18)", borderRadius: 10, padding: "16px 18px" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--purple)", marginBottom: 4 }}>Fast response</div>
                <div style={{ fontSize: 13.5, color: "var(--text)", opacity: 0.85, lineHeight: 1.5 }}>
                  Every inquiry lands directly on our dashboard — we typically reply the same day.
                </div>
              </div>
              <div style={{ background: "var(--card)", border: "1px solid rgba(203,108,230,0.18)", borderRadius: 10, padding: "16px 18px" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--purple)", marginBottom: 4 }}>Flexible cancellation</div>
                <div style={{ fontSize: 13.5, color: "var(--text)", opacity: 0.85, lineHeight: 1.5 }}>
                  Full refund 24+ hours out, and free rescheduling 2+ days before your charter. See our <a href="/terms" style={{ color: "var(--purple)" }}>full policy</a>.
                </div>
              </div>
              <div style={{ background: "var(--card)", border: "1px solid rgba(203,108,230,0.18)", borderRadius: 10, padding: "16px 18px" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--purple)", marginBottom: 4 }}>Prefer to talk it through?</div>
                <div style={{ fontSize: 13.5, color: "var(--text)", opacity: 0.85, lineHeight: 1.5 }}>
                  TheNautiYachti@Gmail.com — 832-948-2912
                </div>
              </div>
            </div>
          </div>
          <InquiryForm packages={packages} vessels={vessels} addOns={addOns} defaultPackageId={activePackage} prefill={prefill} onSubmitPay={submitCheckout} onSubmitInquire={submitPlainInquiry} />
        </div>
      </div>

      <PageFooter />

      {toast && (
        <div
          style={{
            position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)",
            background: "var(--card)", color: "var(--text)", padding: "12px 20px", borderRadius: 8,
            border: "1px solid var(--purple)", fontSize: 14, boxShadow: "0 8px 24px rgba(0,0,0,0.4)", zIndex: 50, maxWidth: "90%", textAlign: "center",
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}

function PackageCard({ pkg, vessels, defaultVesselId, onBook }) {
  const [hour, setHour] = useState(3);
  const [vesselId, setVesselId] = useState(defaultVesselId);
  const [dayType, setDayType] = useState("weekday");
  const [guests, setGuests] = useState(4);

  useEffect(() => { setVesselId(defaultVesselId); }, [defaultVesselId]);

  const currentVessel = vessels.find((v) => v.id === vesselId);
  useEffect(() => {
    if (currentVessel && guests > currentVessel.capacity) setGuests(currentVessel.capacity);
  }, [currentVessel]); // eslint-disable-line

  let price = pkg.price;
  if (pkg.pricingType === "hourly-by-vessel") price = pkg.hourlyByVessel[vesselId]?.[dayType]?.[hour];
  if (pkg.pricingType === "per-guest") price = guests * pkg.pricePerGuest;
  if (pkg.pricingType === "tiered-by-guests") price = tierPrice(pkg.tiers, guests);

  return (
    <div style={{ background: "var(--card)", border: "1px solid rgba(203,108,230,0.18)", borderRadius: 10, padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      {pkg.image && (
        <img src={pkg.image} alt={pkg.name} style={{ width: "100%", aspectRatio: "4 / 3", objectFit: "cover", objectPosition: imageFocus(pkg.image), display: "block" }} />
      )}
      <div style={{ padding: 18, display: "flex", flexDirection: "column", flex: 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <div className="display" style={{ fontSize: 20, color: "var(--text)", fontWeight: 700 }}>{pkg.name}</div>
        <div className="mono" style={{ color: "var(--pink)", fontWeight: 700, fontSize: 18, whiteSpace: "nowrap" }}>{currency(price)}</div>
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>{pkg.unit}</div>

      {pkg.linkLabel && pkg.linkUrl && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <a href={pkg.linkUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--pink)", fontWeight: 700, fontSize: 13, display: "inline-block", textDecoration: "underline" }}>
            {pkg.linkLabel} ↗
          </a>
          {pkg.id === "wakesurf" && (
            <img src="/yolo-lake-conroe-logo.png" alt="Yolo Lake Conroe" style={{ width: 26, height: 26, borderRadius: "50%", display: "block" }} />
          )}
        </div>
      )}
      {pkg.blurb.split("\n\n").map((para, i) => (
        <p key={i} style={{ fontSize: 13.5, color: "var(--text)", opacity: 0.85, lineHeight: 1.5, margin: "0 0 10px" }}>{para}</p>
      ))}
      {pkg.bullets && (
        <div style={{ marginBottom: 10 }}>
          {pkg.bulletsIntro && <div style={{ fontSize: 13, color: "var(--text)", fontWeight: 600, marginBottom: 4 }}>{pkg.bulletsIntro}</div>}
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "var(--text)", opacity: 0.85, lineHeight: 1.6 }}>
            {pkg.bullets.map((b, i) => <li key={i}>{b}</li>)}
          </ul>
        </div>
      )}
      {pkg.closing && pkg.closing.split("\n\n").map((para, i) => (
        <p key={`c${i}`} style={{ fontSize: 13.5, color: "var(--text)", opacity: 0.85, lineHeight: 1.5, margin: "0 0 10px" }}>{para}</p>
      ))}

      {pkg.pricingType === "hourly-by-vessel" && (
        <div style={{ display: "grid", gap: 8, marginBottom: 10 }}>
          <div>
            <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 4 }}>Vessel</label>
            <select value={vesselId} onChange={(e) => setVesselId(e.target.value)}
              style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)", fontSize: 13 }}>
              {vessels.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 4 }}>Day</label>
              <select value={dayType} onChange={(e) => setDayType(e.target.value)}
                style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)", fontSize: 13 }}>
                <option value="weekday">Weekday</option>
                <option value="weekend">Weekend</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 4 }}>Hours</label>
              <select value={hour} onChange={(e) => setHour(Number(e.target.value))}
                style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)", fontSize: 13 }}>
                {Object.keys(pkg.hourlyByVessel[vesselId]?.[dayType] || {}).map((h) => (
                  <option key={h} value={h}>{h}hr</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {pkg.pricingType === "per-guest" && (
        <div style={{ display: "grid", gap: 8, marginBottom: 10 }}>
          <div>
            <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 4 }}>Vessel</label>
            <select value={vesselId} onChange={(e) => setVesselId(e.target.value)}
              style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)", fontSize: 13 }}>
              {vessels.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 4 }}>Guests</label>
            <select value={guests} onChange={(e) => setGuests(Number(e.target.value))}
              style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)", fontSize: 13 }}>
              {Array.from({ length: currentVessel?.capacity || 14 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div className="mono" style={{ fontSize: 11.5, color: "var(--purple)" }}>
            One date only this year: {new Date(pkg.eventDate + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} · {pkg.fixedHours} hrs
            <div style={{ color: "var(--muted)", marginTop: 2 }}>The first Boatz & Glowz this year (May) has already happened.</div>
          </div>
        </div>
      )}

      {pkg.pricingType === "tiered-by-guests" && (
        <div style={{ display: "grid", gap: 8, marginBottom: 10 }}>
          <div>
            <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 4 }}>Guests</label>
            <select value={guests} onChange={(e) => setGuests(Number(e.target.value))}
              style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)", fontSize: 13 }}>
              {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div className="mono" style={{ fontSize: 11.5, color: "var(--muted)" }}>{pkg.fixedHours} hrs, fixed</div>
        </div>
      )}

      <button
        onClick={() => onBook({ vesselId, dayType, hour, guests })}
        style={{ background: "var(--purple)", color: "#0A0612", border: "none", borderRadius: 6, padding: "8px 14px", fontSize: 13, fontWeight: 700, marginTop: "auto", alignSelf: "flex-start" }}
      >
        Book this
      </button>
      </div>
    </div>
  );
}

function AvailabilityCalendar({ blockedDates, partialDates }) {
  // Computed client-side only: "today" must reflect the viewer's local clock,
  // and doing this during SSR causes hydration mismatches when the server's
  // timezone differs from the browser's.
  const [months, setMonths] = useState(null);
  useEffect(() => {
    const now = new Date();
    setMonths([
      { year: now.getFullYear(), month: now.getMonth() },
      { year: now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear(), month: (now.getMonth() + 1) % 12 },
    ]);
  }, []);

  function getState(key) {
    if (blockedDates.includes(key)) return "full";
    return partialDates[key] || "open";
  }

  if (!months) return null;

  return (
    <div style={{ display: "flex", gap: 32, flexWrap: "wrap", justifyContent: "center" }}>
      {months.map((m) => (
        <AvailabilityMonthGrid key={`${m.year}-${m.month}`} year={m.year} month={m.month} getState={getState} />
      ))}
    </div>
  );
}

function InquiryForm({ packages, vessels, addOns, defaultPackageId, prefill, onSubmitPay, onSubmitInquire }) {
  const [form, setForm] = useState({
    name: "", email: "", phone: "", packageId: defaultPackageId || packages[0]?.id,
    vesselId: vessels[0]?.id, date: "", partySize: "", message: "", hours: 3, couponCode: "",
    addOnIds: [], agreeTerms: false,
  });
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const selectedPkg = packages.find((p) => p.id === form.packageId);

  useEffect(() => {
    if (defaultPackageId) setForm((f) => ({ ...f, packageId: defaultPackageId }));
  }, [defaultPackageId]);

  useEffect(() => {
    if (selectedPkg?.pricingType === "per-guest" && selectedPkg.eventDate) {
      setForm((f) => (f.date === selectedPkg.eventDate ? f : { ...f, date: selectedPkg.eventDate }));
    }
  }, [form.packageId]); // eslint-disable-line

  useEffect(() => {
    if (prefill) {
      setForm((f) => ({
        ...f,
        vesselId: prefill.vesselId || f.vesselId,
        hours: prefill.hour || f.hours,
        partySize: prefill.guests || f.partySize,
      }));
    }
  }, [prefill]);

  function dayTypeFor(dateStr) {
    return dayTypeForDate(dateStr);
  }
  const dayType = dayTypeFor(form.date);

  function field(name, label, type = "text", extra = {}) {
    return (
      <label style={{ display: "block" }}>
        <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 4, fontWeight: 600 }}>{label}</div>
        <input
          type={type}
          value={form[name]}
          onChange={(e) => setForm({ ...form, [name]: e.target.value })}
          required
          style={{ width: "100%", padding: "10px 12px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)", fontSize: 14 }}
          {...extra}
        />
      </label>
    );
  }
  const fullWidth = { gridColumn: "1 / -1" };

  async function runSubmit(handler) {
    const pkg = packages.find((p) => p.id === form.packageId);
    const vessel = vessels.find((v) => v.id === form.vesselId);

    let priceQuoted = pkg?.price;
    if (pkg?.pricingType === "hourly-by-vessel") priceQuoted = pkg.hourlyByVessel[form.vesselId]?.[dayType]?.[form.hours];
    if (pkg?.pricingType === "per-guest") priceQuoted = Number(form.partySize || 0) * pkg.pricePerGuest;
    if (pkg?.pricingType === "tiered-by-guests") priceQuoted = tierPrice(pkg.tiers, Number(form.partySize || 1));

    setSubmitting(true);
    const ok = await handler({ ...form, packageName: pkg?.name, vesselName: vessel?.name, priceQuoted });
    // On a successful checkout redirect the browser navigates away entirely,
    // so `submitting` staying true until then is fine — there's no page left
    // to show a stuck button on.
    if (ok) {
      setSent(true);
      setForm({ name: "", email: "", phone: "", packageId: packages[0]?.id, vesselId: vessels[0]?.id, date: "", partySize: "", message: "", hours: 3, couponCode: "", addOnIds: [], agreeTerms: false });
      setTimeout(() => setSent(false), 3500);
    } else {
      setSubmitting(false);
    }
  }

  function submit(e) {
    e.preventDefault();
    runSubmit(onSubmitPay);
  }

  function inquireOnly(e) {
    // type="button" skips native required-field validation, so check it
    // manually — same experience as clicking the submit button would give.
    if (!e.currentTarget.form.reportValidity()) return;
    runSubmit(onSubmitInquire);
  }

  return (
    <form onSubmit={submit} style={{ background: "var(--card)", border: "1px solid rgba(203,108,230,0.2)", borderRadius: 12, padding: 20, boxShadow: "0 4px 24px rgba(0,0,0,0.35)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 14px", marginBottom: 12 }}>
        {field("name", "Name")}
        {field("email", "Email", "email")}
        {field("phone", "Phone", "tel")}

        <label style={{ display: "block" }}>
          <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 4, fontWeight: 600 }}>Package</div>
          <select value={form.packageId} onChange={(e) => setForm({ ...form, packageId: e.target.value })}
            style={{ width: "100%", padding: "10px 12px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)", fontSize: 14 }}>
            {packages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.pricingType === "flat" ? ` — ${currency(p.price)}` : p.pricingType === "per-guest" ? ` — ${currency(p.pricePerGuest)}/guest` : p.pricingType === "tiered-by-guests" ? ` — from ${currency(p.tiers[0].price)}` : ""}
              </option>
            ))}
          </select>
        </label>

        {selectedPkg?.vessels?.length > 0 && (
          <label style={{ display: "block" }}>
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 4, fontWeight: 600 }}>Vessel</div>
            <select value={form.vesselId} onChange={(e) => setForm({ ...form, vesselId: e.target.value })}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)", fontSize: 14 }}>
              {vessels.map((v) => <option key={v.id} value={v.id}>{v.name} (cap. {v.capacity})</option>)}
            </select>
          </label>
        )}

        {selectedPkg?.pricingType === "per-guest" ? (
          <div style={{ ...fullWidth, background: "rgba(203,108,230,0.08)", border: "1px solid rgba(203,108,230,0.3)", borderRadius: 6, padding: "10px 12px" }}>
            <div style={{ fontSize: 12.5, color: "var(--muted)", fontWeight: 600, marginBottom: 2 }}>Event date</div>
            <div style={{ fontSize: 14 }}>
              {new Date(selectedPkg.eventDate + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} · {selectedPkg.fixedHours} hrs — the only date available this year
            </div>
          </div>
        ) : (
          field("date", "Requested date", "date")
        )}

        {selectedPkg?.pricingType === "hourly-by-vessel" && (
          <label style={{ display: "block" }}>
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 4, fontWeight: 600 }}>
              Duration <span style={{ color: "var(--purple)", fontWeight: 400 }}>({form.date ? (dayType === "weekend" ? "weekend" : "weekday") + " rate" : "pick a date to confirm weekday/weekend rate"})</span>
            </div>
            <select value={form.hours} onChange={(e) => setForm({ ...form, hours: Number(e.target.value) })}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)", fontSize: 14 }}>
              {Object.keys(selectedPkg.hourlyByVessel[form.vesselId]?.[dayType] || {}).map((h) => (
                <option key={h} value={h}>{h} hour{h === "1" ? "" : "s"} — {currency(selectedPkg.hourlyByVessel[form.vesselId][dayType][h])}</option>
              ))}
            </select>
          </label>
        )}

        {field("partySize", "Party size", "number", { min: 1 })}

        <label style={{ display: "block" }}>
          <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 4, fontWeight: 600 }}>Coupon code <span style={{ color: "var(--muted)", fontWeight: 400 }}>(optional)</span></div>
          <input
            type="text"
            value={form.couponCode}
            onChange={(e) => setForm({ ...form, couponCode: e.target.value.toUpperCase() })}
            style={{ width: "100%", padding: "10px 12px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)", fontSize: 14 }}
          />
        </label>

        {addOns && addOns.length > 0 && (
          <AddOnsDropdown
            addOns={addOns}
            selectedIds={form.addOnIds}
            onChange={(ids) => setForm({ ...form, addOnIds: ids })}
          />
        )}

        <label style={{ display: "block", ...fullWidth }}>
          <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 4, fontWeight: 600 }}>Anything else?</div>
          <textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} rows={3}
            style={{ width: "100%", padding: "10px 12px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)", fontSize: 14, fontFamily: "inherit" }} />
        </label>
      </div>

      <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 14, fontSize: 13, color: "var(--muted)" }}>
        <input
          type="checkbox"
          checked={form.agreeTerms}
          onChange={(e) => setForm({ ...form, agreeTerms: e.target.checked })}
          required
          style={{ marginTop: 3 }}
        />
        <span>
          I have read and agree to the{" "}
          <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: "var(--purple)", textDecoration: "underline" }}>
            Terms &amp; Cancellation Policy
          </a>
        </span>
      </label>
      <button type="submit" disabled={submitting} style={{ width: "100%", background: "linear-gradient(135deg, var(--purple), var(--pink))", color: "#0A0612", border: "none", borderRadius: 6, padding: "12px", fontWeight: 700, fontSize: 15, opacity: submitting ? 0.7 : 1 }}>
        {sent ? "Request sent ✓" : submitting ? "Redirecting to payment…" : "Book & pay now"}
      </button>
      <button type="button" onClick={inquireOnly} disabled={submitting} style={{ width: "100%", marginTop: 10, background: "transparent", color: "var(--purple)", border: "1px solid var(--purple)", borderRadius: 6, padding: "11px", fontWeight: 600, fontSize: 14, opacity: submitting ? 0.7 : 1 }}>
        Not ready to pay? Just send an inquiry
      </button>
    </form>
  );
}

// A collapsed dropdown (like the Duration select) that expands into a
// checkbox list so more than one add-on can be picked, then closes back
// down — not a native <select multiple>, which stays open as a scroll box.
function AddOnsDropdown({ addOns, selectedIds, onChange }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    function onDocClick(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function toggle(id) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  }

  const summary =
    selectedIds.length === 0
      ? "None selected"
      : selectedIds.length === 1
      ? addOns.find((a) => a.id === selectedIds[0])?.name || "1 selected"
      : `${selectedIds.length} selected`;

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 4, fontWeight: 600 }}>Add-ons <span style={{ color: "var(--muted)", fontWeight: 400 }}>(optional)</span></div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%", padding: "10px 12px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)", fontSize: 14,
          background: "#fff", color: selectedIds.length ? "inherit" : "var(--muted)", textAlign: "left",
          display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer",
        }}
      >
        <span>{summary}</span>
        <span style={{ opacity: 0.6, fontSize: 11 }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div
          style={{
            position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, zIndex: 10,
            background: "#fff", border: "1px solid rgba(203,108,230,0.3)", borderRadius: 6,
            boxShadow: "0 8px 24px rgba(0,0,0,0.25)", padding: 6,
          }}
        >
          {addOns.map((a) => (
            <label key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", borderRadius: 5, cursor: "pointer", fontSize: 13.5 }}>
              <input type="checkbox" checked={selectedIds.includes(a.id)} onChange={() => toggle(a.id)} />
              <span>{a.name} — {currency(a.price)}{a.unit ? ` ${a.unit}` : ""}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function TestimonialCard({ t }) {
  return (
    <div style={{ background: "var(--card)", border: "1px solid rgba(203,108,230,0.18)", borderRadius: 10, padding: 18, breakInside: "avoid", marginBottom: 16, display: "block" }}>
      <div style={{ color: "#E8934A", fontSize: 16, letterSpacing: 2, marginBottom: 8 }}>
        {"★".repeat(t.rating)}{"☆".repeat(5 - t.rating)}
      </div>
      <p style={{ fontSize: 14, color: "var(--text)", opacity: 0.9, lineHeight: 1.6, margin: "0 0 14px" }}>
        &ldquo;{t.quote}&rdquo;
      </p>
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{t.name}</div>
      {t.packageOrVessel && <div style={{ fontSize: 12, color: "var(--purple)", marginTop: 2 }}>{t.packageOrVessel}</div>}
    </div>
  );
}

function TestimonialForm({ onSubmit }) {
  const emptyForm = { name: "", rating: 5, quote: "", packageOrVessel: "" };
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSubmitting(true);
    const ok = await onSubmit(form);
    if (ok) {
      setForm(emptyForm);
      setSent(true);
      setTimeout(() => setSent(false), 4000);
    }
    setSubmitting(false);
  }

  return (
    <form onSubmit={submit} style={{ background: "var(--card)", border: "1px solid rgba(203,108,230,0.2)", borderRadius: 12, padding: 20, boxShadow: "0 4px 24px rgba(0,0,0,0.35)" }}>
      <div className="display" style={{ fontSize: 18, color: "var(--text)", marginBottom: 4 }}>Share your experience</div>
      <p style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 0, marginBottom: 14 }}>
        We read every submission — yours will appear above once we approve it.
      </p>
      <label style={{ display: "block", marginBottom: 12 }}>
        <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 4, fontWeight: 600 }}>Name</div>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
          style={{ width: "100%", padding: "10px 12px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)", fontSize: 14 }}
        />
      </label>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 4, fontWeight: 600 }}>Rating</div>
        <div style={{ display: "flex", gap: 2 }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setForm({ ...form, rating: n })}
              aria-label={`${n} star${n === 1 ? "" : "s"}`}
              style={{ background: "transparent", border: "none", cursor: "pointer", padding: 2, fontSize: 26, lineHeight: 1, color: n <= form.rating ? "#E8934A" : "rgba(203,108,230,0.25)" }}
            >
              ★
            </button>
          ))}
        </div>
      </div>
      <label style={{ display: "block", marginBottom: 12 }}>
        <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 4, fontWeight: 600 }}>
          Package / vessel <span style={{ fontWeight: 400 }}>(optional)</span>
        </div>
        <input
          type="text"
          value={form.packageOrVessel}
          onChange={(e) => setForm({ ...form, packageOrVessel: e.target.value })}
          placeholder="e.g. Party Cove on the Nauti Yachti"
          style={{ width: "100%", padding: "10px 12px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)", fontSize: 14 }}
        />
      </label>
      <label style={{ display: "block", marginBottom: 14 }}>
        <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 4, fontWeight: 600 }}>Your review</div>
        <textarea
          value={form.quote}
          onChange={(e) => setForm({ ...form, quote: e.target.value })}
          rows={4}
          required
          style={{ width: "100%", padding: "10px 12px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)", fontSize: 14, fontFamily: "inherit" }}
        />
      </label>
      <button
        type="submit"
        disabled={submitting}
        style={{ width: "100%", background: "linear-gradient(135deg, var(--purple), var(--pink))", color: "#0A0612", border: "none", borderRadius: 6, padding: "12px", fontWeight: 700, fontSize: 15, opacity: submitting ? 0.7 : 1 }}
      >
        {sent ? "Thanks — pending review ✓" : submitting ? "Sending…" : "Submit review"}
      </button>
    </form>
  );
}
