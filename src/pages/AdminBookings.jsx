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
 *  - 3-way Current / Upcoming / Past bucketing (date-based, not full
 *    timestamp) so a trip starting today never drops out of "Current"
 *    just because the clock has passed its start time-of-day.
 *  - "All | Current | Upcoming | Past" tab control for focused viewing.
 */
import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useApi } from '../context/AuthContext';
import AdminLayout from '../components/AdminNav';
import { normalisePortalUrl } from '../utils/guestPortal';

const STATUS_COLORS = {
  pending:   'bg-yellow-100 text-yellow-700',
  confirmed: 'bg-blue-100 text-blue-700',
  active:    'bg-green-100 text-green-700',
  completed: 'bg-gray-100 text-gray-600 dark:text-gray-300',
  canceled:  'bg-red-100 text-red-700',
  disputed:  'bg-purple-100 text-purple-700',
};

/**
 * Buckets a booking into 'current' | 'upcoming' | 'past' using DATE-only
 * comparisons (not full timestamps). A booking is 'current' any time today
 * falls within [startDate, endDate] — so a trip that started this morning
 * stays in "Current" all day long instead of sliding into "Past" as soon
 * as the clock passes its start time-of-day.
 */
function getBookingBucket(booking) {
  const { startTime, endTime } = booking;
  if (!startTime) return 'past';

  const todayStr = new Date().toISOString().slice(0, 10);
  const startStr = startTime.slice(0, 10);
  const endStr   = (endTime || startTime).slice(0, 10);

  if (startStr <= todayStr && todayStr <= endStr) return 'current';
  if (startStr > todayStr) return 'upcoming';
  return 'past';
}


