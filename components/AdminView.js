"use client";

import { useState, useEffect } from "react";
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
  onUpdatePrice, onUpdatePricePerGuest, onUpdateHourlyByVesselPrice, onUpdateTierPrice,
  onAddLedgerEntry, onToggleBlocked, onUpdateCaption, onMarkInquiry, onLogout,
  onUpdateAddonPrice, onAddExternalBooking, onSetExternalBookingStatus, onDeleteExternalBooking,
}) {
  const [tab, setTab] = useState("inquiries");

  const tabs = [
    { id: "inquiries", label: `Inquiries (${inquiries.length})` },
    { id: "bookings", label: `External bookings (${externalBookings.length})` },
    { id: "pricing", label: "Packages & pricing" },
    { id: "addons", label: "Add-ons" },
    { id: "availability", label: "Availability" },
    { id: "media", label: "Media" },
    { id: "ledger", label: "Income & expenses" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "var(--ink)" }}>
      <div style={{ background: "var(--ink-soft)", color: "var(--text)", padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(203,108,230,0.2)" }}>
        <div className="display" style={{ fontSize: 20, fontWeight: 700 }}>OWNER CONSOLE</div>
        <div style={{ display: "flex", gap: 10 }}>
          <a href="/" style={{ background: "transparent", color: "var(--text)", border: "1px solid var(--purple)", borderRadius: 6, padding: "7px 14px", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
            ← Back to site
          </a>
          <button onClick={onLogout} style={{ background: "var(--purple)", color: "#0A0612", border: "none", borderRadius: 6, padding: "7px 14px", fontSize: 13, fontWeight: 700 }}>
            Log out
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, padding: "16px 24px 0", flexWrap: "wrap" }}>
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            background: tab === t.id ? "var(--purple)" : "transparent", color: tab === t.id ? "#0A0612" : "var(--text)",
            border: "1px solid var(--purple)", borderRadius: "8px 8px 0 0", padding: "9px 14px", fontSize: 13, fontWeight: 600,
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
                  </div>
                  {i.message && <div style={{ fontSize: 12.5, marginTop: 4 }}>{i.message}</div>}
                </div>
                <select value={i.status} onChange={(e) => onMarkInquiry(i.id, e.target.value)} style={{ alignSelf: "center", padding: "6px 8px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)", fontSize: 12.5 }}>
                  <option value="new">New</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="declined">Declined</option>
                </select>
              </div>
            ))}
          </div>
        )}

        {tab === "bookings" && (
          <ExternalBookingsTab
            vessels={vessels}
            externalBookings={externalBookings}
            onAdd={onAddExternalBooking}
            onSetStatus={onSetExternalBookingStatus}
            onDelete={onDeleteExternalBooking}
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

        {tab === "ledger" && (
          <LedgerTab ledger={ledger} totals={totals} onAdd={onAddLedgerEntry} />
        )}
      </div>
    </div>
  );
}

const BOOKING_PLATFORMS = ["Boatsetter", "GetmyBoat", "Facebook", "Instagram", "Other"];

