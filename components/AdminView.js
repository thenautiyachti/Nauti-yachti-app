"use client";

import { useState, useEffect, useRef, useCallback, createContext, useContext, Fragment } from "react";
import { currency, localDateKey, imageFocus } from "../lib/pricing";
import {
  GOOGLE_REVIEW_URL, GOOGLE_LISTING_URL, TEMPLATES, ASK_WINDOWS, DOCK_SCRIPT,
  channelFor, daysSince, askWindow, reviewMessage, reviewSubject, DEFAULT_TEMPLATE_FOR_DAYS,
  smsHref, normalizePhone,
} from "../lib/reviews";
import { isCrewListRow, isGuestContactRow, isRealInquiry, mailableCrewList, CREW_LIST_UNSUBSCRIBED_STATUS } from "../lib/crewList";
import { CREW, AGENT_STATUS, toSpokenForm, isStatusRow, crewInitials, latestRun, latestStatus, statusLines, isToday, isStale, isStalled } from "../lib/crew";
import { PRIORITY, parseItem, priorityOf, sortBoard } from "../lib/board";
import { PlatformIcon, PlatformLabel } from "./PlatformIcon";
import AvailabilityMonthGrid from "./AvailabilityMonthGrid";

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

  // Pearl's audio machinery lives at this level so switching
  // admin console tabs doesn't tear down the AudioContext/gain/compressor
  // graph or the 2s speech-polling loop. AdminView stays mounted for the
  // whole console session; only a full page reload should require the owner
  // to re-click the enable button. That button is in the console header now;
  // the Jarvis tab that used to hold it was retired on 3 Sep 2026, because six
  // of its seven panels had become duplicates of the Overview and the seventh
  // was the media pipeline, which moved to Marketing → Media Drafts where it
  // belonged.
  const [audioEnabled, setAudioEnabled] = useState(false);
  // The last thing said. Kept because speakCrew records it and it costs
  // nothing; nothing renders it since the Jarvis tab was retired, and each
  // agent's card already shows what she filed.
  // The most recent thing Pearl said, as a row rather than a string: the text
  // to show, and the audio to play if it is clicked.
  const [lastSpoken, setLastSpoken] = useState(null);
  const [pearlDismissed, setPearlDismissed] = useState(false);
  const [audioNote, setAudioNote] = useState("");
  const audioElRef = useRef(null);
  const audioCtxRef = useRef(null);
  const gainNodeRef = useRef(null);
  const analyserRef = useRef(null);
  const sinceRef = useRef(null);
  // Which agent is mid-sentence, so her avatar can show it and a second click
  // cannot start her talking over herself.
  const [speakingName, setSpeakingName] = useState("");
  // The same fact as a ref, because a click handler decides what to do based on
  // who is speaking RIGHT NOW, and React state inside a closure can be one
  // render behind. The state exists only so the badge can animate.
  const speakingNameRef = useRef("");
  // Incremented on every stop and every new click. Anything in flight compares
  // against it and gives up if it has moved -- which is what stops audio bought
  // a second ago from starting after you have already clicked her off.
  const speakTokenRef = useRef(0);
  // Every synthesized character is billed. A standup does not change between
  // two clicks a second apart, so the audio is kept against the exact words it
  // was made from and replayed from memory rather than bought twice. Cleared
  // on reload, which is the right lifetime -- it is a convenience, not a store.
  const spokenCacheRef = useRef(new Map());
  // Ids this component has already played directly from a POST response. The
  // 2s poll will see those same rows a moment later; without this it would say
  // everything a second time.
  const playedIdsRef = useRef(new Set());
  // There was a 2-second poll here that fetched every new SpeechEvent, kept a
  // running transcript of them, and played each one aloud.
  //
  // All three of those jobs are gone. Nothing speaks unless an avatar is
  // clicked, so there is nothing to play; the transcript it maintained was
  // never rendered anywhere after the Jarvis tab was retired, so it was state
  // nobody could see; and each agent's own card already shows exactly what she
  // filed. What was left was a request every two seconds, for the lifetime of
  // an open console, feeding nothing. The rows are still written and the GET
  // endpoint still serves them -- this only stops asking for them.
  // A light poll. It fetches the newest message so it can be SHOWN, and never
  // plays anything -- that is the difference from the loop this replaced,
  // which played every event that arrived and talked over whoever was already
  // speaking. Ten seconds, not two: this is a message from a person working
  // alongside him, not a live feed.
  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    async function poll() {
      if (inFlight) return;
      inFlight = true;
      try {
        const res = await fetch('/api/admin/speak');
        if (!res.ok || cancelled) return;
        const events = await res.json();
        if (!Array.isArray(events) || !events.length) return;
        const newest = events[events.length - 1];
        setLastSpoken((prev) => {
          if (prev && prev.id === newest.id) return prev;
          // A genuinely new message un-dismisses the strip. Dismissing one
          // should hide that message, not silence the channel.
          setPearlDismissed(false);
          return newest;
        });
      } catch {
        // transient; try again on the next tick
      } finally {
        inFlight = false;
      }
    }
    poll();
    const t = setInterval(poll, 10000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  // Play a stored message. It borrows the crew machinery deliberately, so
  // Pearl cannot talk over an agent and an agent cannot talk over her -- there
  // is one <audio> element and one speaker at a time, whoever it is.
  function playStored(ev) {
    if (!ev || !ev.audioB64) return;
    if (speakingNameRef.current === 'Nauti Pearl') { stopSpeaking(); return; }
    stopSpeaking();
    if (!audioEnabled) enableAudio();
    const el = audioElRef.current;
    if (!el) return;
    speakingNameRef.current = 'Nauti Pearl';
    setSpeakingName('Nauti Pearl');
    const done = () => {
      el.removeEventListener('ended', done);
      el.removeEventListener('error', done);
      speakingNameRef.current = '';
      setSpeakingName('');
    };
    el.addEventListener('ended', done);
    el.addEventListener('error', done);
    el.src = 'data:audio/mpeg;base64,' + ev.audioB64;
    el.currentTime = 0;
    el.play().catch(() => done());
  }

  // Read one agent's own standup aloud, in her own voice.
  //
  // The rules, which the first version got wrong by letting two of them talk at
  // once: only ever the agent who was clicked; clicking her again stops her;
  // clicking her after that starts her from the beginning; clicking anyone else
  // stops whoever is talking first. There is one <audio> element, so overlap
  // was never really two voices -- it was requests landing out of order and
  // stamping on each other mid-sentence, which sounds the same and is worse.
  const stopSpeaking = useCallback(() => {
    // Bumping the token invalidates any request still in flight, so audio that
    // was already bought cannot start playing after a stop.
    speakTokenRef.current += 1;
    speakingNameRef.current = "";
    const el = audioElRef.current;
    if (el) { try { el.pause(); el.currentTime = 0; } catch {} }
    setSpeakingName("");
  }, []);

  const speakCrew = useCallback(async (r, text) => {
    if (!text) return;

    // Clicking whoever is already talking stops her. State is read from the ref
    // rather than the closure: a click handler can hold a render's worth of
    // stale state, and this decision has to be right at the moment of the click.
    if (speakingNameRef.current === r.name) { stopSpeaking(); return; }

    // Clicking anyone else stops the current speaker before starting the new
    // one. This is what makes "only the one I clicked" true.
    stopSpeaking();

    // A click IS the user gesture a browser wants before it will play anything,
    // so there is no separate button to find first.
    if (!audioEnabled) enableAudio();

    const el = audioElRef.current;
    const key = r.name + "|" + text;
    const token = speakTokenRef.current;
    const current = () => speakTokenRef.current === token;

    const play = (b64) => new Promise((resolve) => {
      if (!b64 || !el || !current()) return resolve();
      el.src = "data:audio/mpeg;base64," + b64;
      el.currentTime = 0; // always from the beginning, never resumed
      const done = () => {
        el.removeEventListener("ended", done);
        el.removeEventListener("error", done);
        resolve();
      };
      el.addEventListener("ended", done);
      el.addEventListener("error", done);
      el.play().catch(() => done());
    });

    speakingNameRef.current = r.name;
    setSpeakingName(r.name);
    try {
      const cached = spokenCacheRef.current.get(key);
      if (cached) { await play(cached); return; }

      const res = await fetch("/api/admin/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // agent picks the voice; immediate brings the audio back on this
        // response instead of making a click wait for the next poll tick.
        body: JSON.stringify({ text, agent: r.name, immediate: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.audioB64) spokenCacheRef.current.set(key, data.audioB64);
      if (!current()) return; // stopped, or someone else was clicked, while we waited
      if (data.audioB64) await play(data.audioB64);
      else if (data.reason) setAudioNote(r.name.replace("Nauti ", "") + " could not speak: " + data.reason);
    } catch {
      if (current()) setAudioNote("Could not reach the speech service.");
    } finally {
      if (current()) { speakingNameRef.current = ""; setSpeakingName(""); }
    }
  }, [audioEnabled, stopSpeaking]);

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
        // plays, so the visualizer reacts to what Pearl is really saying —
        // not the raw pre-boost audio.
        const analyser = audioCtxRef.current.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.75;
        compressor.connect(analyser);
        analyserRef.current = analyser;

        gainNodeRef.current = gain;
      } catch (err) {
        console.error("Pearl audio gain boost setup failed:", err);
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
    <CrewSpeechContext.Provider value={{ speak: speakCrew, speakingName }}>
    <div style={{ minHeight: "100vh", background: "var(--ink)" }}>
      {/* Persists across tab switches — see Pearl's audio state above. */}
      <audio ref={audioElRef} style={{ display: "none" }} />
      <div className="console-header" style={{ background: "var(--ink-soft)", color: "var(--text)", padding: "14px 24px", borderBottom: "1px solid rgba(203,108,230,0.2)" }}>
        {/* Pearl's voice used to need a button here to unlock browser audio.
            It is gone: nothing speaks unless an avatar is clicked, and that
            click is itself the gesture the browser was waiting for.

            What sits here now is the failure. setAudioNote has been called on
            every speech failure since this console was built and was never
            rendered anywhere, so an exhausted ElevenLabs quota looked exactly
            like a click that did nothing. Now it says so. It clears on the next
            successful click. */}
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div className="display" style={{ fontSize: 20, fontWeight: 700, whiteSpace: "nowrap" }}>OWNER CONSOLE</div>
          {/* What Pearl last said, and a button to hear it.

              She talks from scheduled runs and from a Claude Code session via
              speak-remote.js. For a while those messages had nowhere to go at
              all: the old poll displayed them AND played them over whoever was
              already speaking, so removing the autoplay removed the display
              with it and the channel went silent without failing.

              Nothing here makes a sound on its own. It shows the words and
              offers the speaker. */}
          {lastSpoken && !pearlDismissed && (
            <span
              style={{
                display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0,
                fontSize: 12, color: "var(--text)",
                border: "1px solid rgba(79,191,139,0.4)", borderRadius: 8,
                padding: "4px 8px", maxWidth: 520,
              }}
            >
              <button
                onClick={() => playStored(lastSpoken)}
                disabled={!lastSpoken.audioB64}
                title={
                  lastSpoken.audioB64
                    ? (speakingName === "Nauti Pearl" ? "Stop" : "Hear it in Pearl's voice")
                    : "Stored as text only — there was no voice available when she said it"
                }
                style={{
                  border: "none", background: "transparent", padding: 0, lineHeight: 1,
                  cursor: lastSpoken.audioB64 ? "pointer" : "default",
                  color: lastSpoken.audioB64 ? "#7FE0B8" : "var(--muted)",
                  fontSize: 14, flexShrink: 0,
                }}
              >
                {speakingName === "Nauti Pearl" ? "⏸" : "🔊"}
              </button>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {lastSpoken.text}
              </span>
              <button
                onClick={() => setPearlDismissed(true)}
                title="Dismiss. The next thing she says will appear here."
                style={{
                  border: "none", background: "transparent", padding: 0, lineHeight: 1,
                  cursor: "pointer", color: "var(--muted)", fontSize: 13, flexShrink: 0,
                }}
              >
                ×
              </button>
            </span>
          )}
          {audioNote && (
            <span
              onClick={() => setAudioNote("")}
              title="Dismiss"
              style={{
                fontSize: 11.5, color: "#E8934A", cursor: "pointer",
                border: "1px solid rgba(232,147,74,0.45)", borderRadius: 6,
                padding: "3px 9px", lineHeight: 1.3,
              }}
            >
              🔇 {audioNote}
            </span>
          )}

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

      {/* Tabs within the selected group — hidden when the group holds only
          one, because a lone sub-tab repeating its group's name is a row of
          chrome that says nothing. Overview is the only group like that today;
          the condition is on the count rather than the id so it stays true if
          Overview ever gains a sibling. */}
      {activeGroup.tabs.length > 1 && (
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
      )}

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
            testimonials={testimonials} giftCertificates={giftCertificates} vessels={vessels}
            subscriptions={subscriptions}
            onAddTodo={onAddTodo} onToggleTodo={onToggleTodo} onDeleteTodo={onDeleteTodo}
            onGo={setTab}
          />
        )}

        {tab === "media" && (
          <GalleryTab gallery={gallery} onUpdateCaption={onUpdateCaption} onAddGalleryItem={onAddGalleryItem} onUpdateGalleryItem={onUpdateGalleryItem} onDeleteGalleryItem={onDeleteGalleryItem} />
        )}

        {/* The day-grouped card grid, which is what this tab has always been.
            It briefly rendered SocialPipelinePanel instead, on the reasoning
            that the panel carries more stages -- proposed, needs work, approved,
            delisted -- and those are real. But it draws one dense line per
            draft, and the job here is approving a caption against the picture it
            goes out with, which needs both visible at once. The extra stages are
            worth folding into these cards; swapping the layout to get them was
            not. components/SocialPipelinePanel.js is kept for that work. */}
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

      </div>
    </div>
    </CrewSpeechContext.Provider>
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
            <div style={{ background: "var(--paper-1)", borderRadius: 10, padding: 14 }}>
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
      <form onSubmit={submit} style={{ background: "var(--paper-6)", borderRadius: 10, padding: 14 }}>
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
        <form onSubmit={submit} style={{ background: "var(--paper-11)", borderRadius: 10, padding: 14 }}>
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
    <div style={{ background: "var(--paper-4)", borderRadius: 10, padding: 14 }}>
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
    <div style={{ background: "var(--paper-9)", borderRadius: 10, padding: 14 }}>
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

      <div style={{ background: "var(--paper-2)", borderRadius: 10, padding: 14, color: "var(--text)", fontSize: 13, lineHeight: 1.55 }}>
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
        <div style={{ background: "var(--paper-7)", borderRadius: 10, padding: 14 }}>
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

        <div style={{ background: "var(--paper-12)", borderRadius: 10, padding: 14 }}>
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
        <div style={{ background: "var(--paper-5)", borderRadius: 10, padding: 14 }}>
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
      <form onSubmit={submit} style={{ background: "var(--paper-10)", borderRadius: 10, padding: 14, marginBottom: 12 }}>
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
      <form onSubmit={submit} style={{ background: "var(--paper-3)", borderRadius: 10, padding: 14, marginBottom: 12 }}>
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
      <form onSubmit={submit} style={{ background: "var(--paper-8)", borderRadius: 10, padding: 14, alignSelf: "start" }}>
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
      <form onSubmit={submit} style={{ background: "var(--paper-1)", borderRadius: 10, padding: 14, alignSelf: "start" }}>
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

// The day-grouped card grid. Restored 3 Sep 2026 after the Jarvis retirement
// swapped this tab to SocialPipelinePanel -- that panel carries extra stages,
// but it renders one dense line per draft, and a caption you are approving has
// to be readable at a glance beside the picture it goes out with. Every piece
// this needs (MediaDraftCard, DraftDayGroup, draftIsPast, draftSortKey, the
// .draft-days grid) survived the removal; only this function had gone.
function MediaDraftsTab({ mediaDrafts, onUpdateStatus, onDelete, onAttachMedia }) {
  // Past drafts start hidden. They are a record, not a to-do list.
  const [showPast, setShowPast] = useState(false);
  const todayKey = localDayKey(new Date());

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


function MediaDraftCard({ d, onUpdateStatus, onDelete, onAttachMedia }) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Asks for the one fact that is missing rather than offering a dead end —
  // the same prompt the social pipeline uses, so the two behave alike.
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
                <PlatformLabel platform={d.platform || "Platform TBD"} size={12} />
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
                  {/* Same four actions the social pipeline offers, so the two
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
                    <PlatformLabel platform={d.platform || "Platform TBD"} size={12} /> — as it will go out
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
// Everything here previously lived only on the voice dashboard, which had grown
// into a second place to look for the same information the console already held.
// The console won: it does everything else, and its tabs are where the work
// actually happens. Only the to-do list and the agent log were unique to it,
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
// What an attention item is about. Each carries an icon and the accent of the
// crew member whose patch it is, so the panel reads as the same system as the
// cards below it.
//
// Emoji rather than an icon font: no dependency, no sprite sheet, and they
// render at any size in both themes. Deliberately literal — a wrench reads as
// maintenance to everyone, where an abstract glyph needs a legend.
const ATTENTION_KIND = {
  boat:     { icon: "🔧", color: "#4FBF8B", label: "Boat" },        // Pearl's green
  media:    { icon: "📸", color: "#E86AA8", label: "Media" },       // Coral's pink
  reviews:  { icon: "⭐", color: "#FFB454", label: "Reviews" },      // Joy's gold
  guests:   { icon: "📇", color: "#FFB454", label: "Guests" },      // Joy again
  money:    { icon: "💵", color: "#4FF3FF", label: "Money" },       // Penny's cyan
  bookings: { icon: "⛵", color: "#4FA8E8", label: "Bookings" },
  enquiry:  { icon: "📨", color: "#CB6CE6", label: "Enquiries" },
};

// Side profiles, 24x16, stroke-only so they take the row's colour and stay
// legible on the dark ground at 20px. Kept to the one feature that identifies
// each hull: the tower on a wake boat, the stacked cabin on a yacht, the flat
// deck and tubes on a pontoon.
function VesselIcon({ id, color, size = 20 }) {
  // Every hull shares the same sheer line and curved bottom, so each icon reads
  // as a boat first and a type second. The first attempt drew them symmetrical
  // and face-on: the wake boat came out as a mushroom and the yacht as a
  // wedding cake. A boat only reads in side profile.
  const HULL = "M2 9.5 h20 c-.6 2.6-2.4 4-5 4H7c-2.6 0-4.4-1.4-5-4z";
  const D = {
    // Low freeboard, short windshield, and the tower over the cockpit that a
    // wake boat is recognised by.
    explorer: [HULL, "M8 9.5V7h6l2 2.5", "M9 7 C9 4 12 3 14.5 4.5", "M14.5 4.5 L16 7"],
    // Taller: a full cabin sloping to the bow with a flybridge stacked on top.
    yachti: [HULL, "M5 9.5V6h9l2.5 3.5", "M7 6V3.2h6V6", "M8 3.2h4"],
    // No hull at all -- a flat deck on a tube, with railing and bimini. The
    // absence of a hull is what makes it unmistakably a pontoon.
    islander: ["M3 11.5h18", "M4 11.5v1.6h16v-1.6", "M5 11.5V9M19 11.5V9M5 9h14", "M7.5 9V6M16.5 9V6M6.5 6h11"],
  };
  const paths = D[id] || D.explorer;
  return (
    <svg
      width={size} height={size * (16 / 24)} viewBox="0 0 24 16"
      fill="none" stroke={color} strokeWidth="1.35"
      strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0 }} aria-hidden="true"
    >
      {paths.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}
// YYYY-MM-DD in the LOCAL timezone. toISOString() is UTC and silently rolls
// the date forward every evening in Central, which is exactly how "Open
// Saturdays" came out as zero.
function localDayKey(d) {
  return d.getFullYear() + "-" +
    String(d.getMonth() + 1).padStart(2, "0") + "-" +
    String(d.getDate()).padStart(2, "0");
}

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

// When an agent that has never run is next due, read off its own schedule
// string. Deliberately derived from the roster rather than a second source:
// the schedule text is what the card already shows, so the two cannot disagree.
function crewNextDue(schedule) {
  const s = String(schedule || "");
  const day = (s.match(/(Sun|Mon|Tues|Wednes|Thurs|Fri|Satur)day/i) || [])[0];
  if (/every day/i.test(s)) return { when: "today", daily: true };
  if (day) {
    const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const target = names.findIndex((n) => n.toLowerCase() === day.toLowerCase());
    if (target >= 0) {
      const ahead = (target - new Date().getDay() + 7) % 7;
      return { when: ahead === 0 ? "today" : ahead === 1 ? "tomorrow" : names[target], daily: false };
    }
    return { when: day, daily: false };
  }
  if (/month/i.test(s)) return { when: "its monthly slot", daily: false };
  return { when: null, daily: false };
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
// Clicking an avatar reads that agent's own standup aloud, in her own voice.
// Provided from AdminView, which is where the audio element and the unlocked
// AudioContext live; null until the owner has enabled sound.
const CrewSpeechContext = createContext(null);

// Exactly what her card shows, turned into something speakable. Read aloud,
// the bullets need to run together as sentences or she sounds like a list.
// Returns "" when there is nothing filed, which is what makes the avatar
// unclickable rather than clickable-and-silent.
function crewSpeakableText(r) {
  const lines = statusLines(r.status);
  if (!lines.length) return "";
  return toSpokenForm(
    lines
      .map((l) => String(l).trim())
      .filter(Boolean)
      .map((l) => (/[.!?]$/.test(l) ? l : l + "."))
      .join(" ")
  );
}

function CrewCard({ r, compact = false }) {
  const speech = useContext(CrewSpeechContext);
  const speakable = crewSpeakableText(r);
  const canSpeak = !!(speech && speakable);
  const busy = !!(speech && speech.speakingName === r.name);

  const CARD = { background: "var(--paper-6)", borderRadius: 12, padding: 14, border: "1px solid rgba(203,108,230,0.16)" };
  const st = AGENT_STATUS[r.state] || AGENT_STATUS.idle;
  const lines = statusLines(r.status);
  const fresh = isToday(r.status);
  // Nudged up from 54/72. Never below 54: at 46 only bold colour survived and
  // two of them were unrecognisable.
  const AV = compact ? 62 : 82;

  return (
    <div style={{ ...CARD, opacity: r.pending ? 0.62 : 1, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
        {/* Never below 54px: at 46 only bold colour survived and two of them
            were unrecognisable. Initials remain the fallback. */}
        <div
          className={canSpeak ? "crew-avatar crew-avatar-live" : "crew-avatar"}
          role={canSpeak ? "button" : undefined}
          tabIndex={canSpeak ? 0 : undefined}
          aria-label={canSpeak ? "Hear " + r.name + " read her standup" : undefined}
          title={
            canSpeak
              ? (busy ? r.name + " is speaking…" : "Click to hear " + r.name.replace("Nauti ", "") + " read this aloud")
              : r.name + " has nothing filed to read"
          }
          onClick={canSpeak ? () => speech.speak(r, speakable) : undefined}
          onKeyDown={canSpeak ? (e) => {
            // A div with role="button" is not a button: it gets neither key
            // handling nor the click that a real button fires on Space.
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); speech.speak(r, speakable); }
          } : undefined}
          style={{
            width: AV, height: AV, flexShrink: 0, position: "relative",
            cursor: canSpeak ? "pointer" : "default",
            // Her own accent, so every cue that appears also says who it is.
            "--crew-accent": r.accent,
          }}
        >
          <div
            style={{
              width: "100%", height: "100%", borderRadius: "50%", overflow: "hidden",
              background: "linear-gradient(135deg, " + r.accent + ", rgba(10,6,18,0.85))",
              color: "#0A0612", fontWeight: 800, fontSize: 18,
              display: "flex", alignItems: "center", justifyContent: "center",
              border: "2px solid " + r.accent,
              filter: r.pending ? "grayscale(0.7)" : "none",
              boxShadow: busy ? "0 0 0 3px " + r.accent + ", 0 0 18px " + r.accent : "none",
              transition: "box-shadow 160ms ease",
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

          {/* Always present, not hover-only. A cue you can only discover by
              hovering is not a cue, and on a phone there is no hover at all --
              it would be invisible on the one screen it is used from most.
              Quiet at rest, bright on hover, animated while she is talking. */}
          {canSpeak && (
            <span className={"crew-speak-badge" + (busy ? " is-speaking" : "")} aria-hidden="true">
              <svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor">
                <path d="M4 9v6h4l5 5V4L8 9H4z" />
                <path className="crew-speak-wave" d="M16.5 8.5a5 5 0 0 1 0 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </span>
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
          {r.run
            ? "Last run · " + crewAgo(r.run.startedAt)
            : (crewNextDue(r.schedule).daily ? "Has not run today" : "No runs yet")}
        </div>
        <div style={{
          fontSize: 11.5, marginTop: 2, lineHeight: 1.4,
          // A daily agent that has never run has missed something; a weekly one
          // three days out has not. Only the first is worth an alarm colour.
          color: !r.run && crewNextDue(r.schedule).daily ? "#E8934A" : "var(--muted)",
        }}>
          {r.run
            ? (r.run.detail || r.run.taskTitle || "no detail recorded")
            : crewNextDue(r.schedule).daily
              ? "She runs every day and has not reported one. Open Routines and hit Run now."
              : crewNextDue(r.schedule).when
                ? "First run is " + crewNextDue(r.schedule).when + "."
                : "Not due yet."}
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
// Coastlines for the chain-of-command chart. Invented, and deliberately not
// Lake Conroe: at this size a real outline would be unreadable, and a half-right
// one would be worse than an honest abstraction.
//
// Generated by the same harmonic outline the panel plates use -- see
// scripts/generate-map-regions.js -- rather than hand-drawn, because hand-drawn
// cubics produced a smooth curve that read as a wave rather than as a shore.
// Positions are chosen against the node layout: the two coasts run off the top
// corners either side of the You/Pearl column, leaving a channel where those two
// nodes fall, and the islands fill the southern band clear of Coral on the left
// and the compass rose on the right. Coordinates are in the 980x440 viewBox.
const LAND = [
  "M344 -70 C348 -67 352 -64 355 -61 C359 -58 365 -55 368 -52 C371 -48 373 -45 373 -42 C373 -39 370 -36 367 -33 C365 -31 360 -28 358 -26 C356 -23 354 -21 354 -18 C353 -15 354 -11 354 -8 C353 -6 353 -2 351 0 C350 3 347 5 345 7 C343 9 341 12 339 14 C337 16 336 19 333 21 C331 23 328 25 324 26 C321 27 315 27 311 28 C308 28 304 29 301 30 C298 32 297 34 295 36 C293 37 292 40 290 41 C287 42 283 41 279 41 C275 41 269 39 266 39 C262 38 259 38 257 39 C255 41 255 44 255 46 C254 49 254 52 254 55 C253 58 253 61 252 65 C252 68 252 72 251 76 C251 80 251 85 250 88 C249 91 248 94 245 95 C243 96 239 94 235 93 C232 92 228 89 224 88 C221 87 219 87 216 88 C214 88 212 91 210 91 C208 92 205 92 202 91 C200 90 196 87 194 86 C191 84 188 82 186 82 C183 81 181 82 179 82 C177 82 175 83 173 82 C170 82 168 81 166 81 C164 81 162 81 160 82 C157 84 155 87 153 88 C151 89 149 92 147 91 C144 91 142 88 140 85 C138 82 137 77 135 74 C133 71 132 68 130 67 C128 66 126 68 124 68 C121 69 119 71 117 72 C115 72 112 72 110 73 C108 73 106 73 103 74 C101 75 98 77 95 77 C93 78 90 78 88 77 C87 75 85 72 84 70 C83 68 82 64 81 63 C79 61 77 61 74 62 C71 62 68 64 65 64 C62 64 60 64 58 63 C56 62 55 59 53 57 C51 56 50 55 47 55 C44 55 40 56 35 58 C30 59 25 61 20 63 C14 65 9 66 4 68 C-2 69 -8 71 -15 72 C-21 74 -29 76 -35 77 C-42 78 -49 79 -54 78 C-58 77 -61 74 -63 72 C-65 69 -65 64 -66 61 C-67 57 -68 54 -71 51 C-73 49 -77 47 -80 44 C-83 42 -86 39 -88 36 C-90 33 -90 29 -91 25 C-91 22 -91 18 -91 14 C-92 10 -93 7 -93 3 C-93 0 -94 -4 -93 -8 C-92 -11 -90 -16 -88 -19 C-86 -23 -83 -27 -82 -31 C-81 -34 -81 -38 -81 -41 C-81 -44 -82 -47 -81 -51 C-80 -54 -77 -57 -74 -61 C-70 -64 -64 -67 -60 -70 C-55 -73 -50 -76 -47 -78 C-45 -81 -44 -84 -44 -86 C-43 -89 -44 -92 -44 -95 C-44 -97 -44 -100 -44 -103 C-45 -106 -44 -108 -45 -111 C-45 -114 -47 -118 -47 -120 C-47 -123 -47 -127 -45 -129 C-43 -131 -39 -133 -35 -134 C-31 -136 -25 -136 -20 -137 C-16 -138 -12 -139 -9 -141 C-6 -142 -6 -145 -4 -146 C-2 -148 0 -150 3 -151 C6 -152 10 -152 14 -152 C18 -153 22 -152 25 -153 C28 -153 30 -155 32 -156 C33 -158 33 -160 35 -161 C36 -163 37 -165 38 -167 C39 -168 41 -170 41 -172 C41 -175 41 -178 41 -181 C41 -185 40 -189 41 -191 C42 -193 44 -194 47 -194 C50 -194 55 -192 59 -190 C62 -189 66 -187 69 -187 C71 -187 73 -188 74 -189 C76 -191 76 -193 78 -195 C79 -196 81 -198 83 -198 C85 -199 87 -200 89 -200 C90 -201 92 -203 94 -204 C95 -205 97 -207 99 -207 C101 -207 104 -206 106 -205 C109 -204 111 -201 114 -200 C116 -199 118 -199 120 -200 C121 -200 123 -204 124 -205 C126 -206 128 -208 130 -209 C131 -209 134 -207 136 -206 C138 -205 140 -203 142 -204 C143 -204 145 -206 147 -209 C149 -212 151 -217 153 -221 C155 -226 158 -230 160 -235 C163 -240 166 -244 169 -249 C172 -254 175 -260 179 -265 C182 -270 186 -277 190 -280 C194 -283 197 -285 200 -285 C204 -285 206 -282 209 -281 C212 -279 214 -276 217 -276 C220 -275 223 -276 227 -276 C230 -276 234 -278 237 -277 C240 -277 243 -275 246 -273 C248 -271 250 -268 252 -266 C255 -263 257 -262 260 -260 C262 -258 265 -257 267 -255 C270 -253 272 -251 274 -248 C276 -245 277 -242 278 -239 C280 -237 283 -235 285 -234 C288 -232 292 -232 294 -230 C296 -228 299 -226 300 -223 C300 -219 299 -214 298 -209 C297 -204 295 -199 295 -195 C294 -191 295 -188 296 -186 C298 -184 301 -183 303 -181 C305 -179 308 -178 310 -176 C312 -174 314 -172 316 -170 C318 -169 321 -167 323 -165 C326 -163 329 -162 330 -160 C332 -157 332 -154 332 -151 C331 -148 328 -143 326 -140 C325 -136 322 -133 322 -130 C322 -127 323 -125 324 -123 C325 -120 327 -118 328 -116 C328 -113 327 -110 326 -107 C325 -105 322 -102 321 -99 C321 -96 321 -94 322 -92 C323 -89 326 -87 328 -85 C331 -83 334 -80 336 -78 C339 -75 341 -73 344 -70",
  "M1047 -78 C1045 -75 1041 -72 1039 -69 C1038 -66 1036 -63 1036 -59 C1036 -56 1038 -53 1038 -50 C1038 -47 1039 -43 1038 -40 C1037 -37 1034 -35 1032 -32 C1029 -29 1026 -27 1024 -24 C1021 -22 1020 -19 1018 -17 C1016 -14 1014 -12 1011 -10 C1008 -8 1003 -7 999 -5 C995 -4 991 -3 988 -1 C985 0 983 3 982 5 C980 7 979 9 976 11 C973 12 969 12 963 12 C958 11 949 9 943 7 C937 6 930 3 926 2 C921 2 918 2 916 2 C914 3 913 4 912 5 C910 7 909 8 909 10 C908 12 908 14 909 18 C910 21 912 26 913 31 C914 35 916 40 916 44 C916 47 914 49 913 51 C912 53 909 53 908 55 C906 57 905 60 904 63 C904 66 904 72 903 75 C903 79 902 82 900 84 C898 86 894 85 892 85 C889 84 885 83 883 83 C880 82 878 83 875 84 C873 85 871 86 869 87 C866 88 864 88 862 89 C859 90 857 91 855 93 C853 95 851 99 849 102 C847 106 845 110 843 112 C841 114 838 114 835 112 C832 110 829 105 826 102 C824 99 821 94 819 92 C816 91 814 91 811 90 C809 90 807 92 804 92 C802 91 800 91 797 90 C795 89 793 88 791 87 C788 87 786 88 783 88 C781 88 778 89 776 88 C774 87 772 85 770 82 C769 79 768 75 766 73 C764 71 763 69 761 68 C759 67 756 68 754 67 C752 66 750 65 750 61 C749 58 749 51 750 46 C751 41 752 34 753 30 C753 26 753 23 752 21 C752 19 750 18 749 17 C747 17 746 16 743 16 C741 16 739 17 736 18 C732 19 727 22 723 25 C718 27 711 31 707 32 C703 34 699 34 696 34 C693 33 693 30 691 29 C689 28 688 26 685 25 C682 25 677 25 673 25 C669 25 663 26 660 25 C657 24 654 22 653 20 C651 18 651 15 649 13 C648 11 646 9 644 7 C642 5 639 3 638 1 C636 -1 635 -4 634 -6 C633 -9 634 -12 633 -14 C631 -17 629 -19 626 -21 C624 -23 619 -25 617 -27 C615 -29 613 -32 614 -35 C614 -38 618 -42 622 -45 C625 -49 630 -52 632 -55 C635 -58 636 -60 636 -63 C636 -66 634 -68 633 -70 C631 -73 630 -75 628 -78 C626 -81 625 -83 622 -86 C619 -89 615 -92 611 -95 C607 -98 602 -102 599 -105 C596 -109 594 -112 593 -116 C592 -119 594 -122 594 -125 C594 -128 595 -131 594 -135 C593 -138 590 -142 589 -146 C588 -150 586 -154 586 -158 C587 -161 590 -164 593 -166 C596 -168 602 -170 605 -171 C609 -173 613 -175 615 -177 C618 -179 619 -182 621 -184 C623 -187 625 -189 627 -192 C629 -194 631 -196 632 -199 C634 -202 634 -206 634 -210 C634 -214 632 -219 633 -222 C633 -226 634 -230 637 -231 C640 -233 646 -232 651 -232 C656 -232 662 -230 666 -230 C671 -230 674 -230 677 -231 C680 -232 682 -234 685 -235 C688 -236 691 -237 694 -237 C698 -237 702 -236 706 -235 C709 -235 713 -234 716 -234 C719 -234 722 -235 725 -234 C728 -233 732 -232 736 -230 C740 -227 744 -223 748 -221 C752 -218 755 -215 758 -214 C761 -212 763 -213 765 -212 C768 -211 770 -211 773 -208 C776 -205 779 -199 783 -194 C786 -188 790 -180 792 -174 C795 -169 797 -163 799 -160 C801 -157 802 -156 804 -155 C805 -154 806 -154 807 -154 C808 -154 809 -155 810 -157 C811 -159 812 -162 813 -166 C814 -170 816 -177 817 -181 C819 -185 820 -190 822 -192 C824 -195 826 -195 827 -195 C829 -196 831 -196 833 -197 C835 -199 837 -202 839 -205 C842 -209 845 -214 847 -217 C850 -219 853 -221 855 -222 C857 -222 859 -221 861 -220 C863 -220 865 -219 867 -219 C870 -219 872 -220 875 -221 C878 -221 880 -222 883 -222 C885 -222 887 -221 890 -221 C893 -221 895 -222 899 -223 C902 -225 907 -228 911 -229 C915 -231 920 -233 922 -232 C925 -232 926 -229 927 -226 C928 -223 927 -217 928 -214 C928 -211 929 -208 930 -206 C932 -204 935 -204 938 -204 C941 -203 945 -203 948 -203 C951 -202 953 -201 957 -200 C960 -200 964 -199 968 -199 C972 -199 978 -200 982 -199 C986 -199 990 -198 993 -196 C996 -195 997 -192 999 -189 C1000 -187 1001 -183 1003 -181 C1005 -179 1008 -177 1012 -176 C1015 -174 1020 -172 1022 -170 C1024 -167 1024 -164 1024 -161 C1023 -157 1019 -152 1017 -148 C1015 -144 1012 -140 1010 -137 C1009 -134 1009 -131 1010 -128 C1010 -125 1011 -123 1012 -120 C1013 -117 1014 -115 1015 -112 C1017 -109 1020 -107 1023 -104 C1026 -102 1032 -99 1036 -97 C1040 -94 1045 -91 1047 -88 C1048 -85 1048 -81 1047 -78",
  "M363 384 C360 387 348 389 343 391 C338 393 336 394 334 395 C332 397 333 399 332 401 C331 402 330 404 329 405 C327 407 326 408 325 409 C323 410 322 412 320 412 C318 412 315 410 313 409 C311 409 309 408 308 410 C307 412 307 420 306 421 C304 422 302 418 300 417 C298 416 297 416 295 416 C293 416 292 417 289 418 C287 419 283 423 280 423 C278 424 277 421 274 421 C271 420 264 423 264 421 C263 419 268 411 269 407 C270 403 272 401 272 399 C271 397 270 396 267 395 C265 394 259 393 257 391 C255 389 257 387 255 384 C253 381 247 378 245 375 C244 372 246 369 247 367 C248 364 250 362 251 359 C253 356 252 352 255 351 C257 349 262 349 267 350 C271 351 278 357 282 358 C285 360 287 361 288 360 C290 360 290 356 291 355 C292 354 294 357 296 356 C297 355 299 351 300 351 C301 352 303 357 304 359 C305 362 305 366 306 367 C306 368 307 367 309 365 C312 363 318 356 321 354 C325 352 324 356 328 356 C331 356 338 353 342 353 C346 353 349 355 352 357 C355 359 359 361 360 364 C362 367 363 371 363 374 C364 377 366 381 363 384",
  "M498 366 C499 368 500 369 502 372 C504 374 506 377 508 380 C510 383 514 389 514 391 C513 393 508 394 505 394 C502 395 499 395 496 395 C493 395 490 394 488 393 C485 392 482 390 481 389 C479 388 478 389 477 389 C475 389 474 390 473 389 C472 388 471 385 470 383 C469 382 469 379 468 380 C467 381 465 386 464 387 C463 388 462 386 461 385 C460 385 459 385 458 385 C457 385 456 383 455 383 C454 382 452 382 451 382 C449 381 449 380 446 380 C442 380 434 381 432 380 C429 379 431 375 432 373 C432 370 433 368 434 366 C435 364 437 362 438 360 C439 359 439 357 441 355 C443 354 446 354 447 353 C449 352 447 349 448 348 C449 347 451 347 453 347 C454 346 455 346 455 344 C456 341 455 336 455 333 C456 331 457 328 459 328 C461 328 463 331 465 333 C467 335 469 337 470 339 C471 341 472 342 473 344 C474 345 474 349 475 349 C476 349 479 343 481 343 C482 342 483 343 484 345 C485 346 484 348 485 350 C485 351 484 353 485 354 C486 355 490 353 491 354 C491 355 488 358 489 359 C490 360 494 360 495 361 C497 363 497 364 498 366",
  "M644 398 C642 400 642 400 641 402 C641 403 642 404 641 406 C641 407 640 408 639 409 C638 410 637 410 637 411 C636 412 636 414 635 415 C635 416 633 415 632 416 C631 416 630 417 629 418 C629 419 628 423 627 423 C626 422 624 418 623 417 C622 416 621 416 620 417 C619 418 618 420 617 421 C615 422 613 425 612 425 C611 425 610 423 609 423 C607 422 605 424 604 422 C604 421 606 415 606 413 C606 411 605 411 604 411 C603 410 601 410 599 410 C597 409 595 409 594 407 C593 406 595 404 594 402 C593 401 589 400 588 398 C587 396 587 394 586 392 C586 390 585 388 586 386 C586 384 586 381 587 380 C589 379 593 378 596 379 C600 380 605 383 607 383 C609 384 609 384 610 383 C611 383 611 381 612 381 C613 381 615 383 616 383 C616 383 617 380 617 380 C618 380 619 382 620 383 C621 383 621 384 622 383 C623 383 624 382 625 381 C626 379 629 376 630 376 C631 376 630 380 632 380 C633 380 637 377 639 377 C642 376 645 376 647 376 C650 376 654 377 655 378 C657 379 658 382 658 384 C658 387 659 389 657 392 C654 394 647 396 644 398",
  "M726 352 C726 353 726 353 726 354 C726 355 727 355 728 357 C729 358 733 360 734 362 C734 363 733 364 732 365 C731 366 730 366 729 367 C728 368 727 369 726 369 C725 369 723 369 721 368 C720 368 719 367 717 366 C716 366 715 366 714 365 C713 363 713 361 712 360 C711 358 712 357 711 357 C711 357 710 359 709 360 C708 361 708 360 707 360 C707 360 706 360 705 360 C705 360 704 360 704 359 C703 359 702 359 701 359 C701 358 702 358 700 357 C699 357 694 358 693 357 C692 357 692 356 692 355 C692 354 692 353 691 352 C691 351 691 350 690 349 C690 348 689 346 689 345 C690 345 692 344 693 344 C695 343 695 342 696 342 C698 342 700 343 702 343 C704 344 705 345 706 345 C707 344 706 343 706 342 C706 340 706 338 707 337 C707 337 708 337 709 337 C710 337 711 337 712 337 C713 337 714 337 715 338 C715 338 715 341 716 341 C717 342 718 341 718 341 C719 341 719 342 719 343 C720 344 719 345 719 345 C720 346 719 346 721 346 C722 347 725 345 726 346 C727 346 726 347 726 348 C727 349 728 349 728 350 C728 350 727 351 726 352",
  "M400 412 C401 413 402 413 403 414 C404 415 406 417 407 418 C408 420 408 422 408 423 C408 424 408 425 407 426 C406 427 405 428 404 428 C403 428 400 427 399 426 C397 426 396 424 396 425 C395 425 395 428 395 429 C394 430 393 429 392 429 C391 429 391 429 390 429 C389 429 389 429 388 429 C387 429 386 430 385 429 C384 429 384 427 383 427 C383 427 381 428 380 428 C380 427 381 424 381 422 C382 421 382 419 382 419 C382 418 382 418 381 417 C380 417 378 417 378 417 C377 416 379 415 379 414 C379 413 377 413 377 412 C378 411 379 411 380 410 C381 410 382 409 382 409 C381 408 380 407 380 406 C379 405 379 403 378 402 C378 401 380 401 380 400 C380 399 380 397 380 395 C380 393 379 390 380 389 C380 387 382 387 383 387 C384 386 385 384 386 385 C387 385 389 387 390 389 C391 391 392 395 392 397 C393 398 393 400 393 401 C394 401 395 399 396 399 C396 399 396 402 396 403 C396 403 397 403 397 404 C397 404 397 405 397 406 C397 407 397 407 397 408 C397 408 397 409 397 409 C398 409 401 409 401 410 C402 410 400 411 400 412",
];

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
  // Bottom right. The bottom LEFT is where Coral hangs -- she is the only node
  // below the row, and she sits under Siren, who is first -- so a rose there
  // ends up underneath her portrait. Declared once and read by both the rose
  // and its rhumb lines.
  const ROSE_X = W - 150, ROSE_Y = CHART_H - 68, ROSE_R = 40;
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

  // The panel is flat, deliberately. Every other panel carries the --paper
  // graticule; this one rules its own at a different pitch, and two grids
  // showing through each other is moire rather than cartography.
  return (
    <div style={{ background: "var(--card)", borderRadius: 12, padding: "14px 16px 6px", border: "1px solid rgba(203,108,230,0.16)" }}>
      <div style={{ fontWeight: 700, color: "var(--text)", fontSize: 13.5, marginBottom: 2 }}>Chain of command</div>
      <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 6, lineHeight: 1.45 }}>
        Everything routes through Pearl. The dashed line is Coral checking what Siren actually published &mdash;
        the only loop that runs back upstream, because Siren is the only one who acts outside the business.
      </div>
      <div className="crew-chart" style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        <svg viewBox={`0 0 ${W} ${CHART_H}`} style={{ width: "100%", minWidth: 760, height: "auto", display: "block" }}>
          <defs>
            {/* Graticule: the lat/long grid every chart carries. Drawn as a
                pattern so it tiles regardless of how wide the box gets. */}
            <pattern id="cc-grid" width="70" height="70" patternUnits="userSpaceOnUse">
              <path d="M70 0V70M0 70H70" fill="none" stroke="var(--purple)" strokeWidth="0.5" opacity="0.14" />
            </pattern>
            {/* Depth soundings, the stippling on a real chart's shallows. */}
            <pattern id="cc-sound" width="26" height="26" patternUnits="userSpaceOnUse">
              <circle cx="4" cy="4" r="0.7" fill="var(--purple)" opacity="0.13" />
              <circle cx="17" cy="15" r="0.7" fill="var(--purple)" opacity="0.09" />
            </pattern>
            {/* How land was filled before tints: fine diagonal hatching. The
                45deg turn is what stops it reading as a second graticule. */}
            <pattern id="cc-land" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="7" stroke="var(--purple)" strokeWidth="0.6" opacity="0.34" />
            </pattern>
            {/* Light falling across the sheet from above. Faint enough that the
                portraits still sit clearly on top of it. */}
            <radialGradient id="cc-wash" cx="50%" cy="-8%" r="120%">
              <stop offset="0%" stopColor="var(--purple)" stopOpacity="0.09" />
              <stop offset="62%" stopColor="var(--purple)" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Everything in this group is background. It is deliberately faint:
              eight portraits and sixteen labels sit on top of it, and a chart
              you can actually read would compete with them. */}
          <g aria-hidden="true">
            {/* A wash from the top edge, so the sheet reads as lit rather than
                as a filled rectangle. */}
            <rect x="0" y="0" width={W} height={CHART_H} fill="url(#cc-wash)" />

            {/* Land goes under the graticule, because on an engraved chart the
                lat/long rules carry straight across a coast rather than stopping
                at it. */}
            <g>
              {/* The offshore shading band first, so the coastline rules over it. */}
              {LAND.map((d, i) => (
                <path key={"lh" + i} d={d} fill="none" stroke="var(--purple)" strokeWidth="5" opacity="0.07" />
              ))}
              {/* Solid tone first. Hatching alone gives almost no separation
                  from the sea at this opacity, which left the coastline reading
                  as a river drawn across open water. */}
              {LAND.map((d, i) => (
                <path key={"lf" + i} d={d} fill="var(--purple)" opacity="0.055" />
              ))}
              {LAND.map((d, i) => (
                <path key={"l" + i} d={d} fill="url(#cc-land)" stroke="var(--purple)" strokeWidth="0.9" opacity="0.3" />
              ))}
            </g>

            <rect x="0" y="0" width={W} height={CHART_H} fill="url(#cc-grid)" />
            <rect x="0" y="0" width={W} height={CHART_H} fill="url(#cc-sound)" />

            {/* The neatline: two rules with a channel between them, ticked at
                the same 70px pitch as the graticule inside, so the ticks line
                up with the grid lines they belong to. Charts have been bordered
                this way since engraving, and it is what stops the drawing from
                reading as a floating diagram. */}
            <g fill="none" stroke="var(--purple)" opacity="0.26">
              <rect x="3.5" y="3.5" width={W - 7} height={CHART_H - 7} strokeWidth="1" />
              <rect x="11.5" y="11.5" width={W - 23} height={CHART_H - 23} strokeWidth="0.5" />
            </g>
            <g stroke="var(--purple)" strokeWidth="0.7" opacity="0.24">
              {/* Verticals crossing the top and bottom channels. */}
              {Array.from({ length: Math.floor(W / 70) }, (_, i) => (i + 1) * 70).map((tx) => (
                <g key={"tx" + tx}>
                  <line x1={tx} y1="3.5" x2={tx} y2="11.5" />
                  <line x1={tx} y1={CHART_H - 11.5} x2={tx} y2={CHART_H - 3.5} />
                </g>
              ))}
              {/* Horizontals crossing the left and right channels. */}
              {Array.from({ length: Math.floor(CHART_H / 70) }, (_, i) => (i + 1) * 70).map((ty) => (
                <g key={"ty" + ty}>
                  <line x1="3.5" y1={ty} x2="11.5" y2={ty} />
                  <line x1={W - 11.5} y1={ty} x2={W - 3.5} y2={ty} />
                </g>
              ))}
            </g>

            {/* Depth contours. Hand-drawn curves rather than concentric circles
                — a real chart's isobaths follow a coastline, and regular rings
                would read as a target. */}
            <g fill="none" stroke="var(--purple)" strokeWidth="0.8" opacity="0.15">
              <path d="M-20 300 C 120 268, 250 322, 400 296 S 700 250, 1000 292" />
              <path d="M-20 340 C 140 312, 260 360, 420 336 S 720 296, 1000 332" />
              <path d="M-20 384 C 160 360, 280 400, 440 378 S 740 340, 1000 374" />
            </g>
            <g fill="none" stroke="var(--purple)" strokeWidth="0.8" opacity="0.08" strokeDasharray="3 5">
              <path d="M-20 96 C 160 74, 300 118, 460 92 S 760 52, 1000 88" />
            </g>

            {/* Compass rose, bottom right — the corner the tree actually leaves
                empty. See ROSE_X above for why it is not on the left. */}
            <g transform={`translate(${ROSE_X}, ${ROSE_Y})`} opacity="0.22">
              <circle r={ROSE_R} fill="none" stroke="var(--purple)" strokeWidth="0.7" />
              <circle r={ROSE_R * 0.68} fill="none" stroke="var(--purple)" strokeWidth="0.5" />
              <circle r="4" fill="none" stroke="var(--purple)" strokeWidth="0.6" />
              {/* Eight points: the four cardinals long, the intercardinals short. */}
              {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
                <line
                  key={deg} x1="0" y1="0" x2="0" y2={deg % 90 === 0 ? -ROSE_R : -ROSE_R * 0.68}
                  stroke="var(--purple)" strokeWidth={deg % 90 === 0 ? 0.9 : 0.5}
                  transform={`rotate(${deg})`}
                />
              ))}
              {/* The north needle, filled, as every rose has. */}
              <path d={`M0 ${-ROSE_R} L5 -8 L0 0 L-5 -8 Z`} fill="var(--purple)" opacity="0.5" />
              <text x="0" y={-ROSE_R - 6} textAnchor="middle" fontSize="9" fill="var(--purple)" opacity="0.7">N</text>
            </g>

            {/* Ships. The plates behind the other panels carry them and this
                chart did not, which made it the one tile that still read as a
                diagram with a border rather than as a chart. Positions are
                checked against the nodes, the islands and the rose -- the
                southern water is the only part of this sheet with room. */}
            <g fill="none" stroke="var(--purple)" strokeWidth="0.9" opacity="0.32">
              {[[218, 348, 1], [545, 335, -1], [762, 402, 1]].map(([sx, sy, dir]) => (
                <g key={"sh" + sx} transform={`translate(${sx}, ${sy}) scale(${dir}, 1)`}>
                  <path d="M-7 4 L7 4 L5 7.5 L-5 7.5 Z" />
                  <path d="M0 4 L0 -8" />
                  <path d="M0.6 -7 Q6 -3 0.6 -0.5 Z" />
                  <path d="M-0.6 -4 Q-5 -1 -0.6 1.5 Z" />
                  <path d="M-10 9.5 Q-5 11 0 9.5 Q5 8 10 9.5" opacity="0.5" />
                </g>
              ))}
            </g>

            {/* Rhumb lines radiating from the rose, the way a portolan chart
                rules them across the water. They run leftward now because the
                rose does — the open water is whichever side the rose is not on. */}
            <g stroke="var(--purple)" strokeWidth="0.4" opacity="0.07">
              {[10, 26, 42, 58, 74].map((deg) => (
                <line
                  key={deg}
                  x1={ROSE_X} y1={ROSE_Y}
                  x2="0" y2={ROSE_Y - (ROSE_X * Math.tan((deg * Math.PI) / 180)) / 3}
                />
              ))}
            </g>
          </g>
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
  const CARD = { background: "var(--paper-11)", borderRadius: 12, padding: 14, border: "1px solid rgba(203,108,230,0.16)" };
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

