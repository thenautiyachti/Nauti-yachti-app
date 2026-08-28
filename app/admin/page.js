"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import AdminView from "../../components/AdminView";

async function api(path, options) {
  const res = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options && options.headers) },
  });
  if (!res.ok) throw new Error(`Request failed: ${path}`);
  return res.json();
}

export default function AdminPage() {
  const [checking, setChecking] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [loginError, setLoginError] = useState("");

  const [loading, setLoading] = useState(false);
  const [packages, setPackages] = useState([]);
  const [vessels, setVessels] = useState([]);
  const [gallery, setGallery] = useState([]);
  const [blocked, setBlocked] = useState({});
  const [inquiries, setInquiries] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [addons, setAddons] = useState([]);
  const [externalBookings, setExternalBookings] = useState([]);

  useEffect(() => {
    api("/api/admin/session")
      .then((r) => setAuthed(r.authenticated))
      .finally(() => setChecking(false));
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [p, v, g, b, i, l, a, eb] = await Promise.all([
      api("/api/packages"),
      api("/api/vessels"),
      api("/api/gallery"),
      api("/api/blocked-dates"),
      api("/api/inquiries"),
      api("/api/ledger"),
      api("/api/addons"),
      api("/api/external-bookings"),
    ]);
    setPackages(p); setVessels(v); setGallery(g); setBlocked(b); setInquiries(i); setLedger(l); setAddons(a); setExternalBookings(eb);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (authed) loadAll();
  }, [authed, loadAll]);

  async function handleLogin(e) {
    e.preventDefault();
    setLoginError("");
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setLoginError(body.error || "Login failed");
      return;
    }
    setAuthed(true);
  }

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    setAuthed(false);
  }

  async function updatePackagePrice(id, price) {
    await api(`/api/packages/${id}`, { method: "PATCH", body: JSON.stringify({ field: "price", value: price }) });
    setPackages((prev) => prev.map((p) => (p.id === id ? { ...p, price } : p)));
  }
  async function updatePricePerGuest(id, pricePerGuest) {
    await api(`/api/packages/${id}`, { method: "PATCH", body: JSON.stringify({ field: "pricePerGuest", value: pricePerGuest }) });
    setPackages((prev) => prev.map((p) => (p.id === id ? { ...p, pricePerGuest } : p)));
  }
  async function updateHourlyByVesselPrice(id, vesselId, dayType, hour, value) {
    await api(`/api/packages/${id}`, { method: "PATCH", body: JSON.stringify({ field: "hourlyByVesselCell", vesselId, dayType, hour, value }) });
    setPackages((prev) => prev.map((p) => {
      if (p.id !== id) return p;
      const hourlyByVessel = { ...p.hourlyByVessel };
      hourlyByVessel[vesselId] = { ...hourlyByVessel[vesselId], [dayType]: { ...hourlyByVessel[vesselId][dayType], [hour]: value } };
      return { ...p, hourlyByVessel };
    }));
  }
  async function updateTierPrice(id, tierIndex, value) {
    await api(`/api/packages/${id}`, { method: "PATCH", body: JSON.stringify({ field: "tier", tierIndex, value }) });
    setPackages((prev) => prev.map((p) => {
      if (p.id !== id) return p;
      const tiers = p.tiers.map((t, i) => (i === tierIndex ? { ...t, price: value } : t));
      return { ...p, tiers };
    }));
  }
  async function toggleBlocked(vesselId, date) {
    const result = await api("/api/blocked-dates", { method: "POST", body: JSON.stringify({ vesselId, date }) });
    setBlocked((prev) => {
      const current = prev[vesselId] || [];
      const next = result.blocked ? [...current, date] : current.filter((d) => d !== date);
      return { ...prev, [vesselId]: next };
    });
  }
  async function updateCaption(id, caption) {
    await api(`/api/gallery/${id}`, { method: "PATCH", body: JSON.stringify({ caption }) });
    setGallery((prev) => prev.map((g) => (g.id === id ? { ...g, caption } : g)));
  }
  async function markInquiry(id, status) {
    await api(`/api/inquiries/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    setInquiries((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)));
  }
  async function addLedgerEntry(entry) {
    const created = await api("/api/ledger", { method: "POST", body: JSON.stringify(entry) });
    setLedger((prev) => [created, ...prev]);
  }
  async function updateAddonPrice(id, price) {
    await api(`/api/addons/${id}`, { method: "PATCH", body: JSON.stringify({ field: "price", value: price }) });
    setAddons((prev) => prev.map((a) => (a.id === id ? { ...a, price } : a)));
  }
  async function addExternalBooking(booking) {
    const created = await api("/api/external-bookings", { method: "POST", body: JSON.stringify(booking) });
    setExternalBookings((prev) => [...prev, created]);
    if (created.status === "confirmed") {
      setBlocked((prev) => {
        const current = prev[created.vesselId] || [];
        return current.includes(created.date) ? prev : { ...prev, [created.vesselId]: [...current, created.date] };
      });
    }
  }
  async function setExternalBookingStatus(id, status) {
    const updated = await api(`/api/external-bookings/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    setExternalBookings((prev) => prev.map((b) => (b.id === id ? updated : b)));
    if (status === "confirmed") {
      setBlocked((prev) => {
        const current = prev[updated.vesselId] || [];
        return current.includes(updated.date) ? prev : { ...prev, [updated.vesselId]: [...current, updated.date] };
      });
    }
  }
  async function deleteExternalBooking(id) {
    await api(`/api/external-bookings/${id}`, { method: "DELETE" });
    setExternalBookings((prev) => prev.filter((b) => b.id !== id));
  }

  const totals = useMemo(() => {
    const income = ledger.filter((l) => l.type === "income").reduce((s, l) => s + Number(l.amount || 0), 0);
    const expense = ledger.filter((l) => l.type === "expense").reduce((s, l) => s + Number(l.amount || 0), 0);
    return { income, expense, net: income - expense };
  }, [ledger]);

  if (checking) {
    return <div style={{ minHeight: "100vh", background: "var(--ink)", color: "var(--text)", display: "flex", alignItems: "center", justifyContent: "center" }}>Loading…</div>;
  }

  if (!authed) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--ink)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div className="display" style={{ fontSize: 26, color: "var(--text)", marginBottom: 10 }}>Owner console</div>
        <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <input
            type="password"
            placeholder="Passcode"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            style={{ padding: "10px 14px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)", marginBottom: 10, width: 220, textAlign: "center" }}
          />
          {loginError && <div style={{ color: "var(--pink)", fontSize: 13, marginBottom: 8 }}>{loginError}</div>}
          <button type="submit" style={{ background: "var(--purple)", color: "#0A0612", border: "none", borderRadius: 6, padding: "10px 20px", fontWeight: 700 }}>
            Enter
          </button>
        </form>
        <a href="/" style={{ marginTop: 16, color: "var(--muted)", fontSize: 13 }}>← Back to site</a>
      </div>
    );
  }

  if (loading) {
    return <div style={{ minHeight: "100vh", background: "var(--ink)", color: "var(--text)", display: "flex", alignItems: "center", justifyContent: "center" }}>Loading console…</div>;
  }

  return (
    <AdminView
      packages={packages}
      vessels={vessels}
      gallery={gallery}
      blocked={blocked}
      inquiries={inquiries}
      ledger={ledger}
      totals={totals}
      addons={addons}
      externalBookings={externalBookings}
      onUpdatePrice={updatePackagePrice}
      onUpdatePricePerGuest={updatePricePerGuest}
      onUpdateHourlyByVesselPrice={updateHourlyByVesselPrice}
      onUpdateTierPrice={updateTierPrice}
      onAddLedgerEntry={addLedgerEntry}
      onToggleBlocked={toggleBlocked}
      onUpdateCaption={updateCaption}
      onMarkInquiry={markInquiry}
      onUpdateAddonPrice={updateAddonPrice}
      onAddExternalBooking={addExternalBooking}
      onSetExternalBookingStatus={setExternalBookingStatus}
      onDeleteExternalBooking={deleteExternalBooking}
      onLogout={handleLogout}
    />
  );
}
