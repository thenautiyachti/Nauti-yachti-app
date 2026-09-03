"use client";

import { useState, useEffect, useRef, Fragment } from "react";
import { currency, localDateKey, imageFocus } from "../lib/pricing";
import {
  GOOGLE_REVIEW_URL, GOOGLE_LISTING_URL, TEMPLATES, ASK_WINDOWS, DOCK_SCRIPT,
  channelFor, daysSince, askWindow, reviewMessage, reviewSubject, DEFAULT_TEMPLATE_FOR_DAYS,
  smsHref, normalizePhone,
} from "../lib/reviews";
import { isCrewListRow, isGuestContactRow, isRealInquiry, mailableCrewList, CREW_LIST_UNSUBSCRIBED_STATUS } from "../lib/crewList";
import { CREW, AGENT_STATUS, isStatusRow, crewInitials, latestRun, latestStatus, statusLines, isToday, isStale, isStalled } from "../lib/crew";
import { PRIORITY, parseItem, priorityOf, sortBoard } from "../lib/board";
import AvailabilityMonthGrid from "./AvailabilityMonthGrid";
import SocialPipelinePanel from "./SocialPipelinePanel";

// Names only. The leading numbers came from a spreadsheet's sort order and had
// started to do real damage: 05 was three different repair categories, 06 was
// both Utilities and Truck Repairs, and 07 was two spellings of the phone bill —
// so one real total sat split across two lines of the tax report. Sorted by how
// much they actually cost, so the ones that matter are at the top of the list.
const EXPENSE_CATEGORIES = [
  "Fuel", "Storage", "Utilities", "Repairs & Parts", "Food & Party Supplies",
  "Apparel & Advertising", "Payroll", "Platform Fees & Commissions", "Insurance",
  "Training", "Cleaning Supplies", "Software & Subscriptions", "Bank Fees",
];
const INCOME_CATEGORIES = [
  "Reservation", "Add-On (+1 Hour)", "Add-On (+2 Hour)", "Add-On (+3 Hour)", "Add-On (+4 Hour)",
  "Womens Apparel", "Mens Apparel", "Other",
];
const RESERVATION_ORIGINS = ["Boatsetter", "GetmyBoat", "Facebook", "Instagram", "Website", "Friends", "Other"];
const STATEMENT_ORIGINS = ["Cash", "CashApp Statement", "Gmail Statement", "Paypal Statement", "Wells Fargo Statement", "WoodForest Statement", "Other"];

