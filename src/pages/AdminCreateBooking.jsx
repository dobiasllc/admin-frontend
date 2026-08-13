/**
 * AdminCreateBooking.jsx
 * Create an admin booking — no Stripe, no SignWell, no verification gate.
 * Route: /bookings/new
 *
 * Workflow:
 *   Step 1 — Fill in all details (vehicle, calendar date/time picker, guest info,
 *             additional driver, payment method, purpose/notes). Preview draft
 *             contract at any time.
 *   Step 2 — Review summary, adjust price/deposit if needed, then confirm.
 *   After confirmation — go to booking detail page to print the official contract,
 *             get it signed in person, then mark it as signed from the detail page.
 */
import { useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useApi } from "../context/AuthContext";
import AdminLayout from "../components/AdminNav";
import PersonPicker from "../components/PersonPicker";


// ── Helpers ───────────────────────────────────────────────────────────────────

function pad(n) { return String(n).padStart(2, "0"); }

function toNaiveLocal(datetimeLocalValue) {
  if (!datetimeLocalValue) return "";
  return datetimeLocalValue.length === 16
    ? datetimeLocalValue + ":00"
    : datetimeLocalValue;
}

function formatCents(c) {
  return `$${((c || 0) / 100).toFixed(2)}`;
}

function calcDays(start, end) {
  if (!start || !end) return 0;
  const s = new Date(start);
  const e = new Date(end);
  const diff = (e - s) / 86400000;
  return Math.max(1, Math.ceil(diff));
}

function fmtDateStr(y, m, d) {
  return `${y}-${pad(m)}-${pad(d)}`;
}

// 30-minute time-of-day options
const TIME_SLOTS = (() => {
  const out = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      out.push(`${pad(h)}:${pad(m)}`);
    }
  }
  return out;
})();

function isTimeSlotAvailable(dateStr, timeStr, bookings, bufferHours) {
  const slotDt = new Date(`${dateStr}T${timeStr}:00`);
  for (const b of bookings || []) {
    const s = new Date((b.start || "").replace(" ", "T"));
    const e = new Date((b.end || "").replace(" ", "T"));
    if (isNaN(s) || isNaN(e)) continue;
    const eBuffered = new Date(e.getTime() + (bufferHours || 0) * 3600000);
    if (slotDt >= s && slotDt < eBuffered) return false;
  }
  return true;
}

// ── Payment method options ────────────────────────────────────────────────────
const PAYMENT_OPTIONS = [
  { value: "bank_transfer",       label: "Bank Transfer" },
  { value: "check",               label: "Check collected in person" },
  { value: "cash",                label: "Cash collected in person" },
  { value: "card_in_person",      label: "Card charged in person (external terminal)" },
  { value: "stripe_payment_link", label: "Stripe — Send payment link to renter" },
];

function getNoticeText(paymentMethod) {
  switch (paymentMethod) {
    case "bank_transfer":
      return "Payment via bank transfer — no Stripe charge will be processed. Transfer funds separately and note the booking ID in the memo.";
    case "check":
      return "Check payment — no Stripe charge will be processed. Collect the signed check before or at vehicle pickup.";
    case "cash":
      return "Cash payment — no Stripe charge will be processed. Collect cash at vehicle pickup.";
    case "card_in_person":
      return "Card charged via external terminal — no Stripe charge will be processed.";
    case "stripe_payment_link":
      return "A Stripe Checkout link will be generated from the booking detail page after confirming. Copy or text it to the renter — they pay online at their own pace. A deposit hold can optionally be placed automatically after they pay.";
    default:
      return "No Stripe charge will be processed for this booking.";
  }
}

const STEPS = ["Details", "Review"];

