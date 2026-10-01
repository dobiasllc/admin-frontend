/**
 * AdminInspection.jsx — Pre-trip (check-in) / post-trip (check-out) vehicle
 * inspection form. Shared by both routes since the fields and submit flow
 * are identical, only the target endpoint/status transition differs.
 *
 * Routes:
 *   /bookings/:id/check-in   → POST /admin/bookings/:id/check-in  (status: confirmed → active)
 *   /bookings/:id/check-out  → POST /admin/bookings/:id/check-out (status: active → completed)
 */
import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useApi } from "../context/AuthContext";
import AdminLayout from "../components/AdminNav";

const CONDITION_OPTIONS = [
  { value: "good",          label: "Good — no issues" },
  { value: "minor_damage",  label: "Minor damage / wear" },
  { value: "damage_noted",  label: "Damage noted (see notes)" },
];

function formatCents(c) {
  return `$${((c || 0) / 100).toFixed(2)}`;
}

export default function AdminInspection({ mode }) {
  // mode: "check-in" | "check-out" — passed explicitly by the two thin route
  // wrappers below so this file works even if it's ever loaded standalone.
  const { id } = useParams();
  const navigate = useNavigate();
  const api = useApi();
  const isCheckOut = mode === "check-out";

  const [booking, setBooking] = useState(null);
  const [vehicleName, setVehicleName] = useState("");
  const [loading, setLoading] = useState(true);
  const [verification, setVerification] = useState(null);
  const [ackExpiredDocs, setAckExpiredDocs] = useState(false);

  const [mileage, setMileage] = useState("");
  const [fuelBatteryPct, setFuelBatteryPct] = useState("");
  const [tireFL, setTireFL] = useState("");
  const [tireFR, setTireFR] = useState("");
  const [tireRL, setTireRL] = useState("");
  const [tireRR, setTireRR] = useState("");
  const [exteriorCondition, setExteriorCondition] = useState("good");
  const [interiorCondition, setInteriorCondition] = useState("good");
  const [damageNotes, setDamageNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get(`/admin/bookings/${id}`)
      .then(async r => {
        setBooking(r.data);
        if (r.data?.vin) {
          try {
            const v = await api.get(`/admin/vehicles/${r.data.vin}`);
            setVehicleName(`${v.data.year} ${v.data.make} ${v.data.model}`.trim());
          } catch { /* non-fatal */ }
        }
        // Re-check DL/insurance right now, at handoff time — the booking-time
        // check happened whenever it was originally booked, which could be
        // weeks before pickup, so documents may have expired since.
        if (!isCheckOut && r.data?.userId) {
          try {
            const v = await api.get(`/admin/users/${r.data.userId}/verification`);
            setVerification(v.data);
          } catch { /* non-fatal — Turo/legacy bookings may have no linked user */ }
        }
      })
      .catch(() => setError("Could not load booking."))
      .finally(() => setLoading(false));
  }, [id]);

  const hasExpiredDocs = !!(verification && (verification.dlExpired || verification.insuranceExpired));

  const canSubmit = mileage !== "" && fuelBatteryPct !== "" && !submitting && (!hasExpiredDocs || ackExpiredDocs);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true); setError("");
    try {
      const body = {
        mileage: Number(mileage),
        fuel_or_battery_pct: Number(fuelBatteryPct),
        tire_pressures: { fl: tireFL, fr: tireFR, rl: tireRL, rr: tireRR },
        exterior_condition: exteriorCondition,
        interior_condition: interiorCondition,
        damage_notes: damageNotes,
      };
      await api.post(`/admin/bookings/${id}/${mode}`, body);
      navigate(`/bookings/${id}`);
    } catch (err) {
      setError(err.response?.data?.error || err.message || `Failed to complete ${mode}.`);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      </AdminLayout>
    );
  }

  if (!booking) {
    return (
      <AdminLayout>
        <div className="p-6 text-red-600">Booking not found.</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <div>
          <Link to={`/bookings/${id}`} className="text-sm text-blue-600 hover:underline">← Back to booking</Link>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mt-2">
            {isCheckOut ? "Check Out" : "Check In"} — {vehicleName || booking.vin}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {booking.startTime ? new Date(booking.startTime).toLocaleString() : ""} → {booking.endTime ? new Date(booking.endTime).toLocaleString() : ""}
            {" · "}{formatCents(booking.totalAmountCents)}
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 dark:bg-red-900/20">{error}</div>
        )}

        {/* Insurance requires DL + insurance on file to be valid before handoff — re-checked
            live here since the original booking-time check could have been weeks ago. */}
        {!isCheckOut && verification && (
          <div className={`rounded-xl border p-4 ${hasExpiredDocs ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"}`}>
            <h2 className={`text-sm font-semibold uppercase tracking-wide mb-2 ${hasExpiredDocs ? "text-red-700" : "text-green-700"}`}>
              {hasExpiredDocs ? "⚠ Document Check Failed" : "✓ Driver Documents Verified"}
            </h2>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-gray-500">Driver's License</dt>
                <dd className={verification.dlExpired ? "text-red-700 font-semibold" : "text-gray-800"}>
                  {verification.dlExpiryDate ? `Expires ${verification.dlExpiryDate}` : "No expiry on file"}
                  {verification.dlExpired ? " — EXPIRED" : ""}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Insurance</dt>
                <dd className={verification.insuranceExpired ? "text-red-700 font-semibold" : "text-gray-800"}>
                  {verification.insuranceExpiryDate ? `Expires ${verification.insuranceExpiryDate}` : "No expiry on file"}
                  {verification.insuranceExpired ? " — EXPIRED" : ""}
                </dd>
              </div>
            </dl>
            {hasExpiredDocs && (
              <label className="flex items-start gap-2 mt-3 text-sm text-red-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={ackExpiredDocs}
                  onChange={e => setAckExpiredDocs(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-red-400"
                />
                Your insurance requires valid DL/insurance before handoff. I've verified updated documents in person (or accept responsibility) and confirm this renter can receive the vehicle.
              </label>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5 dark:bg-gray-800 dark:border-gray-700">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Odometer (mi) *</label>
              <input
                type="number" min="0" required
                value={mileage} onChange={e => setMileage(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm dark:bg-gray-900 dark:border-gray-600 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {booking.vin ? "Battery / Fuel (%)" : "Fuel (%)"} *
              </label>
              <input
                type="number" min="0" max="100" required
                value={fuelBatteryPct} onChange={e => setFuelBatteryPct(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm dark:bg-gray-900 dark:border-gray-600 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tire Pressures (PSI, optional)</label>
            <div className="grid grid-cols-4 gap-2">
              <input placeholder="FL" value={tireFL} onChange={e => setTireFL(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm dark:bg-gray-900 dark:border-gray-600 dark:text-white" />
              <input placeholder="FR" value={tireFR} onChange={e => setTireFR(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm dark:bg-gray-900 dark:border-gray-600 dark:text-white" />
              <input placeholder="RL" value={tireRL} onChange={e => setTireRL(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm dark:bg-gray-900 dark:border-gray-600 dark:text-white" />
              <input placeholder="RR" value={tireRR} onChange={e => setTireRR(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm dark:bg-gray-900 dark:border-gray-600 dark:text-white" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Exterior Condition</label>
              <select value={exteriorCondition} onChange={e => setExteriorCondition(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm dark:bg-gray-900 dark:border-gray-600 dark:text-white">
                {CONDITION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Interior Condition</label>
              <select value={interiorCondition} onChange={e => setInteriorCondition(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm dark:bg-gray-900 dark:border-gray-600 dark:text-white">
                {CONDITION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Damage Notes (optional)</label>
            <textarea
              rows={3} value={damageNotes} onChange={e => setDamageNotes(e.target.value)}
              placeholder="Describe any scratches, dents, stains, etc."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm dark:bg-gray-900 dark:border-gray-600 dark:text-white"
            />
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-40 transition"
          >
            {submitting ? "Saving…" : isCheckOut ? "Complete Check-Out" : "Complete Check-In"}
          </button>
        </form>
      </div>
    </AdminLayout>
  );
}
