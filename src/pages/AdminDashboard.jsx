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

        {/* ── Tesla Account card ── */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${
                teslaStored ? 'bg-green-100' : 'bg-gray-100'
              }`}>
                {teslaStored ? '✅' : '🔌'}
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900">Tesla Account</h2>
                {teslaStored ? (
                  <p className="text-sm text-green-700 mt-0.5">
                    Connected
                    {teslaConnectedAt && (
                      <span className="text-gray-400 font-normal">
                        {' '}· last authorized {new Date(teslaConnectedAt).toLocaleDateString()}
                      </span>
                    )}
                  </p>
                ) : (
                  <p className="text-sm text-gray-500 mt-0.5">
                    Not connected — OAuth tokens are required for vehicle commands and guest keys.
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={handleConnectTesla}
              className={`shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition ${
                teslaStored
                  ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  : 'bg-red-600 text-white hover:bg-red-700 shadow-sm'
              }`}
            >
              {teslaStored ? 'Re-authorize Tesla' : 'Connect Tesla Account'}
            </button>
          </div>
          {teslaStored && (
            <p className="mt-3 text-xs text-gray-400">
              Tokens are refreshed automatically every 6 hours by the token refresher Lambda. Re-authorize only if you see token-expired errors.
            </p>
          )}
        </div>

        {/* ── Vehicle cards ── */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-800">Fleet</h2>
            <Link to="/vehicles" className="text-sm text-blue-600 hover:underline">Manage vehicles →</Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {(dash?.vehicles || []).map(v => (
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
                </div>
              </div>
            ))}
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