// ── Address autocomplete (OpenStreetMap Nominatim — free, no API key) ────────
function AddressAutocomplete({ value, onChange, placeholder, inputClassName }) {
  const [query, setQuery] = useState(value || "");
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);
  const wrapRef = useRef(null);

  useEffect(() => { setQuery(value || ""); }, [value]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleInput = (val) => {
    setQuery(val);
    onChange(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!val || val.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          format: "json",
          q: val,
          countrycodes: "us",
          limit: "5",
          addressdetails: "1",
        });
        const resp = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
          headers: { "Accept-Language": "en-US" },
        });
        const data = await resp.json();
        setSuggestions(Array.isArray(data) ? data : []);
        setOpen(true);
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 450);
  };

  const selectSuggestion = (s) => {
    setQuery(s.display_name);
    onChange(s.display_name);
    setOpen(false);
    setSuggestions([]);
  };

  return (
    <div className="relative" ref={wrapRef}>
      <input
        type="text"
        value={query}
        onChange={e => handleInput(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder={placeholder}
        className={inputClassName}
        autoComplete="off"
      />
      {loading && (
        <div className="absolute right-3 top-2.5 animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-blue-500" />
      )}
      {open && suggestions.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-auto text-sm dark:bg-gray-800 dark:border-gray-700">
          {suggestions.map((s, i) => (
            <li
              key={i}
              onClick={() => selectSuggestion(s)}
              className="px-3 py-2 hover:bg-blue-50 cursor-pointer dark:hover:bg-gray-700 dark:text-gray-200"
            >
              {s.display_name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AdminCreateBooking() {
  const api      = useApi();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);

  // Vehicles
  const [vehicles, setVehicles]         = useState([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(true);

  // Core booking fields
  const [vin, setVin]               = useState("");
  const [purpose, setPurpose]       = useState("");
  const [notes, setNotes]           = useState("");
  const [pickupLocation, setPickup] = useState("");
  const [paymentMethod, setPayment] = useState("bank_transfer");

  // Calendar / date-time picker state
  const now0 = new Date();
  const [calMonth, setCalMonth] = useState(now0.getMonth() + 1);
  const [calYear, setCalYear]   = useState(now0.getFullYear());
  const [calendarData, setCalendarData] = useState(null);
  const [calendarLoading, setCalendarLoading] = useState(false);

  const [selStartDay, setSelStartDay] = useState(""); // "YYYY-MM-DD"
  const [selEndDay, setSelEndDay]     = useState("");
  const [startTime, setStartTime]     = useState("10:00");
  const [endTime, setEndTime]         = useState("10:00");

  const startDate = selStartDay ? `${selStartDay}T${startTime}` : "";
  const endDate   = selEndDay ? `${selEndDay}T${endTime}` : "";

  // Primary renter — via PersonPicker (may link an existing account)
  const [renter, setRenter] = useState({});
  const guestName    = renter.name || "";
  const guestPhone   = renter.phone || "";
  const guestEmail   = renter.email || "";
  const guestAddress = renter.address || "";
  const guestCity    = renter.city || "";
  const guestDOB     = renter.dob || "";
  const guestDLNum   = renter.dlNumber || "";
  const guestDLState = renter.dlState || "";
  const guestDLExp   = renter.dlExp || "";

  // Additional driver — via PersonPicker (may link an existing account)
  const [addlDriver, setAddlDriver] = useState({});
  const addlName    = addlDriver.name || "";
  const addlAddress = addlDriver.address || "";
  const addlDLNum   = addlDriver.dlNumber || "";
  const addlDLState = addlDriver.dlState || "";
  const addlDLExp   = addlDriver.dlExp || "";
  const addlDOB     = addlDriver.dob || "";


  // Price/deposit overrides (Step 2)
  const [totalOverride, setTotalOverride]     = useState(null); // cents, null = use default
  const [depositOverride, setDepositOverride] = useState(null);
  const [totalInputStr, setTotalInputStr]     = useState(""); // raw text while typing
  const [depositInputStr, setDepositInputStr] = useState("");

  // Admin override: skip the cleaning/turnover buffer for this booking
  const [skipCleaningBuffer, setSkipCleaningBuffer] = useState(false);

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState("");

  // Load vehicles
  useEffect(() => {
    api.get("/admin/vehicles")
      .then(r => {
        const all = (r.data || []).sort((a, b) =>
          `${a.make} ${a.model}`.localeCompare(`${b.make} ${b.model}`)
        );
        setVehicles(all);
        if (all.length > 0 && !vin) setVin(all[0].vin);
      })
      .catch(console.error)
      .finally(() => setVehiclesLoading(false));
  }, []);

  // Default calendar to today; pre-set default pickup location from vehicle home address
  useEffect(() => {
    const v = vehicles.find(v => v.vin === vin);
    if (v && !pickupLocation) {
      const parts = [v.homeAddress, v.homeCity, v.homeState, v.homeZip].filter(Boolean);
      if (parts.length) setPickup(parts.join(", "));
    }
  }, [vin, vehicles]);

  // Fetch calendar month data whenever vin/month/year changes
  useEffect(() => {
    if (!vin) return;
    setCalendarLoading(true);
    api.get(`/vehicles/${vin}/calendar?month=${calMonth}&year=${calYear}`)
      .then(r => setCalendarData(r.data))
      .catch(() => setCalendarData(null))
      .finally(() => setCalendarLoading(false));
  }, [vin, calMonth, calYear]);

  const selectedVehicle = vehicles.find(v => v.vin === vin);
  const numDays         = calcDays(startDate, endDate);
  const dailyRate       = selectedVehicle?.dailyRateCents || 0;
  const defaultTotalCents   = dailyRate * numDays;
  const defaultDepositCents = Math.min(dailyRate, 50000);
  const totalCents      = totalOverride !== null ? totalOverride : defaultTotalCents;
  const depositCents    = depositOverride !== null ? depositOverride : defaultDepositCents;

  const canReview = vin && startDate && endDate && startDate < endDate;

  // Initialize the free-typing price input strings when we (re)compute new defaults
  // and no override is currently in effect, so Step 2 shows a sensible starting value.
  useEffect(() => {
    if (totalOverride === null) setTotalInputStr((defaultTotalCents / 100).toFixed(2));
  }, [defaultTotalCents, totalOverride]);
  useEffect(() => {
    if (depositOverride === null) setDepositInputStr((defaultDepositCents / 100).toFixed(2));
  }, [defaultDepositCents, depositOverride]);


  // ── Calendar helpers ───────────────────────────────────────────────────────
  const dayMap = {};
  (calendarData?.days || []).forEach(d => { dayMap[d.date] = d; });

  const goPrevMonth = () => {
    if (calMonth === 1) { setCalMonth(12); setCalYear(y => y - 1); }
    else setCalMonth(m => m - 1);
  };
  const goNextMonth = () => {
    if (calMonth === 12) { setCalMonth(1); setCalYear(y => y + 1); }
    else setCalMonth(m => m + 1);
  };

  const handleDayClick = (dateStr, available) => {
    if (!available) return;
    if (dateStr === selStartDay) {
      // Clicking the same day as start again — allow same-day start+end
      // (they'll need different times to form a valid range).
      setSelEndDay(dateStr);
      return;
    }
    if (!selStartDay || (selStartDay && selEndDay)) {
      // Start a fresh selection
      setSelStartDay(dateStr);
      setSelEndDay("");
    } else if (dateStr < selStartDay) {
      setSelStartDay(dateStr);
      setSelEndDay("");
    } else {
      setSelEndDay(dateStr);
    }
  };

  const daysInMonth = new Date(calYear, calMonth, 0).getDate();
  const firstOfMonth = new Date(calYear, calMonth - 1, 1);
  const leadingBlanks = firstOfMonth.getDay(); // 0=Sun

  const effectiveBufferHours = skipCleaningBuffer ? 0 : (calendarData?.turnoverBufferHours || 0);

  const startSlotsBlocked = new Set(
    selStartDay
      ? TIME_SLOTS.filter(t => !isTimeSlotAvailable(selStartDay, t, calendarData?.bookings, effectiveBufferHours))
      : []
  );
  const endSlotsBlocked = new Set(
    selEndDay
      ? TIME_SLOTS.filter(t => !isTimeSlotAvailable(selEndDay, t, calendarData?.bookings, effectiveBufferHours))
      : []
  );

  // Today's date string (business-local, best-effort using browser local time)
  const todayStr = fmtDateStr(now0.getFullYear(), now0.getMonth() + 1, now0.getDate());

  // A day is only fully unavailable if EVERY time slot that day is blocked
  // (partial-day bookings should still allow picking the free portion of the day).
  function isDayFullyBooked(dateStr) {
    return TIME_SLOTS.every(t => !isTimeSlotAvailable(dateStr, t, calendarData?.bookings, effectiveBufferHours));
  }


  // ── Open draft print preview ───────────────────────────────────────────────
  const openPrintPreview = (isDraft = true) => {
    const params = new URLSearchParams({
      draft:          isDraft ? "1" : "0",
      vin:            vin,
      startTime:      toNaiveLocal(startDate),
      endTime:        toNaiveLocal(endDate),
      guestName,
      guestPhone,
      guestEmail,
      guestAddress,
      guestCity,
      guestDOB,
      guestDLNum,
      guestDLState,
      guestDLExp,
      addlName,
      addlAddress,
      addlDLNum,
      addlDLState,
      addlDLExp,
      addlDOB,
      purpose,
      notes,
      pickupLocation,
      paymentMethod,
      totalCents:     String(totalCents),
      depositCents:   String(depositCents),
      numDays:        String(numDays),
      dailyRateCents: String(dailyRate),
      vehicleName:    selectedVehicle
        ? `${selectedVehicle.year} ${selectedVehicle.make} ${selectedVehicle.model}`
        : vin,
    });
    window.open(`/admin/bookings/print-contract?${params.toString()}`, "_blank");
  };

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setSubmitting(true);
    setError("");
    try {
      const res = await api.post("/admin/bookings", {
        vin,
        user_id:              renter.userId || "",
        addl_driver_user_id:  addlDriver.userId || "",
        start_time:      toNaiveLocal(startDate),
        end_time:        toNaiveLocal(endDate),
        guest_name:      guestName,
        guest_phone:     guestPhone,
        guest_email:     guestEmail,
        guest_address:   guestAddress,
        guest_city:      guestCity,
        guest_dob:       guestDOB,
        guest_dl_num:    guestDLNum,
        guest_dl_state:  guestDLState,
        guest_dl_exp:    guestDLExp,
        addl_driver_name:     addlName,
        addl_driver_address:  addlAddress,
        addl_driver_dl_num:   addlDLNum,
        addl_driver_dl_state: addlDLState,
        addl_driver_dl_exp:   addlDLExp,
        addl_driver_dob:      addlDOB,
        purpose,
        notes,
        pickup_location: pickupLocation,
        payment_method:  paymentMethod,
        total_amount_cents:   totalCents,
        deposit_amount_cents: depositCents,
        skip_cleaning_buffer: skipCleaningBuffer,
      });

      navigate(`/bookings/${res.data.booking_id}`);
    } catch (e) {
      setError(e.response?.data?.error || e.message || "Booking failed");
      setStep(1);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Input class helper ─────────────────────────────────────────────────────
  const inp = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:border-gray-600 dark:bg-gray-800";

  const monthLabel = new Date(calYear, calMonth - 1, 1).toLocaleString(undefined, { month: "long", year: "numeric" });

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <AdminLayout>
      <div className="max-w-2xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="mb-6">
          <Link to="/bookings" className="text-sm text-blue-600 hover:underline">← Back to Bookings</Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-1 dark:text-gray-100">New Admin Booking</h1>
        </div>

        {/* Step indicator */}
        <div className="flex items-center mb-6">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold
                ${i <= step - 1 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500 dark:bg-gray-700'}`}>
                {i + 1}
              </div>
              <span className={`ml-2 text-sm font-medium ${i === step - 1 ? 'text-blue-600' : 'text-gray-400 dark:text-gray-500'}`}>{s}</span>
              {i < STEPS.length - 1 && <div className="w-8 h-px bg-gray-300 mx-3 dark:bg-gray-600" />}
            </div>
          ))}
        </div>

        {/* Consolidated admin-booking notice */}
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800 dark:bg-amber-900/20 dark:border-amber-700 dark:text-amber-300">
          <span className="font-semibold">⚠ Admin Booking</span> — Creates a confirmed booking directly, bypassing Stripe and e-signature at creation.
          {" "}{getNoticeText(paymentMethod)}
          {" "}Print and sign the contract from the booking detail page after confirming.
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 dark:bg-red-900/20">{error}</div>
        )}

        {/* ── Step 1: Form ── */}
        {step === 1 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5 dark:bg-gray-800 dark:border-gray-700">

            {/* Vehicle */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Vehicle</label>
              {vehiclesLoading ? (
                <div className="text-sm text-gray-400 dark:text-gray-500">Loading vehicles…</div>
              ) : (
                <select value={vin} onChange={e => { setVin(e.target.value); setSelStartDay(""); setSelEndDay(""); }} className={inp}>
                  {vehicles.map(v => (
                    <option key={v.vin} value={v.vin}>
                      {v.year} {v.make} {v.model}
                      {v.status === "maintenance" ? " (maintenance)" : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Calendar date/time picker */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Select Dates</label>
              <div className="border border-gray-200 rounded-lg p-3 dark:border-gray-700">
                <div className="flex items-center justify-between mb-2">
                  <button type="button" onClick={goPrevMonth} className="px-2 py-1 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700">‹</button>
                  <span className="text-sm font-medium">{monthLabel}</span>
                  <button type="button" onClick={goNextMonth} className="px-2 py-1 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700">›</button>
                </div>
                {calendarLoading ? (
                  <div className="text-xs text-gray-400 py-4 text-center">Loading availability…</div>
                ) : (
                  <>
                    <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-gray-400 mb-1">
                      {["S","M","T","W","T","F","S"].map((d, i) => <div key={i}>{d}</div>)}
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                      {Array.from({ length: leadingBlanks }).map((_, i) => <div key={`b${i}`} />)}
                      {Array.from({ length: daysInMonth }).map((_, i) => {
                        const d = i + 1;
                        const dateStr = fmtDateStr(calYear, calMonth, d);
                        const isPast = dateStr < todayStr;
                        const available = !isPast && !isDayFullyBooked(dateStr);
                        const isStart = dateStr === selStartDay;

                        const isEnd = dateStr === selEndDay;
                        const inRange = selStartDay && selEndDay && dateStr > selStartDay && dateStr < selEndDay;
                        return (
                          <button
                            type="button"
                            key={dateStr}
                            disabled={!available}
                            onClick={() => handleDayClick(dateStr, available)}
                            className={`text-xs rounded py-1.5 transition
                              ${!available ? "text-gray-300 line-through cursor-not-allowed dark:text-gray-600" : "cursor-pointer"}
                              ${isStart || isEnd ? "bg-blue-600 text-white font-semibold" : ""}
                              ${inRange ? "bg-blue-100 dark:bg-blue-900/40" : ""}
                              ${available && !isStart && !isEnd && !inRange ? "hover:bg-gray-100 dark:hover:bg-gray-700" : ""}
                            `}
                          >
                            {d}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
                <p className="text-[11px] text-gray-400 mt-2 dark:text-gray-500">
                  Click a start day, then an end day. Greyed-out dates are unavailable (booked or blocked).
                </p>
              </div>
            </div>

            {/* Time-of-day pickers */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Start Time {selStartDay && `(${selStartDay})`}</label>
                <select value={startTime} onChange={e => setStartTime(e.target.value)} disabled={!selStartDay} className={inp}>
                  {TIME_SLOTS.map(t => (
                    <option key={t} value={t} disabled={startSlotsBlocked.has(t)}>
                      {t}{startSlotsBlocked.has(t) ? " (unavailable)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">End Time {selEndDay && `(${selEndDay})`}</label>
                <select value={endTime} onChange={e => setEndTime(e.target.value)} disabled={!selEndDay} className={inp}>
                  {TIME_SLOTS.map(t => (
                    <option key={t} value={t} disabled={endSlotsBlocked.has(t)}>
                      {t}{endSlotsBlocked.has(t) ? " (unavailable)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {startDate && endDate && startDate >= endDate && (
              <p className="text-xs text-red-600">End date/time must be after start date/time.</p>
            )}

            {/* Cleaning buffer override */}
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                id="skipCleaningBuffer"
                checked={skipCleaningBuffer}
                onChange={e => setSkipCleaningBuffer(e.target.checked)}
                className="mt-0.5"
              />
              <label htmlFor="skipCleaningBuffer" className="text-sm text-gray-700 dark:text-gray-300">
                Skip cleaning buffer <span className="text-gray-400">(admin override)</span>
                <span className="block text-xs text-gray-400 dark:text-gray-500">
                  Admin bookings are often unique/one-off and may not require the standard turnover buffer between bookings.
                </span>
              </label>
            </div>


            <PersonPicker label="Primary Renter" value={renter} onChange={setRenter} showDlFields={true} />

            <PersonPicker label="Additional Authorized Driver (optional)" value={addlDriver} onChange={setAddlDriver} showDlFields={true} />

            {/* Payment */}
            <div className="border-t border-gray-100 pt-4 dark:border-gray-700">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 dark:text-gray-500">Payment Method</p>
              <select value={paymentMethod} onChange={e => setPayment(e.target.value)} className={inp}>
                {PAYMENT_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Trip purpose & notes */}
            <div className="border-t border-gray-100 pt-4 space-y-3 dark:border-gray-700">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">
                  Trip Purpose
                  <span className="ml-1 text-xs text-gray-400 font-normal dark:text-gray-500">(shown on booking record & contract)</span>
                </label>
                <input
                  type="text"
                  value={purpose}
                  onChange={e => setPurpose(e.target.value)}
                  placeholder="e.g. Authorized business trip — insurance documentation"
                  className={inp}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Pickup / Return Location</label>
                <AddressAutocomplete
                  value={pickupLocation}
                  onChange={setPickup}
                  placeholder="Start typing an address…"
                  inputClassName={inp}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Internal Notes</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Any additional notes…" className={inp + " resize-none"} />
              </div>
            </div>

            {/* Step 1 actions */}
            <div className="pt-2 flex gap-3">
              <button
                onClick={() => openPrintPreview(true)}
                disabled={!canReview}
                className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition dark:hover:bg-gray-700 dark:bg-gray-900/40 dark:text-gray-300 dark:border-gray-600"
                title="Preview a draft of the rental agreement in a new tab"
              >
                🖨 Preview Draft Contract
              </button>
              <button
                onClick={() => setStep(2)}
                disabled={!canReview}
                className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                Review Booking →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Review ── */}
        {step === 2 && selectedVehicle && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-6 dark:bg-gray-800 dark:border-gray-700">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4 dark:text-gray-400">Booking Summary</h2>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-gray-400 dark:text-gray-500">Vehicle</dt>
                  <dd className="font-medium">{selectedVehicle.year} {selectedVehicle.make} {selectedVehicle.model}</dd>
                  <dd className="text-xs text-gray-400 font-mono dark:text-gray-500">{vin}</dd>
                </div>
                <div>
                  <dt className="text-gray-400 dark:text-gray-500">Duration</dt>
                  <dd className="font-medium">{numDays} day{numDays !== 1 ? "s" : ""}</dd>
                </div>
                <div>
                  <dt className="text-gray-400 dark:text-gray-500">Start</dt>
                  <dd>{new Date(startDate).toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="text-gray-400 dark:text-gray-500">End</dt>
                  <dd>{new Date(endDate).toLocaleString()}</dd>
                </div>
                {guestName && (
                  <div>
                    <dt className="text-gray-400 dark:text-gray-500">Renter</dt>
                    <dd>{guestName}</dd>
                  </div>
                )}
                {guestEmail && (
                  <div>
                    <dt className="text-gray-400 dark:text-gray-500">Email</dt>
                    <dd className="text-xs">{guestEmail}</dd>
                  </div>
                )}
                {addlName && (
                  <div className="col-span-2">
                    <dt className="text-gray-400 dark:text-gray-500">Additional Driver</dt>
                    <dd>{addlName}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-gray-400 dark:text-gray-500">Payment</dt>
                  <dd>{PAYMENT_OPTIONS.find(o => o.value === paymentMethod)?.label}</dd>
                </div>
                {pickupLocation && (
                  <div className="col-span-2">
                    <dt className="text-gray-400 dark:text-gray-500">Pickup / Return</dt>
                    <dd className="text-xs">{pickupLocation}</dd>
                  </div>
                )}
                {purpose && (
                  <div className="col-span-2">
                    <dt className="text-gray-400 dark:text-gray-500">Trip Purpose</dt>
                    <dd>{purpose}</dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Pricing (editable overrides) */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 dark:bg-gray-800 dark:border-gray-700">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 dark:text-gray-400">Pricing (record only — no Stripe charge)</h2>
              <div className="space-y-3 text-sm">
                <p className="text-gray-500 dark:text-gray-400">
                  Default: {formatCents(dailyRate)} × {numDays} day{numDays !== 1 ? "s" : ""} = {formatCents(defaultTotalCents)}
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Total Amount</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={totalInputStr}
                      onChange={e => {
                        const raw = e.target.value;
                        setTotalInputStr(raw);
                        const parsed = parseFloat(raw);
                        if (!isNaN(parsed) && parsed >= 0) {
                          setTotalOverride(Math.round(parsed * 100));
                        } else if (raw.trim() === "") {
                          setTotalOverride(null);
                        }
                      }}
                      onBlur={() => setTotalInputStr((totalCents / 100).toFixed(2))}
                      className={inp}
                    />
                    {totalOverride !== null && totalOverride !== defaultTotalCents && (
                      <p className="text-[11px] text-amber-600 mt-1">(adjusted from {formatCents(defaultTotalCents)} default)</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Deposit Amount</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={depositInputStr}
                      onChange={e => {
                        const raw = e.target.value;
                        setDepositInputStr(raw);
                        const parsed = parseFloat(raw);
                        if (!isNaN(parsed) && parsed >= 0) {
                          setDepositOverride(Math.round(parsed * 100));
                        } else if (raw.trim() === "") {
                          setDepositOverride(null);
                        }
                      }}
                      onBlur={() => setDepositInputStr((depositCents / 100).toFixed(2))}
                      className={inp}
                    />
                    {depositOverride !== null && depositOverride !== defaultDepositCents && (
                      <p className="text-[11px] text-amber-600 mt-1">(adjusted from {formatCents(defaultDepositCents)} default)</p>
                    )}
                  </div>

                </div>
                <div className="flex justify-between font-semibold border-t border-gray-100 pt-1.5 mt-1.5 dark:border-gray-700">
                  <span>Total Due</span>
                  <span>{formatCents(totalCents)}</span>
                </div>
                <p className="text-xs text-gray-400 mt-1 dark:text-gray-500">
                  Collect via {PAYMENT_OPTIONS.find(o => o.value === paymentMethod)?.label?.toLowerCase()}.
                  Print the contract from the booking detail page after confirming.
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => setStep(1)}
                className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition dark:hover:bg-gray-700 dark:bg-gray-900/40 dark:text-gray-300 dark:border-gray-600"
              >
                ← Edit
              </button>
              <button
                onClick={() => openPrintPreview(true)}
                className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition dark:hover:bg-gray-700 dark:bg-gray-900/40 dark:text-gray-300 dark:border-gray-600"
                title="Preview draft contract"
              >
                🖨 Preview Draft
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
              >
                {submitting ? "Creating…" : "✓ Confirm Booking"}
              </button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
