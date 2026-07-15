import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useApi } from "../context/AuthContext";
import AdminLayout from "../components/AdminNav";

// ── Status badge colours ───────────────────────────────────────────────────
const STATUS_STYLES = {
  // Legacy statuses
  pending:             "bg-yellow-100 text-yellow-800",
  invited:             "bg-blue-100 text-blue-800",
  scheduled:           "bg-indigo-100 text-indigo-800",
  created:             "bg-indigo-100 text-indigo-800",
  active:              "bg-green-100 text-green-800",
  revoked:             "bg-red-100 text-red-800",
  failed:              "bg-red-200 text-red-900",
  error:               "bg-red-200 text-red-900",
  not_applicable:      "bg-gray-100 text-gray-500 dark:text-gray-400",
  // New Guest Mode statuses
  page_ready:          "bg-blue-100 text-blue-800",
  guest_mode_active:   "bg-green-100 text-green-800",
  guest_mode_disabled: "bg-gray-100 text-gray-600 dark:text-gray-300",
};

const STATUS_LABELS = {
  pending:             "Scheduled",
  invited:             "Invited",
  scheduled:           "Scheduled",
  created:             "Created",
  active:              "Active",
  revoked:             "Revoked",
  failed:              "Failed",
  error:               "Error",
  not_applicable:      "N/A",
  page_ready:          "Portal Ready",
  guest_mode_active:   "Guest Mode Active ✓",
  guest_mode_disabled: "Access Ended",
};