export default function AdminView({
  packages, vessels, gallery, blocked, partialDates, inquiries, ledger, totals, addons, externalBookings,
  maintenanceItems, engineHours, fuelLogs, coupons, subscriptions, mediaDrafts, testimonials, priceHistory,
  todos = [], agentActivity = [], onAddTodo, onToggleTodo, onDeleteTodo, onAddGalleryItem, onUpdateGalleryItem, onDeleteGalleryItem,
  giftCertificates = [], giftLiability = 0, giftsLoading = false, onIssueGiftCertificate, onRedeemGiftCertificate,
  onUpdatePrice, onUpdatePricePerGuest, onUpdateHourlyByVesselPrice, onUpdateTierPrice,
  onAddLedgerEntry, onToggleBlocked, onUpdateCaption, onMarkInquiry, onUpdateInquiry, onLogout,
  onUpdateAddonPrice, onUpdateAddon, onAddAddon, onAddExternalBooking, onSetExternalBookingStatus, onUpdateExternalBooking, onDeleteExternalBooking,
  onUpdateMaintenanceItem, onAddEngineHoursLog, onAddFuelLog,
  onAddCoupon, onToggleCouponActive, onUpdateCoupon,
  onAddSubscription, onUpdateSubscription, onDeleteSubscription,
  onUpdateMediaDraftStatus, onDeleteMediaDraft, onAttachMediaDraftMedia,
  onUpdateTestimonialStatus, onDeleteTestimonial,
}) {
  const [tab, setTab] = useState("overview");

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
  const analyserRef = useRef(null);
  const sinceRef = useRef(null);
  // A running log of what Jarvis has said, so the tab shows a transcript
  // rather than only the single most recent line.
  const [messages, setMessages] = useState([]);

  // Speech poll — every 2s, only once audio has been unlocked by a click.
  useEffect(() => {
    // Polling deliberately does NOT depend on audioEnabled. Jarvis messages are
    // worth reading whether or not you want them read aloud, and polling costs
    // nothing — it only reads rows that already exist. ElevenLabs is billed at
    // send time, so nothing here consumes credits.
    let cancelled = false;
    let inFlight = false;

    async function pollSpeech() {
      if (inFlight) return;
      inFlight = true;
      // First call of the session has no cursor: ask for recent history so the
      // panel opens with what Jarvis has already said. Anything said while the
      // tab was closed used to be invisible, which made the whole channel look
      // broken whenever the voice was down.
      const first = !sinceRef.current;
      try {
        const url = first
          ? "/api/admin/speak"
          : `/api/admin/speak?since=${encodeURIComponent(sinceRef.current)}`;
        const res = await fetch(url);
        if (!res.ok || cancelled) return;
        const events = await res.json();
        if (!events.length) {
          // Nothing stored at all — still mark the cursor so the next poll asks
          // only for new arrivals rather than re-fetching history forever.
          if (first) sinceRef.current = new Date().toISOString();
          return;
        }
        sinceRef.current = events[events.length - 1].createdAt;
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          const merged = [...prev, ...events.filter((e) => !seen.has(e.id))];
          // Keep the panel bounded; it is a running log, not an archive.
          return merged.slice(-30);
        });
        // Only speak what arrives live. Replaying history aloud on every page
        // load would be maddening.
        if (!first) {
          for (const ev of events) playSpeech(ev);
        } else if (events.length) {
          setLastSpoken(events[events.length - 1].text);
        }
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
    // Text first, always — it should appear even when there is no audio to
    // play, either because the owner has not enabled sound or because
    // synthesis failed and the event was stored as text only.
    setLastSpoken(ev.text);
    if (!ev.audioB64 || !audioEnabled) return;
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

        // Tapped off the same post-gain/compressor signal that actually
        // plays, so the visualizer reacts to what Jarvis is really saying —
        // not the raw pre-boost audio.
        const analyser = audioCtxRef.current.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.75;
        compressor.connect(analyser);
        analyserRef.current = analyser;

        gainNodeRef.current = gain;
      } catch (err) {
        console.error("Jarvis audio gain boost setup failed:", err);
      }
    }

    sinceRef.current = new Date().toISOString();
    setAudioEnabled(true);
  }

  // Crew-list signups are mailing-list contacts stored in the Inquiry table
  // (lib/crewList.js) — they must not inflate either tab's count.
  const bookingInquiries = inquiries.filter(isRealInquiry);

  // Fourteen peer tabs had no answer to "where does the next feature go?"
  // except another tab, so the row kept growing and everything had to be
  // scanned every time. Grouping keeps every tab — nothing was removed — but
  // gives each one a home and a place for the next one to land.
  //
  // Counts bubble up to the group header so a pending media draft or
  // testimonial is still visible without opening the group.
  // Agents waiting on a decision. Everything else about a run can wait for
  // you to look; this cannot, so it gets a badge like the other queues.
  const crewNeedingInput = CREW.filter((c) => {
    const run = latestRun(agentActivity, c.name);
    return run && run.status === "needs-input";
  }).length;

  const TAB_GROUPS = [
    {
      id: "overview", label: "Overview", tabs: [
        { id: "overview", label: tabLabel("Overview", crewNeedingInput), count: crewNeedingInput },
      ],
    },
    {
      id: "bookings", label: "Bookings", tabs: [
        { id: "inquiries", label: `Inquiries (${bookingInquiries.length})`, count: bookingInquiries.length },
        { id: "bookings", label: `Bookings (${bookingInquiries.length + externalBookings.length})` },
        { id: "availability", label: "Availability" },
      ],
    },
    {
      id: "money", label: "Money", tabs: [
        { id: "ledger", label: "Income & expenses" },
        { id: "reconcile", label: "Reconciliation" },
        { id: "taxReport", label: "Tax Report" },
        { id: "giftCertificates", label: "Gift certificates" },
        { id: "subscriptions", label: "Subscriptions" },
      ],
    },
    {
      id: "marketing", label: "Marketing", tabs: [
        { id: "media", label: "Media" },
        { id: "mediaDrafts", label: tabLabel("Media Drafts", needsReviewCount(mediaDrafts)), count: needsReviewCount(mediaDrafts) },
        { id: "testimonials", label: tabLabel("Testimonials", needsReviewCount(testimonials)), count: needsReviewCount(testimonials) },
      ],
    },
    {
      id: "setup", label: "Setup", tabs: [
        { id: "pricing", label: "Packages & pricing" },
        { id: "addons", label: "Add-ons" },
        { id: "coupons", label: "Coupons" },
      ],
    },
    {
      id: "boat", label: "Boat", tabs: [
        { id: "maintenance", label: "Maintenance" },
      ],
    },
  ];

  const groupForTab = (tabId) => TAB_GROUPS.find((g) => g.tabs.some((t) => t.id === tabId));
  const activeGroup = groupForTab(tab) || TAB_GROUPS[0];

  return (
    <div style={{ minHeight: "100vh", background: "var(--ink)" }}>
      {/* Persists across tab switches — see the Jarvis audio state above. */}
      <audio ref={audioElRef} style={{ display: "none" }} />
      <div className="console-header" style={{ background: "var(--ink-soft)", color: "var(--text)", padding: "14px 24px", borderBottom: "1px solid rgba(203,108,230,0.2)" }}>
        {/* Jarvis sits beside the title rather than out on the right: it is a
            mode you switch into, not an action like Manual or Log out. */}
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div className="display" style={{ fontSize: 20, fontWeight: 700, whiteSpace: "nowrap" }}>OWNER CONSOLE</div>
          <button
            className="console-btn"
            onClick={() => setTab("jarvis")}
            style={{
              background: tab === "jarvis" ? "linear-gradient(135deg, #00d9ff, #0ea5e9)" : "rgba(0,217,255,0.08)",
              color: tab === "jarvis" ? "#04070a" : "#4ff3ff",
              borderColor: "#0ea5e9", fontWeight: 700, letterSpacing: "0.04em",
              boxShadow: tab === "jarvis" ? "0 0 14px rgba(0,217,255,0.5)" : "none",
            }}
          >
            ⚡ Jarvis
          </button>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {/* The dock page. Everything on it needs a phone -- an sms: link, and
              an engine-hour reading taken at the boat rather than at a desk. */}
          <a className="console-btn" href="/admin/ask">📱 On the dock</a>
          <a className="console-btn" href="/owner-console-manual.pdf" target="_blank" rel="noopener noreferrer">📖 Manual</a>
          <a className="console-btn" href="/">← Back to site</a>
          <button className="console-btn" onClick={onLogout} style={{ background: "var(--purple)", color: "#0A0612", borderColor: "var(--purple)", fontWeight: 700 }}>
            Log out
          </button>
        </div>
      </div>

      {/* Group row. Selecting a group jumps to its first tab, so a group is
          never selected without something being shown. */}
      <div style={{ display: "flex", gap: 6, padding: "16px 24px 0", flexWrap: "wrap" }}>
        {TAB_GROUPS.map((g) => {
          const isActive = g.id === activeGroup.id;
          const pending = g.tabs.reduce((n, t) => n + (t.count || 0), 0);
          return (
            <button key={g.id} onClick={() => setTab(g.tabs[0].id)} style={{
              background: isActive ? "var(--purple)" : "transparent",
              color: isActive ? "#0A0612" : "var(--text)",
              border: "1px solid var(--purple)", borderRadius: 8, padding: "8px 16px",
              fontSize: 13.5, fontWeight: 700, whiteSpace: "nowrap",
            }}>
              {g.label}
              {pending > 0 && (
                <span style={{
                  marginLeft: 7, padding: "1px 7px", borderRadius: 10, fontSize: 11, fontWeight: 700,
                  background: isActive ? "#0A0612" : "var(--pink)", color: isActive ? "var(--purple)" : "#0A0612",
                }}>{pending}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tabs within the selected group. */}
      <div style={{ display: "flex", gap: 6, padding: "10px 24px 0", flexWrap: "nowrap", overflowX: "auto", whiteSpace: "nowrap" }}>
        {activeGroup.tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            background: tab === t.id ? "rgba(203,108,230,0.22)" : "transparent",
            color: "var(--text)", opacity: tab === t.id ? 1 : 0.72,
            border: "1px solid rgba(203,108,230,0.35)", borderRadius: "8px 8px 0 0",
            padding: "9px 14px", fontSize: 13, fontWeight: 600, flexShrink: 0, whiteSpace: "nowrap",
          }}>{t.label}</button>
        ))}
      </div>

      <div style={{ padding: 24 }}>
        {tab === "inquiries" && (
          <InquiriesTab inquiries={inquiries} externalBookings={externalBookings} onUpdate={onUpdateInquiry} />
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
          <AddOnsTab addons={addons} onUpdate={onUpdateAddon} onAdd={onAddAddon} />
        )}

        {tab === "coupons" && (
          <CouponsTab coupons={coupons} onAdd={onAddCoupon} onToggleActive={onToggleCouponActive} onUpdate={onUpdateCoupon} />
        )}

        {tab === "pricing" && (
          <>
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
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(124px, 1fr))", gap: 10 }}>
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
          <PriceHistoryPanel priceHistory={priceHistory} />
          </>
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

        {tab === "overview" && (
          <OverviewTab
            externalBookings={externalBookings} inquiries={inquiries} ledger={ledger}
            maintenanceItems={maintenanceItems} engineHours={engineHours} mediaDrafts={mediaDrafts}
            todos={todos} agentActivity={agentActivity}
            testimonials={testimonials} giftCertificates={giftCertificates}
            onAddTodo={onAddTodo} onToggleTodo={onToggleTodo} onDeleteTodo={onDeleteTodo}
            onGo={setTab}
          />
        )}

        {tab === "media" && (
          <GalleryTab gallery={gallery} onUpdateCaption={onUpdateCaption} onAddGalleryItem={onAddGalleryItem} onUpdateGalleryItem={onUpdateGalleryItem} onDeleteGalleryItem={onDeleteGalleryItem} />
        )}

        {tab === "mediaDrafts" && (
          <MediaDraftsTab mediaDrafts={mediaDrafts} onUpdateStatus={onUpdateMediaDraftStatus} onDelete={onDeleteMediaDraft} onAttachMedia={onAttachMediaDraftMedia} />
        )}

        {tab === "testimonials" && (
          <TestimonialsTab
            testimonials={testimonials}
            inquiries={inquiries}
            externalBookings={externalBookings}
            onUpdateStatus={onUpdateTestimonialStatus}
            onDelete={onDeleteTestimonial}
            onUpdateExternalBooking={onUpdateExternalBooking}
            onUpdateInquiry={onUpdateInquiry}
          />
        )}

        {tab === "ledger" && (
          <LedgerTab ledger={ledger} totals={totals} onAdd={onAddLedgerEntry} externalBookings={externalBookings} vessels={vessels} packages={packages} />
        )}

        {tab === "reconcile" && (
          <ReconciliationTab
            externalBookings={externalBookings}
            ledger={ledger}
            onUpdateExternalBooking={onUpdateExternalBooking}
          />
        )}

        {tab === "taxReport" && (
          <TaxReportTab ledger={ledger} subscriptions={subscriptions} externalBookings={externalBookings} />
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

        {tab === "giftCertificates" && (
          <GiftCertificatesTab
            certificates={giftCertificates} liability={giftLiability}
            onIssue={onIssueGiftCertificate} onRedeem={onRedeemGiftCertificate} loading={giftsLoading}
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
            messages={messages}
            audioNote={audioNote}
            analyserRef={analyserRef}
          />
        )}
      </div>
    </div>
  );
}

const BOOKING_PLATFORMS = ["Boatsetter", "GetmyBoat", "Facebook", "Instagram", "Other"];

// How a booking was WON. Deliberately separate from `platform`, which records
// who processed the payment. The highest-value bookings on record - a repeat
// guest, a direct cash booking and a word-of-mouth referral - all share the
// platform value "Other", so platform alone cannot show what is working.
const BOOKING_REFERRAL_SOURCES = [
  "platform",
  "repeat guest",
  "word of mouth",
  "direct",
  "website",
  "social media",
  "walk-up",
];

// Merges Inquiry rows (site-originated) and ExternalBooking rows (logged
// from third-party platforms) into one shape for the unified table below.
// kind distinguishes which management actions/enum apply to a given row —
// their status values and editable fields differ, so the row renderer
// branches on it rather than trying to force both into one schema.
// Inquiry.status ("new"|"lapsed"|"pending"|"booked"|"completed"|"cancelled")
// and ExternalBooking.status ("booked"|"completed"|"cancelled") are
// different enums for different underlying flows — this maps both onto the
// same shared bucket concept so the unified table can filter/display them
// consistently without changing either model's own real values.
const INQUIRY_STATUS_BUCKET = { new: "pending", pending: "pending", booked: "booked", completed: "completed", lapsed: "cancelled", cancelled: "cancelled" };

function toUnifiedRows(inquiries, externalBookings) {
  // Crew-list signups live in the Inquiry table (see lib/crewList.js) but are
  // mailing-list contacts, not bookings — they'd otherwise show up here as
  // permanently "pending" reservations with no date and never clear.
  const fromInquiries = inquiries.filter(isRealInquiry).map((i) => ({
    kind: "inquiry",
    id: i.id,
    bookingId: i.bookingId,
    date: i.date,
    startTime: null,
    name: i.name,
    email: i.email,
    phone: i.phone,
    vesselName: i.vesselName,
    hours: i.hours,
    partySize: i.partySize,
    pricePaid: i.priceQuoted,
    source: "Site",
    status: i.status,
    statusBucket: INQUIRY_STATUS_BUCKET[i.status] || "pending",
    addOnIds: i.addOnIds ? JSON.parse(i.addOnIds) : [],
    raw: i,
  }));
  const fromExternal = externalBookings.map((b) => ({
    kind: "external",
    id: b.id,
    bookingId: b.bookingId,
    date: b.date,
    startTime: b.startTime,
    name: b.guestName,
    email: b.email,
    phone: b.phone,
    vesselName: b.vesselName,
    hours: b.hours,
    partySize: b.partySize,
    pricePaid: b.pricePaid,
    source: b.platform,
    status: b.status,
    statusBucket: b.status,
    raw: b,
  }));
  return [...fromInquiries, ...fromExternal].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

// ---- Inquiries tab -------------------------------------------------

const INQUIRY_STATUSES = ["new", "lapsed", "pending", "booked", "completed", "cancelled"];
const INQUIRY_STATUS_LABEL = { new: "New", lapsed: "Lapsed", pending: "Pending", booked: "Booked", completed: "Completed", cancelled: "Cancelled" };
const INQUIRY_STATUS_COLOR = { new: "var(--purple)", lapsed: "var(--muted)", pending: "#E8934A", booked: "#4FA8E8", completed: "#7FE0B8", cancelled: "#F0559C" };
const REFUND_TYPES = ["full", "partial", "none"];
const REFUND_TYPE_LABEL = { full: "Full refund", partial: "Partial refund", none: "No refund" };

// The guest mailing list. These rows come from the two-field signup on /glow
// and /glow/crew, not the booking form — so they get their own panel with a
// one-click "copy all emails" rather than sitting in the inquiry queue where
// they'd read as leads that were never followed up.

// People who were aboard someone else's booking. Not a guest of their own
// reservation and not an enquirer, so they get their own strip rather than
// muddying either list. Distinct from GuestContactsPanel below, which is about
// bookings whose contact details are missing.

// Everyone who has been on a boat, deduplicated into people rather than trips.
//
// Bookings answers "what charters have run"; a repeat guest appears three times
// there and someone with no phone looks identical to someone reachable. This
// answers the different question of "who can we actually contact", which is what
// a review ask or a glow-night mailshot needs.
//
// Keyed on the phone digits, falling back to email then name. Two bookings by
// the same person under slightly different spellings still collapse if the
// number matches.
function contactKey(name, phone, email) {
  const digits = String(phone || "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  if (digits) return "p:" + digits;
  const mail = String(email || "").trim().toLowerCase();
  if (mail.includes("@")) return "e:" + mail;
  const n = String(name || "").trim().toLowerCase();
  return n ? "n:" + n : null;
}

function buildContacts(externalBookings, inquiries) {
  const map = new Map();
  const add = (name, phone, email, date, status, source, optOut) => {
    const key = contactKey(name, phone, email);
    if (!key) return;
    const e = map.get(key) || { name, phone, email, trips: 0, last: null, sources: new Set(), optOut: false, askedAt: null };
    if (!e.name && name) e.name = name;
    if (!e.phone && phone) e.phone = phone;
    if (!e.email && email) e.email = email;
    if (status === "completed") e.trips += 1;
    if (date && (!e.last || date > e.last)) e.last = date;
    if (optOut) e.optOut = true;
    e.sources.add(source);
    map.set(key, e);
  };
  for (const b of externalBookings) {
    add(b.guestName, b.phone, b.email, b.date, b.status, "charter", b.marketingOptOut);
    if (b.reviewRequestedAt) {
      const e = map.get(contactKey(b.guestName, b.phone, b.email));
      if (e) e.askedAt = b.reviewRequestedAt;
    }
  }
  for (const i of inquiries) {
    const source = isGuestContactRow(i) ? "extra contact" : isCrewListRow(i) ? "crew list" : "enquiry";
    add(i.name, i.phone, i.email, i.date, i.status, source);
    if (i.reviewRequestedAt) {
      const e = map.get(contactKey(i.name, i.phone, i.email));
      if (e) e.askedAt = i.reviewRequestedAt;
    }
  }
  return [...map.values()].sort((a, b) => String(b.last || "").localeCompare(String(a.last || "")));
}

function ContactsPanel({ externalBookings, inquiries }) {
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const all = buildContacts(externalBookings, inquiries);
  const reachable = all.filter((c) => c.phone || String(c.email || "").includes("@"));
  const unreachable = all.length - reachable.length;
  const shown = showAll ? all : reachable;

  return (
    <div style={{ background: "var(--card)", borderRadius: 8, padding: 14, marginBottom: 14, border: "1px solid rgba(203,108,230,0.3)" }}>
      <button type="button" onClick={() => setOpen((v) => !v)}
        style={{ background: "transparent", border: "none", padding: 0, textAlign: "left", width: "100%", color: "var(--text)" }}>
        <div style={{ fontWeight: 700 }}>
          {open ? "▾" : "▸"} Everyone we can contact — {reachable.length}
          <span style={{ color: "var(--muted)", fontWeight: 400 }}> of {all.length} people who have been aboard</span>
        </div>
      </button>
      <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2 }}>
        People, not trips — a repeat guest appears once. {unreachable > 0 && (
          <span style={{ color: "#E8934A" }}>{unreachable} have no phone and no email, so they cannot be asked for a review or told about a glow night.</span>
        )}
      </div>

      {open && (
        <>
          <div style={{ display: "flex", gap: 8, margin: "10px 0" }}>
            <button type="button" onClick={() => setShowAll(false)}
              style={{ background: showAll ? "transparent" : "var(--purple)", color: showAll ? "var(--muted)" : "#0A0612", border: "1px solid rgba(203,108,230,0.4)", borderRadius: 6, padding: "5px 11px", fontSize: 12, fontWeight: 700 }}>
              Reachable ({reachable.length})
            </button>
            <button type="button" onClick={() => setShowAll(true)}
              style={{ background: showAll ? "var(--purple)" : "transparent", color: showAll ? "#0A0612" : "var(--muted)", border: "1px solid rgba(203,108,230,0.4)", borderRadius: 6, padding: "5px 11px", fontSize: 12, fontWeight: 700 }}>
              Everyone ({all.length})
            </button>
          </div>

          <div style={{ display: "grid", gap: 3, maxHeight: 340, overflowY: "auto" }}>
            {shown.map((c, i) => (
              <div key={(c.phone || c.email || c.name || "") + i}
                style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 12.5, padding: "5px 0", borderBottom: "1px solid rgba(203,108,230,0.08)", opacity: c.optOut ? 0.5 : 1 }}>
                <span style={{ fontWeight: 700, minWidth: 130 }}>{c.name || "(no name)"}</span>
                <span className="mono" style={{ color: c.phone ? "var(--text)" : "var(--muted)", minWidth: 118 }}>
                  {c.phone ? prettyPhone(c.phone) : "—"}
                </span>
                <span style={{ color: "var(--muted)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.email || ""}
                </span>
                {c.trips > 1 && <span style={{ color: "#7FE0B8", fontWeight: 700, whiteSpace: "nowrap" }}>{c.trips} trips</span>}
                <span style={{ color: "var(--muted)", whiteSpace: "nowrap", fontSize: 11 }}>{c.last || ""}</span>
                <span style={{ color: c.askedAt ? "var(--muted)" : "var(--purple)", whiteSpace: "nowrap", fontSize: 11 }}>
                  {c.optOut ? "opted out" : c.askedAt ? "asked" : "not asked"}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ExtraContactsPanel({ contacts }) {
  if (!contacts.length) return null;
  return (
    <div style={{ background: "var(--card)", borderRadius: 8, padding: 14, marginBottom: 14, border: "1px solid rgba(127,224,184,0.3)" }}>
      <div style={{ fontWeight: 700, color: "var(--text)" }}>
        Extra guest contacts — {contacts.length}
      </div>
      <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2, marginBottom: 10 }}>
        People who were on someone else&apos;s charter and whose number is worth keeping —
        a second review ask from the same trip, or a follow-up. Deliberately not counted
        as inquiries, and every actual guest is already listed under Bookings.
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        {contacts.map((c) => (
          <div key={c.id} style={{ fontSize: 12.5, color: "var(--text)" }}>
            <span style={{ fontWeight: 700 }}>{c.name}</span>
            <span style={{ color: "var(--muted)" }}>
              {c.phone ? " · " + prettyPhone(c.phone) : ""}
              {c.date ? " · " + c.date : ""}
              {c.reviewRequestedAt ? " · review asked" : " · never asked for a review"}
            </span>
            {c.message && <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>{c.message}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function CrewListPanel({ signups, onUpdate }) {
  const [copied, setCopied] = useState(false);

  // Only ever hand over addresses that haven't opted out. The signup form
  // promises an unsubscribe, and until there's a real marketingOptOut column
  // (see prisma/proposed-contact-and-reconciliation.sql) that promise is kept
  // by setting the row's status to "lapsed" — so "lapsed" must never end up
  // on the clipboard.
  const mailable = mailableCrewList(signups);
  const optedOut = signups.length - mailable.length;

  async function copyEmails() {
    try {
      await navigator.clipboard.writeText(mailable.map((s) => s.email).join(", "));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the addresses are listed below anyway */
    }
  }

  return (
    <div style={{ background: "var(--card)", borderRadius: 8, padding: 14, marginBottom: 14, border: "1px solid rgba(203,108,230,0.3)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 700, color: "var(--text)" }}>
            Crew list — {mailable.length} contact{mailable.length === 1 ? "" : "s"}
            {optedOut > 0 && <span style={{ color: "var(--muted)", fontWeight: 400 }}> ({optedOut} opted out)</span>}
          </div>
          <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2 }}>
            Guest emails captured from /glow and the on-boat QR code — this is the
            list to mail when the next date is set. To honour an unsubscribe, set
            that person&apos;s status to &ldquo;{CREW_LIST_UNSUBSCRIBED_STATUS}&rdquo; below and they
            drop out of the copy button.
          </div>
        </div>
        {mailable.length > 0 && (
          <button
            type="button"
            onClick={copyEmails}
            style={{ background: "var(--purple)", color: "#0A0612", border: "none", borderRadius: 6, padding: "8px 14px", fontSize: 13, fontWeight: 700, flexShrink: 0 }}
          >
            {copied ? "Copied ✓" : "Copy mailable emails"}
          </button>
        )}
      </div>
      {signups.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 10 }}>
          No signups yet — they'll appear here as guests join from the glow page.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 4, marginTop: 10, maxHeight: 220, overflowY: "auto" }}>
          {signups.map((s) => {
            const out = s.status === CREW_LIST_UNSUBSCRIBED_STATUS;
            return (
              <div key={s.id} style={{ fontSize: 12.5, color: "var(--text)", opacity: out ? 0.45 : 1, display: "flex", gap: 8, alignItems: "baseline" }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 600, textDecoration: out ? "line-through" : "none" }}>{s.name}</span>
                  <span style={{ color: "var(--muted)" }}> · {s.email}{s.message ? ` · ${s.message}` : ""}</span>
                </span>
                <button
                  type="button"
                  onClick={() => onUpdate(s.id, { status: out ? "new" : CREW_LIST_UNSUBSCRIBED_STATUS })}
                  style={{ background: "transparent", color: "var(--muted)", border: "1px solid rgba(203,108,230,0.3)", borderRadius: 5, padding: "2px 8px", fontSize: 11, flexShrink: 0 }}
                >
                  {out ? "Resubscribe" : "Unsubscribe"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function InquiriesTab({ inquiries, externalBookings = [], onUpdate }) {
  const crewList = inquiries.filter(isCrewListRow);
  const guestContacts = inquiries.filter(isGuestContactRow);
  const realInquiries = inquiries.filter(isRealInquiry);
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <ContactsPanel externalBookings={externalBookings} inquiries={inquiries} />
      <ExtraContactsPanel contacts={guestContacts} />
      <CrewListPanel signups={crewList} onUpdate={onUpdate} />
      {realInquiries.length === 0 && <div style={{ color: "var(--muted)" }}>No inquiries yet — they'll show up here the moment a customer submits the form.</div>}
      {realInquiries.map((i) => (
        <div key={i.id} style={{ background: "var(--card)", borderRadius: 8, padding: 14, color: "var(--text)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 700 }}>{i.name} — {i.packageName}</div>
              <div style={{ fontSize: 12.5, color: "var(--muted)" }}>
                {i.email} · {i.phone} · {i.vesselName || "—"} · {i.date || "—"} · party of {i.partySize || "—"}
                {i.priceQuoted ? ` · ${currency(i.priceQuoted)}` : ""}
                {i.couponCode ? ` · coupon ${i.couponCode} (−${currency(i.discountAmount || 0)})` : ""}
              </div>
              {i.message && <div style={{ fontSize: 12.5, marginTop: 4 }}>{i.message}</div>}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
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
              <span className="mono" style={{ fontSize: 10.5, fontWeight: 700, color: INQUIRY_STATUS_COLOR[i.status], textTransform: "uppercase", letterSpacing: "0.03em" }}>
                {INQUIRY_STATUS_LABEL[i.status] || i.status}
              </span>
              <select value={i.status} onChange={(e) => onUpdate(i.id, { status: e.target.value })} style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)", fontSize: 12.5 }}>
                {INQUIRY_STATUSES.map((s) => <option key={s} value={s}>{INQUIRY_STATUS_LABEL[s]}</option>)}
              </select>
            </div>
          </div>
          {i.status === "cancelled" && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(203,108,230,0.15)" }}>
              <span style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 600 }}>Refund:</span>
              <select value={i.refundType || ""} onChange={(e) => onUpdate(i.id, { refundType: e.target.value || null })}
                style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)", fontSize: 12 }}>
                <option value="">— pick one —</option>
                {REFUND_TYPES.map((r) => <option key={r} value={r}>{REFUND_TYPE_LABEL[r]}</option>)}
              </select>
              {i.refundType === "partial" && (
                <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span className="mono" style={{ color: "var(--muted)" }}>$</span>
                  <input type="number" min="0" step="0.01" placeholder="Amount refunded" defaultValue={i.refundAmount ?? ""}
                    onBlur={(e) => onUpdate(i.id, { refundAmount: e.target.value === "" ? null : Number(e.target.value) })}
                    style={{ width: 110, padding: "5px 8px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)" }} />
                </label>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// Formats a PriceChangeLog row's ISO changedAt into a short local
// date/time string, e.g. "Aug 29, 2026 2:14 PM".
function fmtChangeTimestamp(iso) {
  const d = new Date(iso);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

// Internal-only audit trail for Packages & Pricing — never shown on the
// public site. Collapsed by default since it's investigate-when-needed
// data, not something the owner needs to look at every visit.
function PriceHistoryPanel({ priceHistory }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: 20 }}>
      <button type="button" onClick={() => setOpen((v) => !v)}
        style={{ background: "transparent", color: "var(--muted)", border: "1px solid rgba(203,108,230,0.3)", borderRadius: 6, padding: "6px 12px", fontSize: 12.5, fontWeight: 600, marginBottom: 10 }}>
        {open ? "▲" : "▼"} Price change history ({priceHistory.length})
      </button>
      {open && (
        <div style={{ maxWidth: 720, display: "grid", gap: 6, maxHeight: 420, overflowY: "auto" }}>
          {priceHistory.length === 0 && <div style={{ color: "var(--muted)", fontSize: 13.5 }}>No price changes logged yet.</div>}
          {priceHistory.map((h) => (
            <div key={h.id} style={{ background: "var(--card)", borderRadius: 6, padding: "8px 12px", fontSize: 12.5, color: "var(--text)", display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div>
                <span style={{ fontWeight: 600 }}>{h.packageName}</span>
                <span style={{ color: "var(--muted)" }}> — {h.field}</span>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, whiteSpace: "nowrap" }}>
                <span className="mono" style={{ color: "var(--muted)" }}>
                  {h.oldValue != null ? currency(h.oldValue) : "—"} → <span style={{ color: "var(--purple)", fontWeight: 700 }}>{currency(h.newValue)}</span>
                </span>
                <span style={{ color: "var(--muted)", fontSize: 11 }}>{fmtChangeTimestamp(h.changedAt)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// The 3 real ExternalBooking statuses — used for the add-booking form's
// toggle and the per-row status <select> (an external booking can never be
// bare "pending", that state only exists on the Inquiry side).
const BOOKING_STATUS_BUCKETS = ["booked", "completed", "cancelled"];
// Unified filter/sort buckets for the combined Inquiry+ExternalBooking
// table — includes "pending" since a site Inquiry can sit in that bucket
// even though no ExternalBooking row ever will.
const UNIFIED_STATUS_BUCKETS = ["pending", "booked", "completed", "cancelled"];
const BOOKING_STATUS_COLOR = { pending: "#E8934A", booked: "#4FA8E8", completed: "#7FE0B8", cancelled: "#F0559C" };
const BOOKING_STATUS_LABEL = { pending: "Pending", booked: "Booked", completed: "Completed", cancelled: "Cancelled" };

// ---- Guest contact capture -------------------------------------------
//
// ExternalBooking.email has existed and been editable in the bookings table
// all along, but nothing ever surfaced *which* bookings were missing one, so
// in practice it never got filled in — every one of the live rows is null.
// This panel makes the gap visible and puts the highest-value rows (guests
// who actually paid and sailed) at the top, so filling it in is a short
// worklist rather than a scroll through the whole table.
//
// Grouping is by guest name because there are no emails yet to group by.
// First names collide easily, so repeats are labelled as candidates to
// check, never asserted as the same person.
function normalizeGuestName(name) {
  return (name || "").trim().toLowerCase().replace(/\s+/g, " ");
}

// Shared field styling for the horizontal add-booking band. border-box matters
// here: without it the padding widens each control past the width flex gave it,
// and the row wraps a field earlier than it needs to.
const FIELD = {
  width: "100%", boxSizing: "border-box", padding: "9px 10px", borderRadius: 6,
  border: "1px solid rgba(203,108,230,0.3)", background: "transparent", color: "var(--text)",
};
const FIELD_LABEL = { fontSize: 11, color: "var(--muted)", marginBottom: 3, whiteSpace: "nowrap" };

// Render a stored E.164 number the way a person reads one. US numbers get the
// familiar grouping; anything international is shown as-is, since guessing at
// another country's grouping is worse than not trying.
function prettyPhone(raw) {
  const e164 = normalizePhone(raw);
  if (!e164) return raw || "—";
  const m = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

// A phone field that says whether what you typed can actually be texted.
//
// The review flow is a `sms:` deep link, and that link silently does nothing
// when the number is not dialable — so a typo here looks identical to a guest
// who never replied. Rather than reject the input, it stores what was typed and
// marks it, because a half-remembered number is still worth keeping.
function PhoneInput({ booking, onUpdateExternalBooking }) {
  const [value, setValue] = useState(booking.phone || "");
  const dialable = normalizePhone(value);
  const flagged = value.trim() && !dialable;

  function save() {
    const raw = value.trim();
    // Store the normalized +1XXXXXXXXXX when it parses, so every good number is
    // held in one shape regardless of how it was typed.
    const next = raw ? (normalizePhone(raw) || raw) : null;
    if (next !== booking.phone) onUpdateExternalBooking(booking.id, { phone: next });
    if (next) setValue(next);
  }

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 2 }}>
      <input
        type="tel" value={value} placeholder="add a phone…"
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
        style={{
          width: 170, padding: "5px 8px", borderRadius: 5,
          border: `1px solid ${flagged ? "rgba(232,147,74,0.7)" : "rgba(203,108,230,0.3)"}`,
          background: "transparent", color: "var(--text)",
        }} />
      {flagged && (
        <span style={{ fontSize: 10, color: "#E8934A" }}>not textable — check digits</span>
      )}
    </span>
  );
}

function GuestContactsPanel({ externalBookings, onUpdateExternalBooking }) {
  const [open, setOpen] = useState(false);
  const [onlyMissing, setOnlyMissing] = useState(true);

  // Phone leads, because that is the contact guests actually hand over and the
  // review flow texts rather than emails. Email is still worth keeping when it
  // turns up, it just is not what gets a review asked for.
  const withPhone = externalBookings.filter((b) => b.phone);
  const withEmail = externalBookings.filter((b) => b.email);
  const completed = externalBookings.filter((b) => b.status === "completed");
  const completedMissing = completed.filter((b) => !b.phone);

  // Same normalized name on more than one booking — a repeat-guest candidate.
  const byName = new Map();
  for (const b of externalBookings) {
    const key = normalizeGuestName(b.guestName);
    if (!key) continue;
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(b);
  }
  const repeatCandidates = Array.from(byName.entries())
    .filter(([, list]) => list.length > 1)
    .map(([key, list]) => ({
      key,
      name: list[0].guestName,
      count: list.length,
      completedCount: list.filter((b) => b.status === "completed").length,
      dates: list.map((b) => b.date).sort(),
    }))
    .sort((a, b) => b.count - a.count);

  // Sorted so the guests worth contacting come first: completed charters
  // without an email, newest first.
  const worklist = [...externalBookings]
    .filter((b) => (onlyMissing ? !b.phone : true))
    .sort((a, b) => {
      const rank = (x) => (x.status === "completed" ? 0 : 1);
      return rank(a) - rank(b) || (b.date || "").localeCompare(a.date || "");
    });

  // Anyone reachable by either channel belongs in the export, so a guest with a
  // phone and no email is not silently dropped from the contact list.
  const reachable = externalBookings.filter((b) => b.phone || b.email);

  function exportMarketingCsv() {
    const rows = [
      ["Booking ID", "Date", "Guest name", "Phone", "Email", "Platform", "Status", "Party size", "Vessel", "Price paid"],
      ...reachable
        .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
        .map((b) => [b.bookingId || "", b.date, b.guestName || "", b.phone || "", b.email || "", b.platform, b.status, b.partySize ?? "", b.vesselName, b.pricePaid ?? ""]),
    ];
    downloadCsv("nauti-yachti-guest-contacts.csv", rows);
  }

  return (
    <div>
      <button type="button" onClick={() => setOpen((v) => !v)}
        style={{ background: "transparent", color: completedMissing.length ? "#E8934A" : "var(--muted)", border: `1px solid ${completedMissing.length ? "rgba(232,147,74,0.5)" : "rgba(203,108,230,0.3)"}`, borderRadius: 6, padding: "7px 12px", fontSize: 12.5, fontWeight: 600, marginBottom: 10 }}>
        {open ? "▲" : "▼"} Guest contacts — {withPhone.length} of {externalBookings.length} bookings have a phone number
        {completedMissing.length > 0 ? ` · ${completedMissing.length} paying guests unreachable` : ""}
      </button>
      {open && (
        <div style={{ display: "grid", gap: 14, marginBottom: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(124px, 1fr))", gap: 10 }}>
            <StatCard label="Bookings with a phone" value={`${withPhone.length} / ${externalBookings.length}`} color={withPhone.length ? "var(--purple)" : "#F0559C"} />
            <StatCard label="Completed charters, no phone" value={String(completedMissing.length)} color="#F0559C" />
            <StatCard label="Bookings with an email" value={`${withEmail.length} / ${externalBookings.length}`} color={withEmail.length ? "var(--purple)" : "var(--muted)"} />
            <StatCard label="Repeat-guest candidates" value={String(repeatCandidates.length)} color="#E8934A" />
          </div>

          <div style={{ background: "rgba(240,85,156,0.07)", border: "1px solid rgba(240,85,156,0.3)", borderRadius: 10, padding: 12, fontSize: 12.5, color: "var(--text)", lineHeight: 1.55 }}>
            Neither platform will ever hand over a guest&apos;s phone number or email. Checked every one: Boatsetter forwards message text but guests almost never type a number into it, GetMyBoat forwards no message text at all, and its booking confirmations carry no contact details by design. So this table is the only way past charters get contact details — typed in from your own phone, or asked for on the boat and filled in the same day. Guests who already paid are worth far more than enquiries, so those are listed first.
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ fontSize: 12.5, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
              Only show bookings with no phone number
            </label>
            <button type="button" onClick={exportMarketingCsv} disabled={reachable.length === 0}
              style={{ background: reachable.length ? "linear-gradient(135deg, var(--purple), var(--pink))" : "transparent", color: reachable.length ? "#0A0612" : "var(--muted)", border: reachable.length ? "none" : "1px solid rgba(203,108,230,0.3)", borderRadius: 6, padding: "8px 14px", fontWeight: 700, fontSize: 12.5 }}>
              Download contact list CSV{reachable.length === 0 ? " (none yet)" : ""}
            </button>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 820, fontSize: 12.5, color: "var(--text)" }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--muted)", fontSize: 11 }}>
                  <th style={{ padding: "4px 8px" }}>Date</th>
                  <th style={{ padding: "4px 8px" }}>Guest</th>
                  <th style={{ padding: "4px 8px" }}>Status</th>
                  <th style={{ padding: "4px 8px" }}>Platform</th>
                  <th style={{ padding: "4px 8px" }}>Phone</th>
                  <th style={{ padding: "4px 8px" }}>Email</th>
                </tr>
              </thead>
              <tbody>
                {worklist.map((b) => (
                  <tr key={b.id} style={{ background: "var(--card)" }}>
                    <td className="mono" style={{ padding: "6px 8px", borderRadius: "6px 0 0 6px", whiteSpace: "nowrap" }}>{fmtLedgerDate(b.date)}</td>
                    <td style={{ padding: "6px 8px", fontWeight: 600 }}>{b.guestName || "Guest"}</td>
                    <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                      <span className="mono" style={{ fontSize: 10.5, fontWeight: 700, color: BOOKING_STATUS_COLOR[b.status], textTransform: "uppercase" }}>
                        {BOOKING_STATUS_LABEL[b.status] || b.status}
                      </span>
                    </td>
                    <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{b.platform}</td>
                    <td style={{ padding: "6px 8px" }}>
                      <PhoneInput booking={b} onUpdateExternalBooking={onUpdateExternalBooking} />
                    </td>
                    <td style={{ padding: "6px 8px", borderRadius: "0 6px 6px 0" }}>
                      <input
                        type="email" defaultValue={b.email || ""} placeholder="add an email…"
                        onBlur={(e) => {
                          const value = e.target.value.trim() || null;
                          if (value !== b.email) onUpdateExternalBooking(b.id, { email: value });
                        }}
                        style={{ width: 230, padding: "5px 8px", borderRadius: 5, border: "1px solid rgba(203,108,230,0.3)", background: "transparent", color: "var(--text)" }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {repeatCandidates.length > 0 && (
            <div style={{ background: "var(--card)", borderRadius: 10, padding: 14 }}>
              <div style={{ fontWeight: 700, marginBottom: 4, color: "var(--text)" }}>Repeat-guest candidates</div>
              <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 10 }}>
                Matched on guest name only, because no booking has an email yet. Most platform rows carry a first name alone, so treat these as &ldquo;check whether this is the same person&rdquo; — not as confirmed repeat customers.
              </div>
              <div style={{ display: "grid", gap: 5 }}>
                {repeatCandidates.map((r) => (
                  <div key={r.key} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12.5, color: "var(--text)" }}>
                    <span style={{ fontWeight: 600 }}>{r.name}</span>
                    <span className="mono" style={{ color: "var(--muted)", fontSize: 11.5 }}>
                      {r.count} bookings ({r.completedCount} completed) · {r.dates.join(", ")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BookingsTab({ vessels, inquiries, externalBookings, addOns, onAddExternalBooking, onSetExternalBookingStatus, onUpdateExternalBooking, onDeleteExternalBooking, onMarkInquiry }) {
  const emptyForm = {
    vesselId: vessels[0]?.id || "", date: localDateKey(new Date()), startTime: "", hours: 4,
    guestName: "", phone: "", email: "", partySize: "", platform: BOOKING_PLATFORMS[0], referralSource: "", status: "booked", note: "", pricePaid: "",
  };
  const [form, setForm] = useState(emptyForm);
  // "active" is the default: everything except cancellations. They are almost
  // half the table and are a record, not work — scrolling past them to reach a
  // live booking was the normal case.
  const [filterStatus, setFilterStatus] = useState("active"); // "active" | "all" | "pending" | "booked" | "completed" | "cancelled"
  const [sortBy, setSortBy] = useState("date-desc"); // "date-desc" | "date-asc" | "status"

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
      // Stored in one shape whatever was typed, so the review flow can text it.
      phone: form.phone.trim() ? (normalizePhone(form.phone) || form.phone.trim()) : null,
    });
    setForm(emptyForm);
  }

  // Every historical booking (site + external). No date filtering, so past
  // charters stay visible alongside upcoming ones — only the status filter
  // below narrows what's shown.
  const allRows = toUnifiedRows(inquiries, externalBookings);
  const rows = (
    filterStatus === "all" ? allRows
    : filterStatus === "active" ? allRows.filter((r) => r.statusBucket !== "cancelled")
    : allRows.filter((r) => r.statusBucket === filterStatus)
  )
    .sort((a, b) => {
      if (sortBy === "date-asc") return (a.date || "").localeCompare(b.date || "");
      if (sortBy === "status") return UNIFIED_STATUS_BUCKETS.indexOf(a.statusBucket) - UNIFIED_STATUS_BUCKETS.indexOf(b.statusBucket) || (b.date || "").localeCompare(a.date || "");
      return (b.date || "").localeCompare(a.date || ""); // date-desc, default
    });

  return (
    // A single column: contacts panel, then the add-booking band, then the
    // table with the full width of the tab to itself.
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <GuestContactsPanel externalBookings={externalBookings} onUpdateExternalBooking={onUpdateExternalBooking} />
      {/* Laid out as a horizontal band above the table rather than a sidebar
          beside it. The bookings table is wide — booking id through actions —
          and surrendering a 340px column to this form pushed it off the screen,
          so the tab could only be read zoomed out. */}
      <form onSubmit={submit} style={{ background: "var(--card)", borderRadius: 10, padding: 14 }}>
        <p style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 0, marginBottom: 12 }}>
          Log a booking from GetMyBoat, Boatsetter, or elsewhere. Marking it completed reserves that day (its own hours, or the whole day at 8+ combined hours) on the public availability calendar.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
          <label style={{ flex: "1 1 150px", minWidth: 0 }}>
            <div style={FIELD_LABEL}>Vessel</div>
            <select value={form.vesselId} onChange={(e) => setForm({ ...form, vesselId: e.target.value })} style={FIELD}>
              {vessels.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </label>
          <label style={{ flex: "0 1 140px", minWidth: 0 }}>
            <div style={FIELD_LABEL}>Date</div>
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} style={FIELD} />
          </label>
          <label style={{ flex: "0 1 110px", minWidth: 0 }}>
            <div style={FIELD_LABEL}>Start time</div>
            <input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} style={FIELD} />
          </label>
          <label style={{ flex: "0 1 100px", minWidth: 0 }}>
            <div style={FIELD_LABEL}>Duration</div>
            <select value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} style={FIELD}>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((h) => <option key={h} value={h}>{h} hr{h === 1 ? "" : "s"}</option>)}
            </select>
          </label>
          <label style={{ flex: "1 1 150px", minWidth: 0 }}>
            <div style={FIELD_LABEL}>Guest name</div>
            <input type="text" placeholder="Guest name" value={form.guestName} onChange={(e) => setForm({ ...form, guestName: e.target.value })} style={FIELD} />
          </label>
          <label style={{ flex: "1 1 140px", minWidth: 0 }}>
            <div style={FIELD_LABEL}>Phone</div>
            <input type="tel" placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} style={FIELD} />
          </label>
          <label style={{ flex: "1 1 170px", minWidth: 0 }}>
            <div style={FIELD_LABEL}>Email (optional)</div>
            <input type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={FIELD} />
          </label>
          <label style={{ flex: "0 1 90px", minWidth: 0 }}>
            <div style={FIELD_LABEL}>Party size</div>
            <input type="number" placeholder="—" min="1" value={form.partySize} onChange={(e) => setForm({ ...form, partySize: e.target.value })} style={FIELD} />
          </label>
          <label style={{ flex: "0 1 130px", minWidth: 0 }}>
            <div style={FIELD_LABEL}>Platform</div>
            <select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })} style={FIELD}>
              {BOOKING_PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label style={{ flex: "1 1 160px", minWidth: 0 }}>
            <div style={FIELD_LABEL} title="This is what tells you which channel is actually working">How did they find us?</div>
            <select value={form.referralSource || ""} onChange={(e) => setForm({ ...form, referralSource: e.target.value })} style={FIELD}>
              <option value="">— not recorded —</option>
              {BOOKING_REFERRAL_SOURCES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <label style={{ flex: "0 1 130px", minWidth: 0 }}>
            <div style={FIELD_LABEL}>Price paid</div>
            <input type="number" placeholder="$ optional" value={form.pricePaid} onChange={(e) => setForm({ ...form, pricePaid: e.target.value })} style={FIELD} />
          </label>
          <label style={{ flex: "2 1 200px", minWidth: 0 }}>
            <div style={FIELD_LABEL}>Note</div>
            <input type="text" placeholder="Note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} style={FIELD} />
          </label>
          <div style={{ flex: "0 1 auto" }}>
            <div style={FIELD_LABEL}>Status</div>
            <div style={{ display: "flex", gap: 4 }}>
              {BOOKING_STATUS_BUCKETS.map((s) => (
                <button key={s} type="button" onClick={() => setForm({ ...form, status: s })}
                  style={{ padding: "9px 10px", borderRadius: 6, border: "1px solid var(--purple)", background: form.status === s ? "var(--purple)" : "transparent", color: form.status === s ? "#0A0612" : "var(--text)", fontWeight: 600, fontSize: 12, whiteSpace: "nowrap" }}>
                  {BOOKING_STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </div>
          <button type="submit" style={{ flex: "0 1 auto", background: "linear-gradient(135deg, var(--purple), var(--pink))", color: "#0A0612", border: "none", borderRadius: 6, padding: "10px 20px", fontWeight: 700, whiteSpace: "nowrap" }}>
            Add booking
          </button>
        </div>
      </form>

      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
          <div style={{ fontWeight: 700, color: "var(--text)" }}>
            {filterStatus === "all" ? "All bookings" : filterStatus === "active" ? "Active bookings" : `${BOOKING_STATUS_LABEL[filterStatus]} bookings`}
            {" "}({rows.length}{filterStatus !== "all" ? ` of ${allRows.length}` : ""})
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 4 }}>
              {["active", "all", ...UNIFIED_STATUS_BUCKETS].map((s) => (
                <button key={s} type="button" onClick={() => setFilterStatus(s)}
                  style={{
                    padding: "4px 10px", borderRadius: 5, fontSize: 12, fontWeight: 600, textTransform: "capitalize",
                    border: "1px solid var(--purple)", cursor: "pointer",
                    background: filterStatus === s ? "var(--purple)" : "transparent",
                    color: filterStatus === s ? "#0A0612" : "var(--text)",
                  }}>
                  {s === "active" ? "Active" : s === "all" ? "All" : BOOKING_STATUS_LABEL[s]}
                </button>
              ))}
            </div>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
              style={{ padding: "5px 8px", borderRadius: 5, border: "1px solid rgba(203,108,230,0.3)", fontSize: 12 }}>
              <option value="date-desc">Newest first</option>
              <option value="date-asc">Oldest first</option>
              <option value="status">Group by status</option>
            </select>
          </div>
        </div>
        {rows.length === 0 && <div style={{ color: "var(--muted)", fontSize: 13.5 }}>No bookings match this filter.</div>}
        {rows.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 1080, fontSize: 12.5, color: "var(--text)" }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--muted)", fontSize: 11 }}>
                  <th style={{ padding: "4px 8px" }}>Booking ID</th>
                  <th style={{ padding: "4px 8px" }}>Name</th>
                  <th style={{ padding: "4px 8px" }}>Phone</th>
                  <th style={{ padding: "4px 8px" }}>Email</th>
                  <th style={{ padding: "4px 8px" }}>Vessel</th>
                  <th style={{ padding: "4px 8px" }}>Start</th>
                  <th style={{ padding: "4px 8px" }}>Duration</th>
                  <th style={{ padding: "4px 8px" }}>Party size</th>
                  <th style={{ padding: "4px 8px" }}>Price paid</th>
                  <th style={{ padding: "4px 8px" }}>Source</th>
                  <th style={{ padding: "4px 8px" }}>Status</th>
                  <th style={{ padding: "4px 8px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.kind}-${r.id}`} style={{ background: "var(--card)" }}>
                    <td className="mono" style={{ padding: "6px 8px", borderRadius: "6px 0 0 6px", color: r.bookingId ? "#E8934A" : "var(--muted)", whiteSpace: "nowrap" }}>
                      {r.bookingId || r.date || "—"}
                    </td>
                    <td style={{ padding: "6px 8px", fontWeight: 600 }}>
                      {r.name || (r.kind === "external" ? "Guest" : "—")}
                      {r.addOnIds && r.addOnIds.length > 0 && (
                        <div style={{ fontWeight: 400, fontSize: 11, color: "var(--purple)", marginTop: 2 }}>
                          + {r.addOnIds.map((id) => addOns.find((a) => a.id === id)?.name || id).join(", ")}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                      {r.kind === "external" ? (
                        <PhoneInput booking={r} onUpdateExternalBooking={onUpdateExternalBooking} />
                      ) : (
                        r.phone || "—"
                      )}
                    </td>
                    <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                      {r.kind === "external" ? (
                        <input
                          type="email"
                          defaultValue={r.email || ""}
                          placeholder="—"
                          onBlur={(e) => {
                            const value = e.target.value.trim() || null;
                            if (value !== r.email) onUpdateExternalBooking(r.id, { email: value });
                          }}
                          style={{ width: 140, padding: "4px 6px", borderRadius: 5, border: "1px solid rgba(203,108,230,0.3)", background: "transparent", color: "var(--text)" }}
                        />
                      ) : (
                        r.email || "—"
                      )}
                    </td>
                    <td style={{ padding: "6px 8px" }}>{r.vesselName || "—"}</td>
                    <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                      {r.kind === "external" ? (
                        <input
                          type="time"
                          defaultValue={r.startTime || ""}
                          onBlur={(e) => {
                            const value = e.target.value || null;
                            if (value !== r.startTime) onUpdateExternalBooking(r.id, { startTime: value });
                          }}
                          style={{ width: 100, padding: "4px 6px", borderRadius: 5, border: "1px solid rgba(203,108,230,0.3)", background: "transparent", color: "var(--text)" }}
                        />
                      ) : (r.startTime || "—")}
                    </td>
                    <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{r.hours ? `${r.hours} hrs` : "—"}</td>
                    <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{r.partySize ?? "—"}</td>
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
                    <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                      <span className="mono" style={{ fontSize: 10.5, fontWeight: 700, color: BOOKING_STATUS_COLOR[r.statusBucket], textTransform: "uppercase", letterSpacing: "0.03em" }}>
                        {BOOKING_STATUS_LABEL[r.statusBucket] || r.status}
                      </span>
                    </td>
                    <td style={{ padding: "6px 8px", borderRadius: "0 6px 6px 0" }}>
                      {r.kind === "external" ? (
                        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                          <select value={r.status} onChange={(e) => onSetExternalBookingStatus(r.id, e.target.value)}
                            style={{ padding: "5px 6px", borderRadius: 5, border: "1px solid rgba(203,108,230,0.3)", fontSize: 12 }}>
                            {BOOKING_STATUS_BUCKETS.map((s) => <option key={s} value={s}>{BOOKING_STATUS_LABEL[s]}</option>)}
                          </select>
                          <button type="button" onClick={() => onDeleteExternalBooking(r.id)}
                            style={{ background: "transparent", color: "var(--pink)", border: "1px solid var(--pink)", borderRadius: 6, padding: "4px 8px", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>
                            Delete
                          </button>
                        </div>
                      ) : (
                        <select value={r.status} onChange={(e) => onMarkInquiry(r.id, e.target.value)}
                          style={{ padding: "5px 6px", borderRadius: 5, border: "1px solid rgba(203,108,230,0.3)", fontSize: 12 }}>
                          {INQUIRY_STATUSES.map((s) => <option key={s} value={s}>{INQUIRY_STATUS_LABEL[s]}</option>)}
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

// Categories are plain names now. This survives for anything imported from the
// old spreadsheet, which still writes "01. Gas" and the like.
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
function groupBookingProfit(entries, externalBookings = []) {
  const byPk = new Map(externalBookings.map((b) => [b.id, b]));
  const groups = new Map();
  for (const entry of entries) {
    if (!entry.bookingId) continue;
    const cur = groups.get(entry.bookingId) || { bookingId: entry.bookingId, income: 0, expense: 0, guestName: null };
    // Any one row of the group carrying the link is enough to name the charter.
    if (!cur.guestName && entry.externalBookingId && byPk.has(entry.externalBookingId)) {
      cur.guestName = byPk.get(entry.externalBookingId).guestName || null;
    }
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

function LedgerTab({ ledger, totals, onAdd, externalBookings = [], vessels = [], packages = [] }) {
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

  // Completed charters first and most recent first: an entry being logged by
  // hand is nearly always about a trip that just happened.
  const bookingOptions = [...externalBookings]
    .filter((b) => b.status !== "cancelled")
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .slice(0, 60);

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
  const bookingProfit = groupBookingProfit(ledger, externalBookings);
  const commissionLost = groupCommissionLost(ledger);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(280px,360px) 1fr", gap: 24 }}>
      <div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(124px, 1fr))", gap: 10, marginBottom: 16 }}>
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
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 10, lineHeight: 1.45 }}>
            Charter income logs itself when a booking is marked completed — this form is for
            everything else: expenses, and money that is not a charter.
          </div>
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
          <label style={{ display: "block", marginBottom: 8 }}>
            <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 3 }}>Charter this belongs to (optional)</div>
            <select value={form.bookingId} onChange={(e) => setForm({ ...form, bookingId: e.target.value })}
              style={{ width: "100%", padding: "9px 10px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)" }}>
              <option value="">— not tied to a charter —</option>
              {bookingOptions.map((b) => (
                <option key={b.id} value={b.bookingId || b.id}>
                  {b.date} · {b.guestName || "(no name)"} · {b.vesselName}
                </option>
              ))}
            </select>
          </label>
          {form.type === "income" && (
            <label style={{ display: "block", marginBottom: 8 }}>
              <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 3 }}>Vessel or package</div>
              <select value={form.subcategory} onChange={(e) => setForm({ ...form, subcategory: e.target.value })}
                style={{ width: "100%", padding: "9px 10px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)" }}>
                <option value="">— none —</option>
                {vessels.map((v) => <option key={v.id} value={v.name}>{v.name}</option>)}
                {packages.map((pk) => <option key={pk.id} value={pk.name}>{pk.name}</option>)}
              </select>
            </label>
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
      {/* A flex column so the list below can absorb whatever height the form
          column has, instead of stopping short at a fixed cap. */}
      <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
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
        {/* Runs level with the bottom of the form beside it: the row's height
            comes from whichever column is taller, and the list takes the rest.
            The floor keeps it usable when the form is the shorter of the two. */}
        <div style={{ display: "grid", gap: 6, flex: 1, minHeight: 380, overflowY: "auto", alignContent: "start" }}>
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
            <span style={{ minWidth: 0 }}>
              {r.guestName && <span style={{ fontWeight: 700 }}>{r.guestName} </span>}
              <span className="mono" style={{ color: r.guestName ? "var(--muted)" : "var(--text)", fontSize: r.guestName ? 11.5 : 13.5 }}>{r.bookingId}</span>{" "}
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

// ---- Reconciliation tab ----------------------------------------------
//
// Answers one question per booking: is the money for this charter actually
// on the books? The two sides were never linked — LedgerEntry.bookingId is
// free text, and in the live data it holds the *platform's* reservation
// number ("4609513", "4615817"), not the app's "NY-YYYYMMDD-NN". So none of
// the income rows join to a booking by ID, and matching has to fall back to
// date + amount. See PLATFORM_PAYOUT_DELTA below for the one systematic
// offset that fallback has to tolerate.

// Boatsetter's base payout leg lands in the ledger exactly $0.30 under the
// payout figure recorded on the booking. Observed on every completed
// Boatsetter charter in the live data — 518.19→517.89, 253.71→253.41,
// 252.33→252.03, 158.78→158.48, 220.78→220.48, 160.26→159.96 — so it's a
// fixed per-transaction fee, not rounding. Without tolerating it, every
// Boatsetter charter would be reported as unrecorded revenue.
const PLATFORM_PAYOUT_DELTA = 0.30;
// Amounts are dollars-and-cents; anything under half a cent is the same money.
const AMOUNT_EPSILON = 0.005;
// Platform payouts settle a few days after the charter, so an amount match
// is still a match slightly outside the charter date.
const MATCH_WINDOW_DAYS = 7;

function daysBetweenDateKeys(a, b) {
  return (new Date(a + "T00:00:00") - new Date(b + "T00:00:00")) / 86400000;
}

// How a booking lines up with the income side of the ledger, best first:
//   "id"      — an income row carries this booking's bookingId
//   "exact"   — same date, amount equals the booking's recorded price
//   "payout"  — within the settlement window, amount equals price − the
//               platform's fixed fee (see PLATFORM_PAYOUT_DELTA)
//   "named"   — same date, and the note names this guest, but the amount
//               disagrees; only the difference is unaccounted for
//   "date"    — income exists on that date but nothing ties it to this
//               charter; treated as entirely unrecorded
//   "none"    — no income row plausibly belongs to this booking
//   "unpriced"— the booking has no price, so nothing can be checked
// Only the first three mean the revenue is fully on the books. "date" is
// deliberately NOT counted as accounted-for: sharing a calendar day with
// some unrelated payout is not evidence that this charter was recorded.
const MATCH_LABEL = {
  linked: "Reconciled", id: "Linked by ID", exact: "Amount matches", payout: "Payout matches",
  named: "Amount disagrees", date: "Same date only", none: "Not in ledger",
  unpriced: "No price recorded",
};
const MATCH_COLOR = {
  linked: "#7FE0B8", id: "#7FE0B8", exact: "#7FE0B8", payout: "#7FE0B8",
  named: "#E8934A", date: "#E8934A", none: "#F0559C", unpriced: "#F0559C",
};
const MATCH_ACCOUNTED = {
  linked: true, id: true, exact: true, payout: true,
  named: false, date: false, none: false, unpriced: false,
};

// The guest's first name, when it's long enough to be worth matching on.
// Platform rows are frequently first-name-only ("Sheena", "Jorge"), and the
// imported income notes abbreviate the surname ("Katherine L - ..."), so the
// first name is the only token reliably present on both sides.
function guestNameToken(booking) {
  const first = String(booking.guestName || "").trim().split(/\s+/)[0] || "";
  return first.length >= 3 ? first.toLowerCase() : null;
}

function matchBookingToLedger(booking, incomeRows) {
  const price = booking.pricePaid;

  if (booking.bookingId) {
    const byId = incomeRows.find((l) => l.bookingId && l.bookingId === booking.bookingId);
    if (byId) return { tier: "id", row: byId };
  }
  if (price != null) {
    const exact = incomeRows.find((l) => l.date === booking.date && Math.abs(l.amount - price) < AMOUNT_EPSILON);
    if (exact) return { tier: "exact", row: exact };
    const payout = incomeRows.find((l) => {
      const gap = daysBetweenDateKeys(l.date, booking.date);
      return gap >= -1 && gap <= MATCH_WINDOW_DAYS
        && Math.abs(l.amount - (price - PLATFORM_PAYOUT_DELTA)) < AMOUNT_EPSILON;
    });
    if (payout) return { tier: "payout", row: payout };

    // Same day and the note names the guest, but the figures disagree — the
    // charter IS on the books, just for the wrong amount. Pick the largest
    // such row so the reported shortfall is the conservative one.
    const token = guestNameToken(booking);
    if (token) {
      const named = incomeRows
        .filter((l) => l.date === booking.date && String(l.note || "").toLowerCase().includes(token))
        .sort((a, b) => b.amount - a.amount)[0];
      if (named) return { tier: "named", row: named };
    }
  }
  const sameDate = incomeRows.find((l) => l.date === booking.date);
  if (sameDate) return { tier: price == null ? "unpriced" : "date", row: sameDate };
  return { tier: price == null ? "unpriced" : "none", row: null };
}

// An income row whose amount is exactly the sum of two OTHER income rows
// from the same origin nearby is almost certainly the same money entered
// twice — once as a lump sum, again as its two settlement legs. Live
// example: the $877.74 Boatsetter row dated 2026-05-16 is exactly the
// $517.89 (05-18) plus $359.85 (05-19) rows. Reported only, never removed —
// which of the entries is the real one is the owner's call, not ours.
//
// Restricted to lump sums that carry non-zero cents. Round-dollar amounts
// coincide by accident all the time (the live ledger has a $600 Zelle payout
// that happens to equal a nearby $200 and $400 from the same source, which
// is arithmetic, not a duplicate). Matching to the cent is strong evidence;
// matching on round hundreds is not.
function findSuspectedDoubleCounts(incomeRows) {
  const hits = [];
  for (const row of incomeRows) {
    if (Math.round(row.amount * 100) % 100 === 0) continue;
    const nearby = incomeRows.filter((l) =>
      l.id !== row.id
      && (l.origin || "") === (row.origin || "")
      && Math.abs(daysBetweenDateKeys(l.date, row.date)) <= 10);
    let found = null;
    for (let i = 0; i < nearby.length && !found; i++) {
      for (let j = i + 1; j < nearby.length && !found; j++) {
        if (Math.abs(nearby[i].amount + nearby[j].amount - row.amount) < AMOUNT_EPSILON) {
          found = [nearby[i], nearby[j]];
        }
      }
    }
    if (found) hits.push({ row, parts: found });
  }
  // Each pair surfaces once — keep the lump sum, drop the mirrored hits its
  // own legs would generate.
  const claimed = new Set();
  return hits.filter((h) => {
    if (claimed.has(h.row.id)) return false;
    h.parts.forEach((p) => claimed.add(p.id));
    return true;
  });
}

// Numbered categories are gone — they were a spreadsheet's sort order, and by
// the end 05 meant three different repair categories, 06 was both Utilities and
// Truck Repairs, and 07 was two spellings of the phone bill, each splitting one
// real total across two lines of the Tax Report. Everything is now a plain
// name.
//
// This check stays as a tripwire: anything imported from the old sheet arrives
// numbered, and if two labels ever share a number again this is what says so.
// It reports and never edits, because whether the fix is a merge or a rename
// can only be read off the labels. Rows with no category are counted
// separately and land in the report as "Other / Uncategorized".
function categoryCode(category) {
  const m = String(category).match(/^(\d+)\./);
  return m ? m[1] : null;
}

function findCategoryVariants(ledger) {
  const byCode = new Map();
  const uncategorized = { count: 0, total: 0 };
  for (const l of ledger) {
    if (l.type !== "expense") continue;
    if (!l.category) {
      uncategorized.count += 1;
      uncategorized.total += Number(l.amount || 0);
      continue;
    }
    const code = categoryCode(l.category);
    if (!code) continue;
    if (!byCode.has(code)) byCode.set(code, new Map());
    const labels = byCode.get(code);
    const cur = labels.get(l.category) || { label: l.category, count: 0, total: 0 };
    cur.count += 1;
    cur.total += Number(l.amount || 0);
    labels.set(l.category, cur);
  }
  const variants = [];
  for (const [code, labels] of byCode) {
    if (labels.size > 1) {
      variants.push({ code, labels: Array.from(labels.values()).sort((a, b) => b.total - a.total) });
    }
  }
  variants.sort((a, b) => a.code.localeCompare(b.code));
  return { variants, uncategorized };
}

// Every booking, priced or not, with its ledger verdict and the dollar
// amount still unaccounted for attached.
//
// shortfall is the number that feeds the "revenue missing from ledger"
// total, and it is deliberately conservative in both directions:
//   - fully matched  -> 0
//   - amount differs -> only the difference, and never below 0 (a ledger row
//                       larger than the booking price means the money is
//                       there, possibly with add-ons; it is not a shortfall)
//   - nothing found  -> the whole recorded price
//   - no price       -> null, i.e. unknown and excluded from the total
//                       rather than silently counted as zero
function buildReconciliation(bookings, ledger) {
  const incomeRows = ledger.filter((l) => l.type === "income");

  // Every ledger row written against a booking carries its id. That link is the
  // truth; date proximity is only a fallback for older rows that predate it.
  //
  // Matching on date alone was wrong three times over here. Boatsetter pays two
  // or three days after the trip, so the money never shares the charter's date.
  // It pays in two legs — boat, then captain fee — so one row is never the whole
  // story. And income is recorded gross with the platform's cut booked as an
  // expense, so the ledger figure is meant to exceed the payout. A charter is
  // reconciled when its linked income MINUS its linked fees equals what was
  // actually received.
  const byBooking = new Map();
  for (const l of ledger) {
    if (!l.externalBookingId) continue;
    if (!byBooking.has(l.externalBookingId)) byBooking.set(l.externalBookingId, []);
    byBooking.get(l.externalBookingId).push(l);
  }

  return bookings
    .map((b) => {
      const linked = byBooking.get(b.id) || [];
      if (linked.length) {
        const gross = linked.filter((l) => l.type === "income").reduce((s, l) => s + l.amount, 0);
        const fees = linked.filter((l) => l.type === "expense").reduce((s, l) => s + l.amount, 0);
        const net = gross - fees;
        const expected = b.pricePaid == null ? null : b.pricePaid;
        const off = expected == null ? null : net - expected;
        return {
          ...b,
          match: "linked",
          matchRow: linked.find((l) => l.type === "income") || null,
          linkedRows: linked,
          linkedGross: gross,
          linkedFees: fees,
          linkedNet: net,
          accounted: expected == null ? false : Math.abs(off) < 0.02,
          shortfall: expected == null ? null : Math.max(0, -(off)),
        };
      }

      const match = matchBookingToLedger(b, incomeRows);
      const accounted = MATCH_ACCOUNTED[match.tier];
      let shortfall;
      if (b.pricePaid == null) shortfall = null;
      else if (accounted) shortfall = 0;
      else if (match.tier === "named") shortfall = Math.max(0, b.pricePaid - match.row.amount);
      else shortfall = b.pricePaid;
      return { ...b, match: match.tier, matchRow: match.row, linkedRows: [], accounted, shortfall };
    })
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

function ReconciliationTab({ externalBookings, ledger, onUpdateExternalBooking }) {
  const years = Array.from(new Set([
    ...externalBookings.map((b) => b.date && b.date.slice(0, 4)),
    ...ledger.map((l) => l.date && l.date.slice(0, 4)),
  ].filter(Boolean))).sort((a, b) => b.localeCompare(a));
  const [year, setYear] = useState("all");
  const [onlyProblems, setOnlyProblems] = useState(true);

  const inYear = (d) => year === "all" || (d || "").startsWith(year);
  const scopedBookings = externalBookings.filter((b) => inYear(b.date));
  const scopedLedger = ledger.filter((l) => inYear(l.date));
  const scopedIncome = scopedLedger.filter((l) => l.type === "income");

  const rows = buildReconciliation(scopedBookings, scopedLedger);

  // A charter that never happened owes no revenue. Only "completed" rows are
  // held to the standard of "this money should be on the books" — the
  // "booked" pile is mostly platform enquiries that were imported as
  // bookings and never confirmed (see the callout in the UI below).
  const completed = rows.filter((r) => r.status === "completed");
  const unpriced = completed.filter((r) => r.pricePaid == null);
  const unaccounted = completed.filter((r) => r.shortfall > 0);
  const missingRevenue = unaccounted.reduce((s, r) => s + r.shortfall, 0);
  const accountedRevenue = completed.filter((r) => r.accounted).reduce((s, r) => s + (r.pricePaid || 0), 0);
  const notCompleted = rows.filter((r) => r.status !== "completed");

  const doubleCounts = findSuspectedDoubleCounts(scopedIncome);
  const doubleCountTotal = doubleCounts.reduce((s, h) => s + h.row.amount, 0);

  // The other direction: income the ledger has that no booking explains.
  // Claim every row a booking is linked to, not just one.
  //
  // Two bugs lived in the old single-row version. A Boatsetter charter produces
  // TWO income rows -- the boat leg and the captain fee, paid days apart -- so
  // the second leg was never claimed and was reported as money nobody could
  // explain. And requiring `accounted` meant a charter whose figures were a few
  // cents out had its income counted as unexplained, which is a different
  // problem and is already reported above.
  //
  // A row linked to a booking IS explained by that booking. Whether the amounts
  // reconcile is a separate question.
  const claimedRowIds = new Set();
  for (const r of rows) {
    for (const l of r.linkedRows || []) claimedRowIds.add(l.id);
    if (r.matchRow && r.accounted) claimedRowIds.add(r.matchRow.id);
  }
  const orphanIncome = scopedIncome.filter((l) => !claimedRowIds.has(l.id));
  const orphanTotal = orphanIncome.reduce((s, l) => s + l.amount, 0);

  const totalIncome = scopedIncome.reduce((s, l) => s + l.amount, 0);
  const totalExpense = scopedLedger.filter((l) => l.type === "expense").reduce((s, l) => s + l.amount, 0);
  const correctedIncome = totalIncome - doubleCountTotal + missingRevenue;
  const { variants: categoryVariants, uncategorized } = findCategoryVariants(scopedLedger);

  const visible = onlyProblems ? rows.filter((r) => r.status === "completed" && !r.accounted) : rows;

  function exportCsv() {
    const csvRows = [
      ["Booking ID", "Date", "Guest", "Platform", "Status", "Price recorded", "Ledger verdict", "Ledger amount", "Ledger date", "Unaccounted", "Note"],
      ...rows.map((r) => [
        r.bookingId || "", r.date, r.guestName || "", r.platform, r.status,
        r.pricePaid == null ? "" : r.pricePaid.toFixed(2),
        MATCH_LABEL[r.match],
        r.matchRow ? r.matchRow.amount.toFixed(2) : "",
        r.matchRow ? r.matchRow.date : "",
        r.shortfall == null ? "unknown" : r.shortfall.toFixed(2),
        r.note || "",
      ]),
    ];
    downloadCsv(`nauti-yachti-reconciliation-${year}.csv`, csvRows);
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ fontSize: 13, color: "var(--muted)" }}>
          Year{" "}
          <select value={year} onChange={(e) => setYear(e.target.value)}
            style={{ padding: "7px 10px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)", marginLeft: 6 }}>
            <option value="all">All time</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 13, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} />
          Only show completed charters that need attention
        </label>
        <button type="button" onClick={exportCsv}
          style={{ background: "linear-gradient(135deg, var(--purple), var(--pink))", color: "#0A0612", border: "none", borderRadius: 6, padding: "9px 16px", fontWeight: 700, fontSize: 13 }}>
          Download reconciliation CSV
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(124px, 1fr))", gap: 10 }}>
        <StatCard label="Completed charters" value={String(completed.length)} color="var(--purple)" />
        <StatCard label="Revenue on the books" value={currency(accountedRevenue)} color="#7FE0B8" />
        <StatCard label="Revenue missing from ledger" value={currency(missingRevenue)} color="#F0559C" />
        <StatCard label="Completed, no price recorded" value={String(unpriced.length)} color="#E8934A" />
        <StatCard label="Suspected double-counted" value={currency(doubleCountTotal)} color="#E8934A" />
      </div>

      <div style={{ background: "var(--card)", borderRadius: 10, padding: 14, color: "var(--text)", fontSize: 13, lineHeight: 1.55 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>What the corrected income figure looks like</div>
        <div className="mono" style={{ display: "grid", gap: 3, fontSize: 12.5 }}>
          <div>Ledger income as entered{"  "}<span style={{ color: "#7FE0B8" }}>{currency(totalIncome)}</span></div>
          <div>− suspected double-counted{"  "}<span style={{ color: "#E8934A" }}>{currency(doubleCountTotal)}</span></div>
          <div>+ completed charters missing from ledger{"  "}<span style={{ color: "#F0559C" }}>{currency(missingRevenue)}</span></div>
          <div style={{ borderTop: "1px solid rgba(203,108,230,0.25)", paddingTop: 4, marginTop: 3, fontWeight: 700 }}>
            = corrected income{"  "}<span style={{ color: "var(--purple)" }}>{currency(correctedIncome)}</span>
            {"   vs expenses "}<span style={{ color: "#F0559C" }}>{currency(totalExpense)}</span>
            {"   net "}<span style={{ color: correctedIncome - totalExpense >= 0 ? "#7FE0B8" : "#F0559C" }}>{currency(correctedIncome - totalExpense)}</span>
          </div>
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
          This still excludes any charter whose payout amount was never recorded anywhere ({unpriced.length} of them) — those can only come off a platform payout statement. Treat this as a floor, not a final number.
        </div>
      </div>

      {notCompleted.length > 0 && (
        <div style={{ background: "rgba(232,147,74,0.08)", border: "1px solid rgba(232,147,74,0.35)", borderRadius: 10, padding: 14, color: "var(--text)", fontSize: 13, lineHeight: 1.55 }}>
          <span style={{ fontWeight: 700, color: "#E8934A" }}>{notCompleted.length} bookings are not marked completed</span> and are excluded from every figure above. Their notes say most were platform enquiries that never produced a confirmed booking or a payment. They are not missing revenue — but if any of them <em>did</em> sail, mark it completed and the amount will start counting here.
        </div>
      )}

      <div>
        <div style={{ fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>
          {onlyProblems ? `Completed charters needing attention (${visible.length})` : `All bookings (${visible.length})`}
        </div>
        {visible.length === 0 && <div style={{ color: "var(--muted)", fontSize: 13.5 }}>Nothing outstanding for this selection.</div>}
        {visible.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 1000, fontSize: 12.5, color: "var(--text)" }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--muted)", fontSize: 11 }}>
                  <th style={{ padding: "4px 8px" }}>Booking ID</th>
                  <th style={{ padding: "4px 8px" }}>Date</th>
                  <th style={{ padding: "4px 8px" }}>Guest</th>
                  <th style={{ padding: "4px 8px" }}>Platform</th>
                  <th style={{ padding: "4px 8px" }}>Status</th>
                  <th style={{ padding: "4px 8px" }}>Price paid</th>
                  <th style={{ padding: "4px 8px" }}>In the ledger?</th>
                  <th style={{ padding: "4px 8px" }}>Unaccounted</th>
                  <th style={{ padding: "4px 8px" }}>Ledger row</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.id} style={{ background: "var(--card)" }}>
                    <td className="mono" style={{ padding: "6px 8px", borderRadius: "6px 0 0 6px", color: "#E8934A", whiteSpace: "nowrap" }}>{r.bookingId || "—"}</td>
                    <td className="mono" style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{fmtLedgerDate(r.date)}</td>
                    <td style={{ padding: "6px 8px", fontWeight: 600 }}>{r.guestName || "Guest"}</td>
                    <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{r.platform}</td>
                    <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                      <span className="mono" style={{ fontSize: 10.5, fontWeight: 700, color: BOOKING_STATUS_COLOR[r.status], textTransform: "uppercase" }}>
                        {BOOKING_STATUS_LABEL[r.status] || r.status}
                      </span>
                    </td>
                    <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                      <input
                        type="number" step="0.01" defaultValue={r.pricePaid ?? ""} placeholder="—"
                        onBlur={(e) => {
                          const value = e.target.value === "" ? null : Number(e.target.value);
                          if (value !== r.pricePaid) onUpdateExternalBooking(r.id, { pricePaid: value });
                        }}
                        style={{ width: 86, padding: "4px 6px", borderRadius: 5, border: "1px solid rgba(203,108,230,0.3)" }} />
                    </td>
                    <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                      <span className="mono" style={{ fontSize: 10.5, fontWeight: 700, color: MATCH_COLOR[r.match], textTransform: "uppercase" }}>
                        {MATCH_LABEL[r.match]}
                      </span>
                    </td>
                    <td className="mono" style={{ padding: "6px 8px", whiteSpace: "nowrap", fontWeight: 700, color: r.shortfall ? "#F0559C" : "var(--muted)" }}>
                      {r.shortfall == null ? "unknown" : r.shortfall > 0 ? currency(r.shortfall) : "—"}
                    </td>
                    {/* Show the arithmetic, not just a verdict. A Boatsetter
                        charter reconciles across two payout legs arriving days
                        after the trip, less the platform's fees — stating that
                        plainly is the difference between "trust me" and "here
                        is why". */}
                    <td style={{ padding: "6px 8px", borderRadius: "0 6px 6px 0", color: "var(--muted)", fontSize: 11.5 }}>
                      {r.linkedRows && r.linkedRows.length ? (
                        <>
                          <div style={{ color: "var(--text)" }}>
                            {currency(r.linkedGross)} in
                            {r.linkedFees > 0 ? ` − ${currency(r.linkedFees)} fees = ${currency(r.linkedNet)}` : ""}
                          </div>
                          <div style={{ fontSize: 11 }}>
                            {r.linkedRows.filter((l) => l.type === "income").map((l) => `${fmtLedgerDate(l.date)} ${currency(l.amount)}`).join(" + ") || "—"}
                          </div>
                        </>
                      ) : r.matchRow
                        ? `${fmtLedgerDate(r.matchRow.date)} · ${currency(r.matchRow.amount)} · ${r.matchRow.origin || "—"}`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ background: "var(--card)", borderRadius: 10, padding: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 4, color: "var(--text)" }}>Suspected double-counted income</div>
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 10 }}>
            A lump-sum row that exactly equals two nearby rows from the same source. Verify against the payout statement, then delete whichever entry is the duplicate.
          </div>
          {doubleCounts.length === 0 && <div style={{ color: "var(--muted)", fontSize: 13.5 }}>None found.</div>}
          <div style={{ display: "grid", gap: 8 }}>
            {doubleCounts.map((h) => (
              <div key={h.row.id} style={{ fontSize: 12.5, color: "var(--text)" }}>
                <div className="mono" style={{ color: "#E8934A", fontWeight: 700 }}>
                  {fmtLedgerDate(h.row.date)} · {currency(h.row.amount)} · {h.row.origin || "—"}
                </div>
                <div style={{ color: "var(--muted)", fontSize: 11.5 }}>{h.row.note}</div>
                <div style={{ color: "var(--muted)", fontSize: 11.5, marginTop: 2 }}>
                  = {h.parts.map((p) => `${fmtLedgerDate(p.date)} ${currency(p.amount)}`).join("  +  ")}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: "var(--card)", borderRadius: 10, padding: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 4, color: "var(--text)" }}>
            Income with no matching booking ({orphanIncome.length} · {currency(orphanTotal)})
          </div>
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 10 }}>
            Money that came in without a booking row to explain it. Some are real charters that were never logged as bookings — add them so the calendar and the marketing list are complete.
          </div>
          <div style={{ display: "grid", gap: 5, maxHeight: 320, overflowY: "auto" }}>
            {orphanIncome.map((l) => (
              <div key={l.id} style={{ fontSize: 12, color: "var(--text)", display: "flex", justifyContent: "space-between", gap: 10 }}>
                <span style={{ minWidth: 0 }}>
                  <span className="mono" style={{ color: "#E8934A" }}>{fmtLedgerDate(l.date)}</span>{" "}
                  <span style={{ color: "var(--muted)" }}>{l.note || l.origin}</span>
                </span>
                <span className="mono" style={{ color: "#7FE0B8", fontWeight: 700, whiteSpace: "nowrap" }}>{currency(l.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {(categoryVariants.length > 0 || uncategorized.count > 0) && (
        <div style={{ background: "var(--card)", borderRadius: 10, padding: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 4, color: "var(--text)" }}>Expense codes used for more than one category</div>
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 10 }}>
            Each of these numbers carries two different labels. Where the labels mean the same thing, one real total is split across two lines on the Tax Report — re-save the smaller set under the spelling you want to keep. Where they mean genuinely different things, the number has been reused and one of them needs renumbering.
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            {categoryVariants.map((group) => (
              <div key={group.code} style={{ fontSize: 12.5, color: "var(--text)" }}>
                {group.labels.map((v) => (
                  <div key={v.label} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <span>{v.label} <span style={{ color: "var(--muted)", fontSize: 11.5 }}>({v.count} {v.count === 1 ? "entry" : "entries"})</span></span>
                    <span className="mono" style={{ color: "#E8934A", fontWeight: 700, whiteSpace: "nowrap" }}>{currency(v.total)}</span>
                  </div>
                ))}
                <div style={{ borderTop: "1px solid rgba(203,108,230,0.2)", marginTop: 3, paddingTop: 3, display: "flex", justifyContent: "space-between", fontSize: 11.5, color: "var(--muted)" }}>
                  <span>code {group.code} total</span>
                  <span className="mono" style={{ fontWeight: 700 }}>{currency(group.labels.reduce((s, v) => s + v.total, 0))}</span>
                </div>
              </div>
            ))}
            {uncategorized.count > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12.5, color: "var(--text)" }}>
                <span>No category set <span style={{ color: "var(--muted)", fontSize: 11.5 }}>({uncategorized.count} entries)</span></span>
                <span className="mono" style={{ color: "#F0559C", fontWeight: 700, whiteSpace: "nowrap" }}>{currency(uncategorized.total)}</span>
              </div>
            )}
          </div>
        </div>
      )}
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(124px, 1fr))", gap: 10, marginBottom: 10 }}>
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

// ---- Add-ons tab -------------------------------------------------

function AddOnsTab({ addons, onUpdate, onAdd }) {
  const emptyForm = { name: "", price: "", unit: "", blurb: "" };
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const live = addons.filter((a) => !a.archived);
  const archived = addons.filter((a) => a.archived);

  async function submit(e) {
    e.preventDefault();
    if (!form.name || form.price === "") return;
    setError("");
    try {
      await onAdd({ name: form.name, price: Number(form.price), unit: form.unit || null, blurb: form.blurb || null });
      setForm(emptyForm);
    } catch {
      setError("Could not add that — try again.");
    }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(280px,340px) 1fr", gap: 24 }}>
      <form onSubmit={submit} style={{ background: "var(--card)", borderRadius: 10, padding: 14, alignSelf: "start" }}>
        <div style={{ fontWeight: 700, marginBottom: 10, color: "var(--text)" }}>Add a new add-on</div>
        <input type="text" placeholder="Name (e.g. Champagne bottle)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
          style={{ width: "100%", padding: "9px 10px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)", marginBottom: 8 }} required />
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <label style={{ flex: 1 }}>
            <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 3 }}>Price</div>
            <input type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })}
              style={{ width: "100%", padding: "9px 10px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)" }} required />
          </label>
          <label style={{ flex: 1 }}>
            <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 3 }}>Unit (optional)</div>
            <input type="text" placeholder="per charter" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}
              style={{ width: "100%", padding: "9px 10px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)" }} />
          </label>
        </div>
        <input type="text" placeholder="Blurb (optional)" value={form.blurb} onChange={(e) => setForm({ ...form, blurb: e.target.value })}
          style={{ width: "100%", padding: "9px 10px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)", marginBottom: 10 }} />
        {error && <div style={{ color: "var(--pink)", fontSize: 12.5, marginBottom: 8 }}>{error}</div>}
        <button type="submit" style={{ width: "100%", background: "linear-gradient(135deg, var(--purple), var(--pink))", color: "#0A0612", border: "none", borderRadius: 6, padding: "10px", fontWeight: 700 }}>Add add-on</button>
      </form>

      <div>
        <div style={{ fontWeight: 700, marginBottom: 8, color: "var(--text)" }}>Add-ons ({live.length})</div>
        <div style={{ display: "grid", gap: 10, marginBottom: 20 }}>
          {live.length === 0 && <div style={{ color: "var(--muted)", fontSize: 13.5 }}>No add-ons yet.</div>}
          {live.map((a) => (
            <div key={a.id} style={{ background: "var(--card)", borderRadius: 8, padding: 12, color: "var(--text)", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, opacity: a.active ? 1 : 0.55 }}>
              <div style={{ minWidth: 0 }}>
                <input defaultValue={a.name} onBlur={(e) => e.target.value.trim() && e.target.value !== a.name && onUpdate(a.id, { name: e.target.value.trim() })}
                  style={{ fontWeight: 600, fontSize: 14, background: "transparent", border: "none", color: "var(--text)", padding: 0, width: "100%" }} />
                <input defaultValue={a.blurb || ""} placeholder="Blurb (optional)" onBlur={(e) => e.target.value !== (a.blurb || "") && onUpdate(a.id, { blurb: e.target.value || null })}
                  style={{ fontSize: 12, color: "var(--muted)", marginTop: 2, background: "transparent", border: "none", padding: 0, width: "100%" }} />
                {!a.active && <div style={{ fontSize: 10.5, color: "var(--pink)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 4 }}>Hidden from site</div>}
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span className="mono">$</span>
                  <input type="number" defaultValue={a.price} onBlur={(e) => onUpdate(a.id, { price: Number(e.target.value) })}
                    style={{ width: 70, padding: "6px 8px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)" }} />
                  <input defaultValue={a.unit || ""} placeholder="unit" onBlur={(e) => e.target.value !== (a.unit || "") && onUpdate(a.id, { unit: e.target.value || null })}
                    style={{ width: 76, fontSize: 11, color: "var(--muted)", padding: "6px 6px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)", background: "transparent" }} />
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button type="button" onClick={() => onUpdate(a.id, { active: !a.active })}
                    style={{ background: "transparent", color: a.active ? "var(--purple)" : "var(--muted)", border: `1px solid ${a.active ? "var(--purple)" : "var(--muted)"}`, borderRadius: 6, padding: "4px 8px", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>
                    {a.active ? "Hide from site" : "Show on site"}
                  </button>
                  <button type="button" onClick={() => onUpdate(a.id, { archived: true })}
                    style={{ background: "transparent", color: "var(--pink)", border: "1px solid var(--pink)", borderRadius: 6, padding: "4px 8px", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <button type="button" onClick={() => setShowArchived((v) => !v)}
          style={{ background: "transparent", color: "var(--muted)", border: "1px solid rgba(203,108,230,0.3)", borderRadius: 6, padding: "6px 12px", fontSize: 12.5, fontWeight: 600, marginBottom: 10 }}>
          {showArchived ? "▲" : "▼"} Archived ({archived.length})
        </button>
        {showArchived && (
          <div style={{ display: "grid", gap: 8 }}>
            {archived.length === 0 && <div style={{ color: "var(--muted)", fontSize: 13.5 }}>Nothing archived.</div>}
            {archived.map((a) => (
              <div key={a.id} style={{ background: "var(--card)", borderRadius: 8, padding: "10px 12px", color: "var(--muted)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <div>
                  <span style={{ color: "var(--text)", fontWeight: 600 }}>{a.name}</span>
                  <span style={{ marginLeft: 8 }}>{currency(a.price)}{a.unit ? ` ${a.unit}` : ""}</span>
                </div>
                <button type="button" onClick={() => onUpdate(a.id, { archived: false })}
                  style={{ background: "transparent", color: "var(--purple)", border: "1px solid var(--purple)", borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>
                  Restore
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Coupons tab -------------------------------------------------

function CouponsTab({ coupons, onAdd, onToggleActive, onUpdate }) {
  const emptyForm = { code: "", discountType: "percent", discountValue: "", maxUses: "", expiresAt: "", note: "", requiresReturningGuest: false };
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const live = coupons.filter((c) => !c.archived);
  const archived = coupons.filter((c) => c.archived);

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
        requiresReturningGuest: form.requiresReturningGuest,
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
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 12.5, color: "var(--text)" }}>
          <input type="checkbox" checked={form.requiresReturningGuest} onChange={(e) => setForm({ ...form, requiresReturningGuest: e.target.checked })} />
          Returning guests only (verified by email against a prior paid booking)
        </label>
        {error && <div style={{ color: "var(--pink)", fontSize: 12.5, marginBottom: 8 }}>{error}</div>}
        <button type="submit" style={{ width: "100%", background: "linear-gradient(135deg, var(--purple), var(--pink))", color: "#0A0612", border: "none", borderRadius: 6, padding: "10px", fontWeight: 700 }}>Add coupon</button>
      </form>

      <div>
        <div style={{ fontWeight: 700, marginBottom: 8, color: "var(--text)" }}>Coupons ({live.length})</div>
        <div style={{ display: "grid", gap: 6, marginBottom: 20 }}>
          {live.length === 0 && <div style={{ color: "var(--muted)", fontSize: 13.5 }}>No coupons yet.</div>}
          {live.map((c) => (
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
                  {c.requiresReturningGuest ? " · returning guests only" : ""}
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
                <button type="button" onClick={() => onUpdate(c.id, { archived: true })}
                  style={{ background: "transparent", color: "var(--pink)", border: "1px solid var(--pink)", borderRadius: 6, padding: "5px 9px", fontSize: 11.5, fontWeight: 600 }}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>

        <button type="button" onClick={() => setShowArchived((v) => !v)}
          style={{ background: "transparent", color: "var(--muted)", border: "1px solid rgba(203,108,230,0.3)", borderRadius: 6, padding: "6px 12px", fontSize: 12.5, fontWeight: 600, marginBottom: 10 }}>
          {showArchived ? "▲" : "▼"} Archived ({archived.length})
        </button>
        {showArchived && (
          <div style={{ display: "grid", gap: 6 }}>
            {archived.length === 0 && <div style={{ color: "var(--muted)", fontSize: 13.5 }}>Nothing archived.</div>}
            {archived.map((c) => (
              <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--card)", borderRadius: 6, padding: "8px 12px", fontSize: 13, color: "var(--muted)", gap: 10 }}>
                <div className="mono" style={{ fontWeight: 700, color: "var(--text)" }}>
                  {c.code}
                  <span style={{ fontWeight: 400, color: "var(--muted)", marginLeft: 8 }}>
                    {c.discountType === "percent" ? `${c.discountValue}% off` : `${currency(c.discountValue)} off`}
                  </span>
                </div>
                <button type="button" onClick={() => onUpdate(c.id, { archived: false })}
                  style={{ background: "transparent", color: "var(--purple)", border: "1px solid var(--purple)", borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>
                  Restore
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Media Drafts tab ------------------------------------------------

const MEDIA_DRAFT_STATUS_COLORS = {
  pending: "rgba(203,108,230,0.12)",
  proposed: "rgba(203,108,230,0.12)",
  discussing: "rgba(232,106,168,0.18)",
  approved: "var(--purple)",
  scheduled: "rgba(0,217,255,0.18)",
  rejected: "rgba(240,85,156,0.18)",
  delisted: "rgba(232,147,74,0.18)",
  posted: "#7FE0B8",
};
const MEDIA_DRAFT_STATUS_TEXT_COLORS = {
  pending: "var(--text)",
  proposed: "var(--text)",
  discussing: "#e86aa8",
  approved: "#0A0612",
  scheduled: "#4ff3ff",
  rejected: "var(--pink)",
  delisted: "#E8934A",
  posted: "#0A0612",
};

// "Wed, Sep 2" from a YYYY-MM-DD key, without the timezone shift that
// new Date("2026-09-02") would introduce.
function mediaDraftDate(key) {
  if (!key) return null;
  const [y, m, d] = key.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

// A tab badge counts what is WAITING ON THE OWNER, not how many rows exist.
// Showing "(0)" for a tab holding 8 approved testimonials read as "this is
// empty" and put him off opening it, so the number now appears only when there
// is genuinely something to act on.
//
// "pending" is also a status that no longer exists — media drafts were renamed
// to "proposed"/"discussing" — so the old count silently returned 0 even with
// drafts genuinely queued. Both legacy and current names are matched.
const NEEDS_REVIEW_STATUSES = ["pending", "proposed", "discussing"];
function needsReviewCount(rows) {
  return rows.filter((r) => NEEDS_REVIEW_STATUSES.includes(r.status)).length;
}
function tabLabel(base, n) {
  return n > 0 ? base + " (" + n + ")" : base;
}

// Drafts are ordered by when they GO OUT, not when they were written. The API
// returns them newest-drafted first, which bore no relation to the order the
// work is actually due in.
//
// "Past" means the moment has gone: it went out, it was killed, or its date is
// behind us. Those collapse, because the only list worth scanning is what is
// still coming.
function draftIsPast(d, todayKey) {
  if (["posted", "rejected", "delisted"].includes(d.status)) return true;
  return Boolean(d.scheduledDate) && d.scheduledDate < todayKey;
}

// "7:00 PM" -> 1140. Sorts same-day drafts into the order they actually fire.
// Anything unparseable sorts to the end of its day rather than the start, so a
// draft with no time never jumps ahead of one with a real slot.
function draftMinutes(t) {
  const m = String(t || "").match(/^(d{1,2}):(d{2})s*([AaPp])?/);
  if (!m) return 24 * 60 + 1;
  let h = Number(m[1]) % 12;
  if (m[3] && /p/i.test(m[3])) h += 12;
  return h * 60 + Number(m[2]);
}

function draftSortKey(d) {
  // No date at all means nobody has decided when it runs, so it needs a
  // decision before anything with a date. It sorts to the very top.
  if (!d.scheduledDate) return "0000-00-00#0000";
  return d.scheduledDate + "#" + String(draftMinutes(d.scheduledTime)).padStart(4, "0");
}

function MediaDraftCard({ d, onUpdateStatus, onDelete, onAttachMedia }) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Asks for the one fact that is missing rather than offering a dead end —
  // the same prompt the Jarvis pipeline uses, so the two behave alike.
  function reschedule() {
    const suggested = d.scheduledDate || localDateKey(new Date());
    const date = window.prompt("Date to post it (YYYY-MM-DD):", suggested);
    if (!date) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
      window.alert("Please use YYYY-MM-DD, e.g. 2026-09-14.");
      return;
    }
    onUpdateStatus(d.id, "scheduled", { scheduledDate: date.trim() });
  }

  return (
          <div key={d.id} style={{ background: "var(--card)", borderRadius: 10, overflow: "hidden", color: "var(--text)" }}>
            {/* No media is the common case here, not the exception — most
                drafts are written as copy plus a shot brief. An <img> with no
                src drew a broken frame that said nothing; this says what is
                missing and offers to fix it. */}
            {!d.mediaUrl ? (
              <button type="button" onClick={() => onAttachMedia(d)}
                style={{
                  width: "100%", height: 160, background: "rgba(232,147,74,0.08)", border: "none",
                  borderBottom: "1px dashed rgba(232,147,74,0.5)", color: "#E8934A", textAlign: "center",
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5, padding: "10px 14px",
                }}>
                <span style={{ fontSize: 12.5, fontWeight: 700 }}>No media attached</span>
                {d.photoHint && (
                  <span style={{ fontSize: 11, color: "var(--text)", opacity: 0.75, lineHeight: 1.4 }}>
                    {d.photoHint.length > 90 ? d.photoHint.slice(0, 90) + "…" : d.photoHint}
                  </span>
                )}
                <span style={{ fontSize: 11, textDecoration: "underline" }}>Attach a photo or clip</span>
              </button>
            ) : d.mediaType === "video" ? (
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
              {/* When it goes out, not when it was drafted — "scheduled" alone
                  never said which day the work was due. */}
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 10 }}>
                {d.platform || "Platform TBD"}
                {d.status === "scheduled" && d.scheduledDate && (
                  <span style={{ color: "#4ff3ff" }}> · goes out {mediaDraftDate(d.scheduledDate)}{d.scheduledTime ? ` at ${d.scheduledTime}` : ""}</span>
                )}
                {d.status === "posted" && d.postedAt && (
                  <span style={{ color: "#7FE0B8" }}> · posted {new Date(d.postedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                )}
                {d.status === "delisted" && d.postedAt && (
                  <span style={{ color: "#E8934A" }}> · was posted {new Date(d.postedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}, since removed</span>
                )}
                {!["scheduled", "posted", "delisted"].includes(d.status) && d.scheduledDate && (
                  <span> · for {mediaDraftDate(d.scheduledDate)}</span>
                )}
              </div>

              {d.status === "discussing" && d.reviewNote && (
                <div style={{ fontSize: 11.5, lineHeight: 1.45, color: "var(--text)", background: "rgba(232,106,168,0.1)", border: "1px solid rgba(232,106,168,0.35)", borderRadius: 6, padding: "7px 9px", marginBottom: 8 }}>
                  <strong style={{ color: "#e86aa8" }}>Change requested: </strong>{d.reviewNote}
                </div>
              )}

              {["pending", "proposed", "discussing"].includes(d.status) && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button type="button" onClick={() => onUpdateStatus(d.id, "approved")}
                    style={{ flex: 1, background: "var(--purple)", color: "#0A0612", border: "none", borderRadius: 6, padding: "7px 9px", fontSize: 12, fontWeight: 700 }}>
                    Approve
                  </button>
                  <button type="button"
                    onClick={() => {
                      const note = window.prompt("What needs changing? This is saved against the draft so it can be rewritten.", d.reviewNote || "");
                      if (note !== null && note.trim()) onUpdateStatus(d.id, "discussing", note.trim());
                    }}
                    style={{ flex: 1, background: "transparent", color: "#e86aa8", border: "1px solid #e86aa8", borderRadius: 6, padding: "7px 9px", fontSize: 12, fontWeight: 700 }}>
                    {d.status === "discussing" ? "Edit notes" : "Needs work"}
                  </button>
                  <button type="button" onClick={() => onUpdateStatus(d.id, "rejected")}
                    style={{ flex: 1, background: "transparent", color: "var(--pink)", border: "1px solid var(--pink)", borderRadius: 6, padding: "7px 9px", fontSize: 12, fontWeight: 700 }}>
                    Deny
                  </button>
                </div>
              )}

              {(d.status === "approved" || d.status === "scheduled") && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {/* Same four actions the Jarvis pipeline offers, so the two
                      screens do not disagree about what can be done to a post. */}
                  <button type="button" onClick={() => setPreviewOpen((v) => !v)}
                    style={{ flex: "1 1 46%", background: "transparent", color: "var(--purple)", border: "1px solid var(--purple)", borderRadius: 6, padding: "7px 9px", fontSize: 12, fontWeight: 700 }}>
                    {previewOpen ? "Hide preview" : "Preview"}
                  </button>
                  <button type="button" onClick={() => onUpdateStatus(d.id, "posted")}
                    style={{ flex: "1 1 46%", background: "#7FE0B8", color: "#0A0612", border: "none", borderRadius: 6, padding: "7px 9px", fontSize: 12, fontWeight: 700 }}>
                    Mark posted
                  </button>
                  <button type="button" onClick={() => reschedule()}
                    style={{ flex: "1 1 46%", background: "transparent", color: "#4ff3ff", border: "1px solid #4ff3ff", borderRadius: 6, padding: "7px 9px", fontSize: 12, fontWeight: 700 }}>
                    Reschedule
                  </button>
                  <button type="button" onClick={() => onUpdateStatus(d.id, "rejected")}
                    style={{ flex: "1 1 46%", background: "transparent", color: "var(--pink)", border: "1px solid var(--pink)", borderRadius: 6, padding: "7px 9px", fontSize: 12, fontWeight: 600 }}>
                    Don&apos;t post
                  </button>
                </div>
              )}

              {previewOpen && (
                <div style={{ marginTop: 8, padding: 10, borderRadius: 6, background: "rgba(203,108,230,0.08)", border: "1px solid rgba(203,108,230,0.35)" }}>
                  <div style={{ fontSize: 10.5, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--purple)", fontWeight: 700, marginBottom: 6 }}>
                    {d.platform || "Platform TBD"} — as it will go out
                  </div>
                  <div style={{ fontSize: 12.5, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{d.caption}</div>
                  {d.mediaUrl
                    ? <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6, wordBreak: "break-all" }}>{d.mediaUrl}</div>
                    : <div style={{ fontSize: 11, color: "#E8934A", marginTop: 6 }}>No media attached — Instagram and TikTok will refuse this.</div>}
                  <button type="button"
                    onClick={() => { navigator.clipboard?.writeText(d.caption || ""); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                    style={{ marginTop: 8, background: "transparent", color: "var(--muted)", border: "1px solid rgba(203,108,230,0.3)", borderRadius: 6, padding: "5px 10px", fontSize: 11.5, fontWeight: 600 }}>
                    {copied ? "Copied ✓" : "Copy caption"}
                  </button>
                </div>
              )}

              {/* Posted is not a draft state any more, so there is nothing to
                  reset it to. The only real action left is pulling the post
                  down, which is a different thing from never having run it. */}
              {d.status === "posted" && (
                <div style={{ display: "flex", gap: 6 }}>
                  <button type="button"
                    onClick={() => { if (window.confirm("Recall this post?\n\nRemove it from the social account first — this only records that it came down. It moves to Delisted and can be re-approved later.")) onUpdateStatus(d.id, "delisted"); }}
                    style={{ flex: 1, background: "transparent", color: "#E8934A", border: "1px solid #E8934A", borderRadius: 6, padding: "7px 9px", fontSize: 12, fontWeight: 700 }}>
                    Recall post
                  </button>
                </div>
              )}

              {(d.status === "rejected" || d.status === "delisted") && (
                <div style={{ display: "flex", gap: 6 }}>
                  <button type="button" onClick={() => onUpdateStatus(d.id, "proposed")}
                    style={{ flex: 1, background: "transparent", color: "var(--purple)", border: "1px solid var(--purple)", borderRadius: 6, padding: "7px 9px", fontSize: 12, fontWeight: 600 }}>
                    Back to review
                  </button>
                  <button type="button" onClick={() => onDelete(d.id)}
                    style={{ background: "transparent", color: "var(--pink)", border: "1px solid var(--pink)", borderRadius: 6, padding: "7px 9px", fontSize: 12, fontWeight: 600 }}>
                    Delete
                  </button>
                </div>
              )}
            </div>
          </div>
  );
}


// The gallery grouped by the categories the public site actually uses, because
// a flat list of 35 tiles gives no sense of which package is thin. Corporate
// having three tiles and Party Cove seven is the useful fact, and it was
// invisible before.

// The one screen that answers "what needs me today" without opening five tabs.
//
// Everything here previously lived only on the Jarvis dashboard, which had grown
// into a second place to look for the same information the console already held.
// The console won: it does everything else, and its tabs are where the work
// actually happens. Only the to-do list and the agent log were unique to Jarvis,
// so they move here.
// The one screen that answers "what needs me today".
//
// Laid out three across and two down, because at one card per column the panels
// were too narrow to hold a sentence and everything wrapped.
// The crew roster: who runs, when, what they are for, and whether any of them
// is stuck waiting on the owner.
//
// The point of this panel is that a scheduled agent fails silently. Nothing
// bounces, nothing errors on screen -- it simply stops appearing, and an empty
// log reads exactly like a quiet week. So a run that has not reported within
// about two of its own cycles is called out rather than left looking fine.
// The crew, computed once. Both the alert banners and the individual cards
// need the same derived state, and duplicating it was how the Crew tab and the
// Overview panel drifted apart in the first place.
function crewAccent(shortName) {
  const c = CREW.find((x) => x.name.toUpperCase().endsWith(" " + String(shortName).toUpperCase()));
  return c ? c.accent : "var(--muted)";
}

function crewRows(agentActivity = []) {
  return CREW.map((c) => {
    const run = latestRun(agentActivity, c.name);
    const status = latestStatus(agentActivity, c.name);
    // A run left open for hours is not working, it was killed. Reporting it as
    // "Working" is how Pearl looked healthy for three days while doing nothing.
    const stalled = isStalled(run);
    const state = c.pending ? "unbuilt" : stalled ? "stalled" : run ? run.status : "idle";
    return { ...c, run, status, stalled, state, stale: isStale(run, c.schedule) };
  });
}

function crewAgo(d) {
  if (!d) return "never";
  const day = Math.round((Date.now() - new Date(d)) / 86400000);
  if (day <= 0) return "today";
  if (day === 1) return "yesterday";
  if (day < 14) return day + " days ago";
  return String(d).slice(0, 10);
}

// One agent's card. Sits next to the panel she owns, so `compact` trims the
// parts that would repeat what the panel already says.
function CrewCard({ r, compact = false }) {
  const CARD = { background: "var(--card)", borderRadius: 12, padding: 14, border: "1px solid rgba(203,108,230,0.16)" };
  const st = AGENT_STATUS[r.state] || AGENT_STATUS.idle;
  const lines = statusLines(r.status);
  const fresh = isToday(r.status);
  const AV = compact ? 54 : 72;

  return (
    <div style={{ ...CARD, opacity: r.pending ? 0.62 : 1, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
        {/* Never below 54px: at 46 only bold colour survived and two of them
            were unrecognisable. Initials remain the fallback. */}
        <div
          style={{
            width: AV, height: AV, borderRadius: "50%", flexShrink: 0, overflow: "hidden",
            background: "linear-gradient(135deg, " + r.accent + ", rgba(10,6,18,0.85))",
            color: "#0A0612", fontWeight: 800, fontSize: 18,
            display: "flex", alignItems: "center", justifyContent: "center",
            border: "2px solid " + r.accent,
            filter: r.pending ? "grayscale(0.7)" : "none",
          }}
        >
          {r.avatar ? (
            <img src={r.avatar} alt="" loading="lazy"
              onError={(e) => { e.currentTarget.style.display = "none"; }}
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          ) : (
            crewInitials(r.name)
          )}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 7, flexWrap: "wrap" }}>
            <strong style={{ fontSize: 14.5, color: "var(--text)" }}>{r.name}</strong>
            <span style={{ fontSize: 11, fontWeight: 700, color: st.color, whiteSpace: "nowrap" }}>{st.label}</span>
            {r.lead && (
              <span style={{ fontSize: 10, color: "#0A0612", background: r.accent, borderRadius: 4, padding: "1px 6px", fontWeight: 700 }}>LEAD</span>
            )}
            {r.acts && (
              <span style={{ fontSize: 10, color: "#0A0612", background: "var(--purple)", borderRadius: 4, padding: "1px 6px", fontWeight: 700 }}>POSTS</span>
            )}
          </div>
          {r.title && (
            <div style={{ fontSize: 11.5, color: r.accent, fontWeight: 700, marginTop: 2 }}>
              {r.title}
              {r.rank && <span style={{ color: "var(--muted)", fontWeight: 400, fontStyle: "italic" }}> &middot; {r.rank}</span>}
            </div>
          )}
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
            {r.schedule}
            {r.reportsTo && <> &middot; reports to {r.reportsTo.replace("Nauti ", "")}</>}
            {r.checks && <> &middot; checks {r.checks.replace("Nauti ", "")}</>}
          </div>
        </div>
      </div>

      {!compact && (
        <p style={{ margin: "9px 0 0", fontSize: 12.5, color: "var(--text)", opacity: 0.75, lineHeight: 1.45 }}>{r.job}</p>
      )}

      <div style={{ marginTop: 10, paddingTop: 9, borderTop: "1px solid rgba(203,108,230,0.14)" }}>
        <div style={{ fontSize: 10.5, color: fresh ? r.accent : "#E8934A", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 700 }}>
          {r.status
            ? (fresh ? (r.greeting || "This morning") : "Last filed " + crewAgo(r.status.startedAt))
            : "No status yet"}
        </div>
        {lines.length > 0 ? (
          <ul style={{ margin: "6px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 3 }}>
            {lines.map((l, i) => (
              <li key={i} style={{
                fontSize: 12.5, color: "var(--text)", lineHeight: 1.45,
                opacity: i === 0 ? 0.95 : 0.78,
                paddingLeft: i === 0 ? 0 : 12, position: "relative",
                fontWeight: i === 0 ? 600 : 400,
              }}>
                {i > 0 && <span style={{ position: "absolute", left: 0, color: r.accent, opacity: 0.75 }}>&middot;</span>}
                {l}
              </li>
            ))}
          </ul>
        ) : (
          <div style={{ fontSize: 12, color: "var(--muted)", fontStyle: "italic", marginTop: 5 }}>
            She has not filed a standup yet.
          </div>
        )}
      </div>

      {r.quietIsNormal && !compact && (
        <div style={{ marginTop: 8, fontSize: 11, color: "var(--muted)", lineHeight: 1.45 }}>
          Most weeks are empty by design &mdash; silence is her working, not failing.
        </div>
      )}

      <div style={{ marginTop: "auto", paddingTop: 9 }}>
        <div style={{ fontSize: 10.5, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
          {r.run ? "Last run · " + crewAgo(r.run.startedAt) : "Last run · none recorded"}
        </div>
        <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2, lineHeight: 1.4 }}>
          {r.run ? (r.run.detail || r.run.taskTitle || "no detail recorded") : "Has not reported a run since logging was added."}
        </div>
      </div>
    </div>
  );
}

// The things that need saying before any panel: somebody is blocked, somebody
// broke, somebody went silent. Sits at the very top because a stalled agent
// invalidates whatever its panel is showing.
// The chain of command, drawn. Built from CREW rather than hand-placed, so it
// cannot drift out of step with the roster the way a picture in a document
// would -- rename an agent or change who she reports to and this follows.
//
// Reading it: solid lines are reporting, the dashed line is Coral auditing what
// Siren actually published. That loop is the only one that goes back upstream,
// and it exists because Siren is the only agent who acts outside the business.
function CrewChart({ rows }) {
  const by = Object.fromEntries(rows.map((r) => [r.name, r]));
  const pearl = by["Nauti Pearl"];
  const siren = by["Nauti Siren"];
  const coral = by["Nauti Coral"];
  // Everyone who answers straight to Pearl, in the order they run.
  const direct = rows.filter((r) => !r.lead && r.name !== "Nauti Coral");

  const W = 980, colW = W / direct.length;
  // Vertical rhythm, derived rather than eyeballed. A node runs from cy-rad to
  // cy+rad+28: the circle, its name at +15, its title at +28. Each row must
  // therefore start below the previous row's title, and the viewBox must clear
  // the LAST title -- Coral's used to land at y=335 in a 330-tall box, which is
  // why her role was sliced off.
  const yOwner = 34, yPearl = 130, yRow = 250, yCoral = 370;
  const CHART_H = 440;
  const x = (i) => colW * i + colW / 2;
  const sirenI = direct.findIndex((r) => r.name === "Nauti Siren");

  function Node({ cx, cy, r: agent, label, sub, big }) {
    const rad = big ? 26 : 21;
    return (
      <g>
        {agent && agent.avatar ? (
          <>
            <clipPath id={"clip-" + (agent.name || label).replace(/\s+/g, "")}>
              <circle cx={cx} cy={cy} r={rad} />
            </clipPath>
            <image
              href={agent.avatar} x={cx - rad} y={cy - rad} width={rad * 2} height={rad * 2}
              clipPath={`url(#clip-${(agent.name || label).replace(/\s+/g, "")})`}
              preserveAspectRatio="xMidYMid slice"
            />
            <circle cx={cx} cy={cy} r={rad} fill="none" stroke={agent.accent} strokeWidth="2.5" />
          </>
        ) : (
          <circle cx={cx} cy={cy} r={rad} fill="rgba(203,108,230,0.16)" stroke="var(--purple)" strokeWidth="2" />
        )}
        {!agent && (
          <text x={cx} y={cy + 5} textAnchor="middle" fontSize="15" fill="var(--text)" fontWeight="700">
            {label === "You" ? "⚓" : ""}
          </text>
        )}
        <text x={cx} y={cy + rad + 15} textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--text)">
          {label}
        </text>
        {sub && (
          <text x={cx} y={cy + rad + 28} textAnchor="middle" fontSize="10" fill="var(--muted)">
            {sub}
          </text>
        )}
      </g>
    );
  }

  const line = (x1, y1, x2, y2, dash) => (
    <path
      d={`M ${x1} ${y1} C ${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}`}
      fill="none" stroke="rgba(203,108,230,0.42)" strokeWidth="1.6"
      strokeDasharray={dash ? "5 4" : undefined}
    />
  );

  return (
    <div style={{ background: "var(--card)", borderRadius: 12, padding: "14px 16px 6px", border: "1px solid rgba(203,108,230,0.16)" }}>
      <div style={{ fontWeight: 700, color: "var(--text)", fontSize: 13.5, marginBottom: 2 }}>Chain of command</div>
      <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 6, lineHeight: 1.45 }}>
        Everything routes through Pearl. The dashed line is Coral checking what Siren actually published &mdash;
        the only loop that runs back upstream, because Siren is the only one who acts outside the business.
      </div>
      <div className="crew-chart" style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        <svg viewBox={`0 0 ${W} ${CHART_H}`} style={{ width: "100%", minWidth: 760, height: "auto", display: "block" }}>
          {/* owner -> pearl */}
          {line(W / 2, yOwner + 26, W / 2, yPearl - 26)}
          {/* pearl -> everyone direct */}
          {direct.map((r, i) => (
            <g key={"l" + r.name}>{line(W / 2, yPearl + 26, x(i), yRow - 21)}</g>
          ))}
          {/* coral -> siren, and the audit back */}
          {sirenI >= 0 && line(x(sirenI) - 10, yRow + 21, x(sirenI) - 10, yCoral - 21)}
          {sirenI >= 0 && line(x(sirenI) + 10, yCoral - 21, x(sirenI) + 10, yRow + 21, true)}

          <Node cx={W / 2} cy={yOwner} label="You" sub="the owner" big />
          <Node cx={W / 2} cy={yPearl} r={pearl} label="Pearl" sub="Chief of Staff" big />
          {direct.map((r, i) => (
            <Node key={r.name} cx={x(i)} cy={yRow} r={r} label={r.name.replace("Nauti ", "")} sub={r.title} />
          ))}
          {sirenI >= 0 && (
            <Node cx={x(sirenI)} cy={yCoral} r={coral} label="Coral" sub="Content Producer" />
          )}
          {sirenI >= 0 && (
            <text x={x(sirenI) + 26} y={yRow + 80} fontSize="9.5" fill="var(--muted)">
              audits
            </text>
          )}
        </svg>
      </div>
    </div>
  );
}

function CrewAlerts({ rows }) {
  const CARD = { background: "var(--card)", borderRadius: 12, padding: 14, border: "1px solid rgba(203,108,230,0.16)" };
  const waiting = rows.filter((r) => r.state === "needs-input");
  const broken = rows.filter((r) => r.state === "failed" || r.state === "stalled");
  const quiet = rows.filter((r) => r.stale && !["needs-input", "failed", "stalled"].includes(r.state));
  const silent = rows.filter((r) => !r.status);

  if (!waiting.length && !broken.length && !quiet.length && !silent.length) return null;

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {waiting.length > 0 && (
        <div style={{ ...CARD, borderColor: "#E8934A", borderLeft: "3px solid #E8934A" }}>
          <div style={{ fontWeight: 700, color: "#E8934A", marginBottom: 8 }}>Waiting on you ({waiting.length})</div>
          {waiting.map((r) => (
            <div key={r.name} style={{ fontSize: 13, marginBottom: 5 }}>
              <strong style={{ color: "var(--text)" }}>{r.name}</strong>
              <span style={{ color: "var(--muted)" }}> &mdash; {r.run && r.run.detail ? r.run.detail : "stopped and needs a decision"}</span>
            </div>
          ))}
        </div>
      )}
      {(broken.length > 0 || quiet.length > 0 || silent.length > 0) && (
        <div style={{ ...CARD, borderColor: "rgba(226,104,95,0.5)" }}>
          {broken.map((r) => (
            <div key={r.name} style={{ fontSize: 13, marginBottom: 4 }}>
              <strong style={{ color: "#E2685F" }}>{r.name} {r.stalled ? "stopped mid-run" : "failed"}</strong>
              <span style={{ color: "var(--muted)" }}>
                {r.stalled
                  ? " — started " + crewAgo(r.run && r.run.startedAt) + " and never finished. Open Routines and hit Run now."
                  : " — " + (r.run && r.run.detail ? r.run.detail : "no reason recorded")}
              </span>
            </div>
          ))}
          {quiet.map((r) => (
            <div key={r.name} style={{ fontSize: 13, marginBottom: 4 }}>
              <strong style={{ color: "#E8934A" }}>{r.name} has gone quiet</strong>
              <span style={{ color: "var(--muted)" }}> &mdash; last reported {crewAgo(r.run && r.run.startedAt)}, and she runs {r.schedule.toLowerCase()}.</span>
            </div>
          ))}
          {silent.length > 0 && (
            <div style={{ fontSize: 13, color: "var(--muted)" }}>
              <strong style={{ color: "#E8934A" }}>No standup filed</strong> &mdash;{" "}
              {silent.map((r) => r.name.replace("Nauti ", "")).join(", ")}. The morning standup did not run.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
function PanelOwners({ names = [] }) {
  const rows = names.map((n) => CREW.find((c) => c.name === n)).filter(Boolean);
  if (!rows.length) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }} title={rows.map((r) => r.name + (r.title ? " \u2014 " + r.title : "")).join(", ")}>
      {rows.map((r) => (
        <span
          key={r.name}
          style={{
            width: 22, height: 22, borderRadius: "50%", overflow: "hidden", display: "block",
            border: "1.5px solid " + r.accent, background: r.accent, flexShrink: 0,
          }}
        >
          {r.avatar && (
            <img src={r.avatar} alt={r.name} loading="lazy"
              onError={(e) => { e.currentTarget.style.display = "none"; }}
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          )}
        </span>
      ))}
      <span style={{ fontSize: 10.5, color: "var(--muted)", whiteSpace: "nowrap" }}>
        {rows.map((r) => r.name.replace("Nauti ", "")).join(" · ")}
      </span>
    </div>
  );
}

// A panel heading with its owners pushed to the right.
function PanelHead({ owners, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
      <div style={{ minWidth: 0 }}>{children}</div>
      <PanelOwners names={owners} />
    </div>
  );
}

function OverviewTab({ externalBookings, inquiries, ledger = [], maintenanceItems = [], engineHours = [], mediaDrafts, todos, agentActivity, testimonials = [], giftCertificates = [], onAddTodo, onToggleTodo, onDeleteTodo, onGo }) {
  const [text, setText] = useState("");
  const [showDone, setShowDone] = useState(false);
  // Which priority bands are expanded. High open, Medium and Low closed --
  // ranking exists so the top band is the part he has to read, and 32 of the
  // 37 items live in the two below it.
  // High open, Medium and Low collapsed, on every load.
  //
  // Deliberately NOT remembered. I had this persisting to localStorage, which
  // sounds helpful and does the opposite: open Medium once to check something
  // and it stays open forever after, so the board is back to its full length
  // the next morning. Expanding a band is a thing you do for one look, not a
  // preference you are setting.
  const [openBands, setOpenBands] = useState({ high: true, medium: false, low: false });
  function toggleBand(band) {
    setOpenBands((v) => ({ ...v, [band]: !v[band] }));
  }
  const today = localDateKey(new Date());
  const month = today.slice(0, 7);
  const plus = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return localDateKey(d); };

  // --- money this month -------------------------------------------------
  const monthLedger = ledger.filter((l) => (l.date || "").startsWith(month));
  const mIncome = monthLedger.filter((l) => l.type === "income").reduce((a, l) => a + Number(l.amount || 0), 0);
  const mExpense = monthLedger.filter((l) => l.type === "expense").reduce((a, l) => a + Number(l.amount || 0), 0);
  const monthCharters = externalBookings.filter((b) => b.status === "completed" && (b.date || "").startsWith(month)).length;

  // --- charters: what is coming, then what just happened -----------------
  const upcoming = externalBookings
    .filter((b) => b.status === "booked" && (b.date || "") >= today)
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const recent = externalBookings
    .filter((b) => b.status === "completed")
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const charters = [...upcoming, ...recent].slice(0, 5);

  // --- what actually needs attention ------------------------------------
  //
  // The first version counted only drafts awaiting a decision, so it said
  // "nothing waiting" while 23 posts sat scheduled and 21 guests had never been
  // asked for a review. Anything that is genuinely a job goes here.
  const soonPosts = mediaDrafts.filter((d) => d.status === "scheduled" && d.scheduledDate && d.scheduledDate <= plus(3) && d.scheduledDate >= today);
  const draftsWaiting = mediaDrafts.filter((d) => ["pending", "proposed", "discussing"].includes(d.status));
  const newInquiries = inquiries.filter((i) => isRealInquiry(i) && i.status === "new");
  // Judged against the highest engine-hour reading in the fleet, which is what
  // the Maintenance tab does — the worst case, so nothing slips through.
  const fleetHours = (engineHours || []).map((h) => h.hours).filter((h) => h != null);
  const maxHours = fleetHours.length ? Math.max(...fleetHours) : null;
  const overdue = maintenanceItems.filter((m) => maintenanceStatus(m, maxHours).status === "overdue");
  const dueSoon = maintenanceItems.filter((m) => maintenanceStatus(m, maxHours).status === "due-soon");
  // Items that cannot be judged at all. 13 items are configured and not one can
  // be assessed, because no engine hours or last-serviced dates were ever
  // entered -- so the whole maintenance system reports "fine" while knowing
  // nothing. Silence from an empty system looks identical to silence from a
  // healthy one, which is the dangerous part.
  const unjudgeable = maintenanceItems.filter((m) => maintenanceStatus(m, maxHours).status === "unknown");
  const neverAsked = externalBookings.filter((b) => b.status === "completed" && b.phone && !b.reviewRequestedAt && !b.marketingOptOut);
  const noPhone = externalBookings.filter((b) => b.status === "completed" && !b.phone);
  const noPrice = externalBookings.filter((b) => b.status === "completed" && b.pricePaid == null);
  const looseIncome = ledger.filter((l) => l.type === "income" && !l.externalBookingId);

  // `go` is the tab that can actually act on the item, so the line is a link
  // rather than an instruction to go and find it yourself.
  const attention = [
    newInquiries.length && { t: `${newInquiries.length} new ${newInquiries.length === 1 ? "enquiry" : "enquiries"}`, w: "Bookings → Inquiries", go: "inquiries", urgent: true },
    overdue.length && { t: `${overdue.length} maintenance ${overdue.length === 1 ? "item" : "items"} overdue`, w: "Boat", go: "maintenance", urgent: true },
    dueSoon.length && { t: `${dueSoon.length} maintenance ${dueSoon.length === 1 ? "item" : "items"} due soon`, w: "Boat", go: "maintenance" },
    unjudgeable.length === maintenanceItems.length && maintenanceItems.length > 0 && {
      t: `No maintenance can be judged — ${maintenanceItems.length} items, nothing logged`,
      w: "Boat: add engine hours or a last-serviced date", go: "maintenance", urgent: true,
    },
    draftsWaiting.length && { t: `${draftsWaiting.length} social ${draftsWaiting.length === 1 ? "draft" : "drafts"} to approve`, w: "Marketing → Media Drafts", go: "mediaDrafts", urgent: true },
    noPrice.length && { t: `${noPrice.length} completed ${noPrice.length === 1 ? "charter has" : "charters have"} no price`, w: "no income row is written without one", go: "bookings", urgent: true },
    soonPosts.length && { t: `${soonPosts.length} ${soonPosts.length === 1 ? "post goes" : "posts go"} out in the next 3 days`, w: "Marketing → Media Drafts", go: "mediaDrafts" },
    neverAsked.length && { t: `${neverAsked.length} guests never asked for a review`, w: "Marketing → Testimonials, from your phone", go: "testimonials" },
    looseIncome.length && { t: `${looseIncome.length} income ${looseIncome.length === 1 ? "row is" : "rows are"} not tied to a charter`, w: "Money → Reconciliation", go: "reconcile" },
    noPhone.length && { t: `${noPhone.length} past guests have no phone number`, w: "they cannot be asked for anything", go: "bookings" },
  ].filter(Boolean);

  // --- social: what is actually going out -------------------------------
  const nextPosts = mediaDrafts
    .filter((d) => d.status === "scheduled" && d.scheduledDate && d.scheduledDate >= today)
    .sort((a, b) => (a.scheduledDate || "").localeCompare(b.scheduledDate || ""));
  const nextByDay = [];
  for (const d of nextPosts) {
    const last = nextByDay[nextByDay.length - 1];
    if (last && last.day === d.scheduledDate) last.platforms.push(d.platform);
    else nextByDay.push({ day: d.scheduledDate, platforms: [d.platform] });
  }

  // --- agent activity ---------------------------------------------------
  //
  // One line per agent, its latest run only. The raw log repeats the same daily
  // task and reads as noise; what matters is whether each agent ran and what it
  // last said.
  const latestByAgent = [];
  const seenAgents = new Set();
  // Standup rows are excluded: this panel answers "did each agent run", and a
  // daily status line filed by the standup is not that agent having run.
  for (const a of (agentActivity || []).filter((x) => !isStatusRow(x))) {
    const name = a.agentName || "(unnamed agent)";
    if (seenAgents.has(name)) continue;
    seenAgents.add(name);
    latestByAgent.push(a);
  }


  const openTodos = todos.filter((t) => !t.done);
  const doneTodos = todos.filter((t) => t.done);

  // The crew, and a lookup so a panel can pull the card of whoever owns it.
  const crew = crewRows(agentActivity);
  const byName = Object.fromEntries(crew.map((c) => [c.name, c]));

  // Ranked once, with the owner prefix split off so it can be shown as a tag
  // rather than as literal "[PENNY · T1]" text in the middle of a sentence.
  const rankedTodos = sortBoard(openTodos).map((t) => {
    const { owner, body } = parseItem(t.text);
    return { ...t, owner, body, priority: priorityOf(t.text) };
  });

  // --- Joy: guests -------------------------------------------------------
  const approvedReviews = (testimonials || []).filter((t) => t.status === "approved");
  const liveReviews = approvedReviews.length;
  const pendingReviews = (testimonials || []).filter((t) => t.status === "pending").length;
  const avgRating = liveReviews
    ? (approvedReviews.reduce((s, t) => s + (t.rating || 0), 0) / liveReviews).toFixed(2)
    : null;
  // A completed charter nobody has asked. Opt-outs are not candidates.
  // Distinct from `neverAsked` above, which already excludes anyone with no
  // phone. This is everyone owed an ask; the split below is the useful part.
  const unaskedGuests = (externalBookings || []).filter(
    (b) => b.status === "completed" && !b.reviewRequestedAt && !b.marketingOptOut
  );
  const askable = unaskedGuests.filter((b) => b.phone || b.email).length;
  const unreachable = unaskedGuests.length - askable;

  // --- Reef: money not collected ----------------------------------------
  const revenueIdeas = openTodos.filter((t) => /REVENUE IDEA|\[REEF/i.test(t.text || "")).length;
  const bookedDays = new Set(
    (externalBookings || [])
      .filter((b) => b.status === "booked" || b.status === "completed")
      .map((b) => String(b.date).slice(0, 10))
  );
  let openWeekends = 0;
  for (let i = 0; i < 56; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) continue;
    const key = d.toISOString().slice(0, 10);
    if (!bookedDays.has(key)) openWeekends++;
  }
  // Average of what charters actually took, not a list price.
  const charterIncome = (ledger || []).filter((e) => e.type === "income" && e.amount > 0);
  const avgCharter = charterIncome.length
    ? Math.round(charterIncome.reduce((s, e) => s + e.amount, 0) / charterIncome.length)
    : 0;

  // --- Nova: research ----------------------------------------------------
  const novaItems = openTodos.filter((t) => /^\[?NOVA/i.test(t.text || ""));
  const novaRun = latestRun(agentActivity, "Nauti Nova");
  function agoWords(d) {
    const days = Math.floor((Date.now() - new Date(d)) / 86400000);
    return days <= 0 ? "today" : days === 1 ? "yesterday" : days + " days ago";
  }

  const CARD = { background: "var(--card)", borderRadius: 10, padding: 14, minWidth: 0 };
  const H = { fontWeight: 700, marginBottom: 10, color: "var(--text)", fontSize: 13.5 };
  const EMPTY = { color: "var(--muted)", fontSize: 12.5, fontStyle: "italic" };

  // A panel here is a summary, not a destination. Clicking its heading opens
  // the tab that can actually act on what it is reporting.
  function Go({ to, children }) {
    if (!onGo || !to) return <div style={H}>{children}</div>;
    return (
      <button
        type="button"
        onClick={() => onGo(to)}
        style={{
          ...H, display: "flex", alignItems: "center", gap: 6, width: "100%",
          background: "transparent", border: "none", padding: 0, textAlign: "left",
          cursor: "pointer", font: "inherit", fontWeight: 700, fontSize: 13.5, color: "var(--text)",
        }}
      >
        {children}
        <span style={{ color: "var(--purple)", fontSize: 12 }}>→</span>
      </button>
    );
  }

  function submit(e) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    onAddTodo(t);
    setText("");
  }

  return (
    <>
    <CrewAlerts rows={crew} />

    <div className="console-orbit" style={{ marginTop: 14 }}>
      {/* Pearl above the board: she is the one who reads every agent's
          input and decides what reaches him, so her card and the two panels
          she owns sit over the top of everything. */}
      {/* Column widths live in CSS so they can respond. Inline
          minmax(300px,...) x3 forced 900px of content onto a 375px phone and
          took the whole page sideways with it. */}
      <div className="orbit-lead">
        <div style={CARD}>
          <PanelHead owners={["Nauti Pearl"]}>
            <div style={{ ...H, marginBottom: 0 }}>Needs attention {attention.length > 0 && <span style={{ color: "var(--muted)", fontWeight: 400 }}>({attention.length})</span>}</div>
          </PanelHead>
          {attention.length === 0 && <div style={EMPTY}>Genuinely nothing waiting.</div>}
          <div style={{ display: "grid", gap: 7 }}>
            {attention.map((a, i) => {
              const body = (
                <>
                  <div style={{ color: a.urgent ? "#E8934A" : "var(--text)", fontWeight: a.urgent ? 700 : 400 }}>{a.t}</div>
                  <div style={{ color: "var(--muted)", fontSize: 11 }}>{a.w}</div>
                </>
              );
              if (!onGo || !a.go) return <div key={i} style={{ fontSize: 12.5 }}>{body}</div>;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => onGo(a.go)}
                  style={{
                    textAlign: "left", width: "100%", cursor: "pointer",
                    background: "transparent", border: "none", padding: 0, font: "inherit", fontSize: 12.5,
                  }}
                >
                  {body}
                </button>
              );
            })}
          </div>
        </div>
        <div className="orbit-lead-pearl"><CrewCard r={byName["Nauti Pearl"]} /></div>
        <div style={CARD}>
          <PanelHead owners={["Nauti Pearl", "Nauti Penny"]}><Go to="bookings">Charters</Go></PanelHead>
          {charters.length === 0 && <div style={EMPTY}>Nothing on the books.</div>}
          <div style={{ display: "grid", gap: 7 }}>
            {charters.map((b) => (
              <div key={b.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, fontSize: 12.5 }}>
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  <strong>{b.guestName || "(no name)"}</strong>
                  <span style={{ color: "var(--muted)" }}> {b.vesselName}</span>
                </span>
                <span style={{ whiteSpace: "nowrap" }}>
                  <span className="mono" style={{ color: "var(--muted)", fontSize: 11.5 }}>{b.date}</span>{" "}
                  <span style={{ fontSize: 10, fontWeight: 700, color: b.status === "booked" ? "#4FA8E8" : "#7FE0B8" }}>
                    {b.status === "booked" ? "UPCOMING" : "DONE"}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="orbit-left" style={{ display: "grid", gap: 14 }}>
      <div className="orbit-group ">
        <div style={CARD}>
          <PanelHead owners={["Nauti Penny", "Nauti Shelly"]}><Go to="ledger">This month</Go></PanelHead>
          <div style={{ display: "grid", gap: 7, fontSize: 13 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--muted)" }}>Income</span>
              <span className="mono" style={{ color: "#7FE0B8", fontWeight: 700 }}>{currency(mIncome)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--muted)" }}>Expenses</span>
              <span className="mono" style={{ color: "var(--pink)", fontWeight: 700 }}>{currency(mExpense)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid rgba(203,108,230,0.15)", paddingTop: 7 }}>
              <span style={{ color: "var(--muted)" }}>Net</span>
              <span className="mono" style={{ color: mIncome - mExpense >= 0 ? "#E8934A" : "var(--pink)", fontWeight: 700 }}>{currency(mIncome - mExpense)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", color: "var(--muted)", fontSize: 12.5 }}>
              <span>Charters run</span><span className="mono">{monthCharters}</span>
            </div>
          </div>
        </div>
        <div className="orbit-crew">
          <CrewCard r={byName["Nauti Penny"]} compact />
          <CrewCard r={byName["Nauti Shelly"]} compact />
        </div>
      </div>
      <div className="orbit-group ">
        <div style={CARD}>
          <PanelHead owners={["Nauti Joy"]}><Go to="testimonials">Guests</Go></PanelHead>
          <div style={{ display: "grid", gap: 7, fontSize: 13 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--muted)" }}>Reviews live</span>
              <span className="mono" style={{ fontWeight: 700 }}>
                {liveReviews}{avgRating ? <span style={{ color: "var(--muted)", fontWeight: 400 }}> · {avgRating}★</span> : null}
              </span>
            </div>
            {pendingReviews > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#E8934A" }}>Waiting on your approval</span>
                <span className="mono" style={{ color: "#E8934A", fontWeight: 700 }}>{pendingReviews}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--muted)" }}>Never asked</span>
              <span className="mono" style={{ fontWeight: 700 }}>{unaskedGuests.length}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: unreachable > 0 ? "#E8934A" : "var(--muted)" }}>…of those, no way to reach them</span>
              <span className="mono" style={{ color: unreachable > 0 ? "#E8934A" : "var(--text)", fontWeight: 700 }}>{unreachable}</span>
            </div>
          </div>
          <div style={{ marginTop: 9, paddingTop: 8, borderTop: "1px solid rgba(203,108,230,0.12)", fontSize: 11.5, color: "var(--muted)", lineHeight: 1.45 }}>
            {askable > 0
              ? askable + " can still be asked. Joy mails you the list on Mondays."
              : "Nobody left who can be reached — the gap is contact details at booking, not the asking."}
          </div>
        </div>
        <div className="orbit-crew">
          <CrewCard r={byName["Nauti Joy"]} compact />
        </div>
      </div>
      </div>

      <div className="orbit-center">
        <div style={{ ...CARD, borderColor: "rgba(203,108,230,0.4)" }}>
          <PanelHead owners={["Nauti Pearl"]}>
            <div style={{ ...H, marginBottom: 0, fontSize: 15 }}>
              The Board <span style={{ color: "var(--muted)", fontWeight: 400 }}>(To-do List)</span>
            </div>
          </PanelHead>

        <form onSubmit={submit} style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a task…"
            style={{ flex: 1, minWidth: 0, padding: "7px 9px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)", fontSize: 12.5 }} />
          <button type="submit" style={{ background: "var(--purple)", color: "#0A0612", border: "none", borderRadius: 6, padding: "0 13px", fontWeight: 700 }}>+</button>
        </form>

        {openTodos.length === 0 && <div style={EMPTY}>Nothing on the list.</div>}

        {/* Ranked, not chronological. A board this long read as a wall of
            equal-weight text, and the thing that is actually urgent could sit
            anywhere in it. */}
        {["high", "medium", "low"].map((band) => {
          const items = rankedTodos.filter((t) => t.priority === band);
          if (!items.length) return null;
          const p = PRIORITY[band];
          return (
            <div key={band} style={{ marginBottom: 10 }}>
              <button
                type="button"
                onClick={() => toggleBand(band)}
                aria-expanded={!!openBands[band]}
                style={{
                  display: "flex", alignItems: "center", gap: 7, width: "100%",
                  background: "transparent", border: "none", padding: "3px 0", marginBottom: 6,
                  cursor: "pointer", textAlign: "left",
                }}
              >
                <span style={{ color: p.color, fontSize: 10, width: 9, flexShrink: 0 }}>
                  {openBands[band] ? "▾" : "▸"}
                </span>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color, flexShrink: 0 }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: p.color, textTransform: "uppercase", letterSpacing: "0.07em" }}>
                  {p.label}
                </span>
                {/* The count stays visible when collapsed -- a hidden band with
                    no number would just look like the band is empty. */}
                <span style={{ fontSize: 11, color: "var(--muted)" }}>{items.length}</span>
                {!openBands[band] && (
                  <span style={{ fontSize: 10.5, color: "var(--muted)", opacity: 0.7, marginLeft: "auto" }}>hidden</span>
                )}
              </button>
              {/* Not the `hidden` attribute: it only sets display:none through
                  the UA stylesheet, so an inline display:grid beats it and the
                  band stayed open however many times you clicked. */}
              {openBands[band] && (
              <div style={{ display: "grid", gap: 5 }}>
                {items.map((t) => (
                  <label key={t.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12.5, lineHeight: 1.45, cursor: "pointer" }}>
                    <input type="checkbox" checked={false} onChange={() => onToggleTodo(t.id, true)}
                      style={{ accentColor: p.color, flexShrink: 0, marginTop: 2 }} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      {t.owner && (
                        <span style={{ color: crewAccent(t.owner), fontWeight: 700, fontSize: 11, marginRight: 5 }}>
                          {t.owner}
                        </span>
                      )}
                      {t.body}
                    </span>
                    <button type="button" onClick={(e) => { e.preventDefault(); onDeleteTodo(t.id); }}
                      style={{ background: "transparent", color: "var(--pink)", border: "none", fontSize: 13, opacity: 0.4, flexShrink: 0 }}>✕</button>
                  </label>
                ))}
              </div>
              )}
            </div>
          );
        })}

        {/* Completed items are folded away rather than deleted -- closing one
            is a record that it happened, and the crew read it back. */}
        {doneTodos.length > 0 && (
          <div style={{ marginTop: 4, paddingTop: 8, borderTop: "1px solid rgba(203,108,230,0.12)" }}>
            <button type="button" onClick={() => setShowDone((v) => !v)}
              style={{ background: "transparent", border: "none", color: "var(--muted)", fontSize: 11.5, padding: 0, cursor: "pointer" }}>
              {showDone ? "▾" : "▸"} {doneTodos.length} done
            </button>
            {showDone && (
              <div style={{ display: "grid", gap: 4, marginTop: 6 }}>
                {doneTodos.map((t) => (
                  <label key={t.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, color: "var(--muted)", lineHeight: 1.4, cursor: "pointer" }}>
                    <input type="checkbox" checked readOnly onClick={() => onToggleTodo(t.id, false)}
                      style={{ accentColor: "var(--purple)", flexShrink: 0, marginTop: 2 }} />
                    <span style={{ flex: 1, minWidth: 0, textDecoration: "line-through" }}>{t.text}</span>
                    <button type="button" onClick={(e) => { e.preventDefault(); onDeleteTodo(t.id); }}
                      style={{ background: "transparent", color: "var(--pink)", border: "none", fontSize: 13, opacity: 0.4, flexShrink: 0 }}>✕</button>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid rgba(203,108,230,0.12)", fontSize: 11, color: "var(--muted)", lineHeight: 1.45 }}>
          Pearl keeps this board. The crew write to it, she ranks it and folds the duplicates,
          and anything marked High stays in her morning brief until it is closed.
        </div>
        </div>
      </div>

      <div className="orbit-right" style={{ display: "grid", gap: 14 }}>
      <div className="orbit-group ">
        <div style={CARD}>
          <PanelHead owners={["Nauti Coral", "Nauti Siren"]}><Go to="mediaDrafts">Going out next</Go></PanelHead>
          {nextByDay.length === 0 && <div style={EMPTY}>Nothing scheduled.</div>}
          <div style={{ display: "grid", gap: 6 }}>
            {nextByDay.slice(0, 6).map((d) => (
              <div key={d.day} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12.5 }}>
                <span className="mono" style={{ color: d.day === today ? "#E8934A" : "var(--text)", fontWeight: d.day === today ? 700 : 400, whiteSpace: "nowrap" }}>
                  {mediaDraftDate(d.day) || d.day}
                </span>
                <span style={{ color: "var(--muted)", fontSize: 11.5, textAlign: "right" }}>{d.platforms.join(" · ")}</span>
              </div>
            ))}
            {nextByDay.length > 6 && (
              <div style={{ color: "var(--muted)", fontSize: 11 }}>…and {nextByDay.length - 6} more days scheduled</div>
            )}
          </div>
        </div>
        <div className="orbit-crew">
          <CrewCard r={byName["Nauti Coral"]} compact />
          <CrewCard r={byName["Nauti Siren"]} compact />
        </div>
      </div>
      <div className="orbit-group ">
        <div style={CARD}>
          <PanelHead owners={["Nauti Reef"]}><Go to="giftCertificates">Money on the table</Go></PanelHead>
          <div style={{ display: "grid", gap: 7, fontSize: 13 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--muted)" }}>Open weekend dates, next 8 weeks</span>
              <span className="mono" style={{ fontWeight: 700 }}>{openWeekends}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--muted)" }}>…roughly worth</span>
              <span className="mono" style={{ color: "#7FE0B8", fontWeight: 700 }}>{currency(openWeekends * avgCharter)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: giftCertificates.length === 0 ? "#E8934A" : "var(--muted)" }}>Gift certificates sold</span>
              <span className="mono" style={{ color: giftCertificates.length === 0 ? "#E8934A" : "var(--text)", fontWeight: 700 }}>{giftCertificates.length}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--muted)" }}>Ideas open on the board</span>
              <span className="mono" style={{ fontWeight: 700 }}>{revenueIdeas}</span>
            </div>
          </div>
          <div style={{ marginTop: 9, paddingTop: 8, borderTop: "1px solid rgba(203,108,230,0.12)", fontSize: 11.5, color: "var(--muted)", lineHeight: 1.45 }}>
            An empty Saturday is the most expensive thing the business owns. Valued at the
            {" "}{currency(avgCharter)} average charter.
          </div>
        </div>
        <div className="orbit-crew">
          <CrewCard r={byName["Nauti Reef"]} compact />
        </div>
      </div>
      <div className="orbit-group ">
        <div style={CARD}>
          <PanelHead owners={["Nauti Nova"]}>
            <div style={{ ...H, marginBottom: 0 }}>Research</div>
          </PanelHead>
          {novaItems.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--text)", opacity: 0.85, lineHeight: 1.5 }}>
              Nothing has cleared the bar.
              <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 6, lineHeight: 1.45 }}>
                She reports only what you would be annoyed to learn six months late — a grant that
                closed, a rule that changed, money you were owed. Most weeks that is nothing, and an
                empty panel here is her working.
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 7 }}>
              {novaItems.slice(0, 3).map((t) => (
                <div key={t.id} style={{ fontSize: 12.5, lineHeight: 1.45 }}>
                  {t.text.replace(/^\[?NOVA[^\]]*\]?\s*:?\s*/i, "")}
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 9, paddingTop: 8, borderTop: "1px solid rgba(203,108,230,0.12)", fontSize: 11.5, color: "var(--muted)" }}>
            {novaRun ? "Last looked " + agoWords(novaRun.startedAt) + "." : "First run is Monday."}
          </div>
        </div>
        <div className="orbit-crew">
          <CrewCard r={byName["Nauti Nova"]} compact />
        </div>
      </div>
      </div>
    </div>

    {/* The chain of command, at the foot rather than the head: it is a
        reference you check occasionally, not something to scroll past
        every morning to reach the numbers. */}
    <div style={{ marginTop: 16 }}>
      <CrewChart rows={crew} />
    </div>
    </>
  );
}

function GalleryTab({ gallery, onUpdateCaption, onAddGalleryItem, onUpdateGalleryItem, onDeleteGalleryItem }) {
  const [adding, setAdding] = useState(null);
  const [draft, setDraft] = useState({ image: "", caption: "" });

  const categories = Array.from(new Set(gallery.map((g) => g.category))).sort();
  const byCategory = categories.map((c) => ({
    category: c,
    items: gallery.filter((g) => g.category === c).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)),
  }));
  // Which package looks thin is the thing worth seeing at a glance, so it is
  // stated rather than left for the reader to work out by scrolling.
  const thin = byCategory.filter((c) => c.items.length < 5).map((c) => c.category);

  async function submit(category) {
    const image = draft.image.trim();
    if (!image) return;
    await onAddGalleryItem({ image, caption: draft.caption.trim(), category });
    setDraft({ image: "", caption: "" });
    setAdding(null);
  }

  function replaceImage(g) {
    const url = window.prompt(
      "Path or URL for this tile's image.\n\nImages in the site's own public/gallery/ folder are referenced as /gallery/name.jpg — those are served from our repo and cannot vanish because someone else's account lapsed.",
      g.image || ""
    );
    if (url === null) return;
    if (!url.trim()) { window.alert("An empty image would render a broken tile. Use Remove to take the tile down."); return; }
    onUpdateGalleryItem(g.id, { image: url.trim() });
  }

  function move(items, index, delta) {
    const other = items[index + delta];
    if (!other) return;
    const self = items[index];
    // Swap the two sort values rather than renumbering the whole category.
    onUpdateGalleryItem(self.id, { sortOrder: other.sortOrder ?? index + delta });
    onUpdateGalleryItem(other.id, { sortOrder: self.sortOrder ?? index });
  }

  const BTN = { background: "transparent", border: "1px solid rgba(203,108,230,0.35)", color: "var(--muted)", borderRadius: 5, padding: "3px 7px", fontSize: 11, fontWeight: 600 };

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div>
        <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "0 0 4px" }}>
          The tiles on the public gallery, grouped by package. Edit a caption in place; use the buttons on a
          tile to swap its image, reorder it, or take it down. New images belong in the site&apos;s
          <code> public/gallery/</code> folder, referenced as <code>/gallery/name.jpg</code> — served from our
          own repo rather than a third party&apos;s account.
        </p>
        {thin.length > 0 && (
          <p style={{ fontSize: 12.5, color: "#E8934A", margin: 0 }}>
            Thin on photos: <strong>{thin.join(", ")}</strong> — under five tiles each.
          </p>
        )}
      </div>

      {byCategory.map(({ category, items }) => (
        <div key={category}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8, gap: 10 }}>
            <div style={{ fontSize: 12, color: "var(--purple)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 }}>
              {category}
              <span style={{ color: items.length < 5 ? "#E8934A" : "var(--muted)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
                {" "}· {items.length} {items.length === 1 ? "tile" : "tiles"}
              </span>
            </div>
            <button type="button" onClick={() => { setAdding(adding === category ? null : category); setDraft({ image: "", caption: "" }); }}
              style={{ ...BTN, color: "var(--purple)", padding: "4px 10px", fontSize: 11.5, fontWeight: 700 }}>
              {adding === category ? "Cancel" : "+ Add"}
            </button>
          </div>

          {adding === category && (
            <div style={{ background: "var(--card)", borderRadius: 8, padding: 12, marginBottom: 10, display: "grid", gap: 8, maxWidth: 520 }}>
              <input autoFocus placeholder="/gallery/2025-09-06_char-bachelorette.jpg" value={draft.image}
                onChange={(e) => setDraft((d) => ({ ...d, image: e.target.value }))}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)", fontSize: 12.5 }} />
              <input placeholder="Caption shown under the tile" value={draft.caption}
                onChange={(e) => setDraft((d) => ({ ...d, caption: e.target.value }))}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)", fontSize: 12.5 }} />
              <button type="button" onClick={() => submit(category)}
                style={{ background: "var(--purple)", color: "#0A0612", border: "none", borderRadius: 6, padding: "8px 12px", fontSize: 12.5, fontWeight: 700, justifySelf: "start" }}>
                Add to {category}
              </button>
            </div>
          )}

          {/* A grid, not a stack. One tile per row left most of the screen empty
              and made a category of seven look far longer than it is. */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 12 }}>
            {items.map((g, i) => (
              <div key={g.id} style={{ background: "var(--card)", borderRadius: 8, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                <img src={g.image} alt="" style={{ width: "100%", height: 128, objectFit: "cover", objectPosition: imageFocus(g.image), display: "block" }} />
                <div style={{ padding: 8, display: "grid", gap: 6 }}>
                  <input defaultValue={g.caption} onBlur={(e) => onUpdateCaption(g.id, e.target.value)} placeholder="Caption…"
                    style={{ width: "100%", padding: "6px 8px", borderRadius: 5, border: "1px solid rgba(203,108,230,0.3)", fontSize: 12 }} />
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    <button type="button" onClick={() => move(items, i, -1)} disabled={i === 0} style={{ ...BTN, opacity: i === 0 ? 0.3 : 1 }}>←</button>
                    <button type="button" onClick={() => move(items, i, 1)} disabled={i === items.length - 1} style={{ ...BTN, opacity: i === items.length - 1 ? 0.3 : 1 }}>→</button>
                    <button type="button" onClick={() => replaceImage(g)} style={BTN}>Image</button>
                    <button type="button"
                      onClick={() => { if (window.confirm("Remove this tile from the public gallery?\n\nThe image file stays in public/gallery/ and can be added back.")) onDeleteGalleryItem(g.id); }}
                      style={{ ...BTN, color: "var(--pink)", borderColor: "rgba(240,85,156,0.4)", marginLeft: "auto" }}>Remove</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function MediaDraftsTab({ mediaDrafts, onUpdateStatus, onDelete, onAttachMedia }) {
  // Past drafts start hidden. They are a record, not a to-do list.
  const [showPast, setShowPast] = useState(false);
  const todayKey = localDateKey(new Date());

  const upcoming = mediaDrafts
    .filter((d) => !draftIsPast(d, todayKey))
    .sort((a, b) => draftSortKey(a).localeCompare(draftSortKey(b)));
  // Most recent first, so the thing that just went out is at the top.
  const past = mediaDrafts
    .filter((d) => draftIsPast(d, todayKey))
    .sort((a, b) => draftSortKey(b).localeCompare(draftSortKey(a)));

  const GRID = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 };
  const cardProps = { onUpdateStatus, onDelete, onAttachMedia };

  // Bucket the upcoming posts by the day they go out. `upcoming` is already in
  // date order, so walking it preserves that without sorting again — and a draft
  // with no date lands in its own bucket rather than being silently grouped with
  // whatever happened to be first.
  const upcomingByDay = [];
  for (const d of upcoming) {
    const day = d.scheduledDate || "unscheduled";
    const last = upcomingByDay[upcomingByDay.length - 1];
    if (last && last.day === day) last.items.push(d);
    else upcomingByDay.push({ day, items: [d] });
  }

  return (
    <div>
      <div style={{ fontWeight: 700, marginBottom: 8, color: "var(--text)" }}>
        Media drafts — {upcoming.length} coming up
        {past.length > 0 && <span style={{ color: "var(--muted)", fontWeight: 400 }}> · {past.length} done</span>}
      </div>
      <p style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 0, marginBottom: 12 }}>
        Soonest first. <strong style={{ color: "#E8934A" }}>Anything marked SCHEDULED goes out on its own</strong> —
        the publisher runs each morning and posts whatever is due. Use <em>Don&rsquo;t post</em> to stop one.
        Nothing in any other status is ever posted.
      </p>

      {/* The toggle sits above the grid, not below it. Underneath, it was past
          the end of a long scroll of cards and easy to miss entirely. */}
      {past.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <button type="button" onClick={() => setShowPast((v) => !v)}
            style={{ background: "transparent", color: "var(--muted)", border: "1px solid rgba(203,108,230,0.3)", borderRadius: 6, padding: "7px 12px", fontSize: 12.5, fontWeight: 600 }}>
            {showPast ? "▾" : "▸"} Already posted, denied or past ({past.length})
          </button>
          {showPast && (
            <div style={{ ...GRID, marginTop: 12, marginBottom: 6 }}>
              {past.map((d) => <MediaDraftCard key={d.id} d={d} {...cardProps} />)}
            </div>
          )}
        </div>
      )}

      {upcoming.length === 0 && (
        <div style={{ color: "var(--muted)", fontSize: 13.5 }}>
          Nothing scheduled ahead{past.length > 0 ? " — everything is in the list above." : "."}
        </div>
      )}

      {/* Boxed by day. Three posts going out on the same date are one piece of
          work in the owner's head -- the same idea told three ways -- and a flat
          grid made them look like three unrelated jobs sitting next to each
          other. Each day collapses, but opens by default: this is the list of
          what is still to come, so hiding it would defeat the point. */}
      {/* Two days abreast, fixed. auto-fill fitted a third column on a wide
          monitor, which squeezed each day's cards too narrow to read the
          caption they are being approved on. */}
      <div className="draft-days">
        {upcomingByDay.map(({ day, items }) => (
          <DraftDayGroup key={day} day={day} items={items} cardProps={cardProps} />
        ))}
      </div>
    </div>
  );
}

// One day's posts, boxed together and collapsible. Open by default.
function DraftDayGroup({ day, items, cardProps }) {
  // Sized so three fit across a day box; they wrap on a narrow screen.
  const DAY_GRID = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(158px, 1fr))", gap: 10 };
  const [open, setOpen] = useState(true);
  const platforms = [...new Set(items.map((d) => d.platform).filter(Boolean))];
  const label = day === "unscheduled" ? "No date set" : mediaDraftDate(day) || day;
  // Every post that day shares a time in practice; show it once rather than on
  // each card.
  const time = items.find((d) => d.scheduledTime)?.scheduledTime;

  return (
    <div style={{ border: "1px solid rgba(203,108,230,0.28)", borderRadius: 10, overflow: "hidden" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap",
          background: "rgba(203,108,230,0.08)", border: "none", borderBottom: open ? "1px solid rgba(203,108,230,0.2)" : "none",
          padding: "9px 13px", textAlign: "left", color: "var(--text)",
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 13.5 }}>{open ? "▾" : "▸"} {label}</span>
        {time && <span className="mono" style={{ fontSize: 11.5, color: "#4ff3ff" }}>{time}</span>}
        <span style={{ fontSize: 11.5, color: "var(--muted)", marginLeft: "auto" }}>
          {platforms.length ? platforms.join(" · ") : `${items.length} post${items.length === 1 ? "" : "s"}`}
        </span>
      </button>
      {open && (
        <div style={{ ...DAY_GRID, padding: 12 }}>
          {items.map((d) => <MediaDraftCard key={d.id} d={d} {...cardProps} />)}
        </div>
      )}
    </div>
  );
}

// ---- Review requests panel -------------------------------------------
//
// Lives inside the Testimonials tab rather than as its own tab: this is the
// "go get more reviews" half of the same job the tab already does (the grid
// below is the "moderate the ones we got" half).
//
// Which charters have already been asked is kept in the browser's
// localStorage, NOT in the database. Recording it properly wants a
// `reviewRequestedAt` column on ExternalBooking/Inquiry, which means a
// migration against the live Supabase database — deliberately not done here.
// Until then this is a single-owner, single-browser checklist: clearing site
// data or switching machines loses the marks, and the drafts still work.
const ASKED_STORAGE_KEY = "ny.reviewAsked.v1";

function loadAskedMarks() {
  try {
    const raw = window.localStorage.getItem(ASKED_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {}; // private browsing / storage disabled — the panel still works, it just forgets
  }
}

function saveAskedMarks(marks) {
  try {
    window.localStorage.setItem(ASKED_STORAGE_KEY, JSON.stringify(marks));
  } catch {
    // nothing sensible to do — the in-memory state stays correct for this session
  }
}

// navigator.clipboard needs a secure context; the textarea fallback covers
// the cases where it isn't available (plain-http localhost testing, older
// mobile browsers) so the button never silently does nothing.
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

// "asked 2 Sep" reads better than a flag saying only that it happened —
// knowing when the message went out is what tells you whether to chase.
function fmtAskedAt(v) {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d)) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function ReviewRequestsPanel({ inquiries, externalBookings, onUpdateExternalBooking, onUpdateInquiry }) {
  const [asked, setAsked] = useState({});
  const [templateChoice, setTemplateChoice] = useState("auto"); // "auto" | a TEMPLATES id
  const [filter, setFilter] = useState("todo"); // "todo" | "asked" | "all"

  // Whether this device can hand an sms: link to anything. Checked once after
  // mount rather than during render, because navigator does not exist on the
  // server and touching it there breaks the page.
  const [canSendSms, setCanSendSms] = useState(false);
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const ua = navigator.userAgent || "";
    const touch = (navigator.maxTouchPoints || 0) > 0;
    setCanSendSms(/iPhone|iPad|iPod|Android|Mobile/i.test(ua) || touch);
  }, []);
  const [flash, setFlash] = useState(""); // key of the row that just got copied
  const [previewKey, setPreviewKey] = useState(null);
  const [open, setOpen] = useState(true);

  // Ask-marks live on the booking row itself (reviewRequestedAt), not in
  // localStorage. The old browser-storage version lost every tick when site
  // data was cleared and did not follow the owner between the phone and the
  // desktop — which broke the moment texting from the phone became the whole
  // point. localStorage is still read once on mount so marks made before this
  // change are not silently lost; anything found there is written through to
  // the database and then forgotten.
  useEffect(() => {
    const legacy = loadAskedMarks();
    if (!legacy || !Object.keys(legacy).length) return;
    setAsked(legacy);
  }, []);

  function markAsked(key, on, row) {
    // Optimistic: the tick moves immediately, the write follows.
    setAsked((prev) => {
      const next = { ...prev };
      if (on) next[key] = new Date().toISOString();
      else delete next[key];
      saveAskedMarks(next);
      return next;
    });
    const target = row || null;
    if (!target) return;
    const value = on ? new Date().toISOString() : null;
    if (target.kind === "external" && onUpdateExternalBooking) {
      onUpdateExternalBooking(target.id, { reviewRequestedAt: value });
    } else if (target.kind === "site" && onUpdateInquiry) {
      onUpdateInquiry(target.id, { reviewRequestedAt: value });
    }
  }

  // Capture a phone number straight from this panel. The whole point is that
  // the owner is looking at the list of people to chase — making them navigate
  // to the Bookings tab to type a number they were just given at the dock is
  // exactly the friction that leaves 53 charters with no contact details.
  // Only external bookings can be written to here; a site Inquiry already
  // requires a phone at booking time.
  function savePhone(row, value) {
    if (row.kind !== "external" || !onUpdateExternalBooking) return;
    onUpdateExternalBooking(row.id, { phone: value });
  }

  // Only charters that actually happened can be asked about. Both a site
  // Inquiry marked "completed" and an ExternalBooking marked "completed" land
  // in the same unified "completed" bucket.
  const completed = toUnifiedRows(inquiries, externalBookings)
    .filter((r) => r.statusBucket === "completed")
    .map((r) => {
      const days = daysSince(r.date);
      return { ...r, key: `${r.kind}-${r.id}`, days, window: askWindow(days), askedAt: r.raw && r.raw.reviewRequestedAt };
    })
    // Freshest charters first — those are the ones worth chasing today.
    .sort((a, b) => (a.days ?? 99999) - (b.days ?? 99999));

  // Asked if the server row says so, or if this session just marked it and the
  // write has not round-tripped yet.
  const wasAsked = (r) => Boolean(r.askedAt || asked[r.key]);
  const askedCount = completed.filter(wasAsked).length;
  const rows =
    filter === "todo" ? completed.filter((r) => !wasAsked(r))
    : filter === "asked" ? completed.filter((r) => wasAsked(r))
    : completed;

  function draftFor(row) {
    const templateId = templateChoice === "auto" ? DEFAULT_TEMPLATE_FOR_DAYS(row.days) : templateChoice;
    return reviewMessage(templateId, row);
  }

  async function handleCopy(row) {
    const ok = await copyToClipboard(draftFor(row));
    setFlash(ok ? row.key : "");
    if (ok) {
      // Copying IS the ask, in practice — so it ticks the row off. The Undo
      // button on the row puts it back if you were only previewing.
      markAsked(row.key, true, row);
      setTimeout(() => setFlash(""), 1800);
    }
  }

  return (
    <div style={{ background: "var(--card)", borderRadius: 10, padding: 16, marginBottom: 20, color: "var(--text)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontWeight: 700 }}>
          Ask past guests for a Google review
          <span style={{ color: "var(--muted)", fontWeight: 400, fontSize: 12.5 }}>
            {" "}— {completed.length} completed charter{completed.length === 1 ? "" : "s"} · {askedCount} marked asked · {completed.length - askedCount} to go
          </span>
        </div>
        <button type="button" onClick={() => setOpen((v) => !v)}
          style={{ background: "transparent", color: "var(--muted)", border: "1px solid rgba(203,108,230,0.3)", borderRadius: 6, padding: "5px 11px", fontSize: 12, fontWeight: 600 }}>
          {open ? "▲ Hide" : "▼ Show"}
        </button>
      </div>

      {open && (
        <>
          <p style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 8, marginBottom: 12, maxWidth: 760, lineHeight: 1.55 }}>
            Neither platform hands over guest contact details, so every number here was typed in by you — and a guest with no
            number is a review that never gets asked for. <strong>Text it</strong> opens your messaging app with the message
            already written and ticks the charter off the list; <strong>Preview</strong> shows the wording first, and can copy it
            for pasting into a platform message thread instead. Some platforms strip outbound links — if that happens, switch
            the wording to <em>No link (platform-safe)</em>.
          </p>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
            <input readOnly value={GOOGLE_REVIEW_URL} onFocus={(e) => e.target.select()}
              className="mono"
              style={{ flex: "1 1 380px", minWidth: 260, padding: "7px 10px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)", background: "transparent", color: "var(--text)", fontSize: 11.5 }} />
            <button type="button" onClick={() => copyToClipboard(GOOGLE_REVIEW_URL).then((ok) => { setFlash(ok ? "__link" : ""); setTimeout(() => setFlash(""), 1800); })}
              style={{ background: "var(--purple)", color: "#0A0612", border: "none", borderRadius: 6, padding: "7px 12px", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>
              {flash === "__link" ? "Copied ✓" : "Copy link"}
            </button>
            <a href={GOOGLE_LISTING_URL} target="_blank" rel="noopener noreferrer"
              style={{ color: "var(--purple)", border: "1px solid var(--purple)", borderRadius: 6, padding: "6px 12px", fontSize: 12, fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap" }}>
              Open listing
            </a>
          </div>

          <div style={{ background: "rgba(203,108,230,0.07)", border: "1px solid rgba(203,108,230,0.2)", borderRadius: 8, padding: "10px 12px", marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: "var(--purple)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
              Say this at the dock — it beats every message
            </div>
            <div style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--text)", opacity: 0.9 }}>{DOCK_SCRIPT}</div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
            <label style={{ fontSize: 12, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}>
              Wording
              <select value={templateChoice} onChange={(e) => setTemplateChoice(e.target.value)}
                style={{ padding: "5px 8px", borderRadius: 5, border: "1px solid rgba(203,108,230,0.3)", fontSize: 12 }}>
                <option value="auto">Suggested (by age)</option>
                {TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </label>
            <div style={{ display: "flex", gap: 4 }}>
              {[["todo", "Still to ask"], ["asked", "Already asked"], ["all", "Every charter"]].map(([id, label]) => (
                <button key={id} type="button" onClick={() => setFilter(id)}
                  style={{
                    padding: "4px 10px", borderRadius: 5, fontSize: 12, fontWeight: 600,
                    border: "1px solid var(--purple)", cursor: "pointer",
                    background: filter === id ? "var(--purple)" : "transparent",
                    color: filter === id ? "#0A0612" : "var(--text)",
                  }}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {rows.length === 0 && (
            <div style={{ color: "var(--muted)", fontSize: 13 }}>
              {completed.length === 0
                ? "No completed charters yet — mark a booking Completed on the Bookings tab and it'll appear here."
                : "Every completed charter is marked asked. Nice work."}
            </div>
          )}

          {rows.length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 820, fontSize: 12.5 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "var(--muted)", fontSize: 11 }}>
                    <th style={{ padding: "4px 8px" }}>Charter</th>
                    <th style={{ padding: "4px 8px" }}>Guest</th>
                    <th style={{ padding: "4px 8px" }}>Phone</th>
                    <th style={{ padding: "4px 8px" }}>Vessel</th>
                    <th style={{ padding: "4px 8px" }}>Ask via</th>
                    <th style={{ padding: "4px 8px" }}>Window</th>
                    <th style={{ padding: "4px 8px" }}>Draft</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const w = ASK_WINDOWS[r.window];
                    const isAsked = wasAsked(r);
                    return (
                      <Fragment key={r.key}>
                        <tr style={{ background: "rgba(255,255,255,0.02)" }}>
                          <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                            <div className="mono" style={{ color: r.bookingId ? "#E8934A" : "var(--muted)", fontSize: 11 }}>{r.bookingId || "—"}</div>
                            <div style={{ color: "var(--muted)", fontSize: 11 }}>{r.date || "—"}</div>
                          </td>
                          <td style={{ padding: "6px 8px", fontWeight: 600 }}>{r.name || "Guest"}</td>
                          {/* The number itself, not just whether one exists —
                              this is the tab where you decide who to text, and
                              a guest with no number is the whole reason a
                              review never gets asked for. */}
                          <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                            {r.phone ? (
                              <a href={`tel:${normalizePhone(r.phone) || r.phone}`}
                                className="mono"
                                style={{ color: "var(--text)", fontSize: 12, textDecoration: "none", borderBottom: "1px dotted rgba(203,108,230,0.5)" }}>
                                {prettyPhone(r.phone)}
                              </a>
                            ) : (
                              <input
                                type="tel"
                                placeholder="Add phone…"
                                defaultValue=""
                                onBlur={(e) => { const v = e.target.value.trim(); if (v) savePhone(r, v); }}
                                onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                                style={{ width: 118, padding: "4px 8px", borderRadius: 6, border: "1px solid rgba(232,147,74,0.5)", background: "transparent", color: "var(--text)", fontSize: 11.5 }}
                              />
                            )}
                          </td>
                          <td style={{ padding: "6px 8px" }}>{r.vesselName || "—"}</td>
                          <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                            {channelFor(r.source)}
                            {r.email && <div style={{ color: "var(--muted)", fontSize: 11 }}>{r.email}</div>}
                          </td>
                          <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                            <span className="mono" style={{ fontSize: 10.5, fontWeight: 700, color: isAsked ? "#7FE0B8" : w.color, textTransform: "uppercase", letterSpacing: "0.03em" }}>
                              {isAsked ? "ASKED" : w.label}
                            </span>
                            <div style={{ color: "var(--muted)", fontSize: 11 }}>
                              {isAsked && r.askedAt
                                ? fmtAskedAt(r.askedAt)
                                : r.days == null ? "—" : r.days === 0 ? "today" : `${r.days} day${r.days === 1 ? "" : "s"} ago`}
                            </div>
                          </td>
                          <td style={{ padding: "6px 8px" }}>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                              {/* Two actions: read it, send it. Texting is the
                                  whole point — guests hand over a phone number
                                  far more readily than an email, and the review
                                  link opens on the phone already in their hand.
                                  Copying lives inside the preview, next to the
                                  text it copies, for when the console is open on
                                  a desktop where an sms: link may not fire. */}
                              {smsHref(r.phone, draftFor(r)) && (
                                <a
                                  href={smsHref(r.phone, draftFor(r))}
                                  onClick={(e) => {
                                    // Marking someone asked for a message that
                                    // cannot be sent is worse than not marking
                                    // them: the record says done and the guest
                                    // heard nothing.
                                    if (!canSendSms) {
                                      e.preventDefault();
                                      window.alert(
                                        "This only works on a phone.\n\nA desktop has nothing to hand an sms: link to, so no message would be sent — and ticking it off here would record an ask that never happened.\n\nOpen the console on your phone and tap Text it there, or use Preview to copy the wording and send it another way."
                                      );
                                      return;
                                    }
                                    markAsked(r.key, true, r);
                                  }}
                                  style={{
                                    color: canSendSms ? "#0A0612" : "var(--muted)",
                                    background: canSendSms ? "var(--pink)" : "transparent",
                                    border: "1px solid " + (canSendSms ? "var(--pink)" : "rgba(203,108,230,0.3)"),
                                    borderRadius: 6, padding: "5px 12px", fontSize: 11.5, fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap",
                                  }}>
                                  {canSendSms ? "Text it" : "Text it (phone only)"}
                                </a>
                              )}
                              <button type="button" onClick={() => setPreviewKey(previewKey === r.key ? null : r.key)}
                                style={{ background: "transparent", color: "var(--text)", border: "1px solid rgba(203,108,230,0.35)", borderRadius: 6, padding: "5px 10px", fontSize: 11.5, fontWeight: 600 }}>
                                {previewKey === r.key ? "Hide" : "Preview"}
                              </button>
                              {r.email && (
                                <a
                                  href={`mailto:${encodeURIComponent(r.email)}?subject=${encodeURIComponent(reviewSubject())}&body=${encodeURIComponent(draftFor(r))}`}
                                  onClick={() => markAsked(r.key, true, r)}
                                  style={{ color: "var(--purple)", border: "1px solid var(--purple)", borderRadius: 6, padding: "4px 10px", fontSize: 11.5, fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap" }}>
                                  Email draft
                                </a>
                              )}
                              {isAsked && (
                                <button type="button" onClick={() => markAsked(r.key, false, r)}
                                  style={{ background: "transparent", color: "var(--muted)", border: "1px solid rgba(203,108,230,0.25)", borderRadius: 6, padding: "5px 10px", fontSize: 11.5, fontWeight: 600 }}>
                                  Undo ask
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {previewKey === r.key && (
                          <tr>
                            <td colSpan={7} style={{ padding: "0 8px 10px" }}>
                              <textarea readOnly value={draftFor(r)} rows={11}
                                style={{ width: "100%", padding: "10px 12px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)", background: "rgba(0,0,0,0.25)", color: "var(--text)", fontSize: 12.5, fontFamily: "inherit", lineHeight: 1.5, resize: "vertical" }} />
                              <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
                                <button type="button" onClick={() => handleCopy(r)}
                                  style={{ background: "transparent", color: "var(--purple)", border: "1px solid rgba(203,108,230,0.4)", borderRadius: 6, padding: "4px 10px", fontSize: 11.5, fontWeight: 600 }}>
                                  {flash === r.key ? "Copied ✓" : "Copy"}
                                </button>
                                <span style={{ color: "var(--muted)", fontSize: 11 }}>
                                  {r.phone
                                    ? "Text it opens your messaging app with this already written. On a desktop that may not fire — copy it instead."
                                    : "Add a phone number above and this can be sent as a text."}
                                </span>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
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

function TestimonialsTab({ testimonials, inquiries, externalBookings, onUpdateStatus, onDelete, onUpdateExternalBooking, onUpdateInquiry }) {
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
      <ReviewRequestsPanel inquiries={inquiries || []} externalBookings={externalBookings || []} onUpdateExternalBooking={onUpdateExternalBooking} onUpdateInquiry={onUpdateInquiry} />
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

// ---- Tax Report tab -------------------------------------------------

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// "The Nauti Explorer" and "Nauti Explorer" are the same boat, and both are in
// the live data — $6,653 filed under one and $3,873 under the other. Without
// this, a by-vessel breakdown shows the Explorer twice and neither figure is
// the truth.
function normalizeVesselLabel(name) {
  const s = String(name || "").trim().replace(/^the\s+/i, "");
  return s || "No vessel recorded";
}

function TaxReportTab({ ledger, subscriptions, externalBookings = [] }) {
  const currentYear = new Date().getFullYear();
  const years = Array.from(new Set(ledger.map((l) => l.date && l.date.slice(0, 4)).filter(Boolean)));
  if (!years.includes(String(currentYear))) years.push(String(currentYear));
  years.sort((a, b) => b.localeCompare(a));

  const [year, setYear] = useState(years[0] || String(currentYear));

  const yearLedger = ledger.filter((l) => l.date && l.date.startsWith(year));
  const income = yearLedger.filter((l) => l.type === "income");
  const expenses = yearLedger.filter((l) => l.type === "expense");
  const totalIncome = income.reduce((sum, l) => sum + Number(l.amount || 0), 0);
  const totalExpense = expenses.reduce((sum, l) => sum + Number(l.amount || 0), 0);
  const net = totalIncome - totalExpense;

  const expenseBreakdown = groupTotals(expenses, (l) => stripCategoryPrefix(l.category));
  const incomeBreakdown = groupTotals(income, (l) => stripCategoryPrefix(l.category));

  // Every income row carries "Reservation" as its category, so grouping income
  // by category produces a single row and tells you nothing. These answer
  // questions that can actually change a decision.
  const incomeByVessel = groupTotals(income, (l) => normalizeVesselLabel(l.subcategory));
  const incomeByOrigin = groupTotals(income, (l) => String(l.origin || "").trim() || "No origin recorded");

  // Averages need the bookings, not the ledger: a charter can produce two
  // income rows (Boatsetter pays the boat leg and the captain fee separately),
  // so counting ledger rows would understate what a trip is worth by roughly
  // half.
  const yearCharters = externalBookings.filter(
    (b) => b.status === "completed" && b.date && b.date.startsWith(year)
  );
  const charterCount = yearCharters.length;
  const totalHours = yearCharters.reduce((s, b) => s + (Number(b.hours) || 0), 0);
  const perCharter = charterCount ? totalIncome / charterCount : 0;
  const perHour = totalHours ? totalIncome / totalHours : 0;

  // Income with no vessel on it cannot be attributed to a boat, which is worth
  // saying out loud rather than quietly folding into a bucket.
  const unattributedRows = income.filter((l) => !String(l.subcategory || "").trim());
  const unattributed = unattributedRows.reduce((s, l) => s + Number(l.amount || 0), 0);

  const activeSubs = subscriptions.filter((s) => s.active);
  const annualSubscriptionCost = activeSubs.reduce((sum, s) => sum + monthlyAmount(s) * 12, 0);

  function exportYearCsv() {
    const rows = [
      ["Date", "Type", "Category", "Amount", "Origin", "Booking ID", "Vessel/Package", "Note"],
      ...yearLedger
        .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
        .map((l) => [l.date, l.type, stripCategoryPrefix(l.category) || "", l.amount, l.origin || "", l.bookingId || "", l.subcategory || "", l.note || ""]),
    ];
    downloadCsv(`nauti-yachti-tax-report-${year}.csv`, rows);
  }

  function exportSubscriptionsCsv() {
    const rows = [
      ["Name", "Category", "Amount", "Billing cycle", "Annualized cost", "Vendor", "Active"],
      ...subscriptions.map((s) => [s.name, s.category || "", s.amount, s.billingCycle, (monthlyAmount(s) * 12).toFixed(2), s.vendor || "", s.active ? "yes" : "no"]),
    ];
    downloadCsv(`nauti-yachti-subscriptions-${year}.csv`, rows);
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ fontSize: 13, color: "var(--muted)" }}>
          Tax year{" "}
          <select value={year} onChange={(e) => setYear(e.target.value)}
            style={{ padding: "7px 10px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)", marginLeft: 6 }}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <button type="button" onClick={exportYearCsv}
          style={{ background: "linear-gradient(135deg, var(--purple), var(--pink))", color: "#0A0612", border: "none", borderRadius: 6, padding: "9px 16px", fontWeight: 700, fontSize: 13 }}>
          Download {year} income & expense CSV
        </button>
        <button type="button" onClick={exportSubscriptionsCsv}
          style={{ background: "transparent", color: "var(--text)", border: "1px solid var(--purple)", borderRadius: 6, padding: "9px 16px", fontWeight: 600, fontSize: 13 }}>
          Download subscriptions CSV
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(124px, 1fr))", gap: 10 }}>
        <StatCard label={`${year} total income`} value={currency(totalIncome)} color="var(--purple)" />
        <StatCard label={`${year} total expenses`} value={currency(totalExpense)} color="var(--pink)" />
        <StatCard label={`${year} net profit`} value={currency(net)} color="#E8934A" />
        <StatCard label="Annual recurring subscription cost" value={currency(annualSubscriptionCost)} color="#00d9ff" />
      </div>

      <p style={{ fontSize: 12.5, color: "var(--muted)", maxWidth: 640 }}>
        This isn't a filed tax form — it's a plain summary of everything logged in the Income &amp; expenses and Subscriptions tabs for the selected year, exportable as CSV to hand to a bookkeeper or drop into tax software. Categories below mirror the expense categories used when logging entries.
      </p>

      {/* Per charter and per hour are the two numbers that actually inform a
          pricing decision, and neither existed anywhere before. */}
      {charterCount > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(124px, 1fr))", gap: 10 }}>
          <StatCard label={`${year} completed charters`} value={String(charterCount)} color="var(--purple)" />
          <StatCard label="Average per charter" value={currency(perCharter)} color="#7FE0B8" />
          <StatCard label="Average per hour" value={totalHours ? currency(perHour) : "—"} color="#4ff3ff" />
          <StatCard label="Hours on the water" value={totalHours ? `${totalHours} hr` : "—"} color="var(--muted)" />
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
        <BreakdownPanel title={`${year} expenses by category`} rows={expenseBreakdown} color="#F0559C" />
        <BreakdownPanel title={`${year} income by vessel`} rows={incomeByVessel} color="#7FE0B8" />
        <BreakdownPanel title={`${year} income by origin`} rows={incomeByOrigin} color="#00d9ff" />
      </div>

      {unattributed > 0 && (
        <div style={{ fontSize: 12.5, color: "#E8934A", background: "rgba(232,147,74,0.08)", border: "1px solid rgba(232,147,74,0.35)", borderRadius: 8, padding: "10px 12px" }}>
          <div style={{ marginBottom: 6 }}>
            <strong>{currency(unattributed)}</strong> of {year} income has no vessel recorded, so it cannot be
            attributed to a boat above. These are the entries — set a vessel on each in the Income &amp; expenses tab.
          </div>
          <div style={{ display: "grid", gap: 4 }}>
            {unattributedRows
              .slice()
              .sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0))
              .map((l) => (
                <div key={l.id} style={{ display: "flex", gap: 10, alignItems: "baseline", color: "var(--text)" }}>
                  <span className="mono" style={{ whiteSpace: "nowrap", color: "#E8934A", fontWeight: 700 }}>{currency(l.amount)}</span>
                  <span className="mono" style={{ whiteSpace: "nowrap", color: "var(--muted)", fontSize: 11.5 }}>{l.date}</span>
                  <span style={{ color: "var(--muted)", fontSize: 11.5 }}>{l.origin || "—"}</span>
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11.5 }}>
                    {l.note || "(no note)"}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      <div style={{ fontSize: 11.5, color: "var(--muted)", maxWidth: 720 }}>
        Income by category is not shown: every reservation is logged under the single category
        &ldquo;Reservation&rdquo;, so it would be one row totalling everything. Vessel and origin are the
        splits that say something. Note that origin currently mixes how a booking was won
        (Instagram, Friends) with how it was paid (Zelle, Venmo, Cash) — worth tidying at source.
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

// Gift certificates.
//
// The model, the purchase flow and the validate endpoint have all existed for a
// while; there was simply no way to see any of it. Somebody could buy one on the
// site and the owner would have no way to know it existed, check a balance, or
// answer "is this code still good" when a guest reads it down the phone.
//
// The outstanding balance is a real liability -- money already taken for
// charters not yet run -- so it leads.
function GiftCertificatesTab({ certificates = [], liability = 0, onIssue, onRedeem, loading }) {
  const empty = { initialAmount: "", purchaserName: "", purchaserEmail: "", recipientName: "", expiresAt: "", message: "" };
  const [form, setForm] = useState(empty);
  const [showIssue, setShowIssue] = useState(false);

  const active = certificates.filter((c) => c.status === "active" && c.balance > 0);
  const spent = certificates.filter((c) => c.balance <= 0 || c.status === "redeemed");
  const voided = certificates.filter((c) => c.status === "void");

  async function submit(e) {
    e.preventDefault();
    const amount = Number(form.initialAmount);
    if (!amount || amount <= 0) return;
    await onIssue({ ...form, initialAmount: amount });
    setForm(empty);
    setShowIssue(false);
  }

  function redeem(c) {
    const raw = window.prompt(
      `How much of ${c.code} is being used?\n\nBalance is ${currency(c.balance)}. Enter a smaller figure to part-redeem it — the rest stays on the certificate.`,
      String(c.balance)
    );
    if (raw === null) return;
    const amount = Number(raw);
    if (!amount || amount <= 0 || amount > c.balance) {
      window.alert("That has to be a number above zero and no more than the remaining balance.");
      return;
    }
    onRedeem(c.id, amount);
  }

  const CARD = { background: "var(--card)", borderRadius: 10, padding: 14 };

  function Row({ c }) {
    const used = (c.initialAmount || 0) - (c.balance || 0);
    return (
      <div style={{ padding: "9px 0", borderBottom: "1px solid rgba(203,108,230,0.1)" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <span className="mono" style={{ fontWeight: 700, color: "var(--purple)" }}>{c.code}</span>
          <span className="mono" style={{ fontWeight: 700, color: c.balance > 0 ? "#7FE0B8" : "var(--muted)" }}>
            {currency(c.balance)}
          </span>
          {used > 0 && <span style={{ fontSize: 11.5, color: "var(--muted)" }}>of {currency(c.initialAmount)} · {currency(used)} used</span>}
          {c.expiresAt && <span style={{ fontSize: 11.5, color: "#E8934A" }}>expires {c.expiresAt}</span>}
          {c.stripeSessionId && <span style={{ fontSize: 10.5, color: "var(--muted)", border: "1px solid rgba(203,108,230,0.3)", borderRadius: 4, padding: "1px 6px" }}>bought online</span>}
          {c.balance > 0 && c.status === "active" && (
            <button type="button" onClick={() => redeem(c)}
              style={{ marginLeft: "auto", background: "transparent", color: "var(--purple)", border: "1px solid rgba(203,108,230,0.4)", borderRadius: 5, padding: "3px 10px", fontSize: 11.5, fontWeight: 700 }}>
              Redeem
            </button>
          )}
        </div>
        <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>
          {c.purchaserName ? `from ${c.purchaserName}` : "purchaser not recorded"}
          {c.recipientName ? ` · for ${c.recipientName}` : ""}
          {c.purchaserEmail ? ` · ${c.purchaserEmail}` : ""}
          {c.issuedAt ? ` · issued ${String(c.issuedAt).slice(0, 10)}` : ""}
        </div>
        {c.redemptions && c.redemptions.length > 0 && (
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>
            {c.redemptions.map((r) => `${currency(r.amount)} on ${String(r.redeemedAt).slice(0, 10)}${r.bookingId ? " · " + r.bookingId : ""}`).join("  ·  ")}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(124px, 1fr))", gap: 10 }}>
        <StatCard label="Outstanding balance" value={currency(liability)} color="#E8934A" />
        <StatCard label="Active certificates" value={String(active.length)} color="var(--purple)" />
        <StatCard label="Fully used" value={String(spent.length)} color="var(--muted)" />
        <StatCard label="Issued in total" value={String(certificates.length)} color="#4ff3ff" />
      </div>

      <p style={{ fontSize: 12.5, color: "var(--muted)", margin: 0, maxWidth: 680 }}>
        The outstanding balance is money already taken for charters not yet run — a real liability, not
        income. A certificate bought on the website appears here on its own; use <strong>Issue one</strong>
        for a certificate sold by hand.
      </p>

      <div>
        <button type="button" onClick={() => setShowIssue((v) => !v)}
          style={{ background: showIssue ? "transparent" : "var(--purple)", color: showIssue ? "var(--purple)" : "#0A0612", border: "1px solid var(--purple)", borderRadius: 6, padding: "8px 14px", fontWeight: 700, fontSize: 13 }}>
          {showIssue ? "Cancel" : "Issue one"}
        </button>
        {showIssue && (
          <form onSubmit={submit} style={{ ...CARD, marginTop: 10, display: "grid", gap: 8, maxWidth: 460 }}>
            <input type="number" step="0.01" placeholder="Face value, e.g. 250" required value={form.initialAmount}
              onChange={(e) => setForm({ ...form, initialAmount: e.target.value })}
              style={{ padding: "9px 10px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)" }} />
            <input placeholder="Who bought it" value={form.purchaserName}
              onChange={(e) => setForm({ ...form, purchaserName: e.target.value })}
              style={{ padding: "9px 10px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)" }} />
            <input placeholder="Their email (optional)" value={form.purchaserEmail}
              onChange={(e) => setForm({ ...form, purchaserEmail: e.target.value })}
              style={{ padding: "9px 10px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)" }} />
            <input placeholder="Who it is for (optional)" value={form.recipientName}
              onChange={(e) => setForm({ ...form, recipientName: e.target.value })}
              style={{ padding: "9px 10px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)" }} />
            <label style={{ fontSize: 11.5, color: "var(--muted)" }}>
              Expires (leave blank for never)
              <input type="date" value={form.expiresAt}
                onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                style={{ width: "100%", padding: "9px 10px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)", marginTop: 3 }} />
            </label>
            <input placeholder="Message on the certificate (optional)" value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              style={{ padding: "9px 10px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)" }} />
            <button type="submit"
              style={{ background: "linear-gradient(135deg, var(--purple), var(--pink))", color: "#0A0612", border: "none", borderRadius: 6, padding: "10px", fontWeight: 700 }}>
              Issue certificate
            </button>
          </form>
        )}
      </div>

      <div style={CARD}>
        <div style={{ fontWeight: 700, marginBottom: 6, color: "var(--text)" }}>
          Still has a balance ({active.length})
        </div>
        {loading && <div style={{ color: "var(--muted)", fontSize: 13 }}>Loading…</div>}
        {!loading && active.length === 0 && (
          <div style={{ color: "var(--muted)", fontSize: 13.5, fontStyle: "italic" }}>
            None outstanding. Certificates bought on the website will appear here automatically.
          </div>
        )}
        {active.map((c) => <Row key={c.id} c={c} />)}
      </div>

      {(spent.length > 0 || voided.length > 0) && (
        <div style={CARD}>
          <div style={{ fontWeight: 700, marginBottom: 6, color: "var(--muted)" }}>
            Fully used or void ({spent.length + voided.length})
          </div>
          {[...spent, ...voided].map((c) => <Row key={c.id} c={c} />)}
        </div>
      )}
    </div>
  );
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(124px, 1fr))", gap: 10, maxWidth: 480 }}>
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

// "14:30" -> "2:30 PM". Returns null (not shown) for a missing time rather
// than a placeholder — most site-originated bookings don't have one yet.
function jarvisFmtTime(timeStr) {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
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
// Angular, beveled panel corner — the established Jarvis HUD look (see the
// standalone Jarvis-Voice-UI's .panel for the non-admin-console version of
// this same aesthetic). Cuts the top-right and bottom-left corners at 45°.
const jarvisPanelClip = "polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 14px 100%, 0 calc(100% - 14px))";

function JarvisPanel({ title, children, wide }) {
  return (
    <div
      // A panel holding a list of things to act on needs more width than a
      // panel holding one number, so it can span two grid columns.
      className={wide ? "jarvis-panel-wide" : undefined}
      style={{
        background: "rgba(0,217,255,0.04)", border: "1px solid #0ea5e9", borderRadius: 4,
        // Extra bottom padding because clipPath cuts a 14px triangle out of the
        // bottom-left corner — without the clearance it slices through the last
        // line of whatever the panel is showing.
        padding: "16px 18px 22px", clipPath: jarvisPanelClip,
        boxShadow: "0 0 16px rgba(0,217,255,0.08) inset",
        position: "relative",
        // Grid stretches every panel in a row to match the tallest, so the panel
        // is a flex column and its body takes the leftover height. Scroll areas
        // inside can then fill the panel instead of being pinned to an
        // arbitrary pixel height that leaves dead space below them.
        display: "flex", flexDirection: "column", height: "100%", minHeight: 0,
      }}
    >
      <div className="jarvis-font" style={{
        fontWeight: 700, fontSize: 12.5, letterSpacing: "0.15em", textTransform: "uppercase", color: "#00d9ff",
        marginBottom: 12, textShadow: "0 0 8px rgba(0,217,255,0.5)", flexShrink: 0,
      }}>
        {title}
      </div>
      {/* minHeight:0 is what actually lets a nested overflow:auto child shrink
          and scroll — without it a flex child refuses to go below its content
          height and the scrollbar never engages. */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {children}
      </div>
    </div>
  );
}

// "Talk to Jarvis" — get the owner from this console to a text box where they
// can actually type at Claude.
//
// Two different situations, because a web page cannot reach a desktop app on a
// *different* machine:
//   - On the home PC, Windows has a `claude://` protocol handler registered for
//     the Claude desktop app, so we can hand off to it directly.
//   - From a phone or the laptop, that handler doesn't exist and nothing
//     happens, so we fall back to the web session list. The session has to have
//     Remote Control switched on for it to be reachable there.
// We can't feature-detect a protocol handler, so we try it and fall back if the
// page is still in the foreground shortly after — a successful hand-off blurs
// or hides this tab.
const JARVIS_WEB_SESSIONS_URL = "https://claude.ai/code";

function openJarvisSession() {
  let handedOff = false;
  const markHandedOff = () => { handedOff = true; };
  window.addEventListener("blur", markHandedOff, { once: true });
  document.addEventListener("visibilitychange", markHandedOff, { once: true });

  try {
    window.location.href = "claude://";
  } catch {
    // No handler on this device — the fallback below covers it.
  }

  window.setTimeout(() => {
    window.removeEventListener("blur", markHandedOff);
    document.removeEventListener("visibilitychange", markHandedOff);
    if (!handedOff && !document.hidden) {
      window.open(JARVIS_WEB_SESSIONS_URL, "_blank", "noopener,noreferrer");
    }
  }, 1200);
}

function JarvisTab({ audioEnabled, onEnableAudio, lastSpoken, messages, audioNote, analyserRef }) {
  const [dashboard, setDashboard] = useState(null);
  const [dashboardError, setDashboardError] = useState(false);
  const [agentActivity, setAgentActivity] = useState(null);
  const [agentActivityError, setAgentActivityError] = useState(false);
  // Runs only — the morning standup files eight status rows a day, which would
  // bury the actual work this panel exists to show.
  const jarvisRuns = (agentActivity || []).filter((a) => !isStatusRow(a));
  const [todos, setTodos] = useState([]);
  const [todoText, setTodoText] = useState("");
  const [todoError, setTodoError] = useState("");

  // To-do list — fetched once on mount (not polled; nothing else writes to
  // this table, so there's no need to re-poll every 30s like the shared
  // dashboard data).
  useEffect(() => {
    let cancelled = false;
    fetch("/api/jarvis-todos")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("bad status"))))
      .then((data) => { if (!cancelled) setTodos(data); })
      .catch(() => { if (!cancelled) setTodoError("Unable to load to-dos."); });
    return () => { cancelled = true; };
  }, []);

  async function addTodo(e) {
    e.preventDefault();
    const text = todoText.trim();
    if (!text) return;
    setTodoError("");
    try {
      const res = await fetch("/api/jarvis-todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error("bad status");
      const created = await res.json();
      setTodos((prev) => [...prev, created]);
      setTodoText("");
    } catch {
      setTodoError("Could not add that — try again.");
    }
  }

  async function toggleTodo(id, done) {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, done } : t)));
    try {
      const res = await fetch(`/api/jarvis-todos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done }),
      });
      if (!res.ok) throw new Error("bad status");
    } catch {
      setTodoError("Could not update that — try again.");
      setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, done: !done } : t)));
    }
  }

  async function deleteTodo(id) {
    const prevTodos = todos;
    setTodos((prev) => prev.filter((t) => t.id !== id));
    try {
      const res = await fetch(`/api/jarvis-todos/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("bad status");
    } catch {
      setTodoError("Could not delete that — try again.");
      setTodos(prevTodos);
    }
  }

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
  // Live voice waveform — draws whatever's actually coming out of the
  // Jarvis <audio> element (post gain/compressor) onto a canvas every
  // frame. Runs continuously once audio is enabled: a flat idle line
  // between utterances, a reactive pulse while speech is playing. The
  // AnalyserNode itself is created once in enableAudio() (see above) and
  // handed down via analyserRef, so this effect only needs to draw.
  const canvasRef = useRef(null);
  useEffect(() => {
    if (!audioEnabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    let raf;

    function draw() {
      raf = requestAnimationFrame(draw);
      const analyser = analyserRef.current;
      ctx.clearRect(0, 0, width, height);

      if (!analyser) {
        ctx.strokeStyle = "rgba(0,217,255,0.4)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();
        return;
      }

      const data = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(data);

      ctx.lineWidth = 2.5;
      ctx.strokeStyle = "#00d9ff";
      ctx.shadowColor = "#00d9ff";
      ctx.shadowBlur = 10;
      ctx.beginPath();
      const sliceWidth = width / data.length;
      let x = 0;
      for (let i = 0; i < data.length; i++) {
        const v = data[i] / 128.0; // ~1.0 at silence, swings 0-2 with signal
        const y = (v * height) / 2;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += sliceWidth;
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    draw();
    return () => cancelAnimationFrame(raf);
  }, [audioEnabled, analyserRef]);

  // Media-draft actions now live in SocialPipelinePanel, which owns the whole
  // proposed -> approved -> scheduled -> posted flow rather than just approve
  // and deny.

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
          <button type="button" onClick={openJarvisSession}
            className="jarvis-font"
            title="Opens the Claude session on the home PC, or the web session list from any other device"
            style={{
              background: "rgba(255,180,84,0.08)", color: "#ffb454", border: "1px solid #ffb454", borderRadius: 4,
              padding: "10px 18px", fontWeight: 700, fontSize: 12.5, letterSpacing: "0.1em",
              boxShadow: "0 0 12px rgba(255,180,84,0.2)", cursor: "pointer",
            }}>
            ✎ TALK TO JARVIS
          </button>
          <div style={{ fontSize: 17, lineHeight: 1.45, color: "#4ff3ff", opacity: 0.95 }}>
            {lastSpoken ? <>Latest: <span style={{ color: "#fff", fontSize: 18.5, fontWeight: 600 }}>&ldquo;{lastSpoken}&rdquo;</span></> : "Nothing from Jarvis yet."}
          </div>
        </div>
        {audioNote && <div style={{ color: "#ffb454", fontSize: 12.5, marginBottom: 16 }}>{audioNote}</div>}

        {/* The running transcript. Newest first, matching the owner's stated
            preference elsewhere in the console. A message with no audio was
            stored text-only because synthesis was unavailable — worth marking,
            so a silent message is obviously "not spoken" rather than "missed". */}
        {messages && messages.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div className="jarvis-font" style={{ fontSize: 11, letterSpacing: "0.14em", color: "#1c7a86", marginBottom: 8 }}>
              TRANSCRIPT
            </div>
            <div style={{
              maxHeight: 260, overflowY: "auto", display: "grid", gap: 10,
              border: "1px solid rgba(0,217,255,0.18)", borderRadius: 6, padding: "12px 14px",
              background: "rgba(0,0,0,0.25)",
            }}>
              {[...messages].reverse().map((m) => (
                <div key={m.id} style={{ borderBottom: "1px solid rgba(0,217,255,0.1)", paddingBottom: 8 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "baseline", marginBottom: 3 }}>
                    <span className="mono" style={{ fontSize: 10.5, color: "#1c7a86", whiteSpace: "nowrap" }}>
                      {new Date(m.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </span>
                    {!m.audioB64 && (
                      <span style={{ fontSize: 9.5, letterSpacing: "0.05em", color: "#ffb454", border: "1px solid #ffb454", borderRadius: 3, padding: "0 5px" }}>
                        TEXT ONLY
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 14.5, color: "#dffcff", lineHeight: 1.5 }}>{m.text}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{
          position: "relative", border: "1px solid rgba(0,217,255,0.25)", borderRadius: 6,
          background: "radial-gradient(ellipse at center, rgba(0,217,255,0.06) 0%, rgba(0,0,0,0.3) 80%)",
          padding: "10px 14px", marginBottom: 20,
        }}>
          <canvas ref={canvasRef} width={900} height={70} style={{ width: "100%", height: 70, display: "block" }} />
          {!audioEnabled && (
            <div className="jarvis-font" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10.5, letterSpacing: "0.15em", color: "#1c7a86" }}>
              ENABLE AUDIO TO ACTIVATE VOICE WAVEFORM
            </div>
          )}
        </div>

        {dashboardError && !dashboard && (
          <div style={{ color: "#ff4d5e", fontSize: 13, marginBottom: 16 }}>Unable to load dashboard data.</div>
        )}

        {/* Four columns on a wide screen, so the eight panels sit 4x2 and each
            has room to be read. See .jarvis-dashboard-grid in globals.css --
            the breakpoints are explicit so a wider monitor makes the panels
            bigger rather than squeezing in a fifth column. */}
        <div className="jarvis-dashboard-grid">
          <JarvisPanel title="Upcoming Bookings">
            {!dashboard && <div style={{ color: "#1c7a86", fontSize: 12.5 }}>Loading…</div>}
            {dashboard && bookings.length === 0 && <div style={{ color: "#1c7a86", fontSize: 12.5, fontStyle: "italic" }}>No bookings on record yet.</div>}
            {/* Always three rows: upcoming charters first, padded with the most
                recently completed ones when fewer than three are on the books.
                Past rows are dimmed and tagged so they can't be mistaken for
                something still to come. Scrolls once the list grows. */}
            <div style={{ flex: 1, minHeight: 120, overflowY: "auto" }}>
            {bookings.map((b, idx) => (
              <div key={idx} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: idx < bookings.length - 1 ? "1px solid rgba(0,217,255,0.12)" : "none", fontSize: 12.5, color: "#dffcff", opacity: b.isPast ? 0.62 : 1 }}>
                <span style={{ color: b.isPast ? "#4ff3ff" : "#ffb454", fontWeight: 700, whiteSpace: "nowrap" }}>
                  {jarvisFmtDate(b.date)}{jarvisFmtTime(b.startTime) ? ` · ${jarvisFmtTime(b.startTime)}` : ""}{b.hours ? ` · ${b.hours}h` : ""}
                </span>
                <span style={{ flex: 1 }}>
                  {b.isPast && (
                    <span style={{ display: "inline-block", marginRight: 6, padding: "0 5px", borderRadius: 3, border: "1px solid #4ff3ff", color: "#4ff3ff", fontSize: 9.5, letterSpacing: "0.04em", verticalAlign: "middle" }}>PAST</span>
                  )}
                  {b.name}{b.vessel ? ` · ${b.vessel}` : ""} — {b.label}{b.partySize ? ` · party of ${b.partySize}` : ""}{b.note ? ` (${b.note})` : ""}
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
            </div>
          </JarvisPanel>

          <JarvisPanel title="Needs Attention">
            {!attention && <div style={{ color: "#1c7a86", fontSize: 12.5 }}>Loading…</div>}
            {attention && [
              ["New inquiries", attention.newInquiries],
              ["Booked, unpaid", attention.unpaidConfirmed],
              ["Maintenance overdue", attention.overdueMaintenance],
            ].map(([label, val]) => (
              <div key={label} style={{ padding: "8px 0", borderBottom: "1px solid rgba(0,217,255,0.12)", fontSize: 13, color: "#dffcff" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>{label}</span>
                  <span style={{ fontWeight: 700, color: val > 0 ? "#ffb454" : "#dffcff" }}>{val}</span>
                </div>
                {label === "Maintenance overdue" && val > 0 && attention.overdueMaintenanceItems?.length > 0 && (
                  <div style={{ fontSize: 11, color: "#ffb454", opacity: 0.85, marginTop: 3 }}>
                    {attention.overdueMaintenanceItems.join(", ")}
                  </div>
                )}
              </div>
            ))}
          </JarvisPanel>

          <JarvisPanel title="Revenue — last 30 days">
            {!dashboard && <div style={{ color: "#1c7a86", fontSize: 12.5 }}>Loading…</div>}
            {dashboard && [
              ["Income", dashboard.revenue30d.income, "#7FE0B8"],
              ["Expenses", dashboard.revenue30d.expense, "#ff8fa8"],
              ["Net", dashboard.revenue30d.net, dashboard.revenue30d.net >= 0 ? "#7FE0B8" : "#ff8fa8"],
            ].map(([label, val, color]) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(0,217,255,0.12)", fontSize: 13, color: "#dffcff" }}>
                <span>{label}</span>
                <span className="mono" style={{ fontWeight: 700, color }}>{currency(val)}</span>
              </div>
            ))}
          </JarvisPanel>

          <JarvisPanel title="Subscriptions Due Soon">
            {!dashboard && <div style={{ color: "#1c7a86", fontSize: 12.5 }}>Loading…</div>}
            {dashboard && dashboard.subscriptionsDueSoon.length === 0 && (
              <div style={{ color: "#1c7a86", fontSize: 12.5, fontStyle: "italic" }}>Nothing with a due date set.</div>
            )}
            {dashboard && dashboard.subscriptionsDueSoon.map((s) => (
              <div key={s.name} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(0,217,255,0.12)", fontSize: 12.5, color: "#dffcff", gap: 8 }}>
                <span>{s.name}</span>
                <span style={{ textAlign: "right", flexShrink: 0 }}>
                  <span className="mono" style={{ fontWeight: 700 }}>{currency(s.amount)}</span>{" "}
                  <span style={{ color: s.daysUntilDue <= 3 ? "#ffb454" : "#1c7a86", fontSize: 11 }}>
                    ({s.daysUntilDue <= 0 ? "due" : `${s.daysUntilDue}d`})
                  </span>
                </span>
              </div>
            ))}
          </JarvisPanel>

          <JarvisPanel title="To-Do">
            <form onSubmit={addTodo} style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              <input
                type="text" value={todoText} onChange={(e) => setTodoText(e.target.value)} placeholder="Add a task…"
                style={{ flex: 1, minWidth: 0, padding: "7px 9px", borderRadius: 4, border: "1px solid rgba(0,217,255,0.3)", background: "rgba(0,217,255,0.05)", color: "#dffcff", fontSize: 12.5 }}
              />
              <button type="submit" style={{ background: "rgba(0,217,255,0.15)", color: "#00d9ff", border: "1px solid #00d9ff", borderRadius: 4, padding: "0 12px", fontSize: 12.5, fontWeight: 700 }}>+</button>
            </form>
            {todoError && <div style={{ color: "#ff4d5e", fontSize: 11.5, marginBottom: 8 }}>{todoError}</div>}
            {todos.length === 0 && <div style={{ color: "#1c7a86", fontSize: 12.5, fontStyle: "italic" }}>Nothing on the list.</div>}
            <div style={{ display: "grid", gap: 2, flex: 1, minHeight: 120, overflowY: "auto", alignContent: "start" }}>
              {todos.map((t) => (
                <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: "1px solid rgba(0,217,255,0.08)" }}>
                  <input type="checkbox" checked={t.done} onChange={(e) => toggleTodo(t.id, e.target.checked)} style={{ accentColor: "#00d9ff", flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 12.5, color: t.done ? "#1c7a86" : "#dffcff", textDecoration: t.done ? "line-through" : "none" }}>{t.text}</span>
                  <button type="button" onClick={() => deleteTodo(t.id)} style={{ background: "transparent", color: "#4ff3ff", border: "none", fontSize: 13, opacity: 0.6, flexShrink: 0 }}>✕</button>
                </div>
              ))}
            </div>
          </JarvisPanel>

          {/* One pipeline replacing the old Media Queue and Campaign Queue.
              They were two halves of the same job, and the seam between them
              was where work got stuck: approving a draft set a flag and
              stopped, with nothing to carry it to a date. */}
          <JarvisPanel title="Social Pipeline" wide>
            <SocialPipelinePanel />
          </JarvisPanel>


          {/* This is a feed of work, so the eight standup lines filed every
              morning are filtered out — they would otherwise be most of it. */}
          <JarvisPanel title="Agent Activity">
            {agentActivityError && !agentActivity && <div style={{ color: "#ff4d5e", fontSize: 12.5 }}>Unable to load agent activity.</div>}
            {!agentActivity && !agentActivityError && <div style={{ color: "#1c7a86", fontSize: 12.5 }}>Loading…</div>}
            {agentActivity && jarvisRuns.length === 0 && <div style={{ color: "#1c7a86", fontSize: 12.5, fontStyle: "italic" }}>No active tasks.</div>}
            {agentActivity && jarvisRuns.length > 0 && (
              <div style={{ display: "grid", gap: 10, flex: 1, minHeight: 140, overflowY: "auto", alignContent: "start" }}>
                {jarvisRuns.map((a) => {
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
    // minWidth: 0 overrides flexbox's default min-width:auto on a flex
    // item — without it, a long value (e.g. a negative net like
    // "$-1,448.51") refuses to shrink and visually overflows into
    // whatever sits next to this card instead of wrapping/clipping.
    <div style={{ background: "var(--card)", borderRadius: 10, padding: "10px 12px", borderTop: `3px solid ${color}` }}>
      <div style={{ fontSize: 11, color: "var(--muted)" }}>{label}</div>
      {/* tabular-nums keeps digits the same width so figures line up down a
          column; nowrap stops a dollar amount splitting mid-number. */}
      <div className="mono" style={{ fontSize: 15.5, fontWeight: 700, color: "var(--text)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}