export default function AdminBookings() {
  const api      = useApi();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [bookings, setBookings]   = useState([]);
  const [vehicleMap, setVehicleMap] = useState({}); // vin → "Year Make Model"
  const [loading, setLoading]     = useState(true);
  const [copiedId, setCopiedId]   = useState('');

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

  // Split bookings into current / upcoming / past sections.
  // The backend already sorts within each bucket (current & upcoming: soonest
  // first; past: most recent first) — we just need to bucket them here too.
  // Canceled bookings are excluded from these grouped views by default (they
  // aren't actually "in progress"/"upcoming"/relevant to daily ops) — unless
  // the admin has explicitly selected the "Canceled" status filter, in which
  // case we show them so the filter still works as expected.
  const { current, upcoming, past } = useMemo(() => {
    const groupable = status === 'canceled'
      ? bookings
      : bookings.filter(b => b.status !== 'canceled');
    const current  = groupable.filter(b => getBookingBucket(b) === 'current');
    const upcoming = groupable.filter(b => getBookingBucket(b) === 'upcoming');
    const past     = groupable.filter(b => getBookingBucket(b) === 'past');
    return { current, upcoming, past };
  }, [bookings, status]);


  const view = params.get('view') || 'all'; // all | current | upcoming | past
  const setView = (v) => {
    const next = new URLSearchParams(params);
    if (v && v !== 'all') next.set('view', v); else next.delete('view');
    setParams(next);
  };

  const showCurrent  = view === 'all' || view === 'current';
  const showUpcoming = view === 'all' || view === 'upcoming';
  const showPast     = view === 'all' || view === 'past';


  const renderRow = (b) => {
    const gkStatus = b.guestKeyStatus || '';
    const guestModeActive   = gkStatus === 'guest_mode_active';
    const guestModeDisabled = gkStatus === 'guest_mode_disabled';
    const guestModePending  = ['pending', 'pending_creation', 'created'].includes(gkStatus);
    const portalUrl = normalisePortalUrl(b.guestAccessUrl || b.guestKeyLink);

    return (
      <tr
        key={b.bookingId || b.turoReservationId || Math.random()}
        onClick={() => b.bookingId && navigate(`/bookings/${b.bookingId}`)}
        className={`hover:bg-blue-50 dark:hover:bg-gray-700/40 transition-colors ${b.bookingId ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <td className="px-4 py-3 font-mono text-xs text-gray-400 dark:text-gray-500 hidden sm:table-cell">
          {shortId(b.bookingId)}
        </td>
        <td className="px-4 py-3 font-medium text-gray-800 dark:text-gray-100">
          {vehicleLabel(b.vin)}
        </td>
        <td className="px-4 py-3 text-gray-600 dark:text-gray-400 text-xs">
          {b.guestName || b.turoGuestName || b.userId || '—'}
        </td>
        <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
          {b.startTime ? new Date(b.startTime).toLocaleDateString() : '—'}
        </td>
        <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
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
            : <span className="capitalize text-gray-600 dark:text-gray-400 text-xs">{b.source || 'private'}</span>
          }
        </td>
        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
          ${((b.totalAmountCents || 0) / 100).toFixed(2)}
        </td>

        {/* Guest Mode badge — only shown for Tesla bookings that have a guestKeyStatus */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5 flex-wrap">
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
            {portalUrl && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(portalUrl).then(() => {
                    setCopiedId(b.bookingId);
                    setTimeout(() => setCopiedId(''), 2000);
                  });
                }}
                title="Copy guest portal link"
                className="inline-flex items-center gap-1 px-2 py-0.5 border border-gray-300 text-gray-600 text-xs font-medium rounded-full hover:bg-gray-50 transition-colors whitespace-nowrap dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                {copiedId === b.bookingId ? '✓ Copied!' : '📋 Copy Link'}
              </button>
            )}
          </div>
        </td>
      </tr>
    );
  };

  const tableHeader = (
    <thead className="bg-gray-50 dark:bg-gray-900/40 border-b border-gray-200 dark:border-gray-700">
      <tr>
        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase hidden sm:table-cell">ID</th>
        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Vehicle</th>
        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Renter</th>
        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Start</th>
        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">End</th>
        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Status</th>
        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Source</th>
        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Total</th>
        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Guest Mode</th>
      </tr>
    </thead>
  );


  return (
    <AdminLayout>
      <div className="py-8 px-4">
        <div className="max-w-6xl mx-auto space-y-5">

          {/* Page header */}
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Bookings</h1>
            <Link
              to="/bookings/new"
              className="inline-flex items-center gap-1.5 bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 transition"
            >
              <span className="text-lg leading-none">+</span> New Booking
            </Link>
          </div>

          {/* ── Compact filter bar ── */}
          <div className="flex flex-wrap items-center gap-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3">
            <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Filter</span>

            {/* Status dropdown */}
            <div className="flex items-center gap-1.5">
              <label htmlFor="status-filter" className="text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">Status</label>
              <select
                id="status-filter"
                value={status}
                onChange={e => setFilter('status', e.target.value)}
                className="text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-2.5 py-1.5 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
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
              <label htmlFor="source-filter" className="text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">Source</label>
              <select
                id="source-filter"
                value={source}
                onChange={e => setFilter('source', e.target.value)}
                className="text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-2.5 py-1.5 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
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
                className="ml-auto text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 underline"
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

          {/* ── View tabs: All | Current | Upcoming | Past ── */}
          <div className="flex items-center gap-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-2 py-2 w-fit">
            {[
              { key: 'all',      label: 'All',      count: bookings.length },
              { key: 'current',  label: 'Current',  count: current.length },
              { key: 'upcoming', label: 'Upcoming', count: upcoming.length },
              { key: 'past',     label: 'Past',     count: past.length },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setView(tab.key)}
                className={`text-sm font-medium px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
                  view === tab.key
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {tab.label}
                <span className={`ml-1.5 text-xs ${view === tab.key ? 'text-blue-100' : 'text-gray-400 dark:text-gray-500'}`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>


          {/* ── Table ── */}
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : bookings.length === 0 ? (
            <p className="text-gray-400 dark:text-gray-500 text-sm text-center py-12">No bookings found.</p>
          ) : (view === 'current' && current.length === 0) ||
             (view === 'upcoming' && upcoming.length === 0) ||
             (view === 'past' && past.length === 0) ? (
            <p className="text-gray-400 dark:text-gray-500 text-sm text-center py-12">
              No {view} bookings found.
            </p>
          ) : (

            <div className="space-y-4">

              {/* ── Current / In Progress section ── */}
              {showCurrent && current.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-green-300 dark:border-green-700/60 overflow-hidden shadow-sm">
                  <div className="bg-green-50 dark:bg-green-900/20 border-b border-green-200 dark:border-green-800/40 px-4 py-2 flex items-center gap-2">
                    <span className="text-green-600 dark:text-green-400 text-sm">🚗</span>
                    <span className="text-xs font-semibold text-green-700 dark:text-green-300 uppercase tracking-wide">
                      Current / In Progress
                    </span>
                    <span className="ml-auto text-xs text-green-600 dark:text-green-400 font-medium">
                      {current.length} booking{current.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[640px]">
                      {tableHeader}
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                        {current.map(renderRow)}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── Upcoming / Today section ── */}
              {showUpcoming && upcoming.length > 0 && (

                <div className="bg-white dark:bg-gray-800 rounded-xl border border-blue-200 dark:border-blue-800/50 overflow-hidden shadow-sm">
                  <div className="bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800/40 px-4 py-2 flex items-center gap-2">
                    <span className="text-blue-600 dark:text-blue-400 text-sm">📅</span>
                    <span className="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wide">
                      Upcoming &amp; Today
                    </span>
                    <span className="ml-auto text-xs text-blue-500 dark:text-blue-400 font-medium">
                      {upcoming.length} booking{upcoming.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[640px]">
                      {tableHeader}
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                        {upcoming.map(renderRow)}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── Past section ── */}
              {showPast && past.length > 0 && (

                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden opacity-90">
                  <div className="bg-gray-50 dark:bg-gray-900/40 border-b border-gray-200 dark:border-gray-700 px-4 py-2 flex items-center gap-2">
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
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                        {past.map(renderRow)}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

            </div>
          )}

          <p className="text-xs text-gray-400 dark:text-gray-500 text-right">
            {bookings.length} booking{bookings.length !== 1 ? 's' : ''} shown
          </p>
        </div>
      </div>
    </AdminLayout>
  );
}