function ExternalBookingsTab({ vessels, externalBookings, onAdd, onSetStatus, onDelete }) {
  const emptyForm = {
    vesselId: vessels[0]?.id || "", date: localDateKey(new Date()), hours: 4,
    guestName: "", partySize: "", platform: BOOKING_PLATFORMS[0], status: "pending", note: "",
  };
  const [form, setForm] = useState(emptyForm);

  function submit(e) {
    e.preventDefault();
    if (!form.date || !form.vesselId) return;
    const vessel = vessels.find((v) => v.id === form.vesselId);
    onAdd({ ...form, vesselName: vessel?.name || form.vesselId, hours: Number(form.hours), partySize: form.partySize ? Number(form.partySize) : null });
    setForm(emptyForm);
  }

  const pending = externalBookings.filter((b) => b.status === "pending");
  const confirmed = externalBookings.filter((b) => b.status === "confirmed");

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(280px,340px) 1fr", gap: 24 }}>
      <form onSubmit={submit} style={{ background: "var(--card)", borderRadius: 10, padding: 14, alignSelf: "start" }}>
        <p style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 0, marginBottom: 10 }}>
          Log a booking from GetMyBoat, Boatsetter, or elsewhere. Confirming it marks that day partially booked (or fully, at 8+ combined hours) on the public availability calendar.
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
        <input type="text" placeholder="Note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })}
          style={{ width: "100%", padding: "9px 10px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)", marginBottom: 10 }} />
        <button type="submit" style={{ width: "100%", background: "linear-gradient(135deg, var(--purple), var(--pink))", color: "#0A0612", border: "none", borderRadius: 6, padding: "10px", fontWeight: 700 }}>Add booking</button>
      </form>

      <div style={{ display: "grid", gap: 20 }}>
        {[["Pending", pending], ["Confirmed", confirmed]].map(([label, list]) => (
          <div key={label}>
            <div style={{ fontWeight: 700, marginBottom: 8, color: "var(--text)" }}>{label} ({list.length})</div>
            <div style={{ display: "grid", gap: 6 }}>
              {list.length === 0 && <div style={{ color: "var(--muted)", fontSize: 13.5 }}>None yet.</div>}
              {list.map((b) => (
                <div key={b.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--card)", borderRadius: 6, padding: "8px 12px", fontSize: 13.5, color: "var(--text)", gap: 10 }}>
                  <div>
                    <div>{b.date} — {b.vesselName} — {b.guestName || "Guest"}{b.partySize ? ` (${b.partySize})` : ""}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                      {[b.hours ? `${b.hours} hrs` : null, b.platform, b.note].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button type="button" onClick={() => onSetStatus(b.id, b.status === "confirmed" ? "pending" : "confirmed")}
                      style={{ background: "transparent", color: "var(--purple)", border: "1px solid var(--purple)", borderRadius: 6, padding: "5px 9px", fontSize: 11.5, fontWeight: 600 }}>
                      {b.status === "confirmed" ? "Mark pending" : "Confirm"}
                    </button>
                    <button type="button" onClick={() => onDelete(b.id)}
                      style={{ background: "transparent", color: "var(--pink)", border: "1px solid var(--pink)", borderRadius: 6, padding: "5px 9px", fontSize: 11.5, fontWeight: 600 }}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
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

function LedgerTab({ ledger, totals, onAdd }) {
  const emptyForm = {
    type: "income", amount: "", note: "", date: localDateKey(new Date()),
    category: INCOME_CATEGORIES[0], origin: RESERVATION_ORIGINS[0], bookingId: "",
  };
  const [form, setForm] = useState(emptyForm);
  const categoryOptions = form.type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const originOptions = form.type === "income" ? RESERVATION_ORIGINS : STATEMENT_ORIGINS;

  function setType(type) {
    const categories = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    const origins = type === "income" ? RESERVATION_ORIGINS : STATEMENT_ORIGINS;
    setForm({ ...form, type, category: categories[0], origin: origins[0] });
  }

  function submit(e) {
    e.preventDefault();
    if (!form.amount) return;
    onAdd({ ...form, amount: Number(form.amount) });
    setForm(emptyForm);
  }

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
          <input type="text" placeholder="Note (e.g. guest name, description)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })}
            style={{ width: "100%", padding: "9px 10px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)", marginBottom: 10 }} />
          <button type="submit" style={{ width: "100%", background: "linear-gradient(135deg, var(--purple), var(--pink))", color: "#0A0612", border: "none", borderRadius: 6, padding: "10px", fontWeight: 700 }}>Add entry</button>
        </form>
      </div>
      <div>
        <div style={{ fontWeight: 700, marginBottom: 8, color: "var(--text)" }}>Recent entries</div>
        <div style={{ display: "grid", gap: 6, maxHeight: 380, overflowY: "auto" }}>
          {ledger.length === 0 && <div style={{ color: "var(--muted)", fontSize: 13.5 }}>No entries yet.</div>}
          {ledger.map((l) => (
            <div key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", background: "var(--card)", borderRadius: 6, padding: "8px 12px", fontSize: 13.5, color: "var(--text)", gap: 10 }}>
              <div>
                <div>{l.date} — {l.note || l.category || "(no note)"}</div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                  {[l.category, l.origin, l.bookingId && `#${l.bookingId}`].filter(Boolean).join(" · ")}
                </div>
              </div>
              <span className="mono" style={{ color: l.type === "income" ? "#7FE0B8" : "#F0559C", fontWeight: 700, whiteSpace: "nowrap" }}>
                {l.type === "income" ? "+" : "−"}{currency(l.amount)}
              </span>
            </div>
          ))}
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
