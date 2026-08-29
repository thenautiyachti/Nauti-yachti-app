"use client";

import { useState, useEffect, useRef } from "react";
import { currency, localDateKey, imageFocus } from "../lib/pricing";
import AvailabilityMonthGrid from "./AvailabilityMonthGrid";

const EXPENSE_CATEGORIES = [
  "01. Gas", "02. Food & Party", "03. Cleaning Supplies", "04. Apparel & Advertisement",
  "05. Boat & Truck Repairs/parts", "06. Utilities", "07. Cell Phone/Internet",
  "08. Storage", "09. Training", "10. ADP & Employee payout",
];
const INCOME_CATEGORIES = [
  "Reservation", "Add-On (+1 Hour)", "Add-On (+2 Hour)", "Add-On (+3 Hour)", "Add-On (+4 Hour)",
  "Womens Apparel", "Mens Apparel", "Other",
];
const RESERVATION_ORIGINS = ["Boatsetter", "GetmyBoat", "Facebook", "Instagram", "Website", "Friends", "Other"];
const STATEMENT_ORIGINS = ["Cash", "CashApp Statement", "Gmail Statement", "Paypal Statement", "Wells Fargo Statement", "WoodForest Statement", "Other"];

export default function AdminView({
  packages, vessels, gallery, blocked, partialDates, inquiries, ledger, totals, addons, externalBookings,
  maintenanceItems, engineHours, fuelLogs, coupons, subscriptions, mediaDrafts, testimonials,
  onUpdatePrice, onUpdatePricePerGuest, onUpdateHourlyByVesselPrice, onUpdateTierPrice,
  onAddLedgerEntry, onToggleBlocked, onUpdateCaption, onMarkInquiry, onLogout,
  onUpdateAddonPrice, onAddExternalBooking, onSetExternalBookingStatus, onUpdateExternalBooking, onDeleteExternalBooking,
  onUpdateMaintenanceItem, onAddEngineHoursLog, onAddFuelLog,
  onAddCoupon, onToggleCouponActive, onDeleteCoupon,
  onAddSubscription, onUpdateSubscription, onDeleteSubscription,
  onUpdateMediaDraftStatus, onDeleteMediaDraft,
  onUpdateTestimonialStatus, onDeleteTestimonial,
}) {
  const [tab, setTab] = useState("inquiries");

  // Jarvis audio machinery lives here — not inside JarvisTab — so switching
  // admin console tabs doesn't tear down the AudioContext/gain/compressor
  // graph or the 2s speech-polling loop. AdminView stays mounted for the
  // whole console session; only a full page reload should require the owner
  // to re-click "Enable Jarvis Audio". See JarvisTab below for the render
  // side of this (the button/status badge still live on the Jarvis tab).
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [lastSpoken, setLastSpoken] = useState("");
  const [audioNote, setAudioNote] = useState("");
  const audioElRef = useRef(null);
  const audioCtxRef = useRef(null);
  const gainNodeRef = useRef(null);
  const sinceRef = useRef(null);

  // Speech poll — every 2s, only once audio has been unlocked by a click.
  useEffect(() => {
    if (!audioEnabled) return;
    let cancelled = false;
    let inFlight = false;

    async function pollSpeech() {
      if (inFlight) return;
      inFlight = true;
      try {
        const since = sinceRef.current || new Date().toISOString();
        const res = await fetch(`/api/admin/speak?since=${encodeURIComponent(since)}`);
        if (!res.ok || cancelled) return;
        const events = await res.json();
        if (!events.length) return;
        sinceRef.current = events[events.length - 1].createdAt;
        for (const ev of events) playSpeech(ev);
      } catch {
        // transient — just try again on the next tick
      } finally {
        inFlight = false;
      }
    }

    const interval = setInterval(pollSpeech, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioEnabled]);

  function playSpeech(ev) {
    setLastSpoken(ev.text);
    const el = audioElRef.current;
    if (!el) return;
    el.src = `data:audio/mpeg;base64,${ev.audioB64}`;
    el.play()
      .then(() => setAudioNote(""))
      .catch((err) => {
        console.error("Jarvis audio playback blocked:", err);
        setAudioNote("Playback blocked — click anywhere on the page to retry.");
        const retry = () => {
          audioCtxRef.current && audioCtxRef.current.resume();
          el.play().then(() => {
            setAudioNote("");
            document.removeEventListener("click", retry);
          }).catch(() => {});
        };
        document.addEventListener("click", retry);
      });
  }

  function enableAudio() {
    // Create the ONE AudioContext right here, inside a real user gesture, so
    // the browser doesn't leave it suspended — then reuse this exact
    // instance (and the single <audio> element below) for every message
    // instead of creating a new one per message. Same pattern as the
    // standalone Jarvis-Voice-UI HUD's ACTIVATE button.
    if (!audioCtxRef.current) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) audioCtxRef.current = new Ctx();
    }
    if (audioCtxRef.current) audioCtxRef.current.resume();

    // Route the <audio> element through a gain node (with a compressor
    // after it to catch peaks) so playback is louder than the raw
    // ElevenLabs output without clipping — a media element can only be
    // wired into a MediaElementSourceNode once, so this only runs the
    // first time.
    if (audioCtxRef.current && audioElRef.current && !gainNodeRef.current) {
      try {
        const source = audioCtxRef.current.createMediaElementSource(audioElRef.current);
        const gain = audioCtxRef.current.createGain();
        gain.gain.value = 2.6;
        const compressor = audioCtxRef.current.createDynamicsCompressor();
        compressor.threshold.value = -18;
        compressor.knee.value = 24;
        compressor.ratio.value = 8;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.25;
        source.connect(gain);
        gain.connect(compressor);
        compressor.connect(audioCtxRef.current.destination);
        gainNodeRef.current = gain;
      } catch (err) {
        console.error("Jarvis audio gain boost setup failed:", err);
      }
    }

    sinceRef.current = new Date().toISOString();
    setAudioEnabled(true);
  }

  const tabs = [
    { id: "inquiries", label: `Inquiries (${inquiries.length})` },
    { id: "bookings", label: `Bookings (${inquiries.length + externalBookings.length})` },
    { id: "pricing", label: "Packages & pricing" },
    { id: "addons", label: "Add-ons" },
    { id: "coupons", label: "Coupons" },
    { id: "availability", label: "Availability" },
    { id: "media", label: "Media" },
    { id: "mediaDrafts", label: `Media Drafts (${mediaDrafts.filter((d) => d.status === "pending").length})` },
    { id: "testimonials", label: `Testimonials (${testimonials.filter((t) => t.status === "pending").length})` },
    { id: "ledger", label: "Income & expenses" },
    { id: "maintenance", label: "Maintenance" },
    { id: "subscriptions", label: "Subscriptions" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "var(--ink)" }}>
      {/* Persists across tab switches — see the Jarvis audio state above. */}
      <audio ref={audioElRef} style={{ display: "none" }} />
      <div style={{ background: "var(--ink-soft)", color: "var(--text)", padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(203,108,230,0.2)" }}>
        <div className="display" style={{ fontSize: 20, fontWeight: 700 }}>OWNER CONSOLE</div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button
            onClick={() => setTab("jarvis")}
            style={{
              background: tab === "jarvis" ? "linear-gradient(135deg, #00d9ff, #0ea5e9)" : "rgba(0,217,255,0.08)",
              color: tab === "jarvis" ? "#04070a" : "#4ff3ff",
              border: "1px solid #0ea5e9", borderRadius: 6, padding: "7px 14px", fontSize: 13, fontWeight: 700,
              letterSpacing: "0.04em", boxShadow: tab === "jarvis" ? "0 0 14px rgba(0,217,255,0.5)" : "none",
            }}
          >
            ⚡ Jarvis
          </button>
          <a href="/" style={{ background: "transparent", color: "var(--text)", border: "1px solid var(--purple)", borderRadius: 6, padding: "7px 14px", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
            ← Back to site
          </a>
          <button onClick={onLogout} style={{ background: "var(--purple)", color: "#0A0612", border: "none", borderRadius: 6, padding: "7px 14px", fontSize: 13, fontWeight: 700 }}>
            Log out
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, padding: "16px 24px 0", flexWrap: "nowrap", overflowX: "auto", whiteSpace: "nowrap" }}>
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            background: tab === t.id ? "var(--purple)" : "transparent", color: tab === t.id ? "#0A0612" : "var(--text)",
            border: "1px solid var(--purple)", borderRadius: "8px 8px 0 0", padding: "9px 14px", fontSize: 13, fontWeight: 600,
            flexShrink: 0, whiteSpace: "nowrap",
          }}>{t.label}</button>
        ))}
      </div>

      <div style={{ padding: 24 }}>
        {tab === "inquiries" && (
          <div style={{ display: "grid", gap: 10 }}>
            {inquiries.length === 0 && <div style={{ color: "var(--muted)" }}>No inquiries yet — they'll show up here the moment a customer submits the form.</div>}
            {inquiries.map((i) => (
              <div key={i.id} style={{ background: "var(--card)", borderRadius: 8, padding: 14, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", color: "var(--text)" }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{i.name} — {i.packageName}</div>
                  <div style={{ fontSize: 12.5, color: "var(--muted)" }}>
                    {i.email} · {i.phone} · {i.vesselName || "—"} · {i.date || "—"} · party of {i.partySize || "—"}
                    {i.priceQuoted ? ` · ${currency(i.priceQuoted)}` : ""}
                    {i.couponCode ? ` · coupon ${i.couponCode} (−${currency(i.discountAmount || 0)})` : ""}
                  </div>
                  {i.message && <div style={{ fontSize: 12.5, marginTop: 4 }}>{i.message}</div>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    className="mono"
                    style={{
                      fontSize: 11, fontWeight: 700, padding: "4px 9px", borderRadius: 20, textTransform: "uppercase", letterSpacing: "0.04em",
                      color: i.paymentStatus === "paid" ? "#0A0612" : "var(--text)",
                      background: i.paymentStatus === "paid" ? "var(--purple)" : i.paymentStatus === "refunded" ? "rgba(232,147,74,0.25)" : "rgba(203,108,230,0.12)",
                      border: i.paymentStatus === "paid" ? "none" : "1px solid rgba(203,108,230,0.3)",
                    }}
                  >
                    {i.paymentStatus || "unpaid"}
                  </span>
                  <select value={i.status} onChange={(e) => onMarkInquiry(i.id, e.target.value)} style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)", fontSize: 12.5 }}>
                    <option value="new">New</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="declined">Declined</option>
                  </select>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "bookings" && (
          <BookingsTab
            vessels={vessels}
            inquiries={inquiries}
            externalBookings={externalBookings}
            addOns={addons}
            onAddExternalBooking={onAddExternalBooking}
            onSetExternalBookingStatus={onSetExternalBookingStatus}
            onUpdateExternalBooking={onUpdateExternalBooking}
            onDeleteExternalBooking={onDeleteExternalBooking}
            onMarkInquiry={onMarkInquiry}
          />
        )}

        {tab === "addons" && (
          <div style={{ display: "grid", gap: 10, maxWidth: 480 }}>
            {addons.map((a) => (
              <div key={a.id} style={{ background: "var(--card)", borderRadius: 8, padding: 12, color: "var(--text)", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{a.name}</div>
                  {a.blurb && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{a.blurb}</div>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                  <span className="mono">$</span>
                  <input type="number" defaultValue={a.price} onBlur={(e) => onUpdateAddonPrice(a.id, Number(e.target.value))}
                    style={{ width: 70, padding: "6px 8px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)" }} />
                  <span style={{ fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" }}>{a.unit}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "coupons" && (
          <CouponsTab coupons={coupons} onAdd={onAddCoupon} onToggleActive={onToggleCouponActive} onDelete={onDeleteCoupon} />
        )}

        {tab === "pricing" && (
          <div style={{ display: "grid", gap: 10, maxWidth: 960 }}>
            {packages.map((p) => (
              <div key={p.id} style={{ background: "var(--card)", borderRadius: 8, padding: 12, color: "var(--text)" }}>
                <div
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12,
                    marginBottom: p.pricingType === "hourly-by-vessel" || p.pricingType === "tiered-by-guests" ? 8 : 6,
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 14, minWidth: 0 }}>
                    {p.name} <span style={{ color: "var(--muted)", fontWeight: 400, fontSize: 12 }}>({p.unit})</span>
                  </div>

                  {p.pricingType === "per-guest" && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                      <span className="mono">$</span>
                      <input type="number" defaultValue={p.pricePerGuest} onBlur={(e) => onUpdatePricePerGuest(p.id, Number(e.target.value))}
                        style={{ width: 80, padding: "6px 8px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)" }} />
                    </div>
                  )}

                  {p.pricingType === "flat" && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                      <span className="mono">$</span>
                      <input type="number" defaultValue={p.price} onBlur={(e) => onUpdatePrice(p.id, Number(e.target.value))}
                        style={{ width: 80, padding: "6px 8px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)" }} />
                    </div>
                  )}
                </div>

                {p.pricingType === "per-guest" && (
                  <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>
                    / guest · {p.fixedHours}hrs · {new Date(p.eventDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </div>
                )}

                {p.pricingType === "hourly-by-vessel" && (
                  <div style={{ display: "grid", gap: 10 }}>
                    {vessels.map((v) => (
                      <div key={v.id}>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--purple)", marginBottom: 4 }}>{v.name}</div>
                        {["weekday", "weekend"].map((dt) => (
                          <div key={dt} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 4 }}>
                            <span style={{ fontSize: 11, color: "var(--muted)", width: 62, textTransform: "capitalize" }}>{dt}</span>
                            {Object.keys(p.hourlyByVessel[v.id]?.[dt] || {}).map((h) => (
                              <label key={h} style={{ fontSize: 11, color: "var(--muted)" }}>
                                {h}hr
                                <input type="number" defaultValue={p.hourlyByVessel[v.id][dt][h]}
                                  onBlur={(e) => onUpdateHourlyByVesselPrice(p.id, v.id, dt, h, Number(e.target.value))}
                                  style={{ width: 56, marginLeft: 3, padding: "4px 5px", borderRadius: 5, border: "1px solid rgba(203,108,230,0.3)", fontSize: 12 }} />
                              </label>
                            ))}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}

                {p.pricingType === "tiered-by-guests" && (
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {p.tiers.map((t, idx) => (
                      <label key={idx} style={{ fontSize: 12, color: "var(--muted)" }}>
                        {t.max == null ? `${(p.tiers[idx - 1]?.max || 0) + 1}+` : idx === 0 ? `≤${t.max}` : `${p.tiers[idx - 1].max + 1}–${t.max}`} guests
                        <input type="number" defaultValue={t.price} onBlur={(e) => onUpdateTierPrice(p.id, idx, Number(e.target.value))}
                          style={{ width: 70, marginLeft: 4, padding: "5px 6px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)" }} />
                      </label>
                    ))}
                  </div>
                )}

              </div>
            ))}
          </div>
        )}

        {tab === "availability" && (
          <div>
            <p style={{ fontSize: 13.5, color: "var(--muted)", marginBottom: 6 }}>
              Click a day to toggle a full-day block, per vessel. Orange/striped days have confirmed bookings but aren't full — click only if you need to close the rest of the day too.
            </p>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12, color: "var(--muted)", marginBottom: 16 }}>
              <span><span style={{ display: "inline-block", width: 11, height: 11, borderRadius: 3, background: "var(--purple)", verticalAlign: "middle", marginRight: 5 }} />Open</span>
              <span><span style={{ display: "inline-block", width: 11, height: 11, borderRadius: 3, background: "repeating-linear-gradient(45deg, #E8934A, #E8934A 3px, #C97633 3px, #C97633 6px)", verticalAlign: "middle", marginRight: 5 }} />Partial</span>
              <span><span style={{ display: "inline-block", width: 11, height: 11, borderRadius: 3, background: "#3A2E40", verticalAlign: "middle", marginRight: 5 }} />Full</span>
            </div>
            {vessels.map((v) => (
              <div key={v.id} style={{ marginBottom: 28 }}>
                <div style={{ fontWeight: 700, marginBottom: 6, color: "var(--text)" }}>{v.name}</div>
                <AdminAvailabilityRow
                  vesselId={v.id}
                  blockedDates={blocked[v.id] || []}
                  partialDates={partialDates[v.id] || {}}
                  onToggle={onToggleBlocked}
                />
              </div>
            ))}
          </div>
        )}

        {tab === "media" && (
          <div style={{ display: "grid", gap: 10, maxWidth: 560 }}>
            {gallery.map((g) => (
              <div key={g.id} style={{ background: "var(--card)", borderRadius: 8, padding: 12, display: "flex", gap: 12, alignItems: "center" }}>
                <img src={g.image} alt="" style={{ width: 64, height: 64, objectFit: "cover", objectPosition: imageFocus(g.image), borderRadius: 6, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: "var(--purple)", marginBottom: 4, textTransform: "uppercase" }}>{g.category}</div>
                  <input defaultValue={g.caption} onBlur={(e) => onUpdateCaption(g.id, e.target.value)}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)" }} />
                </div>
              </div>
            ))}
            <p style={{ fontSize: 12.5, color: "var(--muted)" }}>
              Photo/video uploads aren't wired up yet — this edits captions on the existing gallery tiles. Adding real uploads means storing files somewhere like S3 or Cloudinary; happy to wire that in next.
            </p>
          </div>
        )}

        {tab === "mediaDrafts" && (
          <MediaDraftsTab mediaDrafts={mediaDrafts} onUpdateStatus={onUpdateMediaDraftStatus} onDelete={onDeleteMediaDraft} />
        )}

        {tab === "testimonials" && (
          <TestimonialsTab testimonials={testimonials} onUpdateStatus={onUpdateTestimonialStatus} onDelete={onDeleteTestimonial} />
        )}

        {tab === "ledger" && (
          <LedgerTab ledger={ledger} totals={totals} onAdd={onAddLedgerEntry} />
        )}

        {tab === "maintenance" && (
          <MaintenanceTab
            vessels={vessels}
            maintenanceItems={maintenanceItems}
            engineHours={engineHours}
            fuelLogs={fuelLogs}
            onUpdateItem={onUpdateMaintenanceItem}
            onAddEngineHoursLog={onAddEngineHoursLog}
            onAddFuelLog={onAddFuelLog}
          />
        )}

        {tab === "subscriptions" && (
          <SubscriptionsTab subscriptions={subscriptions} onAdd={onAddSubscription} onUpdate={onUpdateSubscription} onDelete={onDeleteSubscription} />
        )}

        {tab === "jarvis" && (
          <JarvisTab
            audioEnabled={audioEnabled}
            onEnableAudio={enableAudio}
            lastSpoken={lastSpoken}
            audioNote={audioNote}
          />
        )}
      </div>
    </div>
  );
}

const BOOKING_PLATFORMS = ["Boatsetter", "GetmyBoat", "Facebook", "Instagram", "Other"];

// Merges Inquiry rows (site-originated) and ExternalBooking rows (logged
// from third-party platforms) into one shape for the unified table below.
// kind distinguishes which management actions/enum apply to a given row —
// their status values and editable fields differ, so the row renderer
// branches on it rather than trying to force both into one schema.
function toUnifiedRows(inquiries, externalBookings) {
  const fromInquiries = inquiries.map((i) => ({
    kind: "inquiry",
    id: i.id,
    bookingId: i.bookingId,
    date: i.date,
    name: i.name,
    vesselName: i.vesselName,
    hours: i.hours,
    pricePaid: i.priceQuoted,
    source: "Site",
    status: i.status,
    addOnIds: i.addOnIds ? JSON.parse(i.addOnIds) : [],
    raw: i,
  }));
  const fromExternal = externalBookings.map((b) => ({
    kind: "external",
    id: b.id,
    bookingId: b.bookingId,
    date: b.date,
    name: b.guestName,
    vesselName: b.vesselName,
    hours: b.hours,
    pricePaid: b.pricePaid,
    source: b.platform,
    status: b.status,
    raw: b,
  }));
  return [...fromInquiries, ...fromExternal].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

function BookingsTab({ vessels, inquiries, externalBookings, addOns, onAddExternalBooking, onSetExternalBookingStatus, onUpdateExternalBooking, onDeleteExternalBooking, onMarkInquiry }) {
  const emptyForm = {
    vesselId: vessels[0]?.id || "", date: localDateKey(new Date()), hours: 4,
    guestName: "", partySize: "", platform: BOOKING_PLATFORMS[0], status: "pending", note: "", pricePaid: "",
  };
  const [form, setForm] = useState(emptyForm);

  function submit(e) {
    e.preventDefault();
    if (!form.date || !form.vesselId) return;
    const vessel = vessels.find((v) => v.id === form.vesselId);
    onAddExternalBooking({
      ...form,
      vesselName: vessel?.name || form.vesselId,
      hours: Number(form.hours),
      partySize: form.partySize ? Number(form.partySize) : null,
      pricePaid: form.pricePaid ? Number(form.pricePaid) : null,
    });
    setForm(emptyForm);
  }

  // Every historical booking (site + external), most recent first — no date
  // filtering, so past charters stay visible alongside upcoming ones.
  const rows = toUnifiedRows(inquiries, externalBookings);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(280px,340px) 1fr", gap: 24 }}>
      <form onSubmit={submit} style={{ background: "var(--card)", borderRadius: 10, padding: 14, alignSelf: "start" }}>
        <p style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 0, marginBottom: 10 }}>
          Log a booking from GetMyBoat, Boatsetter, or elsewhere. Confirming it marks that day partially booked (or fully, at 8+ combined hours) on the public availability calendar. It'll show up below alongside site bookings, with its own booking ID.
        </p>
        <label style={{ display: "block", marginBottom: 8 }}>
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 3 }}>Vessel</div>
          <select value={form.vesselId} onChange={(e) => setForm({ ...form, vesselId: e.target.value })}
            style={{ width: "100%", padding: "9px 10px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)" }}>
            {vessels.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </label>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}
            style={{ flex: 1, padding: "9px 10px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)" }} />
          <label style={{ width: 90 }}>
            <select value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })}
              style={{ width: "100%", padding: "9px 10px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)" }}>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((h) => <option key={h} value={h}>{h} hr{h === 1 ? "" : "s"}</option>)}
            </select>
          </label>
        </div>
        <input type="text" placeholder="Guest name" value={form.guestName} onChange={(e) => setForm({ ...form, guestName: e.target.value })}
          style={{ width: "100%", padding: "9px 10px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)", marginBottom: 8 }} />
        <input type="number" placeholder="Party size" min="1" value={form.partySize} onChange={(e) => setForm({ ...form, partySize: e.target.value })}
          style={{ width: "100%", padding: "9px 10px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)", marginBottom: 8 }} />
        <label style={{ display: "block", marginBottom: 8 }}>
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 3 }}>Platform</div>
          <select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })}
            style={{ width: "100%", padding: "9px 10px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)" }}>
            {BOOKING_PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <button type="button" onClick={() => setForm({ ...form, status: "pending" })}
            style={{ flex: 1, padding: "8px", borderRadius: 6, border: "1px solid var(--purple)", background: form.status === "pending" ? "var(--purple)" : "transparent", color: form.status === "pending" ? "#0A0612" : "var(--text)", fontWeight: 600, fontSize: 13 }}>
            Pending
          </button>
          <button type="button" onClick={() => setForm({ ...form, status: "confirmed" })}
            style={{ flex: 1, padding: "8px", borderRadius: 6, border: "1px solid var(--purple)", background: form.status === "confirmed" ? "var(--purple)" : "transparent", color: form.status === "confirmed" ? "#0A0612" : "var(--text)", fontWeight: 600, fontSize: 13 }}>
            Confirmed
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <span className="mono" style={{ color: "var(--muted)" }}>$</span>
          <input type="number" placeholder="Price paid (optional)" value={form.pricePaid} onChange={(e) => setForm({ ...form, pricePaid: e.target.value })}
            style={{ flex: 1, padding: "9px 10px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)" }} />
        </div>
        <input type="text" placeholder="Note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })}
          style={{ width: "100%", padding: "9px 10px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)", marginBottom: 10 }} />
        <button type="submit" style={{ width: "100%", background: "linear-gradient(135deg, var(--purple), var(--pink))", color: "#0A0612", border: "none", borderRadius: 6, padding: "10px", fontWeight: 700 }}>Add booking</button>
      </form>

      <div>
        <div style={{ fontWeight: 700, marginBottom: 8, color: "var(--text)" }}>All bookings ({rows.length})</div>
        {rows.length === 0 && <div style={{ color: "var(--muted)", fontSize: 13.5 }}>No bookings yet.</div>}
        {rows.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 760, fontSize: 12.5, color: "var(--text)" }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--muted)", fontSize: 11 }}>
                  <th style={{ padding: "4px 8px" }}>Booking ID</th>
                  <th style={{ padding: "4px 8px" }}>Date</th>
                  <th style={{ padding: "4px 8px" }}>Name</th>
                  <th style={{ padding: "4px 8px" }}>Vessel</th>
                  <th style={{ padding: "4px 8px" }}>Duration</th>
                  <th style={{ padding: "4px 8px" }}>Price paid</th>
                  <th style={{ padding: "4px 8px" }}>Source</th>
                  <th style={{ padding: "4px 8px" }}>Status / actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.kind}-${r.id}`} style={{ background: "var(--card)" }}>
                    <td className="mono" style={{ padding: "6px 8px", borderRadius: "6px 0 0 6px", color: r.bookingId ? "#E8934A" : "var(--muted)", whiteSpace: "nowrap" }}>
                      {r.bookingId || "—"}
                    </td>
                    <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{r.date || "—"}</td>
                    <td style={{ padding: "6px 8px", fontWeight: 600 }}>
                      {r.name || (r.kind === "external" ? "Guest" : "—")}
                      {r.addOnIds && r.addOnIds.length > 0 && (
                        <div style={{ fontWeight: 400, fontSize: 11, color: "var(--purple)", marginTop: 2 }}>
                          + {r.addOnIds.map((id) => addOns.find((a) => a.id === id)?.name || id).join(", ")}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "6px 8px" }}>{r.vesselName || "—"}</td>
                    <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{r.hours ? `${r.hours} hrs` : "—"}</td>
                    <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                      {r.kind === "external" ? (
                        <input
                          type="number"
                          defaultValue={r.pricePaid ?? ""}
                          placeholder="—"
                          onBlur={(e) => {
                            const value = e.target.value === "" ? null : Number(e.target.value);
                            if (value !== r.pricePaid) onUpdateExternalBooking(r.id, { pricePaid: value });
                          }}
                          style={{ width: 76, padding: "4px 6px", borderRadius: 5, border: "1px solid rgba(203,108,230,0.3)" }}
                        />
                      ) : (
                        r.pricePaid != null ? currency(r.pricePaid) : "—"
                      )}
                    </td>
                    <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{r.source}</td>
                    <td style={{ padding: "6px 8px", borderRadius: "0 6px 6px 0" }}>
                      {r.kind === "external" ? (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <button type="button" onClick={() => onSetExternalBookingStatus(r.id, r.status === "confirmed" ? "pending" : "confirmed")}
                            style={{ background: "transparent", color: "var(--purple)", border: "1px solid var(--purple)", borderRadius: 6, padding: "4px 8px", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>
                            {r.status === "confirmed" ? "Mark pending" : "Confirm"}
                          </button>
                          <button type="button" onClick={() => onDeleteExternalBooking(r.id)}
                            style={{ background: "transparent", color: "var(--pink)", border: "1px solid var(--pink)", borderRadius: 6, padding: "4px 8px", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>
                            Delete
                          </button>
                        </div>
                      ) : (
                        <select value={r.status} onChange={(e) => onMarkInquiry(r.id, e.target.value)}
                          style={{ padding: "5px 6px", borderRadius: 5, border: "1px solid rgba(203,108,230,0.3)", fontSize: 12 }}>
                          <option value="new">New</option>
                          <option value="confirmed">Confirmed</option>
                          <option value="declined">Declined</option>
                        </select>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function AdminAvailabilityRow({ vesselId, blockedDates, partialDates, onToggle }) {
  // Computed client-side only — see AvailabilityCalendar in SiteView.js for why.
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
    <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
      {months.map((m) => (
        <AvailabilityMonthGrid
          key={`${m.year}-${m.month}`}
          year={m.year}
          month={m.month}
          getState={getState}
          onDayClick={(key) => onToggle(vesselId, key)}
          size="compact"
        />
      ))}
    </div>
  );
}

// Expense categories are stored like "01. Gas" — the leading number was an
// internal ordering scheme from the owner's old spreadsheet. Strip it only
// for display; the stored value keeps the number so other code/imports can
// keep relying on it.
function stripCategoryPrefix(category) {
  if (!category) return category;
  return category.replace(/^\d+\.\s*/, "");
}

const LEDGER_MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// LedgerEntry.date is a plain "YYYY-MM-DD" string. Format it by parsing the
// parts directly — do NOT round-trip through `new Date(dateString)` plus
// local getters; that parses the bare string as UTC midnight and then reads
// it back with local-timezone getters, which silently shifts the displayed
// date back a day in US timezones (the same class of bug already fixed
// elsewhere in this codebase — see localDateKey in lib/pricing.js).
function fmtLedgerDate(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  const month = LEDGER_MONTH_ABBR[Number(m) - 1];
  if (!month || !d || !y) return dateStr;
  return `${month} ${d} ${y}`;
}

// Already-imported income rows (from the owner's spreadsheet) have
// "Name — Vessel — Nhr — gross $X" jammed into `note` — there's no separate
// name/duration column for those. This is a display-only best-effort parse:
// only kicks in when the note actually looks like that em-dash-joined
// format, so a plain freeform note (what new entries use) is treated as the
// name field itself rather than being misparsed. Vessel is NOT re-derived
// here — it already has its own column (subcategory).
function parseIncomeNoteDisplay(note) {
  if (!note) return { name: null, duration: null };
  if (!note.includes(" — ")) return { name: note, duration: null };
  const parts = note.split(" — ").map((p) => p.trim()).filter(Boolean);
  const durationPart = parts.find((p) => /^\d+\s*hrs?$/i.test(p));
  const namePart = parts.find((p) => !/^\d+\s*hrs?$/i.test(p) && !/^gross\s*\$/i.test(p));
  return { name: namePart || null, duration: durationPart || null };
}

const UNCATEGORIZED_INCOME_LABEL = "Other / Uncategorized";

// Grouped totals for the breakdown panels: expenses by category, income by
// vessel/package (subcategory). Sorted biggest total first.
function groupTotals(entries, keyFn) {
  const groups = new Map();
  for (const entry of entries) {
    const key = keyFn(entry) || UNCATEGORIZED_INCOME_LABEL;
    const cur = groups.get(key) || { label: key, total: 0, count: 0 };
    cur.total += Number(entry.amount || 0);
    cur.count += 1;
    groups.set(key, cur);
  }
  return Array.from(groups.values()).sort((a, b) => b.total - a.total);
}

// Groups LedgerEntry rows by bookingId to compute actual profit per
// reservation: income rows and expense rows (e.g. fuel) logged against the
// same booking net out to income − expense. Rows with no bookingId can't be
// attributed to a specific reservation, so they're skipped. Sorted by net
// profit descending so the best (and, scrolling down, worst) performing
// bookings are easy to spot at a glance.
function groupBookingProfit(entries) {
  const groups = new Map();
  for (const entry of entries) {
    if (!entry.bookingId) continue;
    const cur = groups.get(entry.bookingId) || { bookingId: entry.bookingId, income: 0, expense: 0 };
    if (entry.type === "income") cur.income += Number(entry.amount || 0);
    else if (entry.type === "expense") cur.expense += Number(entry.amount || 0);
    groups.set(entry.bookingId, cur);
  }
  return Array.from(groups.values())
    .map((g) => ({ ...g, profit: g.income - g.expense }))
    .sort((a, b) => b.profit - a.profit);
}

// Groups third-party-platform income rows by origin to total the commission
// each platform kept — grossAmount (what the guest paid the platform) minus
// amount (what was actually paid out to the owner). Rows without a
// grossAmount (site-originated bookings, or historical rows where it wasn't
// tracked) aren't part of this — only third-party income has that gross/net
// split. Sorted biggest commission lost first.
function groupCommissionLost(entries) {
  const groups = new Map();
  for (const entry of entries) {
    if (entry.type !== "income" || entry.grossAmount == null) continue;
    const key = entry.origin || UNCATEGORIZED_INCOME_LABEL;
    const cur = groups.get(key) || { label: key, total: 0, count: 0 };
    cur.total += Number(entry.grossAmount) - Number(entry.amount || 0);
    cur.count += 1;
    groups.set(key, cur);
  }
  return Array.from(groups.values()).sort((a, b) => b.total - a.total);
}

function LedgerTab({ ledger, totals, onAdd }) {
  const emptyForm = {
    type: "income", amount: "", grossAmount: "", note: "", date: localDateKey(new Date()),
    category: INCOME_CATEGORIES[0], origin: RESERVATION_ORIGINS[0], bookingId: "", subcategory: "",
  };
  const [form, setForm] = useState(emptyForm);
  const [filterType, setFilterType] = useState("all"); // "all" | "income" | "expense"
  const categoryOptions = form.type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const originOptions = form.type === "income" ? RESERVATION_ORIGINS : STATEMENT_ORIGINS;

  function setType(type) {
    const categories = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    const origins = type === "income" ? RESERVATION_ORIGINS : STATEMENT_ORIGINS;
    setForm({ ...form, type, category: categories[0], origin: origins[0], grossAmount: "" });
  }

  function submit(e) {
    e.preventDefault();
    if (!form.amount) return;
    onAdd({
      ...form,
      amount: Number(form.amount),
      subcategory: form.subcategory || null,
      grossAmount: form.type === "income" && form.grossAmount ? Number(form.grossAmount) : null,
    });
    setForm(emptyForm);
  }

  const sortedLedger = [...ledger].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const visibleLedger = filterType === "all" ? sortedLedger : sortedLedger.filter((l) => l.type === filterType);

  const expenseBreakdown = groupTotals(
    ledger.filter((l) => l.type === "expense"),
    (l) => stripCategoryPrefix(l.category)
  );
  const incomeBreakdown = groupTotals(
    ledger.filter((l) => l.type === "income"),
    (l) => l.subcategory
  );
  const bookingProfit = groupBookingProfit(ledger);
  const commissionLost = groupCommissionLost(ledger);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(280px,360px) 1fr", gap: 24 }}>
      <div>
        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          <StatCard label="Income" value={currency(totals.income)} color="var(--purple)" />
          <StatCard label="Expenses" value={currency(totals.expense)} color="var(--pink)" />
          <StatCard label="Net" value={currency(totals.net)} color="#E8934A" />
        </div>
        <form onSubmit={submit} style={{ background: "var(--card)", borderRadius: 10, padding: 14 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <button type="button" onClick={() => setType("income")}
              style={{ flex: 1, padding: "8px", borderRadius: 6, border: "1px solid var(--purple)", background: form.type === "income" ? "var(--purple)" : "transparent", color: form.type === "income" ? "#0A0612" : "var(--text)", fontWeight: 600, fontSize: 13 }}>
              Income
            </button>
            <button type="button" onClick={() => setType("expense")}
              style={{ flex: 1, padding: "8px", borderRadius: 6, border: "1px solid var(--purple)", background: form.type === "expense" ? "var(--purple)" : "transparent", color: form.type === "expense" ? "#0A0612" : "var(--text)", fontWeight: 600, fontSize: 13 }}>
              Expense
            </button>
          </div>
          <label style={{ display: "block", marginBottom: 8 }}>
            <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 3 }}>Category</div>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
              style={{ width: "100%", padding: "9px 10px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)" }}>
              {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <input type="number" placeholder="Amount" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })}
            style={{ width: "100%", padding: "9px 10px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)", marginBottom: 8 }} required />
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}
            style={{ width: "100%", padding: "9px 10px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)", marginBottom: 8 }} />
          <label style={{ display: "block", marginBottom: 8 }}>
            <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 3 }}>{form.type === "income" ? "Reservation origin" : "Paid from"}</div>
            <select value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })}
              style={{ width: "100%", padding: "9px 10px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)" }}>
              {originOptions.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
          <input type="text" placeholder="Booking ID (links this to a reservation)" value={form.bookingId} onChange={(e) => setForm({ ...form, bookingId: e.target.value })}
            style={{ width: "100%", padding: "9px 10px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)", marginBottom: 8 }} />
          {form.type === "income" && (
            <input type="text" placeholder="Vessel / Package (e.g. The Nauti Explorer)" value={form.subcategory} onChange={(e) => setForm({ ...form, subcategory: e.target.value })}
              style={{ width: "100%", padding: "9px 10px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)", marginBottom: 8 }} />
          )}
          {form.type === "income" && (
            <input type="number" placeholder="Gross / list price (optional — before platform's cut)" value={form.grossAmount} onChange={(e) => setForm({ ...form, grossAmount: e.target.value })}
              style={{ width: "100%", padding: "9px 10px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)", marginBottom: 8 }} />
          )}
          <input type="text" placeholder="Note (e.g. guest name, description)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })}
            style={{ width: "100%", padding: "9px 10px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)", marginBottom: 10 }} />
          <button type="submit" style={{ width: "100%", background: "linear-gradient(135deg, var(--purple), var(--pink))", color: "#0A0612", border: "none", borderRadius: 6, padding: "10px", fontWeight: 700 }}>Add entry</button>
        </form>
      </div>
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ fontWeight: 700, color: "var(--text)" }}>Recent entries</div>
          <div style={{ display: "flex", gap: 4 }}>
            {["all", "income", "expense"].map((f) => (
              <button key={f} type="button" onClick={() => setFilterType(f)}
                style={{
                  padding: "4px 10px", borderRadius: 5, fontSize: 12, fontWeight: 600, textTransform: "capitalize",
                  border: "1px solid var(--purple)", cursor: "pointer",
                  background: filterType === f ? "var(--purple)" : "transparent",
                  color: filterType === f ? "#0A0612" : "var(--text)",
                }}>
                {f}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: "grid", gap: 6, maxHeight: 380, overflowY: "auto" }}>
          {visibleLedger.length === 0 && <div style={{ color: "var(--muted)", fontSize: 13.5 }}>No entries yet.</div>}
          {visibleLedger.map((l) => {
            const isIncome = l.type === "income";
            const { name, duration } = isIncome ? parseIncomeNoteDisplay(l.note) : { name: null, duration: null };
            return (
              <div key={l.id} style={{ background: "var(--card)", borderRadius: 6, padding: "10px 12px", fontSize: 13, color: "var(--text)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                  <div style={{ display: "flex", flexWrap: "wrap", columnGap: 14, rowGap: 2, alignItems: "baseline", minWidth: 0 }}>
                    <span className="mono" style={{ fontWeight: 700, color: "#E8934A", whiteSpace: "nowrap" }}>{fmtLedgerDate(l.date)}</span>
                    {isIncome ? (
                      <>
                        {name && <span style={{ fontWeight: 600 }}>{name}</span>}
                        {l.subcategory && <span style={{ color: "var(--purple)" }}>{l.subcategory}</span>}
                        {duration && <span style={{ color: "var(--muted)" }}>{duration}</span>}
                      </>
                    ) : (
                      <span style={{ fontWeight: 600 }}>{stripCategoryPrefix(l.category) || "(no category)"}</span>
                    )}
                  </div>
                  <span className="mono" style={{ color: isIncome ? "#7FE0B8" : "#F0559C", fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0 }}>
                    {isIncome ? "+" : "−"}{currency(l.amount)}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>
                  {isIncome
                    ? [stripCategoryPrefix(l.category), l.origin, l.bookingId && `#${l.bookingId}`].filter(Boolean).join(" · ")
                    : [l.origin, l.note, l.bookingId && `#${l.bookingId}`].filter(Boolean).join(" · ")}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <BreakdownPanel title="Expenses by category" rows={expenseBreakdown} color="#F0559C" />
        <BreakdownPanel title="Income by vessel / package" rows={incomeBreakdown} color="#7FE0B8" />
      </div>
      <div style={{ gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <BookingProfitPanel rows={bookingProfit} />
        <BreakdownPanel title="Commission lost to platforms" rows={commissionLost} color="#F0559C" />
      </div>
    </div>
  );
}

