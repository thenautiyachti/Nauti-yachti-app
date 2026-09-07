"use client";

// The dock page: who to ask for a Google review, on a phone, right now.
//
// The console already drafts these asks, but it is a desktop tool and an sms:
// link needs a phone — so the ask kept ending up as an evening job at a desk,
// which is where it stops happening. Three same-day reviews arrived on
// 2 September from three asks, so the wording is not the problem; the distance
// between "I should ask" and "asked" is.
//
// One screen, one tap per guest, biggest thumb targets available.
import { useState, useEffect, useCallback } from "react";
import { smsHref, reviewMessage, daysSince, askWindow, ASK_WINDOWS, GOOGLE_REVIEW_URL } from "../../../lib/reviews";
import { isMetered, currentHours } from "../../../lib/engineHours";
import { bookingPhones, addPhone, removePhone, makePrimary, prettyPhone as fmtPhone, normalizePhone } from "../../../lib/bookingPhones";
import { charterNow, minutesLeft, humanLeft, addOnsFor } from "../../../lib/charterNow";
import { milesBetween } from "../../../lib/runForHome";
import { KINDS, PLACE_KINDS, HAZARD_KINDS, KIND_LABEL, KIND_ICON, nearest, isHazard } from "../../../lib/waterPoints";
import { byVessel as maintByVessel, summarise as maintSummarise, hoursForItem as maintHoursFor } from "../../../lib/maintenance";
import RadarMap from "../../../components/RadarMap";

async function api(path, options) {
  const res = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options && options.headers) },
  });
  if (!res.ok) throw new Error("Request failed: " + path);
  return res.json();
}

function todayKey() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

