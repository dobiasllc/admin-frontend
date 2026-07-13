/**
 * AdminDashboard.jsx
 * Fleet overview: stats, vehicle cards, upcoming bookings, Tesla account status.
 * Route: /admin
 */
import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApi } from '../context/AuthContext';
import AdminLayout from '../components/AdminNav';
import { API_BASE_URL } from '../config/const';

const STATUS_COLORS = {
  available:   'bg-green-100 text-green-700',
  rented:      'bg-blue-100 text-blue-700',
  maintenance: 'bg-yellow-100 text-yellow-700',
  retired:     'bg-gray-100 text-gray-500',
};

const STATUS_LABELS = {
  available:   'Available Today',
  rented:      'Rented',
  maintenance: 'Maintenance',
  retired:     'Retired',
};

export default function AdminDashboard() {
  const api = useApi();
  const [searchParams, setSearchParams] = useSearchParams();

  const [dash, setDash]         = useState(null);
  const [bookings, setBookings] = useState([]);
  const [profile, setProfile]   = useState(null);
  const [loading, setLoading]   = useState(true);
  const [err, setErr]           = useState('');

  // Tesla OAuth result banners (from query params after redirect)
  const teslaConnected = searchParams.get('tesla_connected') === '1';
  const teslaError     = searchParams.get('tesla_error');

  // Clear the query params from the URL after reading them (one-shot banner)
  useEffect(() => {
    if (teslaConnected || teslaError) {
      const next = new URLSearchParams(searchParams);
      next.delete('tesla_connected');
      next.delete('tesla_error');
      setSearchParams(next, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // C2: Maintenance due warnings
  const [maintenanceWarnings, setMaintenanceWarnings] = useState([]);

  useEffect(() => {
    Promise.all([
      api.get('/admin/dashboard'),
      api.get('/admin/bookings?status=confirmed'),
      api.get('/users/me'),
    ])
      .then(([dRes, bRes, pRes]) => {
        setDash(dRes.data);
        setBookings((bRes.data || []).slice(0, 5));
        setProfile(pRes.data);

        // C2: Fetch maintenance records for all vehicles and compute warnings
        const vehicles = dRes.data?.vehicles || [];
        const today = new Date();
        const in30  = new Date(); in30.setDate(today.getDate() + 30);
        Promise.allSettled(
          vehicles.map(v =>
            api.get(`/admin/vehicles/${v.vin}/maintenance`)
              .then(r => (r.data || []).map(rec => ({
                ...rec,
                vin: v.vin,
                vehicleName: `${v.year || ''} ${v.make || ''} ${v.model || ''}`.trim() || v.vin,
              })))
          )
        ).then(results => {
          const allRecs = results
            .filter(r => r.status === 'fulfilled')
            .flatMap(r => r.value);
          const warnings = allRecs.filter(rec => {
            if (!rec.nextDueDate) return false;
            const due = new Date(rec.nextDueDate);
            return due <= in30; // overdue OR due within 30 days
          });
          warnings.sort((a, b) => (a.nextDueDate || '').localeCompare(b.nextDueDate || ''));
          setMaintenanceWarnings(warnings);
        }).catch(() => {});
      })
      .catch(e => setErr(`API error: ${e.response?.status} — ${e.response?.data?.error || e.message}`))
      .finally(() => setLoading(false));
  }, []);

  const handleConnectTesla = () => {
    window.location.href = `${API_BASE_URL}/auth/tesla/login`;
  };

  if (loading) return (
    <AdminLayout>
      <div className="flex items-center justify-center py-32">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    </AdminLayout>
  );

  const teslaStored    = profile?.tesla_token_stored === true;
  const teslaConnectedAt = profile?.tesla_connected_at || profile?.updated_at;

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* ── OAuth result banners ── */}
        {teslaConnected && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3 text-sm text-green-800">
            <span className="text-lg">✅</span>
            <span><strong>Tesla account connected!</strong> Your OAuth tokens have been stored. The token refresher will keep them current automatically.</span>
          </div>
        )}
        {teslaError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3 text-sm text-red-800">
            <span className="text-lg">❌</span>
            <span><strong>Tesla connection failed</strong> (error {teslaError}). Please try again or check the CloudWatch logs for details.</span>
          </div>
        )}

        {/* ── API error banner ── */}
        {err && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 font-mono">{err}</div>
        )}

        {/* ── Page header ── */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Fleet Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Overview of your fleet, bookings, and account status.</p>
        </div>

        {/* ── Stats row ── */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Active Rentals',    value: dash?.active_rentals    || 0, color: 'text-green-600' },
            { label: 'Confirmed',         value: dash?.confirmed_bookings || 0, color: 'text-blue-600' },
            { label: 'Pending',           value: dash?.pending_bookings   || 0, color: 'text-yellow-600' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-5 text-center">
              <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-sm text-gray-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* ── C2: Maintenance Due Warnings ── */}
        {maintenanceWarnings.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-amber-600 text-base">🔧</span>
              <h2 className="text-sm font-semibold text-amber-800">
                Maintenance Due ({maintenanceWarnings.length} item{maintenanceWarnings.length !== 1 ? 's' : ''})
              </h2>
              <Link to="/maintenance" className="ml-auto text-xs text-amber-700 hover:underline font-medium">View all →</Link>
            </div>
            {maintenanceWarnings.map((rec, i) => {
              const today = new Date();
              const due   = new Date(rec.nextDueDate);
              const isOverdue = due < today;
              return (
                <div key={`${rec.vin}-${rec.timestamp || i}`}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs ${isOverdue ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}
                >
                  <span>{isOverdue ? '🔴' : '🟡'}</span>
                  <span className="font-medium">{rec.vehicleName}</span>
                  <span className="text-gray-600">·</span>
                  <span>{rec.maintenanceType}</span>
                  <span className="ml-auto font-medium">
                    {isOverdue ? 'Overdue' : 'Due'}: {new Date(rec.nextDueDate).toLocaleDateString()}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Tesla Account status ── */}
        {/* When connected: compact single-line indicator to save space */}
        {/* When not connected: full warning card */}
        {teslaStored ? (
          <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-xs text-green-800">
            <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
            <span className="font-medium">Tesla ✓</span>
            {teslaConnectedAt && (
              <span className="text-green-600">· authorized {new Date(teslaConnectedAt).toLocaleDateString()}</span>
            )}
            <Link to="/settings" className="ml-auto text-green-700 hover:underline font-medium">Settings →</Link>
          </div>
        ) : (
          <div className="rounded-xl border bg-red-50 border-red-200 p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-lg">🔌</span>
              <div>
                <p className="text-sm font-semibold text-gray-800">Tesla Account Not Connected</p>
                <p className="text-xs text-red-700">OAuth tokens required for vehicle commands and guest keys.</p>
              </div>
            </div>
            <Link
              to="/settings"
              className="shrink-0 px-3 py-1.5 bg-white border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50 transition"
            >
              ⚙ Connect Tesla
            </Link>
          </div>
        )}

        {/* ── Vehicle cards ── */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-800">Fleet</h2>
            <Link to="/vehicles" className="text-sm text-blue-600 hover:underline">Manage vehicles →</Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {(dash?.vehicles || []).map(v => {
              const guestActive  = v.currentGuestModeActive === true;
              const eraseStatus  = v.currentEraseStatus || '';
              const guestName    = v.currentGuestName || '';
              const bookingId    = v.currentBookingId || '';
              return (
              <div key={v.vin} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {v.imageUrl && (
                  <img src={v.imageUrl} alt={v.model} className="w-full h-32 object-cover" />
                )}
                <div className="p-4">
                  <p className="font-semibold text-gray-800 text-sm">{v.year} {v.make} {v.model}</p>
                  <p className="text-xs text-gray-400 mb-2">{v.licensePlate}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[v.status] || 'bg-gray-100 text-gray-500'}`}>
                      {STATUS_LABELS[v.status] || v.status}
                    </span>
                    {v.teslaEnabled && (
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Tesla</span>
                    )}
                  </div>
                  {/* Guest mode state indicators */}
                  {v.teslaEnabled && bookingId && (
                    <div className="mt-2 space-y-1">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${guestActive ? 'bg-green-500' : 'bg-gray-300'}`} />
                        <span className="text-xs text-gray-600">
                          Guest Mode: <span className={guestActive ? 'text-green-700 font-medium' : 'text-gray-400'}>
                            {guestActive ? 'Active' : 'Inactive'}
                          </span>
                        </span>
                      </div>
                      {guestName && (
                        <p className="text-xs text-gray-500 truncate">👤 {guestName}</p>
                      )}
                      {eraseStatus && (
                        <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${
                          eraseStatus === 'erased' ? 'bg-green-100 text-green-700' :
                          eraseStatus === 'failed' ? 'bg-red-100 text-red-700' :
                          'bg-gray-100 text-gray-500'
                        }`}>
                          🗑 Erase: {eraseStatus}
                        </span>
                      )}
                      <Link
                        to={`/bookings/${bookingId}`}
                        className="block text-xs text-blue-600 hover:underline mt-1"
                      >
                        View booking →
                      </Link>
                    </div>
                  )}
                </div>
              </div>
              );
            })}
            {(dash?.vehicles || []).length === 0 && (
              <div className="col-span-4 text-center py-8 text-gray-400 text-sm">
                No active vehicles. <Link to="/vehicles" className="text-blue-600 hover:underline">Add one →</Link>
              </div>
            )}
          </div>
        </div>

        {/* ── Upcoming confirmed bookings ── */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-800">Upcoming Confirmed Bookings</h2>
            <Link to="/bookings" className="text-sm text-blue-600 hover:underline">View all →</Link>
          </div>
          {bookings.length === 0 ? (
            <p className="text-gray-400 text-sm">No upcoming confirmed bookings.</p>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {['Booking ID', 'Vehicle', 'Start', 'End', 'Source', ''].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {bookings.map(b => (
                    <tr key={b.bookingId || b.PK} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{(b.bookingId || '').slice(0, 12)}…</td>
                      <td className="px-4 py-3">{b.vin}</td>
                      <td className="px-4 py-3">{new Date(b.startTime).toLocaleDateString()}</td>
                      <td className="px-4 py-3">{new Date(b.endTime).toLocaleDateString()}</td>
                      <td className="px-4 py-3 capitalize">{b.source}</td>
                      <td className="px-4 py-3">
                        <Link to={`/bookings/${b.bookingId}`} className="text-blue-600 hover:underline text-xs">View</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </AdminLayout>
  );
}
