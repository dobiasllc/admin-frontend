/**
 * AdminBookings.jsx — Booking table with status/source filters.
 * Route: /admin/bookings
 *
 * Improvements:
 *  - Fetches vehicles list to display "Year Make Model" instead of raw VIN
 *  - Clickable rows navigate to booking detail (no separate "View" link)
 *  - Compact select-based filter bar (replaces scattered pill buttons)
 *  - Horizontal scroll wrapper for mobile responsiveness
 *  - Safe bookingId display with fallback
 *  - Future/past visual separator with same-day trips treated as upcoming
 */
import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useApi } from '../context/AuthContext';
import AdminLayout from '../components/AdminNav';

const STATUS_COLORS = {
  pending:   'bg-yellow-100 text-yellow-700',
  confirmed: 'bg-blue-100 text-blue-700',
  active:    'bg-green-100 text-green-700',
  completed: 'bg-gray-100 text-gray-600',
  canceled:  'bg-red-100 text-red-700',
  disputed:  'bg-purple-100 text-purple-700',
};

/**
 * Returns true if a booking should be treated as "upcoming" (future).
 * A booking is upcoming if its startTime is today or in the future.
 * It only moves to "past" the day AFTER its scheduled start date.
 */
function isUpcoming(booking) {
  const startTime = booking.startTime;
  if (!startTime) return false;
  // Get today's date at midnight local time
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Parse the booking start (may be naive ISO like "2026-07-10T06:30:00")
  const start = new Date(startTime);
  start.setHours(0, 0, 0, 0);
  // Upcoming = starts today or later
  return start >= today;
}

