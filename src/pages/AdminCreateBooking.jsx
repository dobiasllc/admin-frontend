/**
 * AdminCreateBooking.jsx
 * Create an admin booking — no Stripe, no SignWell, no verification gate.
 * Route: /bookings/new
 *
 * Workflow:
 *   Step 1 — Fill in all details (vehicle, dates, guest info, additional driver,
 *             payment method, purpose/notes). Preview draft contract at any time.
 *   Step 2 — Review summary, then confirm.
 *   After confirmation — go to booking detail page to print the official contract,
 *             get it signed in person, then mark it as signed from the detail page.
 */
import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useApi } from "../context/AuthContext";
import AdminLayout from "../components/AdminNav";

// ── Helpers ───────────────────────────────────────────────────────────────────

function toLocalInput(d) {
  const pad = n => String(n).padStart(2, "0");
  return (
    d.getFullYear() + "-" +
    pad(d.getMonth() + 1) + "-" +
    pad(d.getDate()) + "T" +
    pad(d.getHours()) + ":" +
    pad(d.getMinutes())
  );
}

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
  const [startDate, setStart]       = useState("");
  const [endDate, setEnd]           = useState("");
  const [purpose, setPurpose]       = useState("");
  const [notes, setNotes]           = useState("");
  const [pickupLocation, setPickup] = useState("");
  const [paymentMethod, setPayment] = useState("bank_transfer");

  // Primary renter
  const [guestName,    setGuestName]    = useState("");
  const [guestPhone,   setGuestPhone]   = useState("");
  const [guestEmail,   setGuestEmail]   = useState("");
  const [guestAddress, setGuestAddress] = useState("");
  const [guestCity,    setGuestCity]    = useState("");
  const [guestDOB,     setGuestDOB]     = useState("");
  const [guestDLNum,   setGuestDLNum]   = useState("");
  const [guestDLState, setGuestDLState] = useState("");
  const [guestDLExp,   setGuestDLExp]   = useState("");

  // Additional driver
  const [addlName,    setAddlName]    = useState("");
  const [addlAddress, setAddlAddress] = useState("");
  const [addlDLNum,   setAddlDLNum]   = useState("");
  const [addlDLState, setAddlDLState] = useState("");
  const [addlDLExp,   setAddlDLExp]   = useState("");
  const [addlDOB,     setAddlDOB]     = useState("");

  // Availability check
  const [availChecking, setAvailChecking] = useState(false);
  const [availConflict, setAvailConflict] = useState(null); // null=unchecked, false=ok, string=conflict msg

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState("");

  // Check availability whenever vin/dates change
  useEffect(() => {
    if (!vin || !startDate || !endDate || startDate >= endDate) {
      setAvailConflict(null);
      return;
    }
    setAvailChecking(true);
    setAvailConflict(null);
    const params = new URLSearchParams({
      vin,
      start: toNaiveLocal(startDate),
      end:   toNaiveLocal(endDate),
    });
    api.get(`/vehicles/available?${params}`)
      .then(r => {
        // The endpoint returns either:
        //   { available: bool, conflict: {...} }  (single-VIN check)
        //   an array of available VIN strings     (multi-vehicle list)
        const data = r.data;
        let isAvailable;
        if (Array.isArray(data)) {
          // Array of available VINs — check if our VIN is in the list
          isAvailable = data.includes(vin);
        } else if (data && typeof data.available === 'boolean') {
          isAvailable = data.available;
        } else {
          // Unexpected shape — treat as available to avoid false blocks
          isAvailable = true;
        }

        if (!isAvailable) {
          const conflict = Array.isArray(data) ? null : data?.conflict;
          const msg = conflict
            ? `Conflict with booking ${(conflict.bookingId || '').slice(0,12)}… (${conflict.startTime?.slice(0,10)} → ${conflict.endTime?.slice(0,10)})`
            : "Vehicle is not available for these dates.";
          setAvailConflict(msg);
        } else {
          setAvailConflict(false);
        }
      })
      .catch(() => setAvailConflict(null)) // silently ignore check errors
      .finally(() => setAvailChecking(false));
  }, [vin, startDate, endDate]);

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

  // Default dates: next Friday → next Sunday
  useEffect(() => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const daysUntilFri = (5 - dayOfWeek + 7) % 7 || 7;
    const fri = new Date(now);
    fri.setDate(now.getDate() + daysUntilFri);
    fri.setHours(10, 0, 0, 0);
    const sun = new Date(fri);
    sun.setDate(fri.getDate() + 2);
    sun.setHours(10, 0, 0, 0);
    setStart(toLocalInput(fri));
    setEnd(toLocalInput(sun));
  }, []);

  const selectedVehicle = vehicles.find(v => v.vin === vin);
  const numDays         = calcDays(startDate, endDate);
  const dailyRate       = selectedVehicle?.dailyRateCents || 0;
  const totalCents      = dailyRate * numDays;

  const canReview = vin && startDate && endDate && startDate < endDate;

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
  const inp = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:border-gray-600";

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <AdminLayout>
      <div className="max-w-2xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="mb-6">
          <Link to="/bookings" className="text-sm text-blue-600 hover:underline">← Back to Bookings</Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-1 dark:text-gray-100">New Admin Booking</h1>
          <p className="text-sm text-gray-500 mt-0.5 dark:text-gray-400">
            Creates a confirmed booking directly — no Stripe charge, no e-signature required at creation.
            Print and sign the contract from the booking detail page after confirming.
          </p>
        </div>

        {/* Amber notice */}
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
          <span className="font-semibold">⚠ Admin Booking</span>
          {" — "}{getNoticeText(paymentMethod)}
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
                <select value={vin} onChange={e => setVin(e.target.value)} className={inp + " bg-white dark:bg-gray-800"}>
                  {vehicles.map(v => (
                    <option key={v.vin} value={v.vin}>
                      {v.year} {v.make} {v.model}
                      {v.status === "maintenance" ? " (maintenance)" : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Start Date & Time</label>
                <input type="datetime-local" value={startDate} onChange={e => setStart(e.target.value)} className={inp} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">End Date & Time</label>
                <input type="datetime-local" value={endDate} onChange={e => setEnd(e.target.value)} className={inp} />
              </div>
            </div>
            {startDate && endDate && startDate >= endDate && (
              <p className="text-xs text-red-600">End date must be after start date.</p>
            )}

            {/* Availability indicator */}
            {availChecking && (
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-500" />
                Checking availability…
              </div>
            )}
            {!availChecking && availConflict === false && vin && startDate && endDate && startDate < endDate && (
              <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 dark:bg-green-900/20">
                <span>✓</span> Vehicle is available for these dates.
              </div>
            )}
            {!availChecking && availConflict && (
              <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 dark:bg-red-900/20">
                <span>⚠</span> <span><strong>Booking conflict:</strong> {availConflict}</span>
              </div>
            )}

            {/* Primary Renter */}
            <div className="border-t border-gray-100 pt-4 dark:border-gray-700">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 dark:text-gray-500">
                Primary Renter
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Full Name</label>
                  <input type="text" value={guestName} onChange={e => setGuestName(e.target.value)} placeholder="Full name" className={inp} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Phone</label>
                  <input type="tel" value={guestPhone} onChange={e => setGuestPhone(e.target.value)} placeholder="(555) 555-5555" className={inp} />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Email</label>
                  <input type="email" value={guestEmail} onChange={e => setGuestEmail(e.target.value)} placeholder="renter@example.com" className={inp} />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Home Address</label>
                  <input type="text" value={guestAddress} onChange={e => setGuestAddress(e.target.value)} placeholder="123 Main St" className={inp} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">City / State / ZIP</label>
                  <input type="text" value={guestCity} onChange={e => setGuestCity(e.target.value)} placeholder="Milwaukee, WI 53201" className={inp} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Date of Birth</label>
                  <input type="date" value={guestDOB} onChange={e => setGuestDOB(e.target.value)} className={inp} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Driver's License #</label>
                  <input type="text" value={guestDLNum} onChange={e => setGuestDLNum(e.target.value)} placeholder="D123-4567-8901" className={inp} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">License State</label>
                  <input type="text" value={guestDLState} onChange={e => setGuestDLState(e.target.value)} placeholder="WI" maxLength={2} className={inp} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">License Expiration</label>
                  <input type="date" value={guestDLExp} onChange={e => setGuestDLExp(e.target.value)} className={inp} />
                </div>
              </div>
            </div>

            {/* Additional Driver */}
            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                Additional Authorized Driver
                <span className="font-normal normal-case ml-1">(optional)</span>
              </p>
              <p className="text-xs text-gray-400 mb-3">
                Only drivers listed here are authorized to operate the vehicle per the rental agreement.
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                  <input type="text" value={addlName} onChange={e => setAddlName(e.target.value)} placeholder="Full name" className={inp} />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Home Address</label>
                  <input type="text" value={addlAddress} onChange={e => setAddlAddress(e.target.value)} placeholder="123 Main St, City, ST 00000" className={inp} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Driver's License #</label>
                  <input type="text" value={addlDLNum} onChange={e => setAddlDLNum(e.target.value)} placeholder="D123-4567-8901" className={inp} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">License State</label>
                  <input type="text" value={addlDLState} onChange={e => setAddlDLState(e.target.value)} placeholder="WI" maxLength={2} className={inp} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">License Expiration</label>
                  <input type="date" value={addlDLExp} onChange={e => setAddlDLExp(e.target.value)} className={inp} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Date of Birth</label>
                  <input type="date" value={addlDOB} onChange={e => setAddlDOB(e.target.value)} className={inp} />
                </div>
              </div>
            </div>

            {/* Payment */}
            <div className="border-t border-gray-100 pt-4 dark:border-gray-700">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 dark:text-gray-500">Payment Method</p>
              <select value={paymentMethod} onChange={e => setPayment(e.target.value)} className={inp + " bg-white dark:bg-gray-800"}>
                {PAYMENT_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1.5 dark:text-gray-500">{getNoticeText(paymentMethod)}</p>
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
                <input type="text" value={pickupLocation} onChange={e => setPickup(e.target.value)} placeholder="e.g. Muskego, WI" className={inp} />
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
                {purpose && (
                  <div className="col-span-2">
                    <dt className="text-gray-400 dark:text-gray-500">Trip Purpose</dt>
                    <dd>{purpose}</dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Pricing */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 dark:bg-gray-800 dark:border-gray-700">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 dark:text-gray-400">Pricing (record only — no Stripe charge)</h2>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">{formatCents(dailyRate)} × {numDays} day{numDays !== 1 ? "s" : ""}</span>
                  <span>{formatCents(totalCents)}</span>
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