function StatusBadge({ status }) {
  const cls = STATUS_STYLES[status] || "bg-gray-100 text-gray-600 dark:text-gray-300";
  const label = STATUS_LABELS[status] || status || "—";
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

// ── Confirm modal ──────────────────────────────────────────────────────────
function ConfirmModal({ title, message, onConfirm, onCancel, busy }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4 dark:bg-gray-800">
        <h3 className="text-lg font-semibold text-gray-900 mb-2 dark:text-gray-100">{title}</h3>
        <p className="text-sm text-gray-600 mb-6 dark:text-gray-300">{message}</p>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel} disabled={busy}
            className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:hover:bg-gray-700 dark:bg-gray-900/40 dark:text-gray-300 dark:border-gray-600">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={busy}
            className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
            {busy ? "Working…" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Reschedule modal (trip-based bookings — uses relative offsets) ──────────
function RescheduleModal({ booking, onClose, onSuccess, api }) {
  const [activateOffset, setActivateOffset] = useState(
    booking.guestKeyActivateOffsetMinutes ?? 30
  );
  const [revokeOffset, setRevokeOffset] = useState(
    booking.guestKeyRevokeOffsetMinutes ?? 60
  );
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await api.put(`/admin/guest-keys/${booking.bookingId}/reschedule`, {
        activate_offset_minutes: Number(activateOffset),
        revoke_offset_minutes:   Number(revokeOffset),
      });
      onSuccess(res.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full mx-4 dark:bg-gray-800">
        <h3 className="text-lg font-semibold text-gray-900 mb-1 dark:text-gray-100">Reschedule Guest Key</h3>
        <p className="text-sm text-gray-500 mb-4 dark:text-gray-400">
          Booking <span className="font-mono">{booking.bookingId}</span> ·{" "}
          {booking.guestName || booking.turoGuestName || "Guest"}
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 dark:bg-red-900/20">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">
              Activate key (minutes <em>before</em> trip start)
            </label>
            <input type="number" min={0} max={1440} value={activateOffset}
              onChange={e => setActivateOffset(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600" />
            <p className="text-xs text-gray-400 mt-1 dark:text-gray-500">Default: 30 min before trip start</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">
              Revoke key (minutes <em>after</em> trip end)
            </label>
            <input type="number" min={0} max={1440} value={revokeOffset}
              onChange={e => setRevokeOffset(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600" />
            <p className="text-xs text-gray-400 mt-1 dark:text-gray-500">Default: 60 min after trip end</p>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={onClose} disabled={busy}
              className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:hover:bg-gray-700 dark:bg-gray-900/40 dark:text-gray-300 dark:border-gray-600">
              Cancel
            </button>
            <button type="submit" disabled={busy}
              className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
              {busy ? "Working…" : "Reschedule"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Edit Times modal (ad-hoc keys — uses absolute datetimes) ────────────────
function EditTimesModal({ booking, onClose, onSuccess, api }) {
  // Pre-populate with existing times, converting ISO → datetime-local format
  const toLocal = (iso) => {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      // datetime-local expects "YYYY-MM-DDTHH:MM"
      const pad = n => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch { return ""; }
  };

  const [startTime, setStartTime] = useState(toLocal(booking.startTime));
  const [endTime,   setEndTime]   = useState(toLocal(booking.endTime));
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (!startTime) { setError("Start time is required"); return; }
    if (!endTime)   { setError("End time is required"); return; }
    if (new Date(endTime) <= new Date(startTime)) {
      setError("End time must be after start time"); return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await api.put(`/admin/guest-keys/${booking.bookingId}/reschedule`, {
        start_time: new Date(startTime).toISOString(),
        end_time:   new Date(endTime).toISOString(),
        activate_offset_minutes: 0,
        revoke_offset_minutes:   0,
      });
      onSuccess(res.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full mx-4 dark:bg-gray-800">
        <h3 className="text-lg font-semibold text-gray-900 mb-1 dark:text-gray-100">Edit Access Times</h3>
        <p className="text-sm text-gray-500 mb-1 dark:text-gray-400">
          Ad-hoc key · <span className="font-mono">{booking.bookingId}</span>
        </p>
        {booking.label && (
          <p className="text-xs text-gray-400 mb-4 dark:text-gray-500">{booking.label}</p>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 dark:bg-red-900/20">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">
                Access Start <span className="text-red-500">*</span>
              </label>
              <input type="datetime-local" required
                value={startTime} onChange={e => setStartTime(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">
                Access End <span className="text-red-500">*</span>
              </label>
              <input type="datetime-local" required
                value={endTime} onChange={e => setEndTime(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600" />
            </div>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Times are in your local timezone. The key will be rescheduled to activate and revoke at these exact times.
          </p>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={onClose} disabled={busy}
              className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:hover:bg-gray-700 dark:bg-gray-900/40 dark:text-gray-300 dark:border-gray-600">
              Cancel
            </button>
            <button type="submit" disabled={busy}
              className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
              {busy ? "Saving…" : "Update Times"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Ad-hoc create modal (vehicle selector + absolute datetimes) ────────────
function ManualCreateModal({ onClose, onSuccess, api }) {
  const [vehicles,       setVehicles]       = useState([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(true);
  const [vin,            setVin]            = useState("");
  const [guestName,      setGuestName]      = useState("");
  const [guestEmail,     setGuestEmail]     = useState("");
  const [label,          setLabel]          = useState("");
  const [startTime,      setStartTime]      = useState("");
  const [endTime,        setEndTime]        = useState("");
  const [activateOffset, setActivateOffset] = useState(0);
  const [revokeOffset,   setRevokeOffset]   = useState(0);
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState("");

  // Load Tesla-enabled vehicles for the dropdown
  useEffect(() => {
    api.get("/admin/vehicles")
      .then(res => {
        const teslaVehicles = (res.data || []).filter(v => v.teslaEnabled);
        setVehicles(teslaVehicles);
        if (teslaVehicles.length === 1) setVin(teslaVehicles[0].vin);
      })
      .catch(() => {})
      .finally(() => setVehiclesLoading(false));
  }, [api]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!vin) { setError("Please select a vehicle"); return; }
    if (!startTime) { setError("Start time is required"); return; }
    if (!endTime)   { setError("End time is required"); return; }
    if (new Date(endTime) <= new Date(startTime)) {
      setError("End time must be after start time"); return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await api.post("/admin/guest-keys/ad-hoc", {
        vin,
        guest_name:              guestName || undefined,
        guest_email:             guestEmail || undefined,
        label:                   label || undefined,
        start_time:              new Date(startTime).toISOString(),
        end_time:                new Date(endTime).toISOString(),
        activate_offset_minutes: Number(activateOffset),
        revoke_offset_minutes:   Number(revokeOffset),
      });
      onSuccess(res.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto dark:bg-gray-800">
        <h3 className="text-lg font-semibold text-gray-900 mb-1 dark:text-gray-100">Create Ad-hoc Guest Key</h3>
        <p className="text-sm text-gray-500 mb-4 dark:text-gray-400">
          Create a Tesla key invite for any purpose — maintenance, one-off access, etc. Not tied to a booking.
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 dark:bg-red-900/20">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Vehicle selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Vehicle <span className="text-red-500">*</span></label>
            {vehiclesLoading ? (
              <div className="text-sm text-gray-400 dark:text-gray-500">Loading vehicles…</div>
            ) : vehicles.length === 0 ? (
              <div className="text-sm text-red-600">No Tesla-enabled vehicles found</div>
            ) : (
              <select value={vin} onChange={e => setVin(e.target.value)} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600">
                <option value="">Select a vehicle…</option>
                {vehicles.map(v => (
                  <option key={v.vin} value={v.vin}>
                    {v.year} {v.make} {v.model} — {v.licensePlate} ({v.vin})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Label */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Purpose / Label</label>
            <input type="text" placeholder="e.g. Maintenance — Oil Change, Detailing, etc."
              value={label} onChange={e => setLabel(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600" />
          </div>

          {/* Guest info */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Guest Name</label>
              <input type="text" placeholder="Optional"
                value={guestName} onChange={e => setGuestName(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Guest Email</label>
              <input type="email" placeholder="Optional"
                value={guestEmail} onChange={e => setGuestEmail(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600" />
            </div>
          </div>

          {/* Access window */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">
                Access Start <span className="text-red-500">*</span>
              </label>
              <input type="datetime-local" required
                value={startTime} onChange={e => setStartTime(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">
                Access End <span className="text-red-500">*</span>
              </label>
              <input type="datetime-local" required
                value={endTime} onChange={e => setEndTime(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600" />
            </div>
          </div>

          {/* Optional offsets */}
          <details className="text-sm">
            <summary className="cursor-pointer text-gray-500 hover:text-gray-700 select-none dark:hover:text-gray-200 dark:text-gray-300 dark:text-gray-400">
              Advanced: email timing offsets (optional)
            </summary>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">
                  Send email X min before start
                </label>
                <input type="number" min={0} max={1440} value={activateOffset}
                  onChange={e => setActivateOffset(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600" />
                <p className="text-xs text-gray-400 mt-1 dark:text-gray-500">0 = send immediately on create</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">
                  Revoke X min after end
                </label>
                <input type="number" min={0} max={1440} value={revokeOffset}
                  onChange={e => setRevokeOffset(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600" />
                <p className="text-xs text-gray-400 mt-1 dark:text-gray-500">0 = revoke exactly at end time</p>
              </div>
            </div>
          </details>

          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={onClose} disabled={busy}
              className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:hover:bg-gray-700 dark:bg-gray-900/40 dark:text-gray-300 dark:border-gray-600">
              Cancel
            </button>
            <button type="submit" disabled={busy || vehiclesLoading || vehicles.length === 0}
              className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
              {busy ? "Creating…" : "Create Key"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Row action button ──────────────────────────────────────────────────────
// Buckets a guest key record into 'current' | 'upcoming' | 'past' using
// date-only comparisons (mirrors AdminBookings.jsx getBookingBucket()).
function getKeyBucket(k) {
  const { startTime, endTime } = k;
  if (!startTime) return "past";

  const todayStr = new Date().toISOString().slice(0, 10);
  const startStr = startTime.slice(0, 10);
  const endStr   = (endTime || startTime).slice(0, 10);

  if (startStr <= todayStr && todayStr <= endStr) return "current";
  if (startStr > todayStr) return "upcoming";
  return "past";
}

function ActionButton({ label, onClick, variant = "default", disabled }) {

  const base = "px-3 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-40";
  const variants = {
    default: "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:text-gray-300",
    blue:    "bg-blue-600 text-white hover:bg-blue-700",
    green:   "bg-green-600 text-white hover:bg-green-700",
    red:     "bg-red-600 text-white hover:bg-red-700",
    yellow:  "bg-yellow-500 text-white hover:bg-yellow-600",
  };
  return (
    <button onClick={onClick} disabled={disabled}
      className={`${base} ${variants[variant] || variants.default}`}>
      {label}
    </button>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function AdminGuestKeys() {
  const api      = useApi();
  const navigate = useNavigate();

  const [keys,          setKeys]          = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState("");
  const [actionLoading, setActionLoading] = useState(null); // bookingId of in-flight action

  // Filters
  const [statusFilter,     setStatusFilter]     = useState("");
  const [sourceFilter,     setSourceFilter]     = useState("");
  const [search,           setSearch]           = useState("");
  // Hide completed records older than 30 days by default to reduce clutter
  const [hideOldCompleted, setHideOldCompleted] = useState(true);

  // Modals
  const [confirmModal,     setConfirmModal]     = useState(null); // { booking, action, label }
  const [rescheduleModal,  setRescheduleModal]  = useState(null); // booking (trip-based)
  const [editTimesModal,   setEditTimesModal]   = useState(null); // booking (ad-hoc)
  const [manualCreateOpen, setManualCreateOpen] = useState(false);

  const [toast, setToast] = useState(null);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchKeys = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (sourceFilter) params.set("source", sourceFilter);
      const res = await api.get(`/admin/guest-keys?${params}`);
      setKeys(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Failed to load guest keys");
    } finally {
      setLoading(false);
    }
  }, [api, statusFilter, sourceFilter]);

  useEffect(() => { fetchKeys(); }, [fetchKeys]);

  // ── Inline action (send / revoke) ─────────────────────────────────────────
  async function runAction(booking, action) {
    if (action === "remove") {
      return handleRemove(booking);
    }
    setActionLoading(booking.bookingId);
    try {
      const endpoint = action === "revoke"
        ? `/admin/guest-keys/${booking.bookingId}/revoke`
        : action === "create"
        ? `/admin/guest-keys/${booking.bookingId}/create`
        : `/admin/guest-keys/${booking.bookingId}/send`;
      await api.post(endpoint);
      showToast(`${action} succeeded for booking ${booking.bookingId}`);
      fetchKeys();
    } catch (err) {
      showToast(err.response?.data?.error || err.message || "Action failed", "error");
    } finally {
      setActionLoading(null);
      setConfirmModal(null);
    }
  }

  // ── Delete/Remove handler ─────────────────────────────────────────────────
  async function handleRemove(booking) {
    setActionLoading(booking.bookingId);
    try {
      await api.delete(`/admin/guest-keys/${booking.bookingId}/remove`);
      showToast(
        booking.source === "adhoc"
          ? `Ad-hoc record ${booking.bookingId} deleted`
          : `Guest key data cleared from booking ${booking.bookingId}`
      );
      fetchKeys();
    } catch (err) {
      showToast(err.response?.data?.error || err.message || "Delete failed", "error");
    } finally {
      setActionLoading(null);
      setConfirmModal(null);
    }
  }

  // ── Modal success callbacks ───────────────────────────────────────────────
  function handleRescheduleSuccess(data) {
    showToast(`Rescheduled booking ${data?.booking_id || "—"}`);
    setRescheduleModal(null);
    fetchKeys();
  }

  function handleEditTimesSuccess(data) {
    showToast(`Access times updated for ${data?.booking_id || "—"}`);
    setEditTimesModal(null);
    fetchKeys();
  }

  function handleManualCreateSuccess(data) {
    showToast(`Guest key created for booking ${data?.booking_id || "—"}`);
    setManualCreateOpen(false);
    fetchKeys();
  }

  // ── View tabs: All | Active | Upcoming | History ─────────────────────────
  const [view, setView] = useState("all"); // all | current | upcoming | past

  // ── Filtered list ─────────────────────────────────────────────────────────
  const COMPLETED_STATUSES = ["guest_mode_disabled", "revoked", "not_applicable"];
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

  const filtered = keys.filter(k => {
    // Hide old completed records by default (end time > 30 days ago)
    if (hideOldCompleted && COMPLETED_STATUSES.includes(k.guestKeyStatus || k.status)) {
      const endTime = k.endTime || k.guestKeyRevokeAt || "";
      if (endTime) {
        try {
          const endDate = new Date(endTime);
          if (Date.now() - endDate.getTime() > THIRTY_DAYS_MS) return false;
        } catch { /* ignore parse errors */ }
      }
    }
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (k.bookingId || "").toLowerCase().includes(q) ||
      (k.guestName || k.turoGuestName || "").toLowerCase().includes(q) ||
      (k.vin || "").toLowerCase().includes(q) ||
      (k.vehicleName || "").toLowerCase().includes(q) ||
      (k.guestEmail || "").toLowerCase().includes(q)
    );
  });

  // Bucket the filtered list into current / upcoming / past (mirrors AdminBookings.jsx)
  const { current, upcoming, past } = useMemo(() => {
    const current  = filtered.filter(k => getKeyBucket(k) === "current");
    const upcoming = filtered.filter(k => getKeyBucket(k) === "upcoming");
    const past     = filtered.filter(k => getKeyBucket(k) === "past");
    return { current, upcoming, past };
  }, [filtered]);

  const showCurrent  = view === "all" || view === "current";
  const showUpcoming = view === "all" || view === "upcoming";
  const showPast     = view === "all" || view === "past";

  // ── Shared row renderer & table header (used across the 3 sections) ──────
  const tableHeader = (
    <thead className="bg-gray-50 dark:bg-gray-900/40">
      <tr>
        {["Booking", "Guest", "Vehicle", "Trip Dates", "Source", "Key Status", "Portal Link", "Actions"].map(h => (
          <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
            {h}
          </th>
        ))}
      </tr>
    </thead>
  );

  const renderRow = (k) => {
    const isLoading  = actionLoading === k.bookingId;
    const guestName  = k.guestName || k.turoGuestName || "—";
    const guestEmail = k.guestEmail || k.turoGuestEmail || "";
    const startDate  = k.startTime
      ? new Date(k.startTime).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : "—";
    const endDate = k.endTime
      ? new Date(k.endTime).toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : "—";

    return (
      <tr key={k.bookingId} className="hover:bg-gray-50 transition-colors dark:hover:bg-gray-700 dark:bg-gray-900/40">
        {/* Booking */}
        <td className="px-4 py-3">
          <button
            onClick={() => navigate(`/bookings/${k.bookingId}`)}
            className="text-blue-600 hover:underline font-mono text-xs"
          >
            {k.bookingId?.slice(0, 14)}…
          </button>
        </td>

        {/* Guest */}
        <td className="px-4 py-3">
          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{guestName}</div>
          {guestEmail && (
            <div className="text-xs text-gray-400 truncate max-w-[160px] dark:text-gray-500">{guestEmail}</div>
          )}
        </td>

        {/* Vehicle */}
        <td className="px-4 py-3">
          <div className="text-sm text-gray-900 dark:text-gray-100">{k.vehicleName || k.vin || "—"}</div>
          {k.vin && <div className="text-xs text-gray-400 font-mono dark:text-gray-500">{k.vin}</div>}
        </td>

        {/* Trip Dates */}
        <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap dark:text-gray-300">
          {startDate} → {endDate}
        </td>

        {/* Source */}
        <td className="px-4 py-3">
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
            k.source === "turo"
              ? "bg-teal-100 text-teal-800"
              : "bg-purple-100 text-purple-800"
          }`}>
            {k.source || "private"}
          </span>
        </td>

        {/* Key Status */}
        <td className="px-4 py-3">
          <StatusBadge status={k.guestKeyStatus} />
          {k.guestKeyCreatedAt && (
            <div className="text-xs text-gray-400 mt-0.5 dark:text-gray-500">
              Created {new Date(k.guestKeyCreatedAt).toLocaleDateString()}
            </div>
          )}
        </td>

        {/* Portal Link */}
        <td className="px-4 py-3">
          {k.guestAccessUrl || k.guestKeyLink || k.guestKeyInviteUrl ? (
            <a
              href={k.guestAccessUrl || k.guestKeyLink || k.guestKeyInviteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              Open Portal ↗
            </a>
          ) : (
            <span className="text-xs text-gray-400 dark:text-gray-500">—</span>
          )}
        </td>

        {/* Actions */}
        <td className="px-4 py-3">
          <div className="flex flex-wrap gap-1.5">
            {/* Create — only for non-adhoc keys with no key yet or failed */}
            {(!k.guestKeyStatus || ["failed", "error"].includes(k.guestKeyStatus)) && k.source !== "adhoc" && (
              <ActionButton label="Create" variant="blue" disabled={isLoading}
                onClick={() => setConfirmModal({ booking: k, action: "create", label: "Create" })} />
            )}

            {/* Send email — if key exists but not yet active */}
            {["invited", "scheduled", "pending", "created"].includes(k.guestKeyStatus) && (
              <ActionButton label="Send Email" variant="green" disabled={isLoading}
                onClick={() => setConfirmModal({ booking: k, action: "send", label: "Send" })} />
            )}

            {/* Reschedule (trip-based) or Edit Times (ad-hoc) */}
            {k.guestKeyStatus && !["revoked", "not_applicable"].includes(k.guestKeyStatus) && (
              k.source === "adhoc"
                ? <ActionButton label="Edit Times" variant="yellow" disabled={isLoading}
                    onClick={() => setEditTimesModal(k)} />
                : <ActionButton label="Reschedule" variant="yellow" disabled={isLoading}
                    onClick={() => setRescheduleModal(k)} />
            )}

            {/* Revoke — if active/invited/scheduled */}
            {["active", "invited", "scheduled", "pending", "created"].includes(k.guestKeyStatus) && (
              <ActionButton label="Revoke" variant="red" disabled={isLoading}
                onClick={() => setConfirmModal({ booking: k, action: "revoke", label: "Revoke" })} />
            )}

            {/* Delete/Remove — always available */}
            <ActionButton
              label={k.source === "adhoc" ? "Delete" : "Remove Key"}
              variant="default"
              disabled={isLoading}
              onClick={() => setConfirmModal({ booking: k, action: "remove", label: k.source === "adhoc" ? "Delete" : "Remove Key" })}
            />

            {isLoading && (
              <span className="text-xs text-gray-400 animate-pulse dark:text-gray-500">Working…</span>
            )}
          </div>
        </td>
      </tr>
    );
  };


  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <AdminLayout>

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
          toast.type === "error" ? "bg-red-600 text-white" : "bg-green-600 text-white"
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Confirm modal */}
      {confirmModal && (
        <ConfirmModal
          title={`${confirmModal.label}${confirmModal.action === "remove" ? "" : " Guest Key"}`}
          message={
            confirmModal.action === "remove"
              ? confirmModal.booking.source === "adhoc"
                ? `This will permanently delete the ad-hoc record "${confirmModal.booking.label || confirmModal.booking.bookingId}" and cancel all scheduled actions. The Tesla invite will NOT be revoked — use Revoke first if needed.`
                : `This will clear all guest key data from booking ${confirmModal.booking.bookingId} and cancel scheduled actions. The booking itself will be preserved. The Tesla invite will NOT be revoked — use Revoke first if needed.`
              : `Are you sure you want to ${confirmModal.action} the guest key for booking ${confirmModal.booking.bookingId}?`
          }
          busy={actionLoading === confirmModal.booking.bookingId}
          onConfirm={() => runAction(confirmModal.booking, confirmModal.action)}
          onCancel={() => setConfirmModal(null)}
        />
      )}

      {/* Reschedule modal (trip-based) */}
      {rescheduleModal && (
        <RescheduleModal
          booking={rescheduleModal}
          api={api}
          onClose={() => setRescheduleModal(null)}
          onSuccess={handleRescheduleSuccess}
        />
      )}

      {/* Edit Times modal (ad-hoc) */}
      {editTimesModal && (
        <EditTimesModal
          booking={editTimesModal}
          api={api}
          onClose={() => setEditTimesModal(null)}
          onSuccess={handleEditTimesSuccess}
        />
      )}

      {/* Manual create modal */}
      {manualCreateOpen && (
        <ManualCreateModal
          api={api}
          onClose={() => setManualCreateOpen(false)}
          onSuccess={handleManualCreateSuccess}
        />
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Tesla Guest Keys</h1>
            <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
              Manage Tesla digital key invitations for all bookings
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setManualCreateOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create Key
            </button>
            <button
              onClick={fetchKeys}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 shadow-sm dark:hover:bg-gray-700 dark:bg-gray-800 dark:bg-gray-900/40 dark:text-gray-300 dark:border-gray-600"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-6 dark:bg-gray-800 dark:border-gray-700">
          <div className="flex flex-wrap gap-3">
            <input
              type="text"
              placeholder="Search booking ID, guest, VIN…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 min-w-48 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600"
            />
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600">
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="created">Created</option>
              <option value="invited">Invited</option>
              <option value="scheduled">Scheduled</option>
              <option value="active">Active</option>
              <option value="revoked">Revoked</option>
              <option value="failed">Failed</option>
            </select>
            <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600">
              <option value="">All sources</option>
              <option value="private">Private</option>
              <option value="turo">Turo</option>
            </select>
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none ml-auto dark:text-gray-300">
              <input
                type="checkbox"
                checked={hideOldCompleted}
                onChange={e => setHideOldCompleted(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 dark:border-gray-600"
              />
              Hide completed &gt;30 days old
            </label>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 dark:bg-red-900/20">{error}</div>
        )}

        {/* ── View tabs: All | Active | Upcoming | History ── */}
        {!loading && filtered.length > 0 && (
          <div className="flex items-center gap-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-2 py-2 w-fit mb-4">
            {[
              { key: "all",      label: "All",      count: filtered.length },
              { key: "current",  label: "Active",   count: current.length },
              { key: "upcoming", label: "Upcoming", count: upcoming.length },
              { key: "past",     label: "History",  count: past.length },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setView(tab.key)}
                className={`text-sm font-medium px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
                  view === tab.key
                    ? "bg-blue-600 text-white"
                    : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                }`}
              >
                {tab.label}
                <span className={`ml-1.5 text-xs ${view === tab.key ? "text-blue-100" : "text-gray-400 dark:text-gray-500"}`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Table(s) */}
        {loading ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden dark:bg-gray-800 dark:border-gray-700">
            <div className="flex items-center justify-center py-16 text-gray-400 dark:text-gray-500">
              <svg className="animate-spin w-6 h-6 mr-2" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Loading guest keys…
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden dark:bg-gray-800 dark:border-gray-700">
            <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500">
              <svg className="w-12 h-12 mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
              <p className="text-sm">No guest keys found</p>
              <p className="text-xs mt-1">Keys are created automatically when bookings are confirmed</p>
              <button
                onClick={() => setManualCreateOpen(true)}
                className="mt-4 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
              >
                + Create Key Manually
              </button>
            </div>
          </div>
        ) : (view === "current" && current.length === 0) ||
           (view === "upcoming" && upcoming.length === 0) ||
           (view === "past" && past.length === 0) ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden dark:bg-gray-800 dark:border-gray-700">
            <p className="text-gray-400 dark:text-gray-500 text-sm text-center py-12">
              No {view === "current" ? "active" : view === "upcoming" ? "upcoming" : "history"} guest keys found.
            </p>
          </div>
        ) : (
          <div className="space-y-4">

            {/* ── Active section ── */}
            {showCurrent && current.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-green-300 dark:border-green-700/60 overflow-hidden shadow-sm">
                <div className="bg-green-50 dark:bg-green-900/20 border-b border-green-200 dark:border-green-800/40 px-4 py-2 flex items-center gap-2">
                  <span className="text-green-600 dark:text-green-400 text-sm">🔑</span>
                  <span className="text-xs font-semibold text-green-700 dark:text-green-300 uppercase tracking-wide">
                    Active
                  </span>
                  <span className="ml-auto text-xs text-green-600 dark:text-green-400 font-medium">
                    {current.length} key{current.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    {tableHeader}
                    <tbody className="bg-white divide-y divide-gray-100 dark:bg-gray-800 dark:divide-gray-700">
                      {current.map(renderRow)}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── Upcoming section ── */}
            {showUpcoming && upcoming.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-blue-200 dark:border-blue-800/50 overflow-hidden shadow-sm">
                <div className="bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800/40 px-4 py-2 flex items-center gap-2">
                  <span className="text-blue-600 dark:text-blue-400 text-sm">📅</span>
                  <span className="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wide">
                    Upcoming
                  </span>
                  <span className="ml-auto text-xs text-blue-500 dark:text-blue-400 font-medium">
                    {upcoming.length} key{upcoming.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    {tableHeader}
                    <tbody className="bg-white divide-y divide-gray-100 dark:bg-gray-800 dark:divide-gray-700">
                      {upcoming.map(renderRow)}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── History section ── */}
            {showPast && past.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden opacity-90">
                <div className="bg-gray-50 dark:bg-gray-900/40 border-b border-gray-200 dark:border-gray-700 px-4 py-2 flex items-center gap-2">
                  <span className="text-gray-400 text-sm">🕐</span>
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    History
                  </span>
                  <span className="ml-auto text-xs text-gray-400 font-medium">
                    {past.length} key{past.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    {tableHeader}
                    <tbody className="bg-white divide-y divide-gray-100 dark:bg-gray-800 dark:divide-gray-700">
                      {past.map(renderRow)}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          </div>
        )}

        {/* Summary footer */}
        {!loading && filtered.length > 0 && (
          <p className="text-xs text-gray-400 mt-3 text-right dark:text-gray-500">
            Showing {filtered.length} of {keys.length} guest key records
          </p>
        )}

      </div>
    </AdminLayout>
  );
}