export default function AskPage() {
  const [checking, setChecking] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [loginError, setLoginError] = useState("");
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [canText, setCanText] = useState(true);

  // Engine hours. Thirteen maintenance items are configured against hour
  // intervals and not one has ever been judged, because no reading has ever
  // been taken -- which is how a breakdown reached the 4th of July unannounced.
  // Weather opens first. It is the one you reach for one-handed with the
  // engine running, and the owner asked for it: "I want the default to be the
  // weather when opening the on the dock tab."
  const [screen, setScreen] = useState("weather"); // "weather" | "arriving" | "ask" | "hours"
  const [vessels, setVessels] = useState([]);
  const [logs, setLogs] = useState([]);
  const [hoursForm, setHoursForm] = useState({ vesselId: "", hours: "", note: "" });
  const [hoursSaved, setHoursSaved] = useState("");
  // Fuel, logged where it happens. The pump is at the dock, the receipt is in a
  // hand, and the console that could record it is a desktop at home — which is
  // how the 6 Sep fill went in with no hours against it.
  const [fuel, setFuel] = useState([]);
  const [fuelForm, setFuelForm] = useState({ vesselId: "", gallons: "", cost: "", hoursAtFillup: "", note: "" });
  const [fuelSaved, setFuelSaved] = useState("");

  // Guests arriving today, and the gate code to send them.
  //
  // The code is deliberately NOT in the booking confirmation: an email is
  // forwarded and kept forever, so mailing it would leave every past guest with
  // working access to a private residence. It is texted on the morning instead
  // — and the risk with a manual step is forgetting it, which strands a party
  // of twelve at a gate. So it lives here, one tap from the booking.
  const [arriving, setArriving] = useState([]);
  const [dock, setDock] = useState(null);
  // Which booking's number list is open, and what is being typed into it.
  const [phonesOpen, setPhonesOpen] = useState("");
  const [newPhone, setNewPhone] = useState({ number: "", label: "" });
  // Which number the next text goes to, per booking. Defaults to the primary;
  // this only overrides for the tap in front of you, so choosing a party
  // member's phone once does not silently re-point the booking.
  const [textTo, setTextTo] = useState({});

  // The charter actually on the water, and what it is owed.
  const [allBookings, setAllBookings] = useState([]);
  const [inquiries, setInquiries] = useState([]);
  const [addOns, setAddOns] = useState([]);
  // Re-rendered on a timer so the countdown is a countdown rather than whatever
  // it said when the page loaded.
  const [tick, setTick] = useState(Date.now());

  // Service checks, off the desktop table and onto the phone.
  const [maintItems, setMaintItems] = useState([]);
  const [maintBusy, setMaintBusy] = useState("");

  // Saved places: fuel, cover, ramps.
  const [places, setPlaces] = useState([]);
  const [placeForm, setPlaceForm] = useState({ kind: "fuel", name: "", note: "", radiusYards: "", covered: null, onProperty: null, motorized: null, permission: "" });
  // A position tapped on the map, for a place you are not standing on.
  const [pickedAt, setPickedAt] = useState(null);
  const [placeOpen, setPlaceOpen] = useState(false);

  // Weather, and the run home.
  const [nowcast, setNowcast] = useState(null);
  const [nowcastBusy, setNowcastBusy] = useState(false);
  const [geoError, setGeoError] = useState("");
  const [herePos, setHerePos] = useState(null);

  useEffect(() => {
    api("/api/admin/session").then((r) => setAuthed(r.authenticated)).catch(() => {}).finally(() => setChecking(false));
  }, []);

  // A desktop has nothing to hand an sms: link to. Checked after mount because
  // navigator does not exist on the server.
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const ua = navigator.userAgent || "";
    setCanText(/iPhone|iPad|iPod|Android|Mobile/i.test(ua) || (navigator.maxTouchPoints || 0) > 0);
  }, []);

  const load = useCallback(async () => {
    try {
      const bookings = await api("/api/external-bookings");
      const today = new Date();
      const list = bookings
        .filter((b) => b.status === "completed" && b.phone && !b.marketingOptOut)
        .map((b) => {
          const days = daysSince(b.date, today);
          return { ...b, days, window: askWindow(days) };
        })
        .filter((b) => b.days != null && b.days >= 0)
        // Warmest first: a charter three days ago converts far better than one
        // from March, so the top of the list is where the value is.
        .sort((a, b) => a.days - b.days);
      setRows(list);
    } catch {
      setRows([]);
    }
  }, []);

  // "9:47am" beats a timestamp when the question is "was that just now, or
  // yesterday when I was doing tomorrow's charters?"
  function sentWhen(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase().replace(" ", "");
    return sameDay ? time : d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " + time;
  }

  // Record that the code went out — or take it back.
  //
  // Optimistic: the tap has already opened the messaging app and this page is
  // about to lose focus, so waiting on a round trip before showing anything
  // would show nothing at all. If the write fails the mark is rolled back.
  const markGateCodeSent = useCallback(async (booking, sent) => {
    const at = sent ? new Date().toISOString() : null;
    setArriving((list) => list.map((x) => (x.id === booking.id ? { ...x, gateCodeSentAt: at } : x)));
    try {
      await api(`/api/external-bookings/${booking.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gateCodeSentAt: at }),
      });
    } catch {
      setArriving((list) => list.map((x) => (x.id === booking.id ? { ...x, gateCodeSentAt: booking.gateCodeSentAt || null } : x)));
    }
  }, []);

  // Save a change to a booking's numbers, optimistically.
  //
  // The whole point of this is being able to fix a wrong number while standing
  // at the dock with the guest on their way, so it must not wait on a round
  // trip before showing anything. A failure rolls the card back and says so,
  // rather than leaving the screen claiming a number that was never saved.
  const savePhones = useCallback(async (booking, patch) => {
    const before = { phone: booking.phone, phonesJson: booking.phonesJson };
    setArriving((list) => list.map((x) => (x.id === booking.id ? { ...x, ...patch } : x)));
    try {
      await api(`/api/external-bookings/${booking.id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
    } catch {
      setArriving((list) => list.map((x) => (x.id === booking.id ? { ...x, ...before } : x)));
      window.alert("Could not save that number. Check signal and try again.");
    }
  }, []);

  // Who is coming today or tomorrow, and still needs the gate code.
  const loadArriving = useCallback(async () => {
    try {
      const [bookings, info] = await Promise.all([
        api("/api/external-bookings"),
        api("/api/admin/dock-info"),
      ]);
      setDock(info);
      const today = todayKey();
      const t = new Date();
      const tomorrow = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1);
      const tomorrowKey = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
      // Only charters that are actually happening — a lapsed enquiry must never
      // be handed a gate code.
      // No `b.phone` requirement any more. A booking with no number used to
      // vanish from this list entirely, which is exactly backwards: that is the
      // one that needs attention, and now a number can be added right here.
      const list = (bookings || [])
        .filter((b) => (b.date === today || b.date === tomorrowKey) && b.status === "booked")
        .sort((a, b) => String(a.date).localeCompare(String(b.date)) ||
          String(a.startTime || "").localeCompare(String(b.startTime || "")));
      setArriving(list.map((b) => ({ ...b, when: b.date === today ? "today" : "tomorrow" })));
    } catch {
      setArriving([]);
    }
  }, []);

  // Everything the "on the water now" card and the service list need. Each
  // call falls back to an empty list on its own so one dead endpoint cannot
  // blank the whole page while someone is standing on a boat holding a phone.
  const loadContext = useCallback(async () => {
    const [b, i, a, m, p] = await Promise.all([
      api("/api/external-bookings").catch(() => []),
      api("/api/inquiries").catch(() => []),
      api("/api/addons").catch(() => []),
      api("/api/maintenance-items").catch(() => []),
      api("/api/water-points").catch(() => []),
    ]);
    setAllBookings(Array.isArray(b) ? b : []);
    setInquiries(Array.isArray(i) ? i : []);
    setAddOns(Array.isArray(a) ? a : []);
    setMaintItems(Array.isArray(m) ? m : []);
    setPlaces(Array.isArray(p) ? p : []);
  }, []);

  // A countdown that does not count is just a number. One minute is plenty —
  // this is a phone in a pocket on a boat, not a stopwatch.
  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  const loadHours = useCallback(async () => {
    try {
      const [v, l, f] = await Promise.all([
        api("/api/vessels"), api("/api/engine-hours"), api("/api/fuel-log").catch(() => []),
      ]);
      setVessels(v);
      setLogs(l);
      setFuel(Array.isArray(f) ? f : []);
      setHoursForm((old) => ({ ...old, vesselId: old.vesselId || (v[0] && v[0].id) || "" }));
      setFuelForm((old) => ({ ...old, vesselId: old.vesselId || (v[0] && v[0].id) || "" }));
    } catch { /* the ask list still works without this */ }
  }, []);

  useEffect(() => { if (authed) { load(); loadHours(); loadArriving(); loadContext(); } }, [authed, load, loadHours, loadArriving, loadContext]);

  // The last reading for a boat, so a new one can be sanity-checked against it.
  function lastFor(vesselId) {
    return logs.filter((l) => l.vesselId === vesselId).sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] || null;
  }

  async function saveHours(e) {
    e.preventDefault();
    const hours = Number(hoursForm.hours);
    if (!hoursForm.vesselId || !Number.isFinite(hours) || hours <= 0) return;
    const vessel = vessels.find((v) => v.id === hoursForm.vesselId) || null;
    const last = lastFor(hoursForm.vesselId);
    // This guard used to apply to every boat, and two of the three have no hour
    // meter. On those the entry is the LENGTH OF ONE CHARTER, so a three-hour
    // trip after a four-hour one is completely normal — and this refused to
    // save it. Only a real meter reading can be sanity-checked for going
    // backwards, because only a real meter counts up.
    if (isMetered(vessel) && last && hours < Number(last.hours)) {
      window.alert(
        "That is lower than the last reading for this boat (" + last.hours + " on " + last.date + ").\n\n" +
        "An hour meter only goes up, so this is probably a typo or the wrong boat."
      );
      return;
    }
    // The unmetered boats get the opposite check: an entry is one outing, so a
    // number that looks like a meter reading is someone entering the wrong kind.
    if (vessel && !isMetered(vessel) && hours > 24) {
      const ok = window.confirm(
        vessel.name + " has no hour meter, so this box wants the length of THIS trip, not a total.\n\n" +
        hours + " hours is longer than a day. Save it anyway?"
      );
      if (!ok) return;
    }
    setBusy("hours");
    try {
      await api("/api/engine-hours", {
        method: "POST",
        body: JSON.stringify({ vesselId: hoursForm.vesselId, date: todayKey(), hours, note: hoursForm.note || null }),
      });
      const name = (vessels.find((v) => v.id === hoursForm.vesselId) || {}).name || "the boat";
      setHoursSaved(name + " logged at " + hours + " hours");
      setHoursForm((f) => ({ ...f, hours: "", note: "" }));
      loadHours();
      setTimeout(() => setHoursSaved(""), 4000);
    } catch {
      window.alert("Could not save that. Check signal and try again.");
    } finally {
      setBusy("");
    }
  }

  // Where the boat is, and what the weather is about to do about it.
  //
  // The position never leaves this origin: it goes to our own /api route, which
  // talks to the forecast service server-side. The browser contacts nobody
  // else, which is also what keeps `connect-src 'self'` in the CSP true.
  const checkWeather = useCallback(async () => {
    setNowcastBusy(true);
    setGeoError("");
    // TWO ATTEMPTS, NOT ONE.
    //
    // A single enableHighAccuracy request waits on the GPS chip, and indoors,
    // under a covered slip, or with a weak sky view it simply times out and
    // reports nothing — which is what happened on the owner's phone. Falling
    // back to a coarse fix uses wifi and cell towers instead: accurate to a few
    // hundred metres rather than a few, which is useless for marking a slip and
    // perfectly good for "which end of the lake am I on".
    //
    // The error is also kept, because "you denied permission" and "the GPS
    // could not get a fix" need different things done about them.
    const once = (opts) => new Promise((resolve) => {
      if (typeof navigator === "undefined" || !navigator.geolocation) return resolve({ pos: null, err: null });
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ pos: { lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy }, err: null }),
        (e) => resolve({ pos: null, err: e }),
        opts
      );
    });
    const ask = async () => {
      const precise = await once({ enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 });
      if (precise.pos) return precise;
      // Permission refused is final — asking again just fails again.
      if (precise.err && precise.err.code === 1) return precise;
      return once({ enableHighAccuracy: false, timeout: 15000, maximumAge: 120000 });
    };
    try {
      const { pos, err } = await ask();
      if (pos) setHerePos(pos);
      // Say which failure it was, because the fix is different for each. "Turn
      // location on" is useless advice to someone who has it on and is stood
      // under a metal boat cover.
      else if (err && err.code === 1) setGeoError(
        "Location is blocked for this site. Tap the icon to the left of the address bar → " +
        "Permissions → Location → Allow, then tap the button again."
      );
      else if (err && err.code === 3) setGeoError(
        "The GPS did not get a fix in time — usually indoors or under a cover. " +
        "Step into the open and tap again. Everything below still works without it."
      );
      else setGeoError(
        "No location from this phone, so there is no run home to work out — the forecast, " +
        "the radar and your saved places all still work. Check location is on for the browser and tap again."
      );
      // WHICH BOAT, so the run home goes to the right shore. The Explorer
      // lives at Pearl Bay and the other two are three miles WSW — ten minutes
      // apart, which in weather is the whole question. Taken from the charter
      // actually running, because that is the boat under your feet.
      const onNow = charterNow(allBookings, Date.now()).running;
      const vesselId = onNow && onNow.booking ? onNow.booking.vesselId : null;
      const params = new URLSearchParams();
      if (pos) {
        params.set("lat", pos.lat.toFixed(5));
        params.set("lon", pos.lon.toFixed(5));
      }
      if (vesselId) params.set("vesselId", vesselId);
      const qs = params.toString();
      const data = await api("/api/admin/nowcast" + (qs ? "?" + qs : ""));
      setNowcast(data);
    } catch {
      setNowcast({
        verdict: "unavailable",
        headline: "Could not reach the forecast",
        detail: "No signal, most likely. Trust your eyes, not this page.",
      });
    } finally {
      setNowcastBusy(false);
    }
  }, [allBookings]);

  // Opening the tab should already be doing the work — nobody wants to tap
  // twice in weather. Runs once per visit to the screen.
  useEffect(() => {
    if (authed && screen === "weather" && !nowcast && !nowcastBusy) checkWeather();
  }, [authed, screen, nowcast, nowcastBusy, checkWeather]);

  async function saveFuel(e) {
    e.preventDefault();
    if (!fuelForm.vesselId) return;
    if (fuelForm.gallons === "" && fuelForm.cost === "") return;
    setBusy("fuel");
    try {
      await api("/api/fuel-log", {
        method: "POST",
        body: JSON.stringify({
          vesselId: fuelForm.vesselId,
          date: todayKey(),
          gallons: fuelForm.gallons === "" ? null : Number(fuelForm.gallons),
          cost: fuelForm.cost === "" ? null : Number(fuelForm.cost),
          hoursAtFillup: fuelForm.hoursAtFillup === "" ? null : Number(fuelForm.hoursAtFillup),
          note: fuelForm.note || null,
        }),
      });
      const name = (vessels.find((v) => v.id === fuelForm.vesselId) || {}).name || "the boat";
      setFuelSaved(
        name + " fuelled" + (fuelForm.cost ? " — $" + fuelForm.cost + " on the books" : "")
      );
      setFuelForm((f) => ({ ...f, gallons: "", cost: "", hoursAtFillup: "", note: "" }));
      loadHours();
      setTimeout(() => setFuelSaved(""), 4000);
    } catch {
      window.alert("Could not save that. Check signal and try again.");
    } finally {
      setBusy("");
    }
  }

  // Mark a service item done, right now.
  //
  // Stamps today's date AND the fleet hours in one tap. Both matter: an item
  // with an interval in hours and no lastDoneHours can never be judged, which
  // is exactly why thirteen of them sat reading "OK" while meaning "nobody has
  // ever told me anything".
  const markServiced = useCallback(async (item) => {
    // That boat's hours, not the fleet's. Stamping the fleet maximum onto an
    // Islander item would measure its next interval from the Explorer's engine.
    const hoursNow = maintHoursFor(item, vessels, logs);
    const label = item.label;
    if (!window.confirm(
      `Mark "${label}" done today?` +
      (hoursNow != null ? `\n\nRecorded at ${hoursNow} fleet hours.` : "\n\nNo hours logged yet, so this records the date only.")
    )) return;
    setMaintBusy(item.id);
    const patch = { lastDoneDate: todayKey() };
    if (hoursNow != null) patch.lastDoneHours = hoursNow;
    setMaintItems((list) => list.map((x) => (x.id === item.id ? { ...x, ...patch } : x)));
    try {
      await api(`/api/maintenance-items/${item.id}`, { method: "PATCH", body: JSON.stringify(patch) });
    } catch {
      setMaintItems((list) => list.map((x) => (x.id === item.id ? item : x)));
      window.alert("Could not save that. Check signal and try again.");
    } finally {
      setMaintBusy("");
    }
  }, [vessels, logs]);

  // Save where you are standing as a place worth finding again.
  //
  // One tap while tied up at the fuel dock beats typing coordinates from
  // memory later, which is the version that never happens.
  // Record where a boat lives, standing on its dock.
  //
  // The one fact you can only learn by being somewhere, and until now the only
  // way to write it was by editing the database. The Explorer's berth is
  // currently the street from OpenStreetMap, about a hundred yards out.
  const [dockSaved, setDockSaved] = useState("");
  async function setVesselDock(vessel) {
    let at = herePos;

    // TYPING THE NUMBERS IS THE FALLBACK, and it has to exist.
    //
    // A browser that has been told "no" to location once never asks again — it
    // just returns nothing, with no prompt. Standing on the dock with a phone
    // in that state and no way to record the berth is a wasted trip, so the
    // coordinates can be pasted instead: long-press the spot in Google Maps and
    // it hands you exactly this format.
    if (!at) {
      const typed = window.prompt(
        `This phone is not giving a location, so type ${vessel.name}'s dock position.\n\n` +
        "Long-press the spot in Google Maps and copy what it shows.\n\n" +
        "Format: 30.372740, -95.546670   (longitude is negative here)",
        ""
      );
      if (typed == null) return;
      const parts = String(typed).split(/[, ]+/).map((x) => Number(x.trim())).filter((n) => Number.isFinite(n));
      if (parts.length !== 2) {
        window.alert("Could not read that.\n\nTwo numbers separated by a comma, like:\n30.372740, -95.546670");
        return;
      }
      at = { lat: parts[0], lon: parts[1] };
    }

    if (!window.confirm(
      `Set ${vessel.name}'s dock to ${herePos ? "where you are standing" : "this position"}?\n\n` +
      `${at.lat.toFixed(6)}, ${at.lon.toFixed(6)}` +
      (herePos && herePos.accuracy ? `\n(accurate to about ${Math.round(herePos.accuracy)} m)` : "") +
      "\n\nEvery run home for this boat is measured from here."
    )) return;
    setBusy("dock");
    try {
      await api(`/api/vessels/${vessel.id}`, {
        method: "PATCH",
        body: JSON.stringify({ dockLat: at.lat, dockLon: at.lon }),
      });
      setDockSaved(vessel.name + "’s dock set");
      loadHours();
      checkWeather();
      setTimeout(() => setDockSaved(""), 5000);
    } catch {
      window.alert("Could not save that. Check signal and try again.");
    } finally {
      setBusy("");
    }
  }

  async function savePlace(e) {
    e.preventDefault();
    if (!placeForm.name.trim()) return;
    let at = pickedAt || herePos;

    // Typing the numbers is the third way in, and it has to exist.
    //
    // The owner stood on the Pearl Bay dock with the form filled in — name,
    // note, kind all chosen — and the save button did nothing, because his
    // browser had location blocked and he had not tapped the map. A form that
    // takes everything you type and then refuses silently is worse than one
    // that never asked.
    if (!at) {
      const typed = window.prompt(
        `Where is "${placeForm.name.trim()}"?\n\n` +
        "Long-press the spot in Google Maps and copy what it shows.\n\n" +
        "Format: 30.372740, -95.546670   (longitude is negative here)",
        ""
      );
      if (typed == null) return;
      const parts = String(typed).split(/[, ]+/).map((x) => Number(x.trim())).filter((n) => Number.isFinite(n));
      if (parts.length === 2) {
        at = { lat: parts[0], lon: parts[1] };
      }
    }

    if (!at) {
      window.alert(
        "No position for it.\n\n" +
        "Three ways: tap the map where it is, allow location and use the button above, " +
        "or paste the coordinates from Google Maps."
      );
      return;
    }
    setBusy("place");
    try {
      const made = await api("/api/water-points", {
        method: "POST",
        body: JSON.stringify({
          kind: placeForm.kind, name: placeForm.name.trim(),
          lat: at.lat, lon: at.lon, note: placeForm.note || null,
          radiusYards: placeForm.radiusYards === "" ? null : Number(placeForm.radiusYards),
          covered: placeForm.covered, onProperty: placeForm.onProperty,
          motorized: placeForm.motorized, permission: placeForm.permission || null,
        }),
      });
      setPlaces((list) => [...list, made]);
      setPlaceForm({ kind: placeForm.kind, name: "", note: "", radiusYards: "", covered: null, onProperty: null, motorized: null, permission: "" });
      setPickedAt(null);
      setPlaceOpen(false);
    } catch {
      window.alert("Could not save that spot. Check signal and try again.");
    } finally {
      setBusy("");
    }
  }

  async function login(e) {
    e.preventDefault();
    setLoginError("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      if (!res.ok) { setLoginError("That passcode did not work."); return; }
      setAuthed(true);
    } catch { setLoginError("Could not reach the server."); }
  }

  async function mark(row, on) {
    setBusy(row.id);
    // Optimistic: the card moves as the thumb lifts, the write follows.
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, reviewRequestedAt: on ? new Date().toISOString() : null } : r)));
    try {
      await api("/api/external-bookings/" + row.id, {
        method: "PATCH",
        body: JSON.stringify({ reviewRequestedAt: on ? new Date().toISOString() : null }),
      });
    } catch {
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, reviewRequestedAt: on ? null : row.reviewRequestedAt } : r)));
    } finally {
      setBusy("");
    }
  }

  const S = {
    page: { minHeight: "100vh", background: "var(--ink, #0A0612)", color: "var(--text, #ECE7F5)", padding: "16px 14px 60px", fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif" },
    card: { background: "var(--card, #171029)", border: "1px solid rgba(203,108,230,0.2)", borderRadius: 12, padding: 14, marginBottom: 10 },
    tap: { display: "block", width: "100%", textAlign: "center", padding: "15px 12px", borderRadius: 10, fontSize: 17, fontWeight: 800, textDecoration: "none", border: "none" },
  };

  if (checking) return <div style={S.page}>Checking…</div>;

  if (!authed) {
    return (
      <div style={S.page}>
        <h1 style={{ fontSize: 22, marginBottom: 14 }}>Ask for reviews</h1>
        <form onSubmit={login} style={{ display: "grid", gap: 10, maxWidth: 340 }}>
          <input
            type="password" inputMode="text" autoComplete="current-password"
            placeholder="Passcode" value={passcode} onChange={(e) => setPasscode(e.target.value)}
            style={{ padding: "14px 12px", fontSize: 17, borderRadius: 10, border: "1px solid rgba(203,108,230,0.4)", background: "var(--card, #171029)", color: "inherit" }}
          />
          <button type="submit" style={{ ...S.tap, background: "var(--purple, #CB6CE6)", color: "#0A0612" }}>Open</button>
          {loginError && <div style={{ color: "#E2685F", fontSize: 14 }}>{loginError}</div>}
        </form>
      </div>
    );
  }

  const todo = rows.filter((r) => !r.reviewRequestedAt);
  const done = rows.filter((r) => r.reviewRequestedAt);
  const shown = showDone ? done : todo;

  return (
    <div style={S.page}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
        <h1 style={{ fontSize: 21, margin: 0 }}>On the dock</h1>
        <a href="/admin" style={{ color: "var(--purple, #CB6CE6)", fontSize: 14, textDecoration: "none" }}>Console →</a>
      </div>

      {/* THE CHARTER YOU ARE ON. Above the tabs, so it is context for all of
          them rather than a page you have to go and find. Everything else here
          — the gate code, the hours, the fuel, the weather — is in service of
          one charter, and the page never said which. The answers all lived on a
          desktop at home: who is aboard, how many, what they paid for, and what
          time they are due back. Running long is unpaid; running short is a
          refund conversation on the dock. */}
      {(() => {
        const { running, next } = charterNow(allBookings, tick);
        const on = running || next;
        if (!on) return null;
        const b = on.booking;
        const live = !!running;
        const left = minutesLeft(on.window, tick);
        const over = left != null && left < 0;
        const extras = addOnsFor(b, inquiries, addOns);
        const numbers = bookingPhones(b);
        const backBy = on.window.endMs
          ? new Date(on.window.endMs).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase().replace(" ", "")
          : null;
        const startsAt = new Date(on.window.startMs)
          .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase().replace(" ", "");
        return (
          <div style={{
            border: "2px solid " + (over ? "#E2685F" : live ? "#4FBF8B" : "rgba(203,108,230,0.35)"),
            borderRadius: 12, padding: "12px 14px", marginBottom: 14,
            background: over ? "rgba(226,104,95,0.08)" : "rgba(79,191,139,0.06)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
              <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase", color: over ? "#E2685F" : live ? "#4FBF8B" : "var(--purple, #CB6CE6)" }}>
                {live ? "On the water now" : "Up next"}
              </span>
              {left != null && (
                <span style={{ fontSize: 15, fontWeight: 800, color: over ? "#E2685F" : "var(--text, #ECE7F5)", fontVariantNumeric: "tabular-nums" }}>
                  {live ? humanLeft(left) : `starts ${startsAt}`}
                </span>
              )}
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, marginTop: 4 }}>{b.guestName || "Guest"}</div>
            <div style={{ fontSize: 13.5, color: "var(--muted, #9A8FB4)", marginTop: 2 }}>
              {[b.vesselName, b.partySize ? `${b.partySize} aboard` : null,
                on.window.hours ? `${on.window.hours}h` : null,
                backBy ? `back by ${backBy}` : null].filter(Boolean).join(" · ")}
            </div>
            {extras.length > 0 && (
              <div style={{ fontSize: 13, marginTop: 8, color: "var(--text, #ECE7F5)" }}>
                🎁 {extras.map((a) => a.name).join(", ")}
              </div>
            )}
            {numbers.length > 0 && (
              <a href={`tel:${numbers[0].number}`}
                style={{ display: "inline-block", marginTop: 10, fontSize: 13.5, color: "var(--purple, #CB6CE6)", textDecoration: "none" }}>
                📞 {fmtPhone(numbers[0].number)}
              </a>
            )}
          </div>
        );
      })()}

      {/* Four tabs do not fit across a phone in one row, so they wrap rather
          than shrink the text to nothing. Weather sits first: it is the one
          you open one-handed, wet, with the engine running. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        {[["weather", "⛈ Weather"],
          ["arriving", arriving.length ? `Arriving (${arriving.length})` : "Arriving"],
          ["ask", "Reviews"], ["hours", "Boat log"]].map(([id, label]) => (
          <button
            key={id} type="button" onClick={() => setScreen(id)}
            style={{
              flex: "1 1 44%", padding: "12px 6px", borderRadius: 10, fontSize: 14.5, fontWeight: 700,
              border: "1px solid var(--purple, #CB6CE6)",
              background: screen === id ? "var(--purple, #CB6CE6)" : "transparent",
              color: screen === id ? "#0A0612" : "var(--text, #ECE7F5)",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {screen === "weather" && (
        <div>
          {(() => {
            const v = nowcast || {};
            const TONE = {
              go: { edge: "#4FBF8B", ink: "#4FBF8B" },
              clear: { edge: "#4FBF8B", ink: "#4FBF8B" },
              tight: { edge: "#E8934A", ink: "#E8934A" },
              shelter: { edge: "#E2685F", ink: "#E2685F" },
              unknown: { edge: "rgba(203,108,230,0.3)", ink: "var(--muted, #9A8FB4)" },
              unavailable: { edge: "#E8934A", ink: "#E8934A" },
            };
            const tone = TONE[v.verdict] || TONE.unknown;
            return (
              <>
                <button
                  type="button" onClick={checkWeather} disabled={nowcastBusy}
                  style={{
                    ...S.tap, background: "var(--purple, #CB6CE6)", color: "#0A0612",
                    marginBottom: 12, opacity: nowcastBusy ? 0.6 : 1,
                  }}
                >
                  {nowcastBusy ? "Reading the sky…" : "Can I get back before it hits?"}
                </button>

                {nowcast && (
                  <div style={{ ...S.card, borderColor: tone.edge, borderWidth: 2 }}>
                    <div style={{ fontSize: 17, fontWeight: 800, color: tone.ink, marginBottom: 6 }}>
                      {v.headline}
                    </div>
                    <div style={{ fontSize: 14.5, color: "var(--text, #ECE7F5)", lineHeight: 1.5 }}>
                      {v.detail}
                    </div>
                    {(v.windMph != null || v.miles != null) && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 12, fontSize: 13, color: "var(--muted, #9A8FB4)" }}>
                        {v.miles != null && (
                          <span style={{ fontVariantNumeric: "tabular-nums" }}>
                            🧭 {v.miles} mi {v.compass} · {v.bearing}°
                            {v.dockVessel ? ` to ${v.dockVessel}'s dock` : ""}
                          </span>
                        )}
                        {v.runMinutes != null && (
                          <span style={{ fontVariantNumeric: "tabular-nums" }}>⏱ {v.runMinutes} min home</span>
                        )}
                        {v.windMph != null && (
                          <span style={{ fontVariantNumeric: "tabular-nums" }}>
                            💨 {v.windMph} mph{v.gustMph ? `, gusts ${v.gustMph}` : ""}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* THE LIMIT, stated on the screen and not only in the source.
                    This knows where the rain is. It does not know where the
                    water is shallow, where the stumps are, or where the no-wake
                    zones start — Lake Conroe was flooded over standing timber.
                    A confident-looking line around a storm would be inventing
                    authority this page does not have. */}
                <div style={{
                  ...S.card, borderColor: "rgba(203,108,230,0.25)",
                  fontSize: 12.5, color: "var(--muted, #9A8FB4)", lineHeight: 1.5,
                }}>
                  This is weather timing, not a course. It knows where the rain is and how long
                  the run takes — it does <strong style={{ color: "var(--text, #ECE7F5)" }}>not</strong> know
                  where the stumps, shallows or no-wake zones are. Steering stays with you.
                  {v.dockConfigured === false && (
                    <div style={{ color: "#E8934A", marginTop: 8 }}>
                      {v.dockBadValues ? (
                        <>
                          <strong>The dock position is set to somewhere that is not Lake Conroe</strong>
                          {" "}(<span className="mono">{v.dockBadValues}</span>). Almost always a dropped
                          minus sign — the longitude has to be negative here. Distances are being
                          measured from the middle of the lake until it is fixed.
                        </>
                      ) : (
                        <>
                          Dock position not set, so distances are measured from the middle of the lake.
                          Set <span className="mono">DOCK_LAT</span> and <span className="mono">DOCK_LON</span> in
                          Vercel, then redeploy.
                        </>
                      )}
                      {herePos && (
                        <div style={{ marginTop: 6, color: "var(--text, #ECE7F5)" }}>
                          You are at <span className="mono">{herePos.lat.toFixed(5)}, {herePos.lon.toFixed(5)}</span>
                          {" "}right now — if you are standing on the dock, those are the two values.
                        </div>
                      )}
                    </div>
                  )}
                  {/* A position that is nowhere near this lake was thrown away
                      rather than measured from. Said out loud, because silently
                      falling back to "no position" would hide a phone that is
                      confidently reporting the wrong continent. */}
                  {v.hereRejected && (
                    <div style={{ color: "#E2685F", marginTop: 8 }}>
                      <strong>Ignored a position that is not near Lake Conroe</strong>
                      {" "}(<span className="mono">{v.hereRejected}</span>). Nothing was measured from it.
                    </div>
                  )}
                  {geoError && <div style={{ color: "#E8934A", marginTop: 8 }}>{geoError}</div>}
                </div>

                {/* NEAREST PLACES. Sits directly under the verdict because
                    when that verdict is "shelter", the very next question is
                    "where". Cover leads when it is raining on you; fuel leads
                    the rest of the time, which is what was actually asked for. */}
                <div style={S.card}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>Nearest</div>
                    <button
                      type="button" onClick={() => setPlaceOpen((o) => !o)}
                      style={{ background: "none", border: "none", padding: 0, color: "var(--purple, #CB6CE6)", fontSize: 13 }}>
                      {placeOpen ? "cancel" : "save this spot"}
                    </button>
                  </div>

                  {/* WHERE A BOAT LIVES. Only learnable by standing there, and
                      until now only writable by editing the database. Each run
                      home is measured from this, and the Explorer's is
                      currently the street from OSM rather than the berth. */}
                  {vessels.length > 0 && (
                    <div style={{ marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid rgba(203,108,230,0.15)" }}>
                      <div style={{ fontSize: 12.5, color: "var(--muted, #9A8FB4)", marginBottom: 7, lineHeight: 1.45 }}>
                        {herePos
                          ? "Standing on a dock? Record it, and that boat’s run home is measured from here."
                          : "Standing on a dock? Tap the boat and type the position — long-press the spot in Google Maps to get it."}
                      </div>
                      {dockSaved && (
                        <div style={{ fontSize: 13, color: "#4FBF8B", fontWeight: 700, marginBottom: 7 }}>{dockSaved}</div>
                      )}
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {vessels.map((vv) => {
                          const set = vv.dockLat != null && vv.dockLon != null;
                          const away = set && herePos
                            ? Math.round(milesBetween(herePos, { lat: vv.dockLat, lon: vv.dockLon }) * 1760)
                            : null;
                          return (
                            <button
                              key={vv.id} type="button"
                              disabled={busy === "dock"}
                              onClick={() => setVesselDock(vv)}
                              style={{
                                flex: "1 1 30%", padding: "10px 5px", borderRadius: 8, fontSize: 12.5, fontWeight: 700,
                                border: "1px solid rgba(203,108,230,0.35)", background: "transparent",
                                color: "var(--text, #ECE7F5)", opacity: busy === "dock" ? 0.5 : 1,
                              }}
                            >
                              {vv.name.replace("Nauti ", "")}
                              <span style={{ display: "block", fontSize: 10.5, fontWeight: 400, color: "var(--muted, #9A8FB4)", marginTop: 2 }}>
                                {!set ? "not set" : away == null ? "set" : away < 40 ? "set · you are here" : `set · ${away} yd away`}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {placeOpen && (
                    <form onSubmit={savePlace} style={{ display: "grid", gap: 8, marginBottom: 12 }}>
                      {[["Somewhere to go", PLACE_KINDS], ["Something to avoid", HAZARD_KINDS]].map(([heading, group]) => (
                        <div key={heading}>
                          <div style={{ fontSize: 11, color: "var(--muted, #9A8FB4)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                            {heading}
                          </div>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {group.map((k) => (
                              <button
                                key={k} type="button" onClick={() => setPlaceForm((f) => ({ ...f, kind: k }))}
                                style={{
                                  flex: "1 1 30%", padding: "10px 4px", borderRadius: 8, fontSize: 13, fontWeight: 700,
                                  border: "1px solid " + (placeForm.kind === k ? "var(--purple, #CB6CE6)" : "rgba(203,108,230,0.25)"),
                                  background: placeForm.kind === k ? "rgba(203,108,230,0.18)" : "transparent",
                                  color: "var(--text, #ECE7F5)",
                                }}>
                                {KIND_ICON[k]} {KIND_LABEL[k]}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}

                      {/* A hazard is an area, not a pin. Marking a stump field
                          as a point says the danger is one spot and the water
                          beside it is fine, which is the opposite of the truth. */}
                      {isHazard(placeForm.kind) && (
                        <>
                          <input
                            type="number" inputMode="numeric" min="1" max="5000"
                            placeholder="How far does it reach? (yards)"
                            value={placeForm.radiusYards}
                            onChange={(e) => setPlaceForm((f) => ({ ...f, radiusYards: e.target.value }))}
                            style={{ padding: "13px", fontSize: 16, borderRadius: 8, border: "1px solid rgba(232,147,74,0.4)", background: "var(--card, #171029)", color: "inherit" }}
                          />
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {[100, 250, 500, 1000].map((yd) => (
                              <button key={yd} type="button"
                                onClick={() => setPlaceForm((f) => ({ ...f, radiusYards: String(yd) }))}
                                style={{ flex: 1, padding: "8px 4px", borderRadius: 7, fontSize: 12, fontWeight: 700,
                                  border: "1px solid rgba(232,147,74,0.35)", background: "transparent", color: "#E8934A" }}>
                                {yd} yd
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                      <input
                        type="text" placeholder="What is it called?"
                        value={placeForm.name}
                        onChange={(e) => setPlaceForm((f) => ({ ...f, name: e.target.value }))}
                        style={{ padding: "13px", fontSize: 16, borderRadius: 8, border: "1px solid rgba(203,108,230,0.3)", background: "var(--card, #171029)", color: "inherit" }}
                      />
                      <input
                        type="text"
                        placeholder={placeForm.kind === "shelter"
                          ? "Whose slip, is it covered, usually empty? (optional)"
                          : isHazard(placeForm.kind)
                            ? "What is there, and how bad (optional)"
                            : "Note — hours, depth, anything (optional)"}
                        value={placeForm.note}
                        onChange={(e) => setPlaceForm((f) => ({ ...f, note: e.target.value }))}
                        style={{ padding: "12px", fontSize: 15, borderRadius: 8, border: "1px solid rgba(203,108,230,0.3)", background: "var(--card, #171029)", color: "inherit" }}
                      />
                      {/* THE FOUR THINGS THAT DECIDE WHETHER A BORROWED SLIP IS
                          ACTUALLY USABLE. Lightning is the reason you are going,
                          so covered is the one that matters most; a slip whose
                          owner has said no is never recommended whatever the
                          weather is doing; a lift usually means it is spoken for
                          even when it looks empty. Unknown stays unknown —
                          "nobody has checked" is not "no". */}
                      {placeForm.kind === "shelter" && (
                        <div style={{ display: "grid", gap: 7, padding: "10px 11px", borderRadius: 9, background: "rgba(79,191,139,0.06)", border: "1px solid rgba(79,191,139,0.25)" }}>
                          {[["covered", "Is it covered?"],
                            ["onProperty", "Connected to a property?"],
                            ["motorized", "Motorised slip / lift?"]].map(([field, label]) => (
                            <div key={field} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                              <span style={{ fontSize: 13.5 }}>{label}</span>
                              <span style={{ display: "flex", gap: 5, flex: "0 0 auto" }}>
                                {[[true, "Yes"], [false, "No"], [null, "?"]].map(([val, txt]) => (
                                  <button key={txt} type="button"
                                    onClick={() => setPlaceForm((f) => ({ ...f, [field]: val }))}
                                    style={{
                                      minWidth: 44, padding: "7px 8px", borderRadius: 7, fontSize: 12.5, fontWeight: 700,
                                      border: "1px solid " + (placeForm[field] === val ? "#4FBF8B" : "rgba(203,108,230,0.25)"),
                                      background: placeForm[field] === val ? "rgba(79,191,139,0.22)" : "transparent",
                                      color: "var(--text, #ECE7F5)",
                                    }}>{txt}</button>
                                ))}
                              </span>
                            </div>
                          ))}
                          <div style={{ borderTop: "1px solid rgba(79,191,139,0.2)", paddingTop: 7 }}>
                            <div style={{ fontSize: 13.5, marginBottom: 5 }}>Do they mind?</div>
                            <div style={{ display: "flex", gap: 5 }}>
                              {[["yes", "Said yes"], ["asked", "Never asked"], ["no", "Said no"]].map(([val, txt]) => (
                                <button key={val} type="button"
                                  onClick={() => setPlaceForm((f) => ({ ...f, permission: val }))}
                                  style={{
                                    flex: 1, padding: "9px 4px", borderRadius: 7, fontSize: 12.5, fontWeight: 700,
                                    border: "1px solid " + (placeForm.permission === val
                                      ? (val === "no" ? "#E2685F" : "#4FBF8B") : "rgba(203,108,230,0.25)"),
                                    background: placeForm.permission === val
                                      ? (val === "no" ? "rgba(226,104,95,0.18)" : "rgba(79,191,139,0.22)") : "transparent",
                                    color: "var(--text, #ECE7F5)",
                                  }}>{txt}</button>
                              ))}
                            </div>
                            <div style={{ fontSize: 11, color: "var(--muted, #9A8FB4)", marginTop: 5, lineHeight: 1.4 }}>
                              A &ldquo;said no&rdquo; slip is never suggested, whatever the weather is doing.
                            </div>
                          </div>
                        </div>
                      )}

                      <div style={{ fontSize: 12, color: pickedAt ? "#4FBF8B" : "var(--muted, #9A8FB4)", lineHeight: 1.45 }}>
                        {pickedAt
                          ? `Placed on the map: ${pickedAt.lat.toFixed(5)}, ${pickedAt.lon.toFixed(5)} — tap the map again to move it.`
                          : herePos
                            ? `Will save where you are: ${herePos.lat.toFixed(5)}, ${herePos.lon.toFixed(5)}. Or tap the map to put it somewhere else.`
                            : "No position yet — tap the map where it is, or just press Save and paste the coordinates from Google Maps."}
                      </div>
                      <button type="submit" disabled={busy === "place" || !placeForm.name.trim()}
                        style={{ ...S.tap, background: "var(--purple, #CB6CE6)", color: "#0A0612", opacity: placeForm.name.trim() ? 1 : 0.45 }}>
                        {busy === "place" ? "Saving…" : (pickedAt || herePos) ? "Save this spot" : "Save this spot — asks for the position"}
                      </button>
                    </form>
                  )}

                  {places.length === 0 && !placeOpen && (
                    <div style={{ fontSize: 13, color: "var(--muted, #9A8FB4)", lineHeight: 1.5 }}>
                      Nothing saved yet. Next time you are tied up at a fuel dock, or under cover
                      waiting one out, tap <em>save this spot</em> — one tap while you are there beats
                      typing coordinates from memory later.
                      <div style={{ marginTop: 6 }}>
                        These are yours on purpose: a built-in list that is wrong about which dock
                        pumps gas is how a tank runs dry pointed at the wrong marina.
                      </div>
                    </div>
                  )}

                  {/* THE LIST SHOWS WITHOUT A POSITION.
                      It used to be gated on geolocation, so a phone that would
                      not give one — which is most of them, indoors — showed a
                      bare count and nothing else. The distances need a fix; the
                      LIST does not, and being able to read what is saved is
                      most of the value. Without a position it is everything,
                      grouped; with one it is the nearest three of each, sorted
                      by how far away they are. */}
                  {places.length > 0 && !herePos && (
                    <div style={{ fontSize: 12, color: "var(--muted, #9A8FB4)", marginBottom: 8, lineHeight: 1.45 }}>
                      {places.length} saved. Tap the button above to allow location and these sort by distance.
                    </div>
                  )}

                  {places.length > 0 && KINDS
                    .slice()
                    // Cover first when you are about to get wet.
                    .sort((a, x) => {
                      const wet = v.verdict === "shelter" || v.verdict === "tight";
                      const rank = (k) => (wet ? (k === "shelter" ? 0 : k === "fuel" ? 1 : 2) : (k === "fuel" ? 0 : k === "shelter" ? 1 : 2));
                      return rank(a) - rank(x);
                    })
                    .map((kind) => {
                      const list = herePos
                        ? nearest(places, herePos, kind).slice(0, 3)
                        : places.filter((p) => p.kind === kind).sort((a, b) => a.name.localeCompare(b.name));
                      if (!list.length) return null;
                      return (
                        <div key={kind} style={{ marginBottom: 10 }}>
                          <div style={{ fontSize: 11.5, color: "var(--muted, #9A8FB4)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                            {KIND_ICON[kind]} {KIND_LABEL[kind]}
                          </div>
                          {list.map((p) => (
                            <div key={p.id} style={{
                              display: "flex", justifyContent: "space-between", gap: 10,
                              padding: "9px 0", borderBottom: "1px solid rgba(203,108,230,0.1)",
                            }}>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 14.5, fontWeight: 600 }}>{p.name}</div>
                                {p.note && <div style={{ fontSize: 11.5, color: "var(--muted, #9A8FB4)" }}>{p.note}</div>}
                              </div>
                              {p.miles != null ? (
                                <div style={{ flex: "0 0 auto", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                                  <div style={{ fontSize: 14.5, fontWeight: 700 }}>{p.miles} mi</div>
                                  <div style={{ fontSize: 11.5, color: "var(--muted, #9A8FB4)" }}>{p.compass} · {p.bearing}°</div>
                                </div>
                              ) : (
                                <div style={{ flex: "0 0 auto", fontSize: 11.5, color: "var(--muted, #9A8FB4)", fontVariantNumeric: "tabular-nums" }}>
                                  {p.lat.toFixed(4)}, {p.lon.toFixed(4)}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      );
                    })}
                </div>

                {Array.isArray(v.here) && v.here.length > 0 && (
                  <div style={S.card}>
                    <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>Next three hours, where you are</div>
                    <div style={{ display: "flex", gap: 4, overflowX: "auto", paddingBottom: 4 }}>
                      {v.here.map((p) => {
                        const mm = Number(p.precipitation || 0);
                        const wet = mm >= 0.2;
                        const t = new Date(p.time);
                        return (
                          <div key={p.time} style={{
                            flex: "0 0 auto", width: 52, textAlign: "center",
                            padding: "7px 2px", borderRadius: 7,
                            background: wet ? "rgba(226,104,95,0.22)" : "rgba(203,108,230,0.07)",
                            border: "1px solid " + (wet ? "rgba(226,104,95,0.45)" : "rgba(203,108,230,0.15)"),
                          }}>
                            <div style={{ fontSize: 11, color: "var(--muted, #9A8FB4)" }}>
                              {t.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(" ", "").toLowerCase()}
                            </div>
                            <div style={{ fontSize: 15, marginTop: 3 }}>{wet ? "🌧" : "·"}</div>
                            <div style={{ fontSize: 10.5, color: "var(--muted, #9A8FB4)", fontVariantNumeric: "tabular-nums" }}>
                              {mm > 0 ? mm.toFixed(1) : ""}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* THE RADAR, DRAWN RATHER THAN EMBEDDED. The Windy iframe
                    that was here is pinned to calendar=now — it plays back
                    where rain has been, which is exactly what failed on the
                    water. An iframe also cannot be told where the boat is.
                    This scrubs from two hours back to whatever the nowcast can
                    see, with you and the dock drawn on it. The homepage keeps
                    Windy, which is right for a guest deciding whether to come. */}
                <div style={{ ...S.card, padding: 10 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8, padding: "0 4px" }}>
                    Radar &mdash; drag to see what is coming
                  </div>
                  <RadarMap here={herePos} dock={v.dockPoint || null} points={places} height={340}
                    onPickPoint={placeOpen ? (p) => setPickedAt(p) : null} />
                </div>
              </>
            );
          })()}
        </div>
      )}

      {screen === "arriving" && (
        <div>
          <p style={{ color: "var(--muted, #9A8FB4)", fontSize: 13.5, margin: "0 0 14px" }}>
            Guests coming today or tomorrow. The gate code is deliberately not in their
            confirmation email — an email gets forwarded and kept, and the code opens a
            private gate. Send it here on the morning instead.
          </p>

          {!dock?.gateCode && (
            <div style={{
              border: "1px solid #E8934A", borderRadius: 10, padding: "12px 14px",
              marginBottom: 14, fontSize: 13.5, color: "var(--text, #ECE7F5)", lineHeight: 1.55,
            }}>
              <strong style={{ color: "#E8934A" }}>No gate code is configured.</strong> Set
              <span className="mono"> DOCK_GATE_CODE</span> and
              <span className="mono"> DOCK_ADDRESS</span> in the Vercel environment and this
              writes the whole message for you.
            </div>
          )}

          {arriving.length === 0 && (
            <p style={{ color: "var(--muted, #9A8FB4)", fontSize: 14 }}>
              Nobody booked for today or tomorrow.
            </p>
          )}

          {arriving.map((b) => {
            const first = String(b.guestName || "").trim().split(/\s+/)[0] || "there";
            const start = b.startTime ? ` at ${b.startTime}` : "";
            const msg = [
              `Hi ${first}! Austin from The Nauti Yachti — looking forward to seeing you ${b.when}${start}.`,
              "",
              dock?.address ? `We're at ${dock.address}.` : null,
              dock?.gateCode ? `Gate code is ${dock.gateCode}.` : null,
              `Parking is on site right by the dock, so you can unload straight onto the boat.`,
              "",
              `Try to arrive about ${dock?.arriveMinutesEarly || 15} minutes early so boarding doesn't eat into your hours.`,
              "",
              `Any trouble finding us, just call or text.`,
            ].filter((l) => l !== null).join("\n");
            const numbers = bookingPhones(b);
            // The tap goes to whichever number is selected on this card, which
            // defaults to the primary. Choosing a different one texts that one
            // without re-pointing the booking — "text the friend this once" and
            // "the booking had the wrong number on it" are different problems.
            const chosen = textTo[b.id] && numbers.some((n) => n.number === textTo[b.id])
              ? textTo[b.id]
              : (numbers[0] && numbers[0].number) || null;
            const href = chosen ? smsHref(chosen, msg) : null;
            const open = phonesOpen === b.id;
            return (
              <div key={b.id} style={{
                border: "1px solid rgba(203,108,230,0.3)", borderRadius: 10,
                padding: "14px 16px", marginBottom: 12,
              }}>
                <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text, #ECE7F5)" }}>
                  {b.guestName || "Guest"}
                </div>
                <div style={{ fontSize: 13.5, color: "var(--muted, #9A8FB4)", marginBottom: 10 }}>
                  {b.when} · {b.vesselName}{b.startTime ? ` · ${b.startTime}` : ""}
                  {b.hours ? ` · ${b.hours}h` : ""}{b.partySize ? ` · ${b.partySize} guests` : ""}
                </div>
                {/* Who this is actually going to, and every other number on the
                    booking. On 6 Sep 2026 the owner sent Oscar his gate code
                    and the text opened on a number he did not recognise: the
                    booking carried Oscar's name and email but a party member's
                    phone, because that is who filled the form. Showing the
                    number caught it; being able to change it here is what stops
                    the next one, because the alternative is finding a desktop
                    while a party of twelve waits at a gate. */}
                <button
                  type="button"
                  onClick={() => { setPhonesOpen(open ? "" : b.id); setNewPhone({ number: "", label: "" }); }}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                    width: "100%", background: "none", border: "none", padding: "2px 0 10px",
                    color: "var(--muted, #9A8FB4)", fontSize: 12.5, textAlign: "left", cursor: "pointer",
                  }}
                >
                  <span className="mono">
                    {chosen ? "to " + fmtPhone(chosen) : "no number on this booking"}
                    {numbers.length > 1 && (
                      <span style={{ color: "var(--purple, #CB6CE6)" }}> +{numbers.length - 1} more</span>
                    )}
                  </span>
                  <span style={{ color: "var(--purple, #CB6CE6)", fontSize: 13 }}>
                    {open ? "done" : chosen ? "change" : "add one"} {open ? "⌃" : "⌄"}
                  </span>
                </button>

                {open && (
                  <div style={{
                    border: "1px solid rgba(203,108,230,0.25)", borderRadius: 9,
                    padding: 10, marginBottom: 12, background: "rgba(203,108,230,0.05)",
                  }}>
                    {numbers.length === 0 && (
                      <div style={{ color: "var(--muted, #9A8FB4)", fontSize: 13, marginBottom: 8 }}>
                        Nothing to text yet. Add the number they actually answer.
                      </div>
                    )}
                    {numbers.map((n) => {
                      const picked = n.number === chosen;
                      return (
                        <div key={n.number} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                          <button
                            type="button"
                            onClick={() => setTextTo((m) => ({ ...m, [b.id]: n.number }))}
                            style={{
                              flex: 1, textAlign: "left", padding: "10px 11px", borderRadius: 8,
                              border: "1px solid " + (picked ? "var(--purple, #CB6CE6)" : "rgba(203,108,230,0.25)"),
                              background: picked ? "rgba(203,108,230,0.18)" : "transparent",
                              color: "var(--text, #ECE7F5)", fontSize: 15, cursor: "pointer",
                            }}
                          >
                            <span className="mono">{fmtPhone(n.number)}</span>
                            <div style={{ fontSize: 11.5, color: "var(--muted, #9A8FB4)", marginTop: 2 }}>
                              {n.label || "no label"}{n.primary ? " · default" : ""}
                            </div>
                          </button>
                          {!n.primary && (
                            <button
                              type="button"
                              title="Make this the booking's number"
                              onClick={() => savePhones(b, makePrimary(b, n.number))}
                              style={{
                                padding: "10px 9px", borderRadius: 8, border: "1px solid rgba(203,108,230,0.3)",
                                background: "transparent", color: "var(--purple, #CB6CE6)", fontSize: 12, cursor: "pointer",
                              }}
                            >
                              set&nbsp;default
                            </button>
                          )}
                          <button
                            type="button"
                            title="Remove this number"
                            onClick={() => {
                              if (!window.confirm("Remove " + fmtPhone(n.number) + " from this booking?")) return;
                              savePhones(b, removePhone(b, n.number));
                              setTextTo((m) => ({ ...m, [b.id]: undefined }));
                            }}
                            style={{
                              padding: "10px 11px", borderRadius: 8, border: "1px solid rgba(226,104,95,0.35)",
                              background: "transparent", color: "#E2685F", fontSize: 14, cursor: "pointer",
                            }}
                          >
                            &times;
                          </button>
                        </div>
                      );
                    })}

                    <div style={{ display: "flex", gap: 6, marginTop: 9 }}>
                      <input
                        type="tel" inputMode="tel" placeholder="Another number"
                        value={newPhone.number}
                        onChange={(e) => setNewPhone((p) => ({ ...p, number: e.target.value }))}
                        style={{ flex: 1.3, minWidth: 0, padding: "11px 10px", fontSize: 16, borderRadius: 8, border: "1px solid rgba(203,108,230,0.3)", background: "var(--card, #171029)", color: "inherit" }}
                      />
                      <input
                        type="text" placeholder="Whose?"
                        value={newPhone.label}
                        onChange={(e) => setNewPhone((p) => ({ ...p, label: e.target.value }))}
                        style={{ flex: 1, minWidth: 0, padding: "11px 10px", fontSize: 16, borderRadius: 8, border: "1px solid rgba(203,108,230,0.3)", background: "var(--card, #171029)", color: "inherit" }}
                      />
                    </div>
                    <button
                      type="button"
                      disabled={!normalizePhone(newPhone.number)}
                      onClick={() => {
                        const n = normalizePhone(newPhone.number);
                        if (!n) return;
                        // A booking with no number at all: the first one typed
                        // becomes the booking's number rather than an orphaned
                        // extra with nothing to be secondary to.
                        const patch = b.phone
                          ? { phonesJson: addPhone(b, n, newPhone.label) }
                          : { phone: n, phonesJson: b.phonesJson || null };
                        savePhones(b, patch);
                        setNewPhone({ number: "", label: "" });
                      }}
                      style={{
                        width: "100%", marginTop: 7, padding: "11px", borderRadius: 8, border: "none",
                        background: normalizePhone(newPhone.number) ? "var(--purple, #CB6CE6)" : "rgba(203,108,230,0.2)",
                        color: normalizePhone(newPhone.number) ? "#0A0612" : "var(--muted, #9A8FB4)",
                        fontSize: 15, fontWeight: 700, cursor: "pointer",
                      }}
                    >
                      Add to this booking
                    </button>
                  </div>
                )}

                {href ? (
                  <>
                    <a
                      href={canText ? href : undefined}
                      onClick={(e) => {
                        // Marking it sent when nothing can send it is the same
                        // trap the review flow already guards: the record says
                        // done and the guest is still standing at a gate.
                        if (!canText) {
                          e.preventDefault();
                          window.alert("This only works on a phone.\n\nA desktop has nothing to hand an sms: link to, so no message would be sent — and marking it sent here would be a lie.\n\nOpen this page on your phone.");
                          return;
                        }
                        markGateCodeSent(b, true);
                      }}
                      style={{
                        display: "block", textAlign: "center",
                        background: b.gateCodeSentAt ? "transparent" : "var(--purple, #CB6CE6)",
                        color: b.gateCodeSentAt ? "var(--muted, #9A8FB4)" : "#0A0612",
                        border: b.gateCodeSentAt ? "1px solid rgba(203,108,230,0.35)" : "none",
                        borderRadius: 8, padding: "13px", fontSize: 15.5,
                        fontWeight: 700, textDecoration: "none",
                      }}>
                      {b.gateCodeSentAt
                        ? `Send ${first} the gate code again`
                        : canText ? `Text ${first} the gate code` : "Text the gate code (phone only)"}
                    </a>
                    {/* The card stays on the list either way. It is not hidden
                        once sent, because a guest who cannot find the gate will
                        ring while you are casting off and you need the button
                        again — and it drops off by itself once the date passes. */}
                    {b.gateCodeSentAt && (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 8 }}>
                        <span style={{ fontSize: 13, color: "#4FBF8B", fontWeight: 700 }}>
                          ✓ Sent {sentWhen(b.gateCodeSentAt)}
                        </span>
                        <button
                          type="button"
                          onClick={() => markGateCodeSent(b, false)}
                          style={{ background: "none", border: "none", color: "var(--muted, #9A8FB4)", fontSize: 12.5, textDecoration: "underline", padding: 0 }}>
                          undo
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => { setPhonesOpen(b.id); setNewPhone({ number: "", label: "" }); }}
                    style={{
                      width: "100%", padding: "13px", borderRadius: 8, fontSize: 15,
                      border: "1px dashed rgba(203,108,230,0.45)", background: "transparent",
                      color: "var(--purple, #CB6CE6)", fontWeight: 700, cursor: "pointer",
                    }}
                  >
                    No number yet — add one
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {screen === "hours" && (
        <div>
          <p style={{ color: "var(--muted, #9A8FB4)", fontSize: 13.5, margin: "0 0 14px" }}>
            One reading after each outing. Thirteen service items are already set up against hour
            intervals — they stay unjudgeable until this has numbers in it.
          </p>

          {hoursSaved && (
            <div style={{ ...S.card, borderColor: "#7FE0B8" }}>
              <strong style={{ color: "#7FE0B8" }}>{hoursSaved}</strong>
            </div>
          )}

          <form onSubmit={saveHours} style={{ ...S.card, display: "grid", gap: 10 }}>
            <div style={{ display: "grid", gap: 6 }}>
              {vessels.map((v) => {
                const last = lastFor(v.id);
                const on = hoursForm.vesselId === v.id;
                return (
                  <button
                    key={v.id} type="button" onClick={() => setHoursForm((f) => ({ ...f, vesselId: v.id }))}
                    style={{
                      textAlign: "left", padding: "13px 14px", borderRadius: 10, fontSize: 16, fontWeight: 700,
                      border: "1px solid " + (on ? "var(--purple, #CB6CE6)" : "rgba(203,108,230,0.3)"),
                      background: on ? "rgba(203,108,230,0.18)" : "transparent",
                      color: "var(--text, #ECE7F5)",
                    }}
                  >
                    {v.name}
                    <div style={{ fontSize: 12.5, fontWeight: 400, color: "var(--muted, #9A8FB4)", marginTop: 2 }}>
                      {/* The running total, not the last row. On a boat with no
                          meter those are different numbers and only the total
                          answers "how much has this engine run". */}
                      {currentHours(v, logs) != null
                        ? currentHours(v, logs) + " hrs " + (isMetered(v) ? "on the meter" : "run so far")
                        : "never logged"}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* The box wants a different number depending on the boat, and only
                one of the three has a dial to read. Saying which, right above
                the keyboard, is the difference between a total and a duration
                going into the same column. */}
            {hoursForm.vesselId && (() => {
              const v = vessels.find((x) => x.id === hoursForm.vesselId);
              if (!v) return null;
              return (
                <div style={{ fontSize: 12.5, color: "var(--muted, #9A8FB4)", lineHeight: 1.45, marginTop: -2 }}>
                  {isMetered(v)
                    ? `${v.name} has an hour meter — type what the dial reads.`
                    : `${v.name} has no meter — type just THIS trip's hours. They get added to the total.`}
                </div>
              );
            })()}

            <input
              type="number" inputMode="decimal" step="0.1" min="0" required
              placeholder={
                (() => {
                  const v = vessels.find((x) => x.id === hoursForm.vesselId);
                  return v && !isMetered(v) ? "Hours run this trip" : "Hour meter reading";
                })()
              }
              value={hoursForm.hours}
              onChange={(e) => setHoursForm((f) => ({ ...f, hours: e.target.value }))}
              style={{ padding: "15px 13px", fontSize: 19, borderRadius: 10, border: "1px solid rgba(203,108,230,0.4)", background: "var(--card, #171029)", color: "inherit", fontVariantNumeric: "tabular-nums" }}
            />
            <input
              type="text" placeholder="Anything worth noting (optional)"
              value={hoursForm.note}
              onChange={(e) => setHoursForm((f) => ({ ...f, note: e.target.value }))}
              style={{ padding: "13px", fontSize: 15.5, borderRadius: 10, border: "1px solid rgba(203,108,230,0.3)", background: "var(--card, #171029)", color: "inherit" }}
            />
            <button
              type="submit" disabled={busy === "hours" || !hoursForm.vesselId}
              style={{ ...S.tap, background: "var(--pink, #E86AA8)", color: "#0A0612", opacity: hoursForm.vesselId ? 1 : 0.5 }}
            >
              {busy === "hours" ? "Saving…" : "Log it"}
            </button>
          </form>

          {logs.length > 0 && (
            <div style={S.card}>
              <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 15 }}>Recent readings</div>
              {logs.slice(0, 8).map((l) => {
                const v = vessels.find((x) => x.id === l.vesselId);
                return (
                  <div key={l.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "7px 0", borderBottom: "1px solid rgba(203,108,230,0.1)", fontSize: 14 }}>
                    <span>{(v && v.name) || l.vesselId}</span>
                    <span style={{ color: "var(--muted, #9A8FB4)", fontVariantNumeric: "tabular-nums" }}>{l.hours} hrs · {l.date}</span>
                  </div>
                );
              })}
            </div>
          )}
          {logs.length === 0 && (
            <div style={{ ...S.card, color: "var(--muted, #9A8FB4)", fontSize: 14 }}>
              Nothing logged yet. The first reading is the one that starts the clock.
            </div>
          )}

          {/* FUEL, logged at the pump. It lived only on the desktop console,
              which is nowhere near a fuel dock — so the 6 Sep fill went in
              afterwards with no hours against it, and "due for fuel" has
              nothing to measure from. */}
          <div style={{ height: 8 }} />
          <h2 style={{ fontSize: 17, margin: "18px 0 8px" }}>Fuel</h2>
          {fuelSaved && (
            <div style={{ ...S.card, borderColor: "#7FE0B8" }}>
              <strong style={{ color: "#7FE0B8" }}>{fuelSaved}</strong>
            </div>
          )}
          <form onSubmit={saveFuel} style={{ ...S.card, display: "grid", gap: 10 }}>
            <div style={{ display: "grid", gap: 6 }}>
              {vessels.map((v) => {
                const on = fuelForm.vesselId === v.id;
                const lastFill = fuel.filter((f) => f.vesselId === v.id)[0] || null;
                return (
                  <button
                    key={v.id} type="button" onClick={() => setFuelForm((f) => ({ ...f, vesselId: v.id }))}
                    style={{
                      textAlign: "left", padding: "13px 14px", borderRadius: 10, fontSize: 16, fontWeight: 700,
                      border: "1px solid " + (on ? "var(--pink, #E86AA8)" : "rgba(203,108,230,0.3)"),
                      background: on ? "rgba(232,106,168,0.16)" : "transparent",
                      color: "var(--text, #ECE7F5)",
                    }}
                  >
                    {v.name}
                    <div style={{ fontSize: 12.5, fontWeight: 400, color: "var(--muted, #9A8FB4)", marginTop: 2 }}>
                      {lastFill
                        ? `last filled ${lastFill.date}${lastFill.gallons ? ` · ${lastFill.gallons} gal` : ""}`
                        : "no fill-up logged"}
                    </div>
                  </button>
                );
              })}
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="number" inputMode="decimal" step="0.001" min="0" placeholder="Gallons"
                value={fuelForm.gallons}
                onChange={(e) => setFuelForm((f) => ({ ...f, gallons: e.target.value }))}
                style={{ flex: 1, minWidth: 0, padding: "15px 13px", fontSize: 18, borderRadius: 10, border: "1px solid rgba(203,108,230,0.4)", background: "var(--card, #171029)", color: "inherit", fontVariantNumeric: "tabular-nums" }}
              />
              <input
                type="number" inputMode="decimal" step="0.01" min="0" placeholder="$ total"
                value={fuelForm.cost}
                onChange={(e) => setFuelForm((f) => ({ ...f, cost: e.target.value }))}
                style={{ flex: 1, minWidth: 0, padding: "15px 13px", fontSize: 18, borderRadius: 10, border: "1px solid rgba(203,108,230,0.4)", background: "var(--card, #171029)", color: "inherit", fontVariantNumeric: "tabular-nums" }}
              />
            </div>

            {/* Nobody should be adding charter lengths up in their head at a
                fuel dock, so the current total is one tap away. Without it the
                field goes in blank, which is what happened on 6 Sep. */}
            <input
              type="number" inputMode="decimal" step="0.1" min="0"
              placeholder={
                (() => {
                  const v = vessels.find((x) => x.id === fuelForm.vesselId);
                  return v && !isMetered(v) ? "Total hours at fill-up (optional)" : "Meter at fill-up (optional)";
                })()
              }
              value={fuelForm.hoursAtFillup}
              onChange={(e) => setFuelForm((f) => ({ ...f, hoursAtFillup: e.target.value }))}
              style={{ padding: "13px", fontSize: 16, borderRadius: 10, border: "1px solid rgba(203,108,230,0.3)", background: "var(--card, #171029)", color: "inherit", fontVariantNumeric: "tabular-nums" }}
            />
            {(() => {
              const v = vessels.find((x) => x.id === fuelForm.vesselId);
              const now = v ? currentHours(v, logs) : null;
              if (now == null || fuelForm.hoursAtFillup !== "") return null;
              return (
                <button
                  type="button"
                  onClick={() => setFuelForm((f) => ({ ...f, hoursAtFillup: String(now) }))}
                  style={{ background: "none", border: "none", padding: 0, color: "var(--purple, #CB6CE6)", fontSize: 13, textAlign: "left" }}
                >
                  Use {v.name}&rsquo;s current {now} hrs
                </button>
              );
            })()}

            <input
              type="text" placeholder="Note (optional)"
              value={fuelForm.note}
              onChange={(e) => setFuelForm((f) => ({ ...f, note: e.target.value }))}
              style={{ padding: "13px", fontSize: 15.5, borderRadius: 10, border: "1px solid rgba(203,108,230,0.3)", background: "var(--card, #171029)", color: "inherit" }}
            />
            <div style={{ fontSize: 12, color: "var(--muted, #9A8FB4)", lineHeight: 1.45 }}>
              A dollar total also posts a fuel expense to the ledger, so it does not need entering twice.
            </div>
            <button
              type="submit"
              disabled={busy === "fuel" || !fuelForm.vesselId || (fuelForm.gallons === "" && fuelForm.cost === "")}
              style={{
                ...S.tap, background: "var(--pink, #E86AA8)", color: "#0A0612",
                opacity: fuelForm.vesselId && (fuelForm.gallons !== "" || fuelForm.cost !== "") ? 1 : 0.5,
              }}
            >
              {busy === "fuel" ? "Saving…" : "Log the fill-up"}
            </button>
          </form>

          {/* SERVICE CHECKS. The same thirteen items as the Boat tab in the
              console, which is a desktop — and every one of these gets done
              standing next to the engine, not sitting at a desk afterwards.
              Marking one done stamps the date AND the fleet hours together,
              because an hours-interval item with no lastDoneHours can never be
              judged, which is how all thirteen came to read "OK" while meaning
              "nobody has ever told me anything". */}
          <h2 style={{ fontSize: 17, margin: "22px 0 4px" }}>Service checks</h2>
          <p style={{ color: "var(--muted, #9A8FB4)", fontSize: 13, margin: "0 0 10px", lineHeight: 1.45 }}>
            Tap one to mark it done today. Full intervals stay on the console — this is the
            list you work through with the cowling up.
          </p>

          {maintItems.length === 0 && (
            <div style={{ ...S.card, color: "var(--muted, #9A8FB4)", fontSize: 14 }}>
              No service items configured.
            </div>
          )}

          {/* Grouped by boat, worst first within each. The same job on two
              hulls is two different answers now: the Explorer's oil against the
              Explorer's hours, the Islander's against its own. */}
          {maintByVessel(maintItems, vessels, logs).map((group) => (
            <div key={group.vesselId || "fleet"} style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
                <span style={{ fontSize: 14.5, fontWeight: 700 }}>{group.name}</span>
                <span style={{ fontSize: 11.5, color: "var(--muted, #9A8FB4)" }}>{maintSummarise(group)}</span>
              </div>
              {group.items.length === 0 && (
                <div style={{ fontSize: 12.5, color: "#E8934A", padding: "8px 2px" }}>
                  No schedule set up for this boat yet.
                </div>
              )}
              {group.items.map(({ item, status, label, hoursSince, monthsSince }) => (
                <button
                  key={item.id} type="button"
                  disabled={maintBusy === item.id}
                  onClick={() => markServiced(item)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                    width: "100%", textAlign: "left", marginBottom: 8, padding: "13px 14px",
                    borderRadius: 10, border: "1px solid " + (status === "overdue" ? "#E2685F" : "rgba(203,108,230,0.25)"),
                    background: status === "overdue" ? "rgba(226,104,95,0.08)" : "var(--card, #171029)",
                    color: "var(--text, #ECE7F5)", opacity: maintBusy === item.id ? 0.5 : 1,
                  }}
                >
                  <span style={{ minWidth: 0 }}>
                    <span style={{ fontSize: 15, fontWeight: 600 }}>{item.label}</span>
                    <span style={{ display: "block", fontSize: 11.5, color: "var(--muted, #9A8FB4)", marginTop: 3 }}>
                      {item.lastDoneDate ? `last done ${item.lastDoneDate}` : "no record of it ever being done"}
                      {hoursSince != null ? ` · ${Math.round(hoursSince)} hrs since` : ""}
                      {monthsSince != null && hoursSince == null ? ` · ${monthsSince} mo since` : ""}
                    </span>
                  </span>
                  <span style={{ flex: "0 0 auto", fontSize: 11.5, fontWeight: 700, textAlign: "right",
                    color: status === "overdue" ? "#E2685F" : status === "due-soon" ? "#E8934A"
                      : status === "ok" ? "#4FBF8B" : "var(--muted, #9A8FB4)" }}>
                    {label}
                  </span>
                </button>
              ))}
            </div>
          ))}

          {fuel.length > 0 && (
            <div style={{ ...S.card, marginTop: 18 }}>
              <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 15 }}>Recent fill-ups</div>
              {fuel.slice(0, 6).map((f) => {
                const v = vessels.find((x) => x.id === f.vesselId);
                return (
                  <div key={f.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "7px 0", borderBottom: "1px solid rgba(203,108,230,0.1)", fontSize: 14 }}>
                    <span>{(v && v.name) || f.vesselId}</span>
                    <span style={{ color: "var(--muted, #9A8FB4)", fontVariantNumeric: "tabular-nums" }}>
                      {f.gallons ? f.gallons + " gal" : ""}{f.cost ? " · $" + f.cost : ""} · {f.date}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {screen === "ask" && (
      <>
      <p style={{ color: "var(--muted, #9A8FB4)", fontSize: 13.5, margin: "0 0 14px" }}>
        Warmest first. Tapping opens your messages app with the wording already written — you still send it.
      </p>

      {!canText && (
        <div style={{ ...S.card, borderColor: "#E8934A" }}>
          <strong style={{ color: "#E8934A" }}>This is a phone page.</strong>
          <div style={{ color: "var(--muted, #9A8FB4)", fontSize: 14, marginTop: 4 }}>
            A desktop has nothing to hand a text link to. Open this on your phone, or use Copy below and send it another way.
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {[["todo", "To ask", todo.length], ["done", "Asked", done.length]].map(([id, label, n]) => {
          const active = (id === "done") === showDone;
          return (
            <button
              key={id} type="button" onClick={() => setShowDone(id === "done")}
              style={{
                flex: 1, padding: "11px 8px", borderRadius: 9, fontSize: 15, fontWeight: 700,
                border: "1px solid var(--purple, #CB6CE6)",
                background: active ? "var(--purple, #CB6CE6)" : "transparent",
                color: active ? "#0A0612" : "var(--text, #ECE7F5)",
              }}
            >
              {label} ({n})
            </button>
          );
        })}
      </div>

      {shown.length === 0 && (
        <div style={{ ...S.card, textAlign: "center", color: "var(--muted, #9A8FB4)" }}>
          {showDone ? "Nobody asked yet." : "Everyone with a phone number has been asked. "}
        </div>
      )}

      {shown.map((r) => {
        const msg = reviewMessage("sms", { name: r.guestName, date: r.date, vesselName: r.vessel }, new Date());
        const href = smsHref(r.phone, msg);
        const w = ASK_WINDOWS[r.window] || ASK_WINDOWS.cold;
        return (
          <div key={r.id} style={S.card}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
              <strong style={{ fontSize: 17 }}>{r.guestName || "Guest"}</strong>
              <span style={{ fontSize: 12.5, color: w.color, fontWeight: 700, whiteSpace: "nowrap" }}>{w.label}</span>
            </div>
            <div style={{ color: "var(--muted, #9A8FB4)", fontSize: 13.5, margin: "2px 0 12px" }}>
              {r.date} · {r.days === 0 ? "today" : r.days === 1 ? "yesterday" : r.days + " days ago"}
              {r.vessel && r.vessel !== "undefined" ? " · " + r.vessel : ""}
            </div>

            {!r.reviewRequestedAt ? (
              <div style={{ display: "grid", gap: 8 }}>
                {href && (
                  <a
                    href={href}
                    onClick={() => { if (canText) mark(r, true); }}
                    style={{ ...S.tap, background: canText ? "var(--pink, #E86AA8)" : "transparent", color: canText ? "#0A0612" : "var(--muted, #9A8FB4)", border: canText ? "none" : "1px solid rgba(203,108,230,0.3)" }}
                  >
                    {canText ? "Text " + (r.guestName || "them").split(" ")[0] : "Text it (phone only)"}
                  </a>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard && navigator.clipboard.writeText(msg)}
                    style={{ flex: 1, padding: "11px", borderRadius: 9, fontSize: 14.5, fontWeight: 700, background: "transparent", color: "var(--text, #ECE7F5)", border: "1px solid rgba(203,108,230,0.35)" }}
                  >
                    Copy wording
                  </button>
                  <button
                    type="button" disabled={busy === r.id}
                    onClick={() => mark(r, true)}
                    style={{ flex: 1, padding: "11px", borderRadius: 9, fontSize: 14.5, fontWeight: 700, background: "transparent", color: "var(--muted, #9A8FB4)", border: "1px solid rgba(203,108,230,0.25)" }}
                  >
                    Mark asked
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span style={{ color: "#7FE0B8", fontSize: 14.5, fontWeight: 700 }}>
                  Asked {String(r.reviewRequestedAt).slice(0, 10)}
                </span>
                <button
                  type="button" disabled={busy === r.id} onClick={() => mark(r, false)}
                  style={{ padding: "9px 14px", borderRadius: 8, fontSize: 13.5, background: "transparent", color: "var(--muted, #9A8FB4)", border: "1px solid rgba(203,108,230,0.25)" }}
                >
                  Undo
                </button>
              </div>
            )}
          </div>
        );
      })}

      <div style={{ ...S.card, marginTop: 16 }}>
        <div style={{ fontSize: 13.5, color: "var(--muted, #9A8FB4)", marginBottom: 8 }}>
          Say it out loud at the dock instead — it converts better than any message:
        </div>
        <div style={{ fontSize: 14.5, lineHeight: 1.55 }}>
          &ldquo;We&rsquo;re a small local outfit and Google reviews are how people find us. If you get a sec
          tonight, search <strong>The Nauti Yachti</strong> and leave an honest review. Means the world.&rdquo;
        </div>
        <a href={GOOGLE_REVIEW_URL} target="_blank" rel="noopener noreferrer"
          style={{ display: "inline-block", marginTop: 10, color: "var(--purple, #CB6CE6)", fontSize: 13.5 }}>
          Open the review link yourself →
        </a>
      </div>
      </>
      )}
    </div>
  );
}