export default function AdminBookings() {
  const api      = useApi();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [bookings, setBookings]   = useState([]);
  const [vehicleMap, setVehicleMap] = useState({}); // vin → "Year Make Model"
  const [loading, setLoading]     = useState(true);

  const status = params.get('status') || '';
  const source = params.get('source') || '';

  // Fetch vehicles once to build a VIN → display name lookup
  useEffect(() => {
    api.get('/admin/vehicles')
      .then(r => {
        const map = {};
        (r.data || []).forEach(v => {
          map[v.vin] = `${v.year} ${v.make} ${v.model}`.trim();
        });
        setVehicleMap(map);
      })
      .catch(console.error);
  }, []);

  // Fetch bookings whenever filters change
  useEffect(() => {
    setLoading(true);
    const q = new URLSearchParams();
    if (status) q.set('status', status);
    if (source) q.set('source', source);
    api.get(`/admin/bookings?${q}`)
      .then(r => setBookings(r.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [status, source]);

  const setFilter = (key, val) => {
    const next = new URLSearchParams(params);
    if (val) next.set(key, val); else next.delete(key);
    setParams(next);
  };

  const vehicleLabel = (vin) => vehicleMap[vin] || vin || '—';

  const shortId = (id) => {
    if (!id) return '—';
    return id.length > 10 ? `${id.slice(0, 10)}…` : id;
  };

  // Split bookings into upcoming and past sections.
  // The backend already sorts them correctly (upcoming first, then past).
  // We just need to find the split point.
  const { upcoming, past } = useMemo(() => {
    const upcoming = bookings.filter(isUpcoming);
    const past     = bookings.filter(b => !isUpcoming(b));
    return { upcoming, past };
  }, [bookings]);

  const renderRow = (b) => {
    const gkStatus = b.guestKeyStatus || '';
    const guestModeActive   = gkStatus === 'guest_mode_active';
    const guestModeDisabled = gkStatus === 'guest_mode_disabled';
    const guestModePending  = ['pending', 'pending_creation', 'created'].includes(gkStatus);

    return (
      <tr
        key={b.bookingId || b.turoReservationId || Math.random()}
        onClick={() => b.bookingId && navigate(`/bookings/${b.bookingId}`)}
        className={`hover:bg-blue-50 transition-colors ${b.bookingId ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <td className="px-4 py-3 font-mono text-xs text-gray-400 hidden sm:table-cell">
          {shortId(b.bookingId)}
        </td>
        <td className="px-4 py-3 font-medium text-gray-800">
          {vehicleLabel(b.vin)}
        </td>
        <td className="px-4 py-3 text-gray-600 text-xs">
          {b.guestName || b.turoGuestName || b.userId || '—'}
        </td>
        <td className="px-4 py-3 text-gray-600">
          {b.startTime ? new Date(b.startTime).toLocaleDateString() : '—'}
        </td>
        <td className="px-4 py-3 text-gray-600">
          {b.endTime ? new Date(b.endTime).toLocaleDateString() : '—'}
        </td>
        <td className="px-4 py-3">
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[b.status] || 'bg-gray-100 text-gray-600'}`}>
            {b.status || '—'}
          </span>
        </td>
        <td className="px-4 py-3">
          {b.source === 'turo'
            ? <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-xs font-medium">Turo</span>
            : <span className="capitalize text-gray-600 text-xs">{b.source || 'private'}</span>
          }
        </td>
        <td className="px-4 py-3 text-gray-700">
          ${((b.totalAmountCents || 0) / 100).toFixed(2)}
        </td>
        {/* Guest Mode badge — only shown for Tesla bookings that have a guestKeyStatus */}
        <td className="px-4 py-3">
          {guestModeActive ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" /> Guest Mode
            </span>
          ) : guestModeDisabled ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full text-xs font-medium whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400 inline-block" /> Disabled
            </span>
          ) : guestModePending && b.status !== 'canceled' ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-yellow-50 text-yellow-600 rounded-full text-xs font-medium whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 inline-block" /> Key Pending
            </span>
          ) : null}
        </td>
      </tr>
    );
  };

  const tableHeader = (
    <thead className="bg-gray-50 border-b border-gray-200">
      <tr>
        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase hidden sm:table-cell">ID</th>
        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Vehicle</th>
        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Renter</th>
        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Start</th>
        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">End</th>
        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Source</th>
        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Total</th>
        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Guest Mode</th>
      </tr>
    </thead>
  );

  return (
    <AdminLayout>
      <div className="py-8 px-4">
        <div className="max-w-6xl mx-auto space-y-5">

          {/* Page header */}
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">Bookings</h1>
            <Link
              to="/bookings/new"
              className="inline-flex items-center gap-1.5 bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 transition"
            >
              <span className="text-lg leading-none">+</span> New Booking
            </Link>
          </div>

          {/* ── Compact filter bar ── */}
          <div className="flex flex-wrap items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Filter</span>

            {/* Status dropdown */}
            <div className="flex items-center gap-1.5">
              <label htmlFor="status-filter" className="text-sm text-gray-500 whitespace-nowrap">Status</label>
              <select
                id="status-filter"
                value={status}
                onChange={e => setFilter('status', e.target.value)}
                className="text-sm border border-gray-300 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                <option value="">All</option>
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="canceled">Canceled</option>
                <option value="disputed">Disputed</option>
              </select>
            </div>

            {/* Source dropdown */}
            <div className="flex items-center gap-1.5">
              <label htmlFor="source-filter" className="text-sm text-gray-500 whitespace-nowrap">Source</label>
              <select
                id="source-filter"
                value={source}
                onChange={e => setFilter('source', e.target.value)}
                className="text-sm border border-gray-300 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                <option value="">All Sources</option>
                <option value="private">Private</option>
                <option value="turo">Turo</option>
              </select>
            </div>

            {/* Clear filters */}
            {(status || source) && (
              <button
                onClick={() => setParams({})}
                className="ml-auto text-xs text-gray-400 hover:text-gray-600 underline"
              >
                Clear filters
              </button>
            )}

            {/* Active filter badges */}
            <div className="flex gap-1.5 flex-wrap">
              {status && (
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[status] || 'bg-gray-100 text-gray-600'}`}>
                  {status}
                </span>
              )}
              {source && (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-800 text-white">
                  {source}
                </span>
              )}
            </div>
          </div>

          {/* ── Table ── */}
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : bookings.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-12">No bookings found.</p>
          ) : (
            <div className="space-y-4">

              {/* ── Upcoming / Today section ── */}
              {upcoming.length > 0 && (
                <div className="bg-white rounded-xl border border-blue-200 overflow-hidden shadow-sm">
                  <div className="bg-blue-50 border-b border-blue-200 px-4 py-2 flex items-center gap-2">
                    <span className="text-blue-600 text-sm">📅</span>
                    <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
                      Upcoming &amp; Today
                    </span>
                    <span className="ml-auto text-xs text-blue-500 font-medium">
                      {upcoming.length} booking{upcoming.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[640px]">
                      {tableHeader}
                      <tbody className="divide-y divide-gray-100">
                        {upcoming.map(renderRow)}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── Past section ── */}
              {past.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden opacity-90">
                  <div className="bg-gray-50 border-b border-gray-200 px-4 py-2 flex items-center gap-2">
                    <span className="text-gray-400 text-sm">🕐</span>
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                      Past Bookings
                    </span>
                    <span className="ml-auto text-xs text-gray-400 font-medium">
                      {past.length} booking{past.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[640px]">
                      {tableHeader}
                      <tbody className="divide-y divide-gray-100">
                        {past.map(renderRow)}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

            </div>
          )}

          <p className="text-xs text-gray-400 text-right">
            {bookings.length} booking{bookings.length !== 1 ? 's' : ''} shown
          </p>
        </div>
      </div>
    </AdminLayout>
  );
}