function OverviewTab({ externalBookings, inquiries, ledger = [], maintenanceItems = [], engineHours = [], mediaDrafts, todos, agentActivity, testimonials = [], giftCertificates = [], vessels = [], subscriptions = [], onAddTodo, onToggleTodo, onDeleteTodo, onGo }) {
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

  // --- the fleet, which is what the charter list was hiding ---------------
  //
  // Season starts in March. Counting from there rather than "all time" is what
  // makes an idle boat visible: the Islander has history, it just has no 2026.
  const SEASON_FROM = today.slice(0, 4) + "-03-01";
  // Average of what charters actually took this season. Declared here because
  // both the fleet panel and the money panel need it, and the ledger-wide
  // avgCharter further down is a different figure (all income rows, all time).
  const seasonPaid = externalBookings
    .filter((b) => b.status === "completed" && (b.date || "") >= today.slice(0, 4) + "-03-01")
    .map((b) => Number(b.pricePaid || 0)).filter((n) => n > 0);
  const avgCharterSeason = seasonPaid.length
    ? Math.round(seasonPaid.reduce((a, n) => a + n, 0) / seasonPaid.length)
    : 0;
  const seasonRuns = externalBookings.filter(
    (b) => b.status === "completed" && (b.date || "") >= SEASON_FROM
  );
  // The CURRENT fleet, from the Vessel table — not from booking history.
  //
  // History was wrong in both directions: it listed "Nauti Lexi (sold, no
  // longer in fleet)" and the sold wave runners as idle, when a sold asset
  // costs nothing and is not the point; and it left out the Nauti Islander
  // entirely, because a boat that has never run has no bookings to derive a
  // row from. The Islander is precisely the row worth seeing.
  const fleetList = (vessels || []).filter((v) => v && v.name);
  const fleet = fleetList.map(({ id, name }) => {
    const runs = seasonRuns.filter((b) => b.vesselName === name);
    const lastRan = runs.map((b) => b.date).sort().pop() || null;
    const paid = runs.map((b) => Number(b.pricePaid || 0)).filter((n) => n > 0);
    return {
      id,
      name,
      trips: runs.length,
      lastRan,
      idleDays: lastRan ? Math.round((new Date(today) - new Date(lastRan)) / 86400000) : null,
      earned: paid.reduce((a, n) => a + n, 0),
    };
  }).sort((a, b) => b.trips - a.trips);

  // --- the season, which is the honest unit for a seasonal business --------
  //
  // A calendar month is a misleading frame here: on the 3rd it shows a month of
  // fixed bills against three days of income. March is when the season starts.
  const seasonLedger = ledger.filter((e) => (e.date || "") >= SEASON_FROM);
  const seasonIn = seasonLedger.filter((e) => e.type === "income")
    .reduce((a, e) => a + Number(e.amount || 0), 0);
  const seasonOut = seasonLedger.filter((e) => e.type === "expense")
    .reduce((a, e) => a + Number(e.amount || 0), 0);
  const seasonNet = seasonIn - seasonOut;
  const monthsElapsed = Math.max(
    1,
    new Set(seasonLedger.map((e) => String(e.date).slice(0, 7))).size
  );
  const avgMonthOut = seasonOut / monthsElapsed;
  // What a month has to earn to stand still, expressed as charters, because
  // "five charters" is a thing you can act on and "$2,048" is not.
  const breakEven = avgCharterSeason > 0 ? Math.ceil(avgMonthOut / avgCharterSeason) : null;
  const tripsPerMonth = seasonRuns.length / monthsElapsed;
  const dayOfMonth = Number(today.slice(8, 10));

  // Money taken for a charter that has not been delivered. Undated bookings
  // count: a booking goes undated precisely because it never got rescheduled,
  // and filtering on a parseable date would drop exactly those.
  const heldMoney = externalBookings
    .filter((b) => {
      if (Number(b.pricePaid) <= 0) return false;
      if (b.status === "completed") return false;
      const d = String(b.date || "");
      // The escapes matter: without them this matches nothing, every booking
      // counts as undated, and a future paid trip is reported as money held.
      const dated = /^\d{4}-\d{2}-\d{2}$/.test(d);
      return !dated || d < today;
    })
    .reduce((a, b) => a + Number(b.pricePaid || 0), 0);

  const seasonTrips = seasonRuns.length;
  const seasonEarned = seasonRuns.reduce((a, b) => a + Number(b.pricePaid || 0), 0);
  const nextOut = upcoming[0] || null;
  const daysToNext = nextOut ? Math.round((new Date(nextOut.date) - new Date(today)) / 86400000) : null;

  // --- what actually needs attention ------------------------------------
  //
  // The first version counted only drafts awaiting a decision, so it said
  // "nothing waiting" while 23 posts sat scheduled and 21 guests had never been
  // asked for a review. Anything that is genuinely a job goes here.
  const soonPosts = mediaDrafts.filter((d) => d.status === "scheduled" && d.scheduledDate && d.scheduledDate <= plus(3) && d.scheduledDate >= today);
  const draftsWaiting = mediaDrafts.filter((d) => ["pending", "proposed", "discussing"].includes(d.status));
  // Approved, but never given a date. These are the drafts that rot: Coral
  // drafts, Siren publishes what is scheduled, and until now nothing owned the
  // step between -- so a post you said yes to just sat, and no panel said so.
  const approvedNoDate = mediaDrafts.filter((d) => d.status === "approved" && !d.scheduledDate);
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
  // Renewals landing inside a fortnight. Nothing else in the console surfaces a
  // subscription BEFORE it charges -- the Subscriptions tab lists them, but a
  // list is not a warning. This was the one genuinely useful thing in the
  // retired Jarvis tab.
  const subsDueSoon = (subscriptions || []).filter((x) => {
    if (!x || x.active === false || !x.nextDueDate) return false;
    const d = String(x.nextDueDate).slice(0, 10);
    return d >= today && d <= plus(14);
  });

  const attention = [
    newInquiries.length && { k: "enquiry", t: `${newInquiries.length} new ${newInquiries.length === 1 ? "enquiry" : "enquiries"}`, w: "Bookings → Inquiries", go: "inquiries", urgent: true },
    overdue.length && { k: "boat", t: `${overdue.length} maintenance ${overdue.length === 1 ? "item" : "items"} overdue`, w: "Boat", go: "maintenance", urgent: true },
    dueSoon.length && { k: "boat", t: `${dueSoon.length} maintenance ${dueSoon.length === 1 ? "item" : "items"} due soon`, w: "Boat", go: "maintenance" },
    unjudgeable.length === maintenanceItems.length && maintenanceItems.length > 0 && {
      k: "boat",
      t: `No maintenance can be judged — ${maintenanceItems.length} items, nothing logged`,
      w: "Boat: add engine hours or a last-serviced date", go: "maintenance", urgent: true,
    },
    approvedNoDate.length && { k: "media", t: `${approvedNoDate.length} approved ${approvedNoDate.length === 1 ? "post has" : "posts have"} no date`, w: "Marketing → Media Drafts · approved but not scheduled, so nothing will publish " + (approvedNoDate.length === 1 ? "it" : "them"), go: "mediaDrafts", urgent: true },
    draftsWaiting.length && { k: "media", t: `${draftsWaiting.length} social ${draftsWaiting.length === 1 ? "draft" : "drafts"} to approve`, w: "Marketing → Media Drafts", go: "mediaDrafts", urgent: true },
    noPrice.length && { k: "money", t: `${noPrice.length} completed ${noPrice.length === 1 ? "charter has" : "charters have"} no price`, w: "no income row is written without one", go: "bookings", urgent: true },
    soonPosts.length && { k: "media", t: `${soonPosts.length} ${soonPosts.length === 1 ? "post goes" : "posts go"} out in the next 3 days`, w: "Marketing → Media Drafts", go: "mediaDrafts" },
    neverAsked.length && { k: "reviews", t: `${neverAsked.length} guests never asked for a review`, w: "Marketing → Testimonials, from your phone", go: "testimonials" },
    looseIncome.length && { k: "money", t: `${looseIncome.length} income ${looseIncome.length === 1 ? "row is" : "rows are"} not tied to a charter`, w: "Money → Reconciliation", go: "reconcile" },
    subsDueSoon.length && { k: "money", t: `${subsDueSoon.length} subscription${subsDueSoon.length === 1 ? "" : "s"} due in the next 14 days`, w: "Money → Subscriptions · " + subsDueSoon.map((x) => x.name).slice(0, 3).join(", "), go: "subscriptions" },
    noPhone.length && { k: "guests", t: `${noPhone.length} past guests have no phone number`, w: "they cannot be asked for anything", go: "bookings" },
  ].filter(Boolean);

  // --- social: what is actually going out -------------------------------
  const nextPosts = mediaDrafts
    .filter((d) => d.status === "scheduled" && d.scheduledDate && d.scheduledDate >= today)
    .sort((a, b) => (a.scheduledDate || "").localeCompare(b.scheduledDate || ""));
  // --- the media pipeline, which the day list was hiding -------------------
  const scheduledDrafts = mediaDrafts.filter((d) => d.status === "scheduled");
  const queueEnds = scheduledDrafts
    .map((d) => d.scheduledDate).filter(Boolean).sort().pop() || null;
  const runwayDays = queueEnds
    ? Math.round((new Date(queueEnds) - new Date(today)) / 86400000) : 0;
  // Per platform, because reach is uneven and a list of dates cannot show it.
  const byPlatform = {};
  for (const d of scheduledDrafts) {
    const p = d.platform || "—";
    byPlatform[p] = (byPlatform[p] || 0) + 1;
  }
  const platformRows = Object.entries(byPlatform).sort((a, b) => b[1] - a[1]);
  const maxPlatform = platformRows.length ? platformRows[0][1] : 1;
  // Proof of publication, not a status flag. A draft marked "posted" with no
  // timestamp and no URL is not evidence that anything went out.
  const trulyPublished = mediaDrafts.filter((d) => d.postedAt);
  const lastPublished = trulyPublished
    .map((d) => String(d.postedAt).slice(0, 10)).sort().pop() || null;
  const draftsNeedingYou = mediaDrafts.filter((d) =>
    ["pending", "proposed", "discussing"].includes(d.status)).length;

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
  // Keep the DATES, not just a tally. This was a bare counter, and the Reef
  // panel then called .filter on it to pull out the Saturdays -- a TypeError
  // that took the whole console down the moment Overview rendered. The name
  // matched an array in facts.js and I carried the wrong shape across.
  const openWeekendDates = [];
  for (let i = 0; i < 56; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) continue;
    const key = localDayKey(d);
    if (!bookedDays.has(key)) openWeekendDates.push(key);
  }
  const openWeekends = openWeekendDates.length;
  // Average of what charters actually took, not a list price.
  const charterIncome = (ledger || []).filter((e) => e.type === "income" && e.amount > 0);
  const avgCharter = charterIncome.length
    ? Math.round(charterIncome.reduce((s, e) => s + e.amount, 0) / charterIncome.length)
    : 0;

  // --- Reef: what is realistically still winnable -------------------------
  //
  // Saturday is the business: 14 of 24 completed charters this season, against
  // two Sundays in six months. So the opportunity is counted in Saturdays, and
  // valued at the rate Saturdays actually convert rather than at 100%.
  const isSat = (k) => new Date(k + "T12:00:00").getDay() === 6;
  const openSaturdays = openWeekendDates.filter(isSat);
  let satTotal = 0, satRan = 0;
  {
    const d = new Date(SEASON_FROM + "T12:00:00");
    const end = new Date(today + "T12:00:00");
    const ranOn = new Set(
      externalBookings.filter((b) => b.status === "completed").map((b) => b.date)
    );
    for (; d <= end; d.setDate(d.getDate() + 1)) {
      if (d.getDay() !== 6) continue;
      satTotal++;
      if (ranOn.has(localDayKey(d))) satRan++;
    }
  }
  const satFillRate = satTotal ? satRan / satTotal : 0;
  const likelySales = Math.round(openSaturdays.length * satFillRate);

  // --- Joy: is the intake fixed, or still leaking? -------------------------
  //
  // The total tells you nothing you can act on. The trend tells you whether the
  // problem is behind you or still happening every weekend.
  const completedThisYear = externalBookings.filter(
    (b) => b.status === "completed" && (b.date || "") >= today.slice(0, 4) + "-01-01"
  );
  const capturePeriods = [
    { label: "Before May", from: "0000", to: today.slice(0, 4) + "-05-01" },
    { label: "May–Jun", from: today.slice(0, 4) + "-05-01", to: today.slice(0, 4) + "-07-01" },
    { label: "Jul onward", from: today.slice(0, 4) + "-07-01", to: "9999" },
  ].map((p) => {
    const rows = completedThisYear.filter((b) => (b.date || "") >= p.from && (b.date || "") < p.to);
    const reach = rows.filter((b) => b.phone || b.email).length;
    return { ...p, n: rows.length, reach, pct: rows.length ? Math.round((reach / rows.length) * 100) : null };
  }).filter((p) => p.n > 0);
  const recentCapture = capturePeriods.length ? capturePeriods[capturePeriods.length - 1] : null;

  // --- Nova: research ----------------------------------------------------
  const novaItems = openTodos.filter((t) => /^\[?NOVA/i.test(t.text || ""));
  const novaRun = latestRun(agentActivity, "Nauti Nova");
  function agoWords(d) {
    const days = Math.floor((Date.now() - new Date(d)) / 86400000);
    return days <= 0 ? "today" : days === 1 ? "yesterday" : days + " days ago";
  }

  const CARD = { background: "var(--paper-4)", borderRadius: 10, padding: 14, minWidth: 0 };
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

      <div className="orbit-left" style={{ display: "grid", gap: 14 }}>
        <div style={CARD}>
          <PanelHead owners={["Nauti Pearl"]}>
            <div style={{ ...H, marginBottom: 0 }}>Needs attention {attention.length > 0 && <span style={{ color: "var(--muted)", fontWeight: 400 }}>({attention.length})</span>}</div>
          </PanelHead>
          {attention.length === 0 && <div style={EMPTY}>Genuinely nothing waiting.</div>}
          <div style={{ display: "grid", gap: 7 }}>
            {attention.map((a, i) => {
              const kind = ATTENTION_KIND[a.k] || ATTENTION_KIND.bookings;
              const body = (
                <div style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
                  {/* A coloured rail rather than a tinted row: it marks the
                      domain without washing the text, which has to stay
                      readable in both themes. */}
                  <span
                    aria-hidden="true"
                    title={kind.label}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center",
                      width: 22, height: 22, borderRadius: 6, flexShrink: 0, marginTop: 1,
                      background: kind.color + "22",
                      border: "1px solid " + kind.color + "55",
                      fontSize: 12, lineHeight: 1,
                    }}
                  >
                    {kind.icon}
                  </span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ color: a.urgent ? "#E8934A" : "var(--text)", fontWeight: a.urgent ? 700 : 400 }}>{a.t}</div>
                    <div style={{ color: kind.color, opacity: 0.75, fontSize: 11 }}>{a.w}</div>
                  </span>
                </div>
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
      <div className="orbit-group ">
        <div style={CARD}>
          <PanelHead owners={["Nauti Penny", "Nauti Shelly"]}><Go to="ledger">Money</Go></PanelHead>

          {/* The season first. A seasonal business does not live in calendar
              months, and on the 3rd a month view shows a month of bills against
              three days of income. */}
          <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--muted)" }}>Season in</span>
              <span className="mono" style={{ color: "#7FE0B8", fontWeight: 700 }}>{currency(seasonIn)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--muted)" }}>Season out</span>
              <span className="mono" style={{ color: "var(--pink)" }}>{currency(seasonOut)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 5, borderTop: "1px solid rgba(203,108,230,0.12)" }}>
              <span style={{ fontWeight: 700 }}>Net since March</span>
              <span className="mono" style={{ fontWeight: 700, color: seasonNet >= 0 ? "#7FE0B8" : "#E2685F" }}>
                {seasonNet >= 0 ? "+" : ""}{currency(seasonNet)}
              </span>
            </div>
          </div>

          {/* What a month must clear to stand still, in charters rather than
              dollars, because charters are the thing you can go and get. */}
          <div style={{ marginTop: 10, paddingTop: 9, borderTop: "1px solid rgba(203,108,230,0.12)", display: "grid", gap: 6, fontSize: 13 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--muted)" }}>Costs, per month</span>
              <span className="mono">{currency(Math.round(avgMonthOut))}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--muted)" }}>Break-even</span>
              <span className="mono">
                {breakEven ? breakEven + " charters/mo" : "—"}
                <span style={{ color: "var(--muted)" }}> @ {currency(avgCharterSeason)}</span>
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--muted)" }}>Running at</span>
              <span className="mono" style={{ color: breakEven && tripsPerMonth < breakEven ? "#E8934A" : "#7FE0B8" }}>
                {tripsPerMonth.toFixed(1)} charters/mo
              </span>
            </div>
          </div>

          {/* This month, kept but honestly labelled with how far into it we are
              so a low income figure is read as "early", not "broke". */}
          <div style={{ marginTop: 10, paddingTop: 9, borderTop: "1px solid rgba(203,108,230,0.12)", fontSize: 12.5 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--muted)" }}>
                This month <span style={{ opacity: 0.7 }}>· day {dayOfMonth}</span>
              </span>
              <span className="mono">
                <span style={{ color: "#7FE0B8" }}>{currency(mIncome)}</span>
                <span style={{ color: "var(--muted)" }}> in · </span>
                <span style={{ color: "var(--pink)" }}>{currency(mExpense)}</span>
                <span style={{ color: "var(--muted)" }}> out</span>
              </span>
            </div>
            {heldMoney > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
                <span style={{ color: "#E8934A" }}>Held, undelivered</span>
                <span className="mono" style={{ color: "#E8934A", fontWeight: 700 }}>{currency(heldMoney)}</span>
              </div>
            )}
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
          </div>

          {/* The trend, not the total. A total reads as a sunk cost; the trend
              says whether guests are still walking off the boat uncontactable
              this weekend. */}
          <div style={{ marginTop: 10, paddingTop: 9, borderTop: "1px solid rgba(203,108,230,0.12)" }}>
            <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 6 }}>
              Contact details captured, by when they sailed
            </div>
            <div style={{ display: "grid", gap: 5 }}>
              {capturePeriods.map((p) => (
                <div key={p.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5 }}>
                  <span style={{ width: 64, flexShrink: 0, color: "var(--muted)", whiteSpace: "nowrap" }}>{p.label}</span>
                  <span style={{ flex: 1, height: 6, background: "rgba(203,108,230,0.12)", borderRadius: 3, overflow: "hidden" }}>
                    <span style={{
                      display: "block", height: "100%", width: p.pct + "%",
                      background: p.pct >= 80 ? "#7FE0B8" : p.pct >= 50 ? "#E8934A" : "#E2685F",
                    }} />
                  </span>
                  {/* Wide enough for the longest real value, and never wrapping. At 52px
                      "36% 4/11" broke across two lines, so the percentage and the count
                      it came from stacked and the row read as two unrelated numbers. */}
                  <span className="mono" style={{ width: 74, textAlign: "right", flexShrink: 0, whiteSpace: "nowrap" }}>
                    {p.pct}% <span style={{ color: "var(--muted)" }}>{p.reach}/{p.n}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 10, paddingTop: 9, borderTop: "1px solid rgba(203,108,230,0.12)", display: "grid", gap: 6, fontSize: 12.5 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--muted)" }}>Can be asked now</span>
              <span className="mono" style={{ fontWeight: 700 }}>{askable}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--muted)" }}>Unreachable, ever</span>
              <span className="mono" style={{ color: "var(--muted)" }}>{unreachable}</span>
            </div>
          </div>
          <div style={{ marginTop: 9, fontSize: 11.5, color: "var(--muted)", lineHeight: 1.45 }}>
            {recentCapture && recentCapture.pct < 90
              ? `Still leaking: ${recentCapture.n - recentCapture.reach} of the last ${recentCapture.n} guests left with no phone or email on file. The fix is at the dock, not in the asking.`
              : "Capture is holding. Every recent guest can be reached."}
          </div>
        </div>
        <div className="orbit-crew">
          <CrewCard r={byName["Nauti Joy"]} compact />
        </div>
      </div>
      </div>

      <div className="orbit-center" style={{ display: "grid", gap: 14 }}>
        <div className="orbit-lead-pearl"><CrewCard r={byName["Nauti Pearl"]} /></div>
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

      <div className="orbit-right" style={{ display: "grid", gap: 14 }}>
        <div style={CARD}>
          <PanelHead owners={["Nauti Pearl", "Nauti Penny"]}><Go to="maintenance">The fleet</Go></PanelHead>

          {/* Next out, and how long the wait is. A gap is as much the news as
              the booking. */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 12.5, color: "var(--muted)", flex: "0 0 auto" }}>Next out</span>
            {nextOut ? (
              <span style={{ fontSize: 12.5, textAlign: "right", minWidth: 0, flex: "1 1 auto" }}>
                <strong>{nextOut.guestName || "(no name)"}</strong>
                <span style={{ color: "var(--muted)" }}> · {nextOut.vesselName}</span>
                <div className="mono" style={{ fontSize: 11.5, color: daysToNext > 14 ? "#E8934A" : "#4FA8E8" }}>
                  {nextOut.date} · {daysToNext === 0 ? "today" : daysToNext === 1 ? "tomorrow" : "in " + daysToNext + " days"}
                </div>
              </span>
            ) : (
              <span style={{ fontSize: 12.5, color: "#E8934A", fontWeight: 700 }}>nothing booked</span>
            )}
          </div>

          {/* The bookings list is still one click away, just not behind a
              heading that says "fleet". */}
          {onGo && (
            <button
              type="button"
              onClick={() => onGo("bookings")}
              style={{
                background: "transparent", border: "none", padding: 0, marginBottom: 10,
                color: "var(--purple)", fontSize: 11.5, cursor: "pointer", textAlign: "left",
              }}
            >
              View all bookings →
            </button>
          )}

          {/* Per boat, this season. The point of the panel: an idle hull still
              costs insurance, storage and depreciation. */}
          <div style={{ display: "grid", gap: 6, paddingTop: 9, borderTop: "1px solid rgba(203,108,230,0.12)" }}>
            {fleet.map((v) => {
              const cold = v.trips === 0;
              const stale = v.idleDays != null && v.idleDays > 30;
              return (
                <div key={v.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, fontSize: 12.5 }}>
                  {/* The name takes whatever is left and truncates; the figures
                      never shrink. Both halves flexing is what pushed the money
                      column off the edge of the card. */}
                  <span style={{ minWidth: 0, flex: "1 1 auto", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 7 }}>
                    <VesselIcon id={v.id} color={cold ? "#E2685F" : "var(--muted)"} />
                    <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                      <strong style={{ color: cold ? "#E2685F" : "var(--text)" }}>{v.name}</strong>
                      <span style={{ color: "var(--muted)" }}> {v.trips} {v.trips === 1 ? "trip" : "trips"}</span>
                    </span>
                  </span>
                  <span style={{ whiteSpace: "nowrap", fontSize: 11.5, flex: "0 0 auto" }}>
                    {cold ? (
                      <span style={{ color: "#E2685F", fontWeight: 700 }}>never ran this season</span>
                    ) : (
                      <>
                        <span className="mono" style={{ color: "#7FE0B8" }}>{currency(v.earned)}</span>
                        <span style={{ color: stale ? "#E8934A" : "var(--muted)" }}> · idle {v.idleDays}d</span>
                      </>
                    )}
                  </span>
                </div>
              );
            })}
          </div>

          {/* An empty Saturday is the most expensive thing the business owns,
              so it belongs beside the boats rather than buried in a revenue
              panel. */}
          <div style={{ marginTop: 10, paddingTop: 9, borderTop: "1px solid rgba(203,108,230,0.12)", display: "grid", gap: 5, fontSize: 12.5 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--muted)" }}>Season so far</span>
              <span className="mono">{seasonTrips} trips · {currency(seasonEarned)}</span>
            </div>
            {/* Open dates moved to Reef's panel, which counts Saturdays and
                values them at the rate Saturdays actually fill. Two panels
                quoting different figures for the same thing on one screen is
                worse than either figure alone. */}
          </div>

          {/* The names still matter, just not as the headline -- the Bookings
              tab is one click away for the full list. */}
          {charters.length > 0 && (
            <div style={{ marginTop: 9, fontSize: 11.5, color: "var(--muted)", lineHeight: 1.5 }}>
              Recent: {charters.filter((b) => b.status === "completed").slice(0, 4)
                .map((b) => (b.guestName || "?") + " " + String(b.date).slice(5)).join(" · ")}
            </div>
          )}
        </div>
      <div className="orbit-group ">
        <div style={CARD}>
          <PanelHead owners={["Nauti Siren", "Nauti Coral"]}><Go to="mediaDrafts">Going out next</Go></PanelHead>

          {/* What is next, plainly. */}
          {nextByDay.length === 0 ? (
            <div style={EMPTY}>Nothing scheduled.</div>
          ) : (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, fontSize: 12.5, marginBottom: 10 }}>
              <span style={{ flex: "0 0 auto", color: "var(--muted)" }}>Next up</span>
              <span style={{ textAlign: "right", minWidth: 0, flex: "1 1 auto" }}>
                <strong style={{ color: nextByDay[0].day === today ? "#E8934A" : "var(--text)" }}>
                  {mediaDraftDate(nextByDay[0].day) || nextByDay[0].day}
                </strong>
                <div style={{ color: "var(--muted)", fontSize: 11.5, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {nextByDay[0].platforms.map((p, i) => <PlatformLabel key={p + i} platform={p} size={11} />)}
                </div>
              </span>
            </div>
          )}

          {/* Runway. A content queue's first duty is to say when it runs out,
              and this one stops before the season does. */}
          <div style={{ display: "grid", gap: 6, fontSize: 12.5, paddingTop: 9, borderTop: "1px solid rgba(203,108,230,0.12)" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--muted)" }}>Queue runs to</span>
              <span className="mono" style={{ color: runwayDays < 10 ? "#E8934A" : "var(--text)" }}>
                {queueEnds || "—"}{queueEnds ? " · " + runwayDays + "d" : ""}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--muted)" }}>Scheduled</span>
              <span className="mono">{scheduledDrafts.length} posts · {nextByDay.length} days</span>
            </div>
            {draftsNeedingYou > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#E8934A" }}>Waiting on you</span>
                <span className="mono" style={{ color: "#E8934A", fontWeight: 700 }}>{draftsNeedingYou}</span>
              </div>
            )}
          </div>

          {/* Reach per platform. Facebook carries every day; the two that need
              video carry half as many, and a list of dates cannot show that. */}
          <div style={{ marginTop: 10, paddingTop: 9, borderTop: "1px solid rgba(203,108,230,0.12)", display: "grid", gap: 5 }}>
            {platformRows.map(([name, n]) => (
              <div key={name} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5 }}>
                <span style={{ width: 78, flexShrink: 0, color: "var(--muted)", display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <PlatformIcon platform={name} size={11} />
                  {name}
                </span>
                <span style={{ flex: 1, height: 6, background: "rgba(203,108,230,0.12)", borderRadius: 3, overflow: "hidden" }}>
                  <span style={{ display: "block", height: "100%", width: Math.round((n / maxPlatform) * 100) + "%", background: "var(--purple)", opacity: 0.75 }} />
                </span>
                <span className="mono" style={{ width: 18, textAlign: "right", flexShrink: 0 }}>{n}</span>
              </div>
            ))}
          </div>

          {/* Publication, evidenced. "posted" with no timestamp and no URL is
              not proof that anything went out. */}
          <div style={{ marginTop: 10, paddingTop: 9, borderTop: "1px solid rgba(203,108,230,0.12)", fontSize: 11.5, lineHeight: 1.45 }}>
            {lastPublished ? (
              <span style={{ color: "var(--muted)" }}>
                Last confirmed publish <span className="mono">{lastPublished}</span> · {trulyPublished.length} on record
              </span>
            ) : (
              <span style={{ color: "#E8934A" }}>
                Nothing has published yet with a timestamp to prove it — the next one is the first.
              </span>
            )}
          </div>
        </div>
        {/* Siren first: Coral reports to her and she gates before publish,
            so the stack should read down the chain, not up it. */}
        <div className="orbit-crew">
          <CrewCard r={byName["Nauti Siren"]} compact />
          <CrewCard r={byName["Nauti Coral"]} compact />
        </div>
      </div>
      <div className="orbit-group ">
        <div style={CARD}>
          <PanelHead owners={["Nauti Reef"]}><Go to="giftCertificates">Money on the table</Go></PanelHead>
          <div style={{ display: "grid", gap: 7, fontSize: 13 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--muted)" }}>Open Saturdays, next 8wks</span>
              <span className="mono" style={{ fontWeight: 700 }}>{openSaturdays.length}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--muted)" }}>Saturdays that fill</span>
              <span className="mono">
                {Math.round(satFillRate * 100)}%
                <span style={{ color: "var(--muted)" }}> · {satRan} of {satTotal} since Mar</span>
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 5, borderTop: "1px solid rgba(203,108,230,0.12)" }}>
              <span style={{ fontWeight: 700 }}>Likely to sell</span>
              <span className="mono" style={{ fontWeight: 700, color: "#7FE0B8" }}>
                ~{likelySales} · {currency(likelySales * avgCharterSeason)}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--muted)" }}>If every one sold</span>
              <span className="mono" style={{ color: "var(--muted)" }}>{currency(openSaturdays.length * avgCharterSeason)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 5, borderTop: "1px solid rgba(203,108,230,0.12)" }}>
              <span style={{ color: giftCertificates.length === 0 ? "#E8934A" : "var(--muted)" }}>Gift certificates sold</span>
              <span className="mono" style={{ color: giftCertificates.length === 0 ? "#E8934A" : "var(--text)", fontWeight: 700 }}>{giftCertificates.length}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--muted)" }}>Ideas open on the board</span>
              <span className="mono">{revenueIdeas}</span>
            </div>
          </div>
          <div style={{ marginTop: 9, paddingTop: 8, borderTop: "1px solid rgba(203,108,230,0.12)", fontSize: 11.5, color: "var(--muted)", lineHeight: 1.45 }}>
            Counted in Saturdays, not weekend days: Saturday carried 14 of 24 charters this
            season and Sunday ran twice in six months. Valued at the {currency(avgCharterSeason)} the
            season actually took, and at the rate Saturdays actually fill.
          </div>
        </div>
        <div className="orbit-crew">
          <CrewCard r={byName["Nauti Reef"]} compact />
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
          {platforms.length ? (
            <span style={{ display: "inline-flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              {platforms.map((p, i) => <PlatformLabel key={p + i} platform={p} size={11} />)}
            </span>
          ) : `${items.length} post${items.length === 1 ? "" : "s"}`}
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
  const [showArchived, setShowArchived] = useState(false);
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
    } else if ((target.kind === "inquiry" || target.kind === "contact") && onUpdateInquiry) {
      // Both live in the Inquiry table, so both save the same way.
      //
      // This branch used to test for kind "site", which no row has ever had --
      // toUnifiedRows has always produced "inquiry". So ticking off a charter
      // booked through the site wrote nothing to the database; the tick came
      // back only from the local mark this panel keeps, and would have vanished
      // on another device. Silent, because the optimistic update makes the tick
      // appear either way.
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

  // Extra guest contacts: people who sailed on somebody else's reservation and
  // whose number was kept, explicitly, for a second review ask from that trip.
  //
  // toUnifiedRows drops these on purpose -- a contact is not a booking, and
  // letting one through would put it under Bookings and inflate the inquiry
  // count. That is right everywhere except here. They were listed in the Guests
  // panel as "never asked for a review" and then offered in no list that could
  // ask them, which is the console setting a job and withholding the button.
  // The weekly reminder email has always included them.
  const contactRows = inquiries.filter(isGuestContactRow).map((i) => ({
    kind: "contact",
    id: i.id,
    bookingId: i.bookingId,
    date: i.date,
    name: i.name,
    email: i.email,
    phone: i.phone,
    vesselName: i.vesselName,
    source: "Other",
    statusBucket: "completed", // they sailed; that is the only bucket that matters here
    raw: i,
  }));

  // Only charters that actually happened can be asked about. Both a site
  // Inquiry marked "completed" and an ExternalBooking marked "completed" land
  // in the same unified "completed" bucket.
  const completed = [...toUnifiedRows(inquiries, externalBookings), ...contactRows]
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

  // People he has decided never to ask -- a guest who damaged something, or one
  // he would rather not hear from. Without this they sat in the list forever,
  // looking exactly like work not yet done, and the only way to clear one was to
  // mark it asked, which is a lie the record then keeps.
  const isArchived = (r) => Boolean(r.raw && r.raw.marketingOptOut);
  const archived = completed.filter(isArchived);
  const live = completed.filter((r) => !isArchived(r));

  const askedCount = live.filter(wasAsked).length;
  const rows =
    filter === "todo" ? live.filter((r) => !wasAsked(r))
    : filter === "asked" ? live.filter((r) => wasAsked(r))
    : filter === "archived" ? archived
    // "Every charter" means every charter. It used to quietly drop the archived
    // ones, which makes it the one filter that lies about what it shows.
    : completed;

  function setArchived(row, on) {
    if (row.kind === "external" && onUpdateExternalBooking) onUpdateExternalBooking(row.id, { marketingOptOut: on });
    else if (onUpdateInquiry) onUpdateInquiry(row.id, { marketingOptOut: on });
  }

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

  // The plate sits over the head of the panel and stops where the table starts.
  // That is the Bookings pattern: the Add booking form is on a plate, the
  // bookings table below it is not. A plate behind a form is texture; behind
  // forty rows of dense table it fights the scanning the table exists for.
  const HEAD = { background: "var(--paper-9)", border: "1px solid rgba(203,108,230,0.16)", borderRadius: 10, padding: 16, color: "var(--text)" };
  const BODY = { background: "var(--ink-soft)", border: "1px solid rgba(203,108,230,0.16)", borderRadius: 10, padding: 16, marginTop: 12, color: "var(--text)" };

  return (
    <div style={{ marginBottom: 20 }}>
    <div style={HEAD}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontWeight: 700 }}>
          Ask past guests for a Google review
          <span style={{ color: "var(--muted)", fontWeight: 400, fontSize: 12.5 }}>
            {" "}— {live.length} to ask · {askedCount} marked asked · {live.length - askedCount} to go
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

          {/* Black, not another pink wash. This is the single most effective
              thing on the page -- asking at the dock beats every message -- and
              on a panel already full of pink it was just more of the same. */}
          <div style={{ background: "var(--ink)", border: "1px solid rgba(203,108,230,0.3)", borderRadius: 8, padding: "10px 12px", marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: "var(--purple)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
              Say this at the dock — it beats every message
            </div>
            <div style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--text)", opacity: 0.9 }}>{DOCK_SCRIPT}</div>
          </div>
        </>
      )}
      </div>

      {open && (
        <div style={BODY}>
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
              {[["todo", "Still to ask"], ["asked", "Already asked"], ["archived", `Not asking${archived.length ? " (" + archived.length + ")" : ""}`], ["all", "Every charter"]].map(([id, label]) => (
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
                            {/* An extra contact has no charter of its own -- they
                                sailed on somebody else's booking. Saying so beats a
                                bare dash, which reads as a missing reference. */}
                            <div className="mono" style={{ color: r.bookingId ? "#E8934A" : "var(--muted)", fontSize: 11 }}>
                              {r.bookingId || (r.kind === "contact" ? "extra contact" : "—")}
                            </div>
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
                          {/* Only meaningful without a phone number. Those
                              guests cannot be texted at all, so the platform
                              thread is the only way to reach them and the column
                              is the instruction. Beside a Text it button it was
                              noise on every row. */}
                          <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                            {smsHref(r.phone, "x")
                              ? <span style={{ color: "var(--muted)" }}>Text</span>
                              : channelFor(r.source)}
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
                                    // Green: the one action that actually does
                                    // the job. Pink is the page's default accent
                                    // and made this read as just another button.
                                    color: canSendSms ? "#04140D" : "var(--muted)",
                                    background: canSendSms ? "#4FBF8B" : "transparent",
                                    border: "1px solid " + (canSendSms ? "#4FBF8B" : "rgba(203,108,230,0.3)"),
                                    borderRadius: 6, padding: "5px 12px", fontSize: 11.5, fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap",
                                  }}>
                                  {canSendSms ? "Text it" : "Text it (phone only)"}
                                </a>
                              )}
                              {/* Blue: reading, not doing. */}
                              <button type="button" onClick={() => setPreviewKey(previewKey === r.key ? null : r.key)}
                                style={{ background: "transparent", color: "#4FA8E8", border: "1px solid rgba(79,168,232,0.55)", borderRadius: 6, padding: "5px 10px", fontSize: 11.5, fontWeight: 600 }}>
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
                              {/* The honest way out of this list. Before it, the
                                  only way to clear someone he was never going to
                                  ask was to mark them asked -- which puts a lie
                                  in the record and hides it behind a tick. */}
                              {/* Amber, and outlined rather than filled: it
                                  removes someone from the list, so it should be
                                  findable without inviting a stray click. */}
                              <button type="button" onClick={() => setArchived(r, true)}
                                title="Take them off this list for good. Nothing is deleted."
                                style={{ background: "transparent", color: "#E8934A", border: "1px solid rgba(232,147,74,0.5)", borderRadius: 6, padding: "4px 10px", fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>
                                Don&rsquo;t ask
                              </button>
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
        </div>
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
            background: "var(--paper-2)", borderRadius: 10, padding: 14, color: "var(--text)",
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

  const CARD = { background: "var(--paper-7)", borderRadius: 10, padding: 14 };

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
        <form onSubmit={submit} style={{ background: "var(--paper-12)", borderRadius: 10, padding: 14, alignSelf: "start" }}>
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
