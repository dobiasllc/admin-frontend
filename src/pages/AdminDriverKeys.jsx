import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useApi } from "../context/AuthContext";
import AdminLayout from "../components/AdminNav";

// ── Status badge ────────────────────────────────────────────────────────────
const STATUS_STYLES = {
  none:    "bg-gray-100 text-gray-500 dark:text-gray-400",
  active:  "bg-green-100 text-green-800",
  revoked: "bg-red-100 text-red-800",
  expired: "bg-yellow-100 text-yellow-800",
};

const STATUS_LABELS = {
  none:    "No key created yet",
  active:  "Key link active",
  revoked: "Revoked",
  expired: "Expired",
};

function StatusBadge({ status }) {
  const cls = STATUS_STYLES[status] || STATUS_STYLES.none;
  const label = STATUS_LABELS[status] || status || "—";
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

function isExpired(booking) {
  if (booking.driverInviteStatus !== "active") return false;
  if (!booking.driverInviteExpiresAt) return false;
  return new Date(booking.driverInviteExpiresAt).getTime() < Date.now();
}

function effectiveStatus(booking) {
  if (isExpired(booking)) return "expired";
  return booking.driverInviteStatus || "none";
}

// ── Confirm modal ──────────────────────────────────────────────────────────
function ConfirmModal({ title, message, onConfirm, onCancel, busy, confirmLabel = "Confirm", danger }) {
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
            className={`px-4 py-2 text-sm rounded-lg text-white disabled:opacity-50 ${danger ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"}`}>
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── "Create Key" modal — either attach to existing booking or make a new portal ──
function CreateKeyModal({ onClose, onSuccess, api }) {
  const [mode, setMode] = useState("existing"); // existing | new
  const [bookings, setBookings] = useState([]);
  const [bookingsLoading, setBookingsLoading] = useState(true);
  const [bookingId, setBookingId] = useState("");

  const [vehicles, setVehicles] = useState([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(true);
  const [vin, setVin] = useState("");
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/admin/bookings")
      .then(res => {
        const list = (Array.isArray(res.data) ? res.data : []).filter(
          b => !["canceled", "completed"].includes(b.status)
        );
        setBookings(list);
      })
      .catch(() => {})
      .finally(() => setBookingsLoading(false));

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
    setError("");

    if (mode === "existing") {
      if (!bookingId) { setError("Please select a booking"); return; }
    } else {
      if (!vin) { setError("Please select a vehicle"); return; }
      if (!startTime) { setError("Start time is required"); return; }
      if (!endTime) { setError("End time is required"); return; }
      if (new Date(endTime) <= new Date(startTime)) {
        setError("End time must be after start time"); return;
      }
    }

    setBusy(true);
    try {
      const payload = mode === "existing"
        ? { booking_id: bookingId }
        : {
            vin,
            guest_name:  guestName || undefined,
            guest_email: guestEmail || undefined,
            guest_phone: guestPhone || undefined,
            start_time:  new Date(startTime).toISOString(),
            end_time:    new Date(endTime).toISOString(),
          };
      const res = await api.post("/admin/driver-keys/enable", payload);
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
        <h3 className="text-lg font-semibold text-gray-900 mb-1 dark:text-gray-100">Create Guest Key</h3>
        <p className="text-sm text-gray-500 mb-4 dark:text-gray-400">
          Adds a "Create My Key" link to a guest's portal so they can add their Tesla account
          as a driver of the vehicle. The actual key invite link is generated when the guest
          clicks the button (or you can trigger it yourself below) — Tesla invite links expire
          quickly, so it's best generated close to when it's needed.
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 dark:bg-red-900/20">{error}</div>
        )}

        {/* Mode toggle */}
        <div className="flex gap-2 mb-4">
          <button type="button" onClick={() => setMode("existing")}
            className={`flex-1 px-3 py-2 text-sm rounded-lg font-medium border ${
              mode === "existing" ? "bg-blue-600 text-white border-blue-600" : "border-gray-300 text-gray-600 dark:border-gray-600 dark:text-gray-300"
            }`}>
            Existing booking
          </button>
          <button type="button" onClick={() => setMode("new")}
            className={`flex-1 px-3 py-2 text-sm rounded-lg font-medium border ${
              mode === "new" ? "bg-blue-600 text-white border-blue-600" : "border-gray-300 text-gray-600 dark:border-gray-600 dark:text-gray-300"
            }`}>
            New guest portal
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "existing" ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">
                Booking <span className="text-red-500">*</span>
              </label>
              {bookingsLoading ? (
                <div className="text-sm text-gray-400 dark:text-gray-500">Loading bookings…</div>
              ) : (
                <select value={bookingId} onChange={e => setBookingId(e.target.value)} required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600">
                  <option value="">Select a booking…</option>
                  {bookings.map(b => (
                    <option key={b.bookingId} value={b.bookingId}>
                      {(b.guestName || b.turoGuestName || "Guest")} — {b.vehicleName || b.vin} ({(b.startTime || "").slice(0, 10)})
                    </option>
                  ))}
                </select>
              )}
              <p className="text-xs text-gray-400 mt-1 dark:text-gray-500">
                Adds the Guest Key option to this booking's existing guest portal.
              </p>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">
                  Vehicle <span className="text-red-500">*</span>
                </label>
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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Driver Name</label>
                  <input type="text" placeholder="Optional" value={guestName} onChange={e => setGuestName(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Driver Email</label>
                  <input type="email" placeholder="Optional" value={guestEmail} onChange={e => setGuestEmail(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Driver Phone</label>
                <input type="tel" placeholder="Optional" value={guestPhone} onChange={e => setGuestPhone(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">
                    Access Start <span className="text-red-500">*</span>
                  </label>
                  <input type="datetime-local" required value={startTime} onChange={e => setStartTime(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">
                    Access End <span className="text-red-500">*</span>
                  </label>
                  <input type="datetime-local" required value={endTime} onChange={e => setEndTime(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600" />
                </div>
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Creates a lightweight guest portal (not a full booking) purely to host the
                "Create My Key" link — this does NOT trigger Guest Mode scheduling.
              </p>
            </>
          )}

          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={onClose} disabled={busy}
              className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:hover:bg-gray-700 dark:bg-gray-900/40 dark:text-gray-300 dark:border-gray-600">
              Cancel
            </button>
            <button type="submit" disabled={busy}
              className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
              {busy ? "Creating…" : "Create Key Option"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ActionButton({ label, onClick, variant = "default", disabled }) {
  const base = "px-3 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-40";
  const variants = {
    default: "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:text-gray-300",
    blue:    "bg-blue-600 text-white hover:bg-blue-700",
    green:   "bg-green-600 text-white hover:bg-green-700",
    red:     "bg-red-600 text-white hover:bg-red-700",
  };
  return (
    <button onClick={onClick} disabled={disabled}
      className={`${base} ${variants[variant] || variants.default}`}>
      {label}
    </button>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function AdminDriverKeys() {
  const api      = useApi();
  const navigate = useNavigate();

  const [bookings, setBookings]       = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");
  const [actionLoading, setActionLoading] = useState(null);

  const [createOpen, setCreateOpen]   = useState(false);
  const [confirmModal, setConfirmModal] = useState(null); // { booking, action, label, danger }
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchKeys = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get("/admin/driver-keys");
      setBookings(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Failed to load guest keys");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { fetchKeys(); }, [fetchKeys]);

  async function handleCreateInvite(booking) {
    setActionLoading(booking.bookingId);
    try {
      await api.post(`/admin/driver-keys/${booking.bookingId}/create-invite`);
      showToast(`Key link created for ${booking.bookingId}`);
      fetchKeys();
    } catch (err) {
      showToast(err.response?.data?.error || err.message || "Failed to create key link", "error");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRevokeInvite(booking) {
    setActionLoading(booking.bookingId);
    try {
      await api.post(`/admin/driver-keys/${booking.bookingId}/revoke-invite`);
      showToast(`Key link revoked for ${booking.bookingId}`);
      fetchKeys();
    } catch (err) {
      showToast(err.response?.data?.error || err.message || "Failed to revoke key link", "error");
    } finally {
      setActionLoading(null);
      setConfirmModal(null);
    }
  }

  async function handleDisable(booking) {
    setActionLoading(booking.bookingId);
    try {
      await api.post(`/admin/driver-keys/${booking.bookingId}/disable`);
      showToast(`Guest Key removed for ${booking.bookingId}`);
      fetchKeys();
    } catch (err) {
      showToast(err.response?.data?.error || err.message || "Failed to disable Guest Key", "error");
    } finally {
      setActionLoading(null);
      setConfirmModal(null);
    }
  }

  function handleCreateSuccess(data) {
    showToast(`Guest Key option added to booking ${data?.booking_id || "—"}`);
    setCreateOpen(false);
    fetchKeys();
  }

  return (
    <AdminLayout>
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
          toast.type === "error" ? "bg-red-600 text-white" : "bg-green-600 text-white"
        }`}>
          {toast.msg}
        </div>
      )}

      {createOpen && (
        <CreateKeyModal api={api} onClose={() => setCreateOpen(false)} onSuccess={handleCreateSuccess} />
      )}

      {confirmModal && (
        <ConfirmModal
          title={confirmModal.label}
          message={confirmModal.message}
          busy={actionLoading === confirmModal.booking.bookingId}
          danger={confirmModal.danger}
          confirmLabel={confirmModal.label}
          onConfirm={() => confirmModal.action(confirmModal.booking)}
          onCancel={() => setConfirmModal(null)}
        />
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Guest Keys</h1>
            <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
              Time-limited Tesla driver invite links that let a guest add their own Tesla account
              as a driver — useful for temporary drivers, delivery handoffs, etc.
              Looking for Bluetooth pairing / Guest Mode instead?{" "}
              <a href="/admin/guest-keys" className="text-blue-600 hover:underline">Go to Guest Mode →</a>
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setCreateOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create Key
            </button>
            <button
              onClick={fetchKeys}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 shadow-sm dark:hover:bg-gray-700 dark:bg-gray-900/40 dark:text-gray-300 dark:border-gray-600"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 dark:bg-red-900/20">{error}</div>
        )}

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
        ) : bookings.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden dark:bg-gray-800 dark:border-gray-700">
            <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500">
              <svg className="w-12 h-12 mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
              <p className="text-sm">No Guest Keys enabled yet</p>
              <p className="text-xs mt-1">Create a key option on a booking's guest portal, or start a new one</p>
              <button
                onClick={() => setCreateOpen(true)}
                className="mt-4 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
              >
                + Create Key
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden dark:bg-gray-800 dark:border-gray-700">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900/40">
                  <tr>
                    {["Booking", "Driver", "Vehicle", "Key Status", "Expires", "Portal Link", "Actions"].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100 dark:bg-gray-800 dark:divide-gray-700">
                  {bookings.map(b => {
                    const isLoading = actionLoading === b.bookingId;
                    const status = effectiveStatus(b);
                    const guestName = b.guestName || b.turoGuestName || "—";
                    return (
                      <tr key={b.bookingId} className="hover:bg-gray-50 transition-colors dark:hover:bg-gray-700 dark:bg-gray-900/40">
                        <td className="px-4 py-3">
                          {b.isPortalOnly ? (
                            <span className="font-mono text-xs text-gray-500 dark:text-gray-400">{b.bookingId?.slice(0, 14)}…</span>
                          ) : (
                            <button onClick={() => navigate(`/bookings/${b.bookingId}`)} className="text-blue-600 hover:underline font-mono text-xs">
                              {b.bookingId?.slice(0, 14)}…
                            </button>
                          )}
                          {b.isPortalOnly && (
                            <div className="text-xs text-purple-500 mt-0.5">Portal-only</div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{guestName}</div>
                          {b.guestEmail && <div className="text-xs text-gray-400 dark:text-gray-500">{b.guestEmail}</div>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm text-gray-900 dark:text-gray-100">{b.vehicleName || b.vin || "—"}</div>
                        </td>
                        <td className="px-4 py-3"><StatusBadge status={status} /></td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                          {b.driverInviteExpiresAt ? new Date(b.driverInviteExpiresAt).toLocaleString() : "—"}
                        </td>
                        <td className="px-4 py-3">
                          {b.guestAccessUrl ? (
                            <a href={b.guestAccessUrl} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors">
                              Open Portal ↗
                            </a>
                          ) : <span className="text-xs text-gray-400 dark:text-gray-500">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1.5">
                            {status !== "active" && (
                              <ActionButton label="Create Key Link" variant="blue" disabled={isLoading}
                                onClick={() => handleCreateInvite(b)} />
                            )}
                            {status === "active" && (
                              <>
                                <ActionButton label="Regenerate" variant="blue" disabled={isLoading}
                                  onClick={() => handleCreateInvite(b)} />
                                <ActionButton label="Revoke" variant="red" disabled={isLoading}
                                  onClick={() => setConfirmModal({
                                    booking: b, action: handleRevokeInvite, label: "Revoke",
                                    danger: true,
                                    message: `Revoke the active key link for ${guestName}? They will no longer be able to use it to add themselves as a driver.`
                                  })} />
                              </>
                            )}
                            <ActionButton label="Remove Guest Key" variant="default" disabled={isLoading}
                              onClick={() => setConfirmModal({
                                booking: b, action: handleDisable, label: "Remove",
                                danger: true,
                                message: b.isPortalOnly
                                  ? "This will delete the portal-only record entirely, since it exists only to host this Guest Key."
                                  : "This removes the Guest Key option from this booking's portal. The booking itself is preserved."
                              })} />
                            {isLoading && <span className="text-xs text-gray-400 animate-pulse dark:text-gray-500">Working…</span>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!loading && bookings.length > 0 && (
          <p className="text-xs text-gray-400 mt-3 text-right dark:text-gray-500">
            Showing {bookings.length} guest key record{bookings.length !== 1 ? "s" : ""}
          </p>
        )}
      </div>
    </AdminLayout>
  );
}