// Same visual shell as BreakdownPanel, but each row needs to show income and
// expense alongside the net profit rather than a single total — kept as its
// own component instead of overloading BreakdownPanel's row shape.
function BookingProfitPanel({ rows }) {
  return (
    <div style={{ background: "var(--card)", borderRadius: 10, padding: 14 }}>
      <div style={{ fontWeight: 700, marginBottom: 10, color: "var(--text)" }}>Profit by booking</div>
      {rows.length === 0 && <div style={{ color: "var(--muted)", fontSize: 13.5 }}>No bookingId-linked entries yet.</div>}
      <div style={{ display: "grid", gap: 6, maxHeight: 300, overflowY: "auto" }}>
        {rows.map((r) => (
          <div key={r.bookingId} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 13.5, color: "var(--text)", gap: 10 }}>
            <span className="mono" style={{ whiteSpace: "nowrap" }}>
              {r.bookingId}{" "}
              <span style={{ color: "var(--muted)", fontSize: 11.5 }}>
                (+{currency(r.income)} / −{currency(r.expense)})
              </span>
            </span>
            <span className="mono" style={{ color: r.profit >= 0 ? "#7FE0B8" : "#F0559C", fontWeight: 700, whiteSpace: "nowrap" }}>
              {currency(r.profit)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BreakdownPanel({ title, rows, color }) {
  return (
    <div style={{ background: "var(--card)", borderRadius: 10, padding: 14 }}>
      <div style={{ fontWeight: 700, marginBottom: 10, color: "var(--text)" }}>{title}</div>
      {rows.length === 0 && <div style={{ color: "var(--muted)", fontSize: 13.5 }}>No entries yet.</div>}
      <div style={{ display: "grid", gap: 6 }}>
        {rows.map((r) => (
          <div key={r.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 13.5, color: "var(--text)", gap: 10 }}>
            <span>{r.label} <span style={{ color: "var(--muted)", fontSize: 11.5 }}>({r.count} {r.count === 1 ? "entry" : "entries"})</span></span>
            <span className="mono" style={{ color, fontWeight: 700, whiteSpace: "nowrap" }}>{currency(r.total)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Maintenance tab -------------------------------------------------

// Whole months elapsed since a "YYYY-MM-DD" date, floored — e.g. a date
// 45 days ago reads as 1 month, not 1.5.
function monthsSinceDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const now = new Date();
  let months = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
  if (now.getDate() < d.getDate()) months -= 1;
  return Math.max(0, months);
}

// Most recent log per vessel, "most recent" meaning latest date (ties broken
// by createdAt) — these are point-in-time readings (hour-meter, fillup), not
// events to sum.
function latestPerVessel(logs) {
  const result = {};
  for (const log of logs) {
    const cur = result[log.vesselId];
    if (!cur || log.date > cur.date || (log.date === cur.date && log.createdAt > cur.createdAt)) {
      result[log.vesselId] = log;
    }
  }
  return result;
}

const DUE_SOON_FRACTION = 0.9; // flag "due soon" within 10% of either threshold

// MaintenanceItem isn't tied to a specific vessel (it's one shared checklist
// for the fleet), so status is judged against whichever vessel currently has
// the most hours on it — the worst case, so nothing slips through unnoticed.
function maintenanceStatus(item, currentHours) {
  const hasHoursBasis = item.intervalHours != null && item.lastDoneHours != null && currentHours != null;
  const hasMonthsBasis = item.intervalMonths != null && !!item.lastDoneDate;

  if (!hasHoursBasis && !hasMonthsBasis) {
    return { status: "unknown", label: "Enter last serviced info", hoursSince: null, monthsSince: null };
  }

  let overdue = false;
  let dueSoon = false;
  let hoursSince = null;
  let monthsSinceVal = null;

  if (hasHoursBasis) {
    hoursSince = currentHours - item.lastDoneHours;
    if (hoursSince >= item.intervalHours) overdue = true;
    else if (hoursSince >= item.intervalHours * DUE_SOON_FRACTION) dueSoon = true;
  }
  if (hasMonthsBasis) {
    monthsSinceVal = monthsSinceDate(item.lastDoneDate);
    if (monthsSinceVal >= item.intervalMonths) overdue = true;
    else if (monthsSinceVal >= item.intervalMonths * DUE_SOON_FRACTION) dueSoon = true;
  }

  return {
    status: overdue ? "overdue" : dueSoon ? "due-soon" : "ok",
    label: overdue ? "Overdue" : dueSoon ? "Due soon" : "OK",
    hoursSince, monthsSince: monthsSinceVal,
  };
}

const STATUS_COLORS = { overdue: "var(--pink)", "due-soon": "#E8934A", ok: "#7FE0B8", unknown: "var(--muted)" };

function MaintenanceTab({ vessels, maintenanceItems, engineHours, fuelLogs, onUpdateItem, onAddEngineHoursLog, onAddFuelLog }) {
  const latestHours = latestPerVessel(engineHours);
  const latestFuel = latestPerVessel(fuelLogs);

  const vesselHours = vessels.map((v) => ({ vessel: v, log: latestHours[v.id] || null }));
  const knownHours = vesselHours.map((vh) => vh.log?.hours).filter((h) => h != null);
  const fleetMaxHours = knownHours.length ? Math.max(...knownHours) : null;

  const statuses = maintenanceItems.map((item) => ({ item, ...maintenanceStatus(item, fleetMaxHours) }));
  const overdueCount = statuses.filter((s) => s.status === "overdue").length;
  const dueSoonCount = statuses.filter((s) => s.status === "due-soon").length;

  const fuelGaps = vessels.map((v) => {
    const lastFuel = latestFuel[v.id];
    const currentLog = latestHours[v.id];
    if (!lastFuel) return { vessel: v, flag: false };
    const tripsSince = engineHours.filter((e) => e.vesselId === v.id && e.date > lastFuel.date).length;
    const hoursSince = currentLog && lastFuel.hoursAtFillup != null ? currentLog.hours - lastFuel.hoursAtFillup : null;
    const flag = (hoursSince != null && hoursSince >= 15) || tripsSince >= 3;
    return { vessel: v, flag, hoursSince, tripsSince, lastFuelDate: lastFuel.date };
  }).filter((g) => g.flag);

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
          {vesselHours.map(({ vessel, log }) => (
            <StatCard key={vessel.id} label={`${vessel.name} hours`} value={log ? `${log.hours.toLocaleString()} hrs` : "No log yet"} color="var(--purple)" />
          ))}
          <StatCard label="Overdue items" value={String(overdueCount)} color="var(--pink)" />
          <StatCard label="Due soon" value={String(dueSoonCount)} color="#E8934A" />
        </div>
        {fuelGaps.length > 0 && (
          <div style={{ background: "var(--card)", borderRadius: 8, padding: 12, borderLeft: "3px solid #E8934A" }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text)", marginBottom: 4 }}>Fuel gap warning</div>
            {fuelGaps.map((g) => (
              <div key={g.vessel.id} style={{ fontSize: 12.5, color: "var(--muted)" }}>
                {g.vessel.name}: last fuel entry {g.lastFuelDate}
                {g.hoursSince != null ? ` — ${g.hoursSince.toLocaleString()} hrs run since` : ""}
                {g.tripsSince ? ` — ${g.tripsSince} trip${g.tripsSince === 1 ? "" : "s"} logged since` : ""}
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div style={{ fontWeight: 700, marginBottom: 8, color: "var(--text)" }}>Maintenance schedule</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 760, fontSize: 12.5, color: "var(--text)" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--muted)", fontSize: 11 }}>
                <th style={{ padding: "4px 8px" }}>Item</th>
                <th style={{ padding: "4px 8px" }}>Interval (hrs)</th>
                <th style={{ padding: "4px 8px" }}>Interval (mo)</th>
                <th style={{ padding: "4px 8px" }}>Last done date</th>
                <th style={{ padding: "4px 8px" }}>Last done hours</th>
                <th style={{ padding: "4px 8px" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {statuses.map(({ item, status, label, hoursSince, monthsSince }) => (
                <tr key={item.id} style={{ background: "var(--card)" }}>
                  <td style={{ padding: "6px 8px", borderRadius: "6px 0 0 6px", fontWeight: 600 }}>{item.label}</td>
                  <td style={{ padding: "6px 8px" }}>
                    <input type="number" defaultValue={item.intervalHours ?? ""} placeholder="—"
                      onBlur={(e) => onUpdateItem(item.id, { intervalHours: e.target.value === "" ? null : Number(e.target.value) })}
                      style={{ width: 60, padding: "5px 6px", borderRadius: 5, border: "1px solid rgba(203,108,230,0.3)" }} />
                  </td>
                  <td style={{ padding: "6px 8px" }}>
                    <input type="number" defaultValue={item.intervalMonths ?? ""} placeholder="—"
                      onBlur={(e) => onUpdateItem(item.id, { intervalMonths: e.target.value === "" ? null : Number(e.target.value) })}
                      style={{ width: 60, padding: "5px 6px", borderRadius: 5, border: "1px solid rgba(203,108,230,0.3)" }} />
                  </td>
                  <td style={{ padding: "6px 8px" }}>
                    <input type="date" defaultValue={item.lastDoneDate || ""}
                      onBlur={(e) => onUpdateItem(item.id, { lastDoneDate: e.target.value || null })}
                      style={{ padding: "5px 6px", borderRadius: 5, border: "1px solid rgba(203,108,230,0.3)" }} />
                  </td>
                  <td style={{ padding: "6px 8px" }}>
                    <input type="number" defaultValue={item.lastDoneHours ?? ""} placeholder="—"
                      onBlur={(e) => onUpdateItem(item.id, { lastDoneHours: e.target.value === "" ? null : Number(e.target.value) })}
                      style={{ width: 70, padding: "5px 6px", borderRadius: 5, border: "1px solid rgba(203,108,230,0.3)" }} />
                  </td>
                  <td style={{ padding: "6px 8px", borderRadius: "0 6px 6px 0" }}>
                    <span style={{ color: STATUS_COLORS[status], fontWeight: 700 }}>{label}</span>
                    {(hoursSince != null || monthsSince != null) && (
                      <div style={{ fontSize: 10.5, color: "var(--muted)" }}>
                        {[hoursSince != null ? `${Math.round(hoursSince)} hrs since` : null, monthsSince != null ? `${monthsSince} mo since` : null].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 8 }}>
          Fleet-wide status is judged against the highest-hours vessel so nothing slips through unnoticed. Intervals shown are generic starting points — swap in the real numbers from each engine's manual when you have them.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        <EngineHoursLogPanel vessels={vessels} engineHours={engineHours} onAdd={onAddEngineHoursLog} />
        <FuelLogPanel vessels={vessels} fuelLogs={fuelLogs} onAdd={onAddFuelLog} />
      </div>
    </div>
  );
}

function EngineHoursLogPanel({ vessels, engineHours, onAdd }) {
  const emptyForm = { vesselId: vessels[0]?.id || "", date: localDateKey(new Date()), hours: "", note: "" };
  const [form, setForm] = useState(emptyForm);

  function submit(e) {
    e.preventDefault();
    if (!form.vesselId || !form.date || form.hours === "") return;
    onAdd({ ...form, hours: Number(form.hours) });
    setForm(emptyForm);
  }

  function vesselName(id) {
    return vessels.find((v) => v.id === id)?.name || id;
  }

  return (
    <div>
      <div style={{ fontWeight: 700, marginBottom: 8, color: "var(--text)" }}>Engine hours log</div>
      <form onSubmit={submit} style={{ background: "var(--card)", borderRadius: 10, padding: 14, marginBottom: 12 }}>
        <label style={{ display: "block", marginBottom: 8 }}>
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 3 }}>Vessel</div>
          <select value={form.vesselId} onChange={(e) => setForm({ ...form, vesselId: e.target.value })}
            style={{ width: "100%", padding: "9px 10px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)" }}>
            {vessels.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </label>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}
            style={{ flex: 1, padding: "9px 10px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)" }} />
          <input type="number" placeholder="Hour-meter reading" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })}
            style={{ flex: 1, padding: "9px 10px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)" }} required />
        </div>
        <input type="text" placeholder="Note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })}
          style={{ width: "100%", padding: "9px 10px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)", marginBottom: 10 }} />
        <button type="submit" style={{ width: "100%", background: "linear-gradient(135deg, var(--purple), var(--pink))", color: "#0A0612", border: "none", borderRadius: 6, padding: "10px", fontWeight: 700 }}>Add entry</button>
      </form>
      <div style={{ display: "grid", gap: 6, maxHeight: 260, overflowY: "auto" }}>
        {engineHours.length === 0 && <div style={{ color: "var(--muted)", fontSize: 13.5 }}>No entries yet.</div>}
        {engineHours.map((h) => (
          <div key={h.id} style={{ background: "var(--card)", borderRadius: 6, padding: "8px 12px", fontSize: 13, color: "var(--text)" }}>
            <div>{h.date} — {vesselName(h.vesselId)} — {h.hours.toLocaleString()} hrs</div>
            {h.note && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{h.note}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function FuelLogPanel({ vessels, fuelLogs, onAdd }) {
  const emptyForm = { vesselId: vessels[0]?.id || "", date: localDateKey(new Date()), hoursAtFillup: "", gallons: "", cost: "", note: "" };
  const [form, setForm] = useState(emptyForm);

  function submit(e) {
    e.preventDefault();
    if (!form.vesselId || !form.date) return;
    onAdd({
      ...form,
      hoursAtFillup: form.hoursAtFillup === "" ? null : Number(form.hoursAtFillup),
      gallons: form.gallons === "" ? null : Number(form.gallons),
      cost: form.cost === "" ? null : Number(form.cost),
    });
    setForm(emptyForm);
  }

  function vesselName(id) {
    return vessels.find((v) => v.id === id)?.name || id;
  }

  return (
    <div>
      <div style={{ fontWeight: 700, marginBottom: 8, color: "var(--text)" }}>Fuel log</div>
      <form onSubmit={submit} style={{ background: "var(--card)", borderRadius: 10, padding: 14, marginBottom: 12 }}>
        <p style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 0, marginBottom: 8 }}>
          Entering a cost also adds a matching expense to the Ledger tab (category "fuel").
        </p>
        <label style={{ display: "block", marginBottom: 8 }}>
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 3 }}>Vessel</div>
          <select value={form.vesselId} onChange={(e) => setForm({ ...form, vesselId: e.target.value })}
            style={{ width: "100%", padding: "9px 10px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)" }}>
            {vessels.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </label>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}
            style={{ flex: 1, padding: "9px 10px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)" }} />
          <input type="number" placeholder="Hours at fillup" value={form.hoursAtFillup} onChange={(e) => setForm({ ...form, hoursAtFillup: e.target.value })}
            style={{ flex: 1, padding: "9px 10px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)" }} />
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input type="number" placeholder="Gallons" value={form.gallons} onChange={(e) => setForm({ ...form, gallons: e.target.value })}
            style={{ flex: 1, padding: "9px 10px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)" }} />
          <input type="number" placeholder="Cost ($)" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })}
            style={{ flex: 1, padding: "9px 10px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)" }} />
        </div>
        <input type="text" placeholder="Note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })}
          style={{ width: "100%", padding: "9px 10px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)", marginBottom: 10 }} />
        <button type="submit" style={{ width: "100%", background: "linear-gradient(135deg, var(--purple), var(--pink))", color: "#0A0612", border: "none", borderRadius: 6, padding: "10px", fontWeight: 700 }}>Add entry</button>
      </form>
      <div style={{ display: "grid", gap: 6, maxHeight: 260, overflowY: "auto" }}>
        {fuelLogs.length === 0 && <div style={{ color: "var(--muted)", fontSize: 13.5 }}>No entries yet.</div>}
        {fuelLogs.map((f) => (
          <div key={f.id} style={{ background: "var(--card)", borderRadius: 6, padding: "8px 12px", fontSize: 13, color: "var(--text)" }}>
            <div>{f.date} — {vesselName(f.vesselId)}{f.cost != null ? ` — ${currency(f.cost)}` : ""}</div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
              {[f.hoursAtFillup != null ? `${f.hoursAtFillup} hrs` : null, f.gallons != null ? `${f.gallons} gal` : null, f.note].filter(Boolean).join(" · ")}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Coupons tab -------------------------------------------------

function CouponsTab({ coupons, onAdd, onToggleActive, onDelete }) {
  const emptyForm = { code: "", discountType: "percent", discountValue: "", maxUses: "", expiresAt: "", note: "" };
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    if (!form.code || !form.discountValue) return;
    setError("");
    try {
      await onAdd({
        code: form.code,
        discountType: form.discountType,
        discountValue: Number(form.discountValue),
        maxUses: form.maxUses ? Number(form.maxUses) : null,
        expiresAt: form.expiresAt || null,
        note: form.note || null,
      });
      setForm(emptyForm);
    } catch {
      setError("Could not save that coupon — the code may already be in use.");
    }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(280px,340px) 1fr", gap: 24 }}>
      <form onSubmit={submit} style={{ background: "var(--card)", borderRadius: 10, padding: 14, alignSelf: "start" }}>
        <label style={{ display: "block", marginBottom: 8 }}>
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 3 }}>Code</div>
          <input type="text" placeholder="e.g. FAMILY20" value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
            style={{ width: "100%", padding: "9px 10px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)" }} required />
        </label>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <label style={{ flex: 1 }}>
            <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 3 }}>Type</div>
            <select value={form.discountType} onChange={(e) => setForm({ ...form, discountType: e.target.value })}
              style={{ width: "100%", padding: "9px 10px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)" }}>
              <option value="percent">Percent off</option>
              <option value="fixed">Fixed $ off</option>
            </select>
          </label>
          <label style={{ flex: 1 }}>
            <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 3 }}>{form.discountType === "percent" ? "Percent" : "Dollars"}</div>
            <input type="number" min="0" step="0.01" value={form.discountValue} onChange={(e) => setForm({ ...form, discountValue: e.target.value })}
              style={{ width: "100%", padding: "9px 10px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)" }} required />
          </label>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <label style={{ flex: 1 }}>
            <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 3 }}>Max uses (optional)</div>
            <input type="number" min="1" placeholder="Unlimited" value={form.maxUses} onChange={(e) => setForm({ ...form, maxUses: e.target.value })}
              style={{ width: "100%", padding: "9px 10px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)" }} />
          </label>
          <label style={{ flex: 1 }}>
            <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 3 }}>Expires (optional)</div>
            <input type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
              style={{ width: "100%", padding: "9px 10px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)" }} />
          </label>
        </div>
        <input type="text" placeholder="Note (optional)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })}
          style={{ width: "100%", padding: "9px 10px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)", marginBottom: 10 }} />
        {error && <div style={{ color: "var(--pink)", fontSize: 12.5, marginBottom: 8 }}>{error}</div>}
        <button type="submit" style={{ width: "100%", background: "linear-gradient(135deg, var(--purple), var(--pink))", color: "#0A0612", border: "none", borderRadius: 6, padding: "10px", fontWeight: 700 }}>Add coupon</button>
      </form>

      <div>
        <div style={{ fontWeight: 700, marginBottom: 8, color: "var(--text)" }}>Coupons ({coupons.length})</div>
        <div style={{ display: "grid", gap: 6 }}>
          {coupons.length === 0 && <div style={{ color: "var(--muted)", fontSize: 13.5 }}>No coupons yet.</div>}
          {coupons.map((c) => (
            <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--card)", borderRadius: 6, padding: "8px 12px", fontSize: 13.5, color: "var(--text)", gap: 10 }}>
              <div>
                <div className="mono" style={{ fontWeight: 700 }}>
                  {c.code}
                  <span style={{ fontWeight: 400, color: "var(--muted)", marginLeft: 8 }}>
                    {c.discountType === "percent" ? `${c.discountValue}% off` : `${currency(c.discountValue)} off`}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                  {c.usedCount} / {c.maxUses ?? "∞"} used
                  {c.expiresAt ? ` · expires ${c.expiresAt}` : ""}
                  {c.note ? ` · ${c.note}` : ""}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                <span
                  className="mono"
                  style={{
                    fontSize: 10.5, fontWeight: 700, padding: "3px 8px", borderRadius: 20, textTransform: "uppercase", letterSpacing: "0.04em",
                    color: c.active ? "#0A0612" : "var(--text)",
                    background: c.active ? "var(--purple)" : "rgba(203,108,230,0.12)",
                    border: c.active ? "none" : "1px solid rgba(203,108,230,0.3)",
                  }}
                >
                  {c.active ? "Active" : "Inactive"}
                </span>
                <button type="button" onClick={() => onToggleActive(c.id, !c.active)}
                  style={{ background: "transparent", color: "var(--purple)", border: "1px solid var(--purple)", borderRadius: 6, padding: "5px 9px", fontSize: 11.5, fontWeight: 600 }}>
                  {c.active ? "Deactivate" : "Activate"}
                </button>
                <button type="button" onClick={() => onDelete(c.id)}
                  style={{ background: "transparent", color: "var(--pink)", border: "1px solid var(--pink)", borderRadius: 6, padding: "5px 9px", fontSize: 11.5, fontWeight: 600 }}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---- Media Drafts tab ------------------------------------------------

const MEDIA_DRAFT_STATUS_COLORS = {
  pending: "rgba(203,108,230,0.12)",
  approved: "var(--purple)",
  rejected: "rgba(240,85,156,0.18)",
  posted: "#7FE0B8",
};
const MEDIA_DRAFT_STATUS_TEXT_COLORS = {
  pending: "var(--text)",
  approved: "#0A0612",
  rejected: "var(--pink)",
  posted: "#0A0612",
};

function MediaDraftsTab({ mediaDrafts, onUpdateStatus, onDelete }) {
  return (
    <div>
      <div style={{ fontWeight: 700, marginBottom: 8, color: "var(--text)" }}>Media drafts ({mediaDrafts.length})</div>
      <p style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 0, marginBottom: 14 }}>
        These are AI-drafted social posts queued for your review — nothing here is ever posted automatically. Approve or reject each one; approved drafts still require a separate manual posting step.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
        {mediaDrafts.length === 0 && <div style={{ color: "var(--muted)", fontSize: 13.5 }}>No drafts found — they'll show up here once the media agent queues one.</div>}
        {mediaDrafts.map((d) => (
          <div key={d.id} style={{ background: "var(--card)", borderRadius: 10, overflow: "hidden", color: "var(--text)" }}>
            {d.mediaType === "video" ? (
              <a href={d.mediaUrl} target="_blank" rel="noreferrer" style={{ width: "100%", height: 160, background: "rgba(203,108,230,0.08)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--purple)", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
                ▶ View video
              </a>
            ) : (
              <img src={d.mediaUrl} alt="" style={{ width: "100%", height: 160, objectFit: "cover" }} />
            )}
            <div style={{ padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{d.theme}</div>
                <span
                  className="mono"
                  style={{
                    fontSize: 10.5, fontWeight: 700, padding: "3px 8px", borderRadius: 20, textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap",
                    color: MEDIA_DRAFT_STATUS_TEXT_COLORS[d.status] || "var(--text)",
                    background: MEDIA_DRAFT_STATUS_COLORS[d.status] || "rgba(203,108,230,0.12)",
                  }}
                >
                  {d.status}
                </span>
              </div>
              <div style={{ fontSize: 12.5, marginBottom: 8 }}>{d.caption}</div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 10 }}>
                {[d.platform || "Platform TBD", new Date(d.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })].join(" · ")}
              </div>
              {d.status === "pending" ? (
                <div style={{ display: "flex", gap: 6 }}>
                  <button type="button" onClick={() => onUpdateStatus(d.id, "approved")}
                    style={{ flex: 1, background: "var(--purple)", color: "#0A0612", border: "none", borderRadius: 6, padding: "7px 9px", fontSize: 12, fontWeight: 700 }}>
                    Approve
                  </button>
                  <button type="button" onClick={() => onUpdateStatus(d.id, "rejected")}
                    style={{ flex: 1, background: "transparent", color: "var(--pink)", border: "1px solid var(--pink)", borderRadius: 6, padding: "7px 9px", fontSize: 12, fontWeight: 700 }}>
                    Reject
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 6 }}>
                  <button type="button" onClick={() => onUpdateStatus(d.id, "pending")}
                    style={{ flex: 1, background: "transparent", color: "var(--purple)", border: "1px solid var(--purple)", borderRadius: 6, padding: "7px 9px", fontSize: 12, fontWeight: 600 }}>
                    Reset to pending
                  </button>
                  <button type="button" onClick={() => onDelete(d.id)}
                    style={{ background: "transparent", color: "var(--pink)", border: "1px solid var(--pink)", borderRadius: 6, padding: "7px 9px", fontSize: 12, fontWeight: 600 }}>
                    Delete
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Testimonials tab ------------------------------------------------

const TESTIMONIAL_STATUS_COLORS = {
  pending: "rgba(232,147,74,0.22)",
  approved: "var(--purple)",
  rejected: "rgba(240,85,156,0.22)",
};
const TESTIMONIAL_STATUS_TEXT_COLORS = {
  pending: "#E8934A",
  approved: "#0A0612",
  rejected: "var(--pink)",
};

function TestimonialsTab({ testimonials, onUpdateStatus, onDelete }) {
  const [filterStatus, setFilterStatus] = useState("all"); // "all" | "pending" | "approved" | "rejected"
  const pendingCount = testimonials.filter((t) => t.status === "pending").length;

  // Pending (the actionable state) always floats to the top; within each
  // group, most recently submitted first.
  const sorted = [...testimonials].sort((a, b) => {
    if (a.status === "pending" && b.status !== "pending") return -1;
    if (b.status === "pending" && a.status !== "pending") return 1;
    return (b.submittedAt || "").localeCompare(a.submittedAt || "");
  });
  const visible = filterStatus === "all" ? sorted : sorted.filter((t) => t.status === filterStatus);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontWeight: 700, color: "var(--text)" }}>
          Testimonials ({testimonials.length})
          {pendingCount > 0 && <span style={{ color: "#E8934A" }}> — {pendingCount} pending review</span>}
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {["all", "pending", "approved", "rejected"].map((f) => (
            <button key={f} type="button" onClick={() => setFilterStatus(f)}
              style={{
                padding: "4px 10px", borderRadius: 5, fontSize: 12, fontWeight: 600, textTransform: "capitalize",
                border: "1px solid var(--purple)", cursor: "pointer",
                background: filterStatus === f ? "var(--purple)" : "transparent",
                color: filterStatus === f ? "#0A0612" : "var(--text)",
              }}>
              {f}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
        {visible.length === 0 && <div style={{ color: "var(--muted)", fontSize: 13.5 }}>No testimonials found.</div>}
        {visible.map((t) => (
          <div key={t.id} style={{
            background: "var(--card)", borderRadius: 10, padding: 14, color: "var(--text)",
            border: t.status === "pending" ? "1px solid #E8934A" : "1px solid transparent",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{t.name}</div>
                <div style={{ color: "#E8934A", fontSize: 14, letterSpacing: 1 }}>{"★".repeat(t.rating)}{"☆".repeat(5 - t.rating)}</div>
              </div>
              <span
                className="mono"
                style={{
                  fontSize: 10.5, fontWeight: 700, padding: "3px 8px", borderRadius: 20, textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap",
                  color: TESTIMONIAL_STATUS_TEXT_COLORS[t.status] || "var(--text)",
                  background: TESTIMONIAL_STATUS_COLORS[t.status] || "rgba(203,108,230,0.12)",
                }}
              >
                {t.status}
              </span>
            </div>
            {t.packageOrVessel && <div style={{ fontSize: 11.5, color: "var(--purple)", marginBottom: 6 }}>{t.packageOrVessel}</div>}
            <div style={{ fontSize: 12.5, marginBottom: 10, lineHeight: 1.5 }}>&ldquo;{t.quote}&rdquo;</div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 10 }}>
              {t.submittedAt && new Date(t.submittedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </div>
            {t.status === "pending" ? (
              <div style={{ display: "flex", gap: 6 }}>
                <button type="button" onClick={() => onUpdateStatus(t.id, "approved")}
                  style={{ flex: 1, background: "var(--purple)", color: "#0A0612", border: "none", borderRadius: 6, padding: "7px 9px", fontSize: 12, fontWeight: 700 }}>
                  Approve
                </button>
                <button type="button" onClick={() => onUpdateStatus(t.id, "rejected")}
                  style={{ flex: 1, background: "transparent", color: "var(--pink)", border: "1px solid var(--pink)", borderRadius: 6, padding: "7px 9px", fontSize: 12, fontWeight: 700 }}>
                  Reject
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 6 }}>
                <button type="button" onClick={() => onUpdateStatus(t.id, "pending")}
                  style={{ flex: 1, background: "transparent", color: "var(--purple)", border: "1px solid var(--purple)", borderRadius: 6, padding: "7px 9px", fontSize: 12, fontWeight: 600 }}>
                  Reset to pending
                </button>
                <button type="button" onClick={() => onDelete(t.id)}
                  style={{ background: "transparent", color: "var(--pink)", border: "1px solid var(--pink)", borderRadius: 6, padding: "7px 9px", fontSize: 12, fontWeight: 600 }}>
                  Delete
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Subscriptions tab --------------------------------------------

const SUBSCRIPTION_CATEGORIES = ["Storage", "Hosting", "Software", "Utilities", "Other"];
const BILLING_CYCLES = ["monthly", "yearly", "weekly"];

// Normalizes any billing cycle to an equivalent monthly figure so subscriptions
// on different cadences can be summed into one "per month" total.
function monthlyAmount(sub) {
  if (sub.billingCycle === "yearly") return sub.amount / 12;
  if (sub.billingCycle === "weekly") return sub.amount * 4.33;
  return sub.amount;
}

function SubscriptionsTab({ subscriptions, onAdd, onUpdate, onDelete }) {
  const emptyForm = { name: "", category: SUBSCRIPTION_CATEGORIES[0], amount: "", billingCycle: "monthly", nextDueDate: "", vendor: "", note: "" };
  const [form, setForm] = useState(emptyForm);

  function submit(e) {
    e.preventDefault();
    if (!form.name || !form.amount) return;
    onAdd({
      name: form.name,
      category: form.category || null,
      amount: Number(form.amount),
      billingCycle: form.billingCycle,
      nextDueDate: form.nextDueDate || null,
      vendor: form.vendor || null,
      note: form.note || null,
    });
    setForm(emptyForm);
  }

  const active = subscriptions.filter((s) => s.active);
  const totalMonthly = active.reduce((sum, s) => sum + monthlyAmount(s), 0);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", gap: 10, maxWidth: 480 }}>
        <StatCard label="Total monthly recurring cost" value={currency(totalMonthly)} color="var(--purple)" />
        <StatCard label="Active subscriptions" value={String(active.length)} color="#E8934A" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(280px,340px) 1fr", gap: 24 }}>
        <form onSubmit={submit} style={{ background: "var(--card)", borderRadius: 10, padding: 14, alignSelf: "start" }}>
          <input type="text" placeholder="Name (e.g. Boat storage)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
            style={{ width: "100%", padding: "9px 10px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)", marginBottom: 8 }} required />
          <label style={{ display: "block", marginBottom: 8 }}>
            <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 3 }}>Category</div>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
              style={{ width: "100%", padding: "9px 10px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)" }}>
              {SUBSCRIPTION_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <label style={{ flex: 1 }}>
              <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 3 }}>Amount</div>
              <input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })}
                style={{ width: "100%", padding: "9px 10px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)" }} required />
            </label>
            <label style={{ flex: 1 }}>
              <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 3 }}>Cycle</div>
              <select value={form.billingCycle} onChange={(e) => setForm({ ...form, billingCycle: e.target.value })}
                style={{ width: "100%", padding: "9px 10px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)" }}>
                {BILLING_CYCLES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
          </div>
          <label style={{ display: "block", marginBottom: 8 }}>
            <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 3 }}>Next due date (optional)</div>
            <input type="date" value={form.nextDueDate} onChange={(e) => setForm({ ...form, nextDueDate: e.target.value })}
              style={{ width: "100%", padding: "9px 10px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)" }} />
          </label>
          <input type="text" placeholder="Vendor (optional)" value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })}
            style={{ width: "100%", padding: "9px 10px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)", marginBottom: 8 }} />
          <input type="text" placeholder="Note (optional)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })}
            style={{ width: "100%", padding: "9px 10px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)", marginBottom: 10 }} />
          <button type="submit" style={{ width: "100%", background: "linear-gradient(135deg, var(--purple), var(--pink))", color: "#0A0612", border: "none", borderRadius: 6, padding: "10px", fontWeight: 700 }}>Add subscription</button>
        </form>

        <div>
          <div style={{ fontWeight: 700, marginBottom: 8, color: "var(--text)" }}>Subscriptions ({subscriptions.length})</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 640, fontSize: 12.5, color: "var(--text)" }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--muted)", fontSize: 11 }}>
                  <th style={{ padding: "4px 8px" }}>Name</th>
                  <th style={{ padding: "4px 8px" }}>Category</th>
                  <th style={{ padding: "4px 8px" }}>Amount</th>
                  <th style={{ padding: "4px 8px" }}>Cycle</th>
                  <th style={{ padding: "4px 8px" }}>Next due</th>
                  <th style={{ padding: "4px 8px" }}>Active</th>
                  <th style={{ padding: "4px 8px" }}></th>
                </tr>
              </thead>
              <tbody>
                {subscriptions.length === 0 && (
                  <tr><td colSpan={7} style={{ padding: "8px", color: "var(--muted)" }}>No subscriptions yet.</td></tr>
                )}
                {subscriptions.map((s) => (
                  <tr key={s.id} style={{ background: "var(--card)" }}>
                    <td style={{ padding: "6px 8px", borderRadius: "6px 0 0 6px", fontWeight: 600 }}>
                      <input defaultValue={s.name} onBlur={(e) => onUpdate(s.id, { name: e.target.value })}
                        style={{ width: 130, padding: "5px 6px", borderRadius: 5, border: "1px solid rgba(203,108,230,0.3)", background: "transparent", color: "var(--text)" }} />
                    </td>
                    <td style={{ padding: "6px 8px" }}>
                      <select defaultValue={s.category || SUBSCRIPTION_CATEGORIES[SUBSCRIPTION_CATEGORIES.length - 1]} onChange={(e) => onUpdate(s.id, { category: e.target.value })}
                        style={{ padding: "5px 6px", borderRadius: 5, border: "1px solid rgba(203,108,230,0.3)" }}>
                        {SUBSCRIPTION_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: "6px 8px" }}>
                      <input type="number" min="0" step="0.01" defaultValue={s.amount} onBlur={(e) => onUpdate(s.id, { amount: Number(e.target.value) })}
                        style={{ width: 70, padding: "5px 6px", borderRadius: 5, border: "1px solid rgba(203,108,230,0.3)" }} />
                    </td>
                    <td style={{ padding: "6px 8px" }}>
                      <select defaultValue={s.billingCycle} onChange={(e) => onUpdate(s.id, { billingCycle: e.target.value })}
                        style={{ padding: "5px 6px", borderRadius: 5, border: "1px solid rgba(203,108,230,0.3)" }}>
                        {BILLING_CYCLES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: "6px 8px" }}>
                      <input type="date" defaultValue={s.nextDueDate || ""} onBlur={(e) => onUpdate(s.id, { nextDueDate: e.target.value || null })}
                        style={{ padding: "5px 6px", borderRadius: 5, border: "1px solid rgba(203,108,230,0.3)" }} />
                    </td>
                    <td style={{ padding: "6px 8px" }}>
                      <button type="button" onClick={() => onUpdate(s.id, { active: !s.active })}
                        style={{ background: "transparent", color: s.active ? "var(--purple)" : "var(--muted)", border: `1px solid ${s.active ? "var(--purple)" : "var(--muted)"}`, borderRadius: 6, padding: "4px 8px", fontSize: 11, fontWeight: 600 }}>
                        {s.active ? "Active" : "Inactive"}
                      </button>
                    </td>
                    <td style={{ padding: "6px 8px", borderRadius: "0 6px 6px 0" }}>
                      <button type="button" onClick={() => onDelete(s.id)}
                        style={{ background: "transparent", color: "var(--pink)", border: "1px solid var(--pink)", borderRadius: 6, padding: "4px 8px", fontSize: 11, fontWeight: 600 }}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Jarvis tab --------------------------------------------------
//
// Folds the standalone Jarvis-Voice-UI HUD into the owner console so it
// works from anywhere over the site's own HTTPS + passcode auth, with no
// separate always-on server or tunnel. Vercel functions can't hold a
// websocket open, so this polls Postgres instead:
//  - GET /api/admin/dashboard every ~30s for bookings/attention/media queue
//  - GET /api/admin/speak?since=... every ~2s for new SpeechEvent rows
//    while this tab is mounted, decoding + playing any new audio.
// Browsers block audio autoplay until a real user gesture, so playback is
// gated behind a one-time "Enable Jarvis Audio" click, same as the
// standalone HUD's ACTIVATE button.

function jarvisFmtDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Relative time like "3m ago" / "2h ago" / "5d ago" for AgentActivity rows.
function jarvisRelativeTime(dateVal) {
  const then = new Date(dateVal).getTime();
  if (isNaN(then)) return "";
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

const JARVIS_STATUS_STYLE = {
  running: { color: "#00d9ff", label: "RUNNING", pulse: true },
  completed: { color: "#ffb454", label: "COMPLETED", pulse: false },
  failed: { color: "#ff4d5e", label: "FAILED", pulse: false },
};

// Renders an AgentActivity row's `detail` text. Going forward, Claude Code
// writes `detail` as separate newline-separated lines instead of one
// comma-heavy sentence — those render as a real bullet list. A single short
// line (or an older row written before this change) has no "\n" and just
// renders as plain text, same as before.
function JarvisActivityDetail({ detail }) {
  const lines = detail.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length <= 1) {
    return <div style={{ fontSize: 11.5, color: "#b7d9de", marginTop: 4, marginLeft: 16 }}>{detail}</div>;
  }
  return (
    <ul style={{ fontSize: 11.5, color: "#b7d9de", marginTop: 4, marginBottom: 0, marginLeft: 16, paddingLeft: 16 }}>
      {lines.map((line, idx) => (
        <li key={idx} style={{ marginBottom: idx < lines.length - 1 ? 2 : 0 }}>{line}</li>
      ))}
    </ul>
  );
}

// Badge styling for MediaDraft.status in the Jarvis Media Queue panel.
// "discussing" reads as "PENDING ACTION" — the owner's wording for "still
// thinking about it / needs a conversation before we approve it."
const JARVIS_MEDIA_STATUS_STYLE = {
  pending: { color: "#00d9ff", label: "PENDING" },
  discussing: { color: "#ffb454", label: "PENDING ACTION" },
  approved: { color: "#7fe0b8", label: "APPROVED" },
  rejected: { color: "#ff4d5e", label: "REJECTED" },
  posted: { color: "#7fe0b8", label: "POSTED" },
};

// Angular, beveled panel corner — the established Jarvis HUD look (see the
// standalone Jarvis-Voice-UI's .panel for the non-admin-console version of
// this same aesthetic). Cuts the top-right and bottom-left corners at 45°.
const jarvisPanelClip = "polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 14px 100%, 0 calc(100% - 14px))";

function JarvisPanel({ title, children }) {
  return (
    <div
      style={{
        background: "rgba(0,217,255,0.04)", border: "1px solid #0ea5e9", borderRadius: 4,
        padding: "16px 18px", clipPath: jarvisPanelClip, boxShadow: "0 0 16px rgba(0,217,255,0.08) inset",
        position: "relative",
      }}
    >
      <div className="jarvis-font" style={{
        fontWeight: 700, fontSize: 12.5, letterSpacing: "0.15em", textTransform: "uppercase", color: "#00d9ff",
        marginBottom: 12, textShadow: "0 0 8px rgba(0,217,255,0.5)",
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function JarvisTab({ audioEnabled, onEnableAudio, lastSpoken, audioNote }) {
  const [dashboard, setDashboard] = useState(null);
  const [dashboardError, setDashboardError] = useState(false);
  const [agentActivity, setAgentActivity] = useState(null);
  const [agentActivityError, setAgentActivityError] = useState(false);
  const [mediaItems, setMediaItems] = useState([]);
  const [expandedMediaId, setExpandedMediaId] = useState(null);
  const [mediaActionPendingId, setMediaActionPendingId] = useState(null);
  const [mediaActionError, setMediaActionError] = useState("");

  // Dashboard poll — every 30s while this tab is mounted.
  useEffect(() => {
    let cancelled = false;
    async function loadDashboard() {
      try {
        const res = await fetch("/api/admin/dashboard");
        if (!res.ok) throw new Error("bad status");
        const data = await res.json();
        if (!cancelled) {
          setDashboard(data);
          setDashboardError(false);
        }
      } catch {
        if (!cancelled) setDashboardError(true);
      }
    }
    loadDashboard();
    const interval = setInterval(loadDashboard, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Agent activity poll — every 30s, same cadence as the dashboard panels.
  useEffect(() => {
    let cancelled = false;
    async function loadAgentActivity() {
      try {
        const res = await fetch("/api/admin/agent-activity");
        if (!res.ok) throw new Error("bad status");
        const data = await res.json();
        if (!cancelled) {
          setAgentActivity(data);
          setAgentActivityError(false);
        }
      } catch {
        if (!cancelled) setAgentActivityError(true);
      }
    }
    loadAgentActivity();
    const interval = setInterval(loadAgentActivity, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Mirror the dashboard's media queue into local state so approve/deny/
  // discuss clicks below can update the panel immediately, instead of
  // waiting up to 30s for the next dashboard poll to reflect the change.
  useEffect(() => {
    if (dashboard) setMediaItems(dashboard.mediaQueue || []);
  }, [dashboard]);

  // Approve / deny / discuss a queued media draft directly from the Jarvis
  // tab. This is a human clicking inside the already-authenticated admin
  // console, so it hits /api/media-drafts/[id] with the normal session
  // cookie — no x-jarvis-key service-key needed. The local mediaItems list
  // is updated right away so the panel reflects the new status without
  // waiting for the next 30s dashboard poll; items that move out of
  // "pending"/"discussing" drop out of the queue, matching what the next
  // dashboard poll would fetch anyway.
  async function setMediaDraftStatus(id, status) {
    setMediaActionPendingId(id);
    setMediaActionError("");
    try {
      const res = await fetch(`/api/media-drafts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("bad status");
      const updated = await res.json();
      setMediaItems((prev) => {
        if (status === "pending" || status === "discussing") {
          return prev.map((m) => (m.id === id ? { ...m, status: updated.status } : m));
        }
        return prev.filter((m) => m.id !== id);
      });
      if (status !== "pending" && status !== "discussing") {
        setExpandedMediaId((cur) => (cur === id ? null : cur));
      }
    } catch {
      setMediaActionError("Could not update that item — try again.");
    } finally {
      setMediaActionPendingId(null);
    }
  }

  const bookings = dashboard?.bookings || [];
  const attention = dashboard?.needsAttention || null;

  return (
    <div
      className="jarvis-hud"
      style={{
        position: "relative", margin: "-24px", padding: 24, minHeight: "calc(100vh - 145px)",
        background:
          "radial-gradient(ellipse at top, rgba(0,217,255,0.07) 0%, rgba(4,7,10,1) 62%)," +
          "repeating-linear-gradient(0deg, rgba(0,217,255,0.025) 0px, rgba(0,217,255,0.025) 1px, transparent 1px, transparent 3px)",
        overflow: "hidden",
      }}
    >
      <style>{`
        @keyframes jarvisPulseDot {
          0%, 100% { box-shadow: 0 0 4px 1px rgba(0,217,255,0.6), 0 0 0 rgba(0,217,255,0.4); opacity: 1; }
          50% { box-shadow: 0 0 10px 4px rgba(0,217,255,0.9), 0 0 16px rgba(0,217,255,0.5); opacity: 0.65; }
        }
        @keyframes jarvisScan {
          from { background-position: 0 0; }
          to { background-position: 0 300px; }
        }
        .jarvis-hud .jarvis-font {
          font-family: "Orbitron", "Share Tech Mono", monospace;
        }
        .jarvis-hud, .jarvis-hud input, .jarvis-hud select, .jarvis-hud button {
          font-family: "Share Tech Mono", monospace;
        }
        .jarvis-hud .jarvis-dot-running {
          animation: jarvisPulseDot 1.6s ease-in-out infinite;
        }
        .jarvis-scanline-overlay {
          position: absolute; inset: 0; pointer-events: none; z-index: 1;
          background: linear-gradient(rgba(0,217,255,0) 0%, rgba(0,217,255,0.05) 50%, rgba(0,217,255,0) 100%);
          background-size: 100% 6px;
          animation: jarvisScan 6s linear infinite;
          mix-blend-mode: screen;
        }
      `}</style>
      <div className="jarvis-scanline-overlay" />
      <div style={{ position: "relative", zIndex: 2 }}>
        <div className="jarvis-font" style={{
          fontSize: 20, fontWeight: 900, letterSpacing: "0.3em", color: "#00d9ff",
          textShadow: "0 0 12px rgba(0,217,255,0.6)", marginBottom: 4,
        }}>
          J.A.R.V.I.S.
        </div>
        <div style={{ fontSize: 11, letterSpacing: "0.15em", color: "#1c7a86", marginBottom: 18 }}>
          NAUTI YACHTI // ASSISTANT LINK — CONSOLE MODE
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
          {!audioEnabled ? (
            <button type="button" onClick={onEnableAudio}
              className="jarvis-font"
              style={{
                background: "rgba(0,217,255,0.08)", color: "#00d9ff", border: "1px solid #00d9ff", borderRadius: 4,
                padding: "10px 18px", fontWeight: 700, fontSize: 12.5, letterSpacing: "0.1em",
                boxShadow: "0 0 12px rgba(0,217,255,0.25)",
              }}>
              ▲ ENABLE JARVIS AUDIO
            </button>
          ) : (
            <span style={{
              fontSize: 11, fontWeight: 700, padding: "6px 12px", borderRadius: 20, textTransform: "uppercase", letterSpacing: "0.1em",
              color: "#04070a", background: "#00d9ff", boxShadow: "0 0 10px rgba(0,217,255,0.5)",
            }}>
              <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: "#04070a", marginRight: 6, verticalAlign: "middle" }} />
              AUDIO ENABLED
            </span>
          )}
          <div style={{ fontSize: 12.5, color: "#4ff3ff", opacity: 0.75 }}>
            {lastSpoken ? <>Last spoken: <span style={{ color: "#fff" }}>&ldquo;{lastSpoken}&rdquo;</span></> : "Nothing spoken yet this session."}
          </div>
        </div>
        {audioNote && <div style={{ color: "#ffb454", fontSize: 12.5, marginBottom: 16 }}>{audioNote}</div>}

        {dashboardError && !dashboard && (
          <div style={{ color: "#ff4d5e", fontSize: 13, marginBottom: 16 }}>Unable to load dashboard data.</div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 18 }}>
          <JarvisPanel title="Upcoming Bookings">
            {!dashboard && <div style={{ color: "#1c7a86", fontSize: 12.5 }}>Loading…</div>}
            {dashboard && bookings.length === 0 && <div style={{ color: "#1c7a86", fontSize: 12.5, fontStyle: "italic" }}>No upcoming confirmed bookings.</div>}
            {bookings.map((b, idx) => (
              <div key={idx} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: idx < bookings.length - 1 ? "1px solid rgba(0,217,255,0.12)" : "none", fontSize: 12.5, color: "#dffcff" }}>
                <span style={{ color: "#ffb454", fontWeight: 700, whiteSpace: "nowrap" }}>{jarvisFmtDate(b.date)}</span>
                <span style={{ flex: 1 }}>
                  {b.name} — {b.label}{b.vessel ? ` · ${b.vessel}` : ""}{b.note ? ` (${b.note})` : ""}
                  {b.weatherRisk && b.weatherRisk.risk && (
                    <span title={b.weatherRisk.reason} style={{
                      display: "inline-block", marginLeft: 8, padding: "1px 7px", borderRadius: 3,
                      border: "1px solid #ffb454", color: "#ffb454", fontSize: 10.5, letterSpacing: "0.02em", whiteSpace: "nowrap", verticalAlign: "middle",
                    }}>
                      ⚠ {b.weatherRisk.reason.toUpperCase()}
                    </span>
                  )}
                </span>
              </div>
            ))}
          </JarvisPanel>

          <JarvisPanel title="Needs Attention">
            {!attention && <div style={{ color: "#1c7a86", fontSize: 12.5 }}>Loading…</div>}
            {attention && [
              ["New inquiries", attention.newInquiries],
              ["Confirmed, unpaid", attention.unpaidConfirmed],
              ["Maintenance overdue", attention.overdueMaintenance],
            ].map(([label, val]) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(0,217,255,0.12)", fontSize: 13, color: "#dffcff" }}>
                <span>{label}</span>
                <span style={{ fontWeight: 700, color: val > 0 ? "#ffb454" : "#dffcff" }}>{val}</span>
              </div>
            ))}
          </JarvisPanel>

          <JarvisPanel title="Media Queue">
            {!dashboard && <div style={{ color: "#1c7a86", fontSize: 12.5 }}>Loading…</div>}
            {dashboard && mediaItems.length === 0 && <div style={{ color: "#1c7a86", fontSize: 12.5, fontStyle: "italic" }}>No drafts awaiting review.</div>}
            {mediaActionError && <div style={{ color: "#ff4d5e", fontSize: 11.5, marginBottom: 8 }}>{mediaActionError}</div>}
            {mediaItems.length > 0 && (
              // gridTemplateColumns: "1fr" is required here — an implicit
              // single-column CSS Grid (the default with just `display:
              // grid`) sizes its column to the *content's* max-content
              // width rather than stretching to fill the panel, which let
              // rows (and the expanded image inside them) blow out past the
              // panel's ~290px width. Explicit "1fr" pins the column to the
              // container's actual width.
              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8, width: "100%" }}>
                {mediaItems.map((m) => {
                  const isExpanded = expandedMediaId === m.id;
                  const isPending = mediaActionPendingId === m.id;
                  const statusStyle = JARVIS_MEDIA_STATUS_STYLE[m.status] || JARVIS_MEDIA_STATUS_STYLE.pending;
                  return (
                    <div key={m.id} style={{ border: "1px solid rgba(0,217,255,0.18)", borderRadius: 4, background: isExpanded ? "rgba(0,217,255,0.06)" : "transparent", width: "100%", minWidth: 0, boxSizing: "border-box", overflow: "hidden" }}>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setExpandedMediaId(isExpanded ? null : m.id)}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setExpandedMediaId(isExpanded ? null : m.id); }}
                        style={{ padding: "8px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "#dffcff" }}
                      >
                        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {m.theme} — {m.captionPreview}{m.platform ? ` · ${m.platform}` : ""}
                        </span>
                        <span style={{ color: statusStyle.color, fontSize: 10, letterSpacing: "0.03em", whiteSpace: "nowrap" }}>{statusStyle.label}</span>
                        <span style={{ color: "#4ff3ff", fontSize: 10, flexShrink: 0 }}>{isExpanded ? "✕" : "▼"}</span>
                      </div>
                      {isExpanded && (
                        <div style={{ padding: "0 10px 12px" }}>
                          {m.mediaType === "video" ? (
                            <video src={m.mediaUrl} controls style={{ width: "100%", maxHeight: 240, borderRadius: 4, background: "#000" }} />
                          ) : (
                            <img src={m.mediaUrl} alt="" style={{ width: "100%", maxHeight: 240, objectFit: "contain", borderRadius: 4, background: "rgba(0,0,0,0.35)" }} />
                          )}
                          <div style={{ fontSize: 12.5, color: "#dffcff", marginTop: 8 }}>{m.caption}</div>
                          <div style={{ fontSize: 11, color: "#4ff3ff", opacity: 0.75, marginTop: 6 }}>
                            {[
                              m.theme,
                              m.platform || "Platform TBD",
                              m.createdAt ? new Date(m.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null,
                            ].filter(Boolean).join(" · ")}
                          </div>
                          <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                            <button type="button" disabled={isPending} onClick={() => setMediaDraftStatus(m.id, "approved")}
                              className="jarvis-font"
                              style={{ flex: 1, background: "#00d9ff", color: "#04070a", border: "none", borderRadius: 4, padding: "7px 8px", fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", opacity: isPending ? 0.55 : 1, cursor: isPending ? "default" : "pointer" }}>
                              APPROVE
                            </button>
                            <button type="button" disabled={isPending} onClick={() => setMediaDraftStatus(m.id, "rejected")}
                              className="jarvis-font"
                              style={{ flex: 1, background: "transparent", color: "#ff4d5e", border: "1px solid #ff4d5e", borderRadius: 4, padding: "7px 8px", fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", opacity: isPending ? 0.55 : 1, cursor: isPending ? "default" : "pointer" }}>
                              DENY
                            </button>
                            <button type="button" disabled={isPending} onClick={() => setMediaDraftStatus(m.id, "discussing")}
                              className="jarvis-font"
                              style={{ flex: 1, background: "transparent", color: "#ffb454", border: "1px solid #ffb454", borderRadius: 4, padding: "7px 8px", fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", opacity: isPending ? 0.55 : 1, cursor: isPending ? "default" : "pointer" }}>
                              DISCUSS
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </JarvisPanel>

          <JarvisPanel title="Agent Activity">
            {agentActivityError && !agentActivity && <div style={{ color: "#ff4d5e", fontSize: 12.5 }}>Unable to load agent activity.</div>}
            {!agentActivity && !agentActivityError && <div style={{ color: "#1c7a86", fontSize: 12.5 }}>Loading…</div>}
            {agentActivity && agentActivity.length === 0 && <div style={{ color: "#1c7a86", fontSize: 12.5, fontStyle: "italic" }}>No active tasks.</div>}
            {agentActivity && agentActivity.length > 0 && (
              <div style={{ display: "grid", gap: 10, maxHeight: 320, overflowY: "auto" }}>
                {agentActivity.map((a) => {
                  const s = JARVIS_STATUS_STYLE[a.status] || JARVIS_STATUS_STYLE.running;
                  return (
                    <div key={a.id} style={{ padding: "8px 0", borderBottom: "1px solid rgba(0,217,255,0.12)", fontSize: 12.5, color: "#dffcff" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span
                          className={s.pulse ? "jarvis-dot-running" : ""}
                          style={{
                            display: "inline-block", width: 8, height: 8, borderRadius: "50%",
                            background: s.color, flexShrink: 0,
                            boxShadow: s.pulse ? undefined : `0 0 6px ${s.color}`,
                          }}
                        />
                        <span style={{ fontWeight: 700, color: "#fff", flex: 1, minWidth: 0 }}>{a.taskTitle}</span>
                        <span style={{ fontSize: 10, letterSpacing: "0.06em", color: s.color, whiteSpace: "nowrap" }}>{s.label}</span>
                      </div>
                      <div style={{ fontSize: 11, color: "#4ff3ff", opacity: 0.7, marginTop: 3, marginLeft: 16 }}>
                        {a.agentName} · {jarvisRelativeTime(a.status === "completed" || a.status === "failed" ? (a.completedAt || a.startedAt) : a.startedAt)}
                      </div>
                      {a.detail && <JarvisActivityDetail detail={a.detail} />}
                    </div>
                  );
                })}
              </div>
            )}
          </JarvisPanel>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div style={{ flex: 1, background: "var(--card)", borderRadius: 10, padding: "10px 12px", borderTop: `3px solid ${color}` }}>
      <div style={{ fontSize: 11, color: "var(--muted)" }}>{label}</div>
      <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: "var(--text)" }}>{value}</div>
    </div>
  );
}
