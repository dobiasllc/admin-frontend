import React, { useState, useEffect, useCallback } from 'react';
import { useApi } from '../context/AuthContext';
import AdminLayout from '../components/AdminNav';

function fmt$(cents) {
  if (!cents) return '—';
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
}

export default function AdminTuroGuests() {
  const api = useApi();
  const [guests, setGuests]         = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [selected, setSelected]     = useState(null);
  const [detail, setDetail]         = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [inviting, setInviting]     = useState(false);
  const [search, setSearch]         = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/admin/turo-guests');
      setGuests(res.data || []);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load Turo guests');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSelect = async (phone) => {
    if (selected === phone) { setSelected(null); setDetail(null); return; }
    setSelected(phone);
    setDetailLoading(true);
    try {
      const res = await api.get(`/admin/turo-guests/${encodeURIComponent(phone)}`);
      setDetail(res.data);
    } catch (e) {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleInvite = async (phone) => {
    if (!window.confirm(`Send a Cognito account invite to this guest? They will receive an email to set up a full account.`)) return;
    setInviting(true);
    try {
      const res = await api.post(`/admin/turo-guests/${encodeURIComponent(phone)}/invite-cognito`);
      alert(`✅ Invite sent to ${res.data.email}`);
      await load();
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to send invite');
    } finally {
      setInviting(false);
    }
  };

  const filtered = guests.filter(g => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (g.name || '').toLowerCase().includes(q) ||
      (g.phone || '').includes(q) ||
      (g.email || '').toLowerCase().includes(q)
    );
  });

  return (
    <AdminLayout>
    <div className="p-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">🚗 Turo Guest Profiles</h1>
        <button onClick={load} className="text-sm text-blue-600 hover:underline">↻ Refresh</button>
      </div>

      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by name, phone, or email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full max-w-md border border-gray-300 rounded px-3 py-1.5 text-sm"
        />
      </div>

      {loading ? (
        <div className="text-gray-400 text-sm">Loading…</div>
      ) : error ? (
        <div className="text-red-600 text-sm">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="text-gray-400 text-sm italic">
          {search ? 'No guests match your search.' : 'No Turo guest profiles yet. They are created automatically when Turo booking emails are parsed.'}
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase border-b border-gray-200">
              <tr>
                <th className="px-4 py-2 text-left">Guest</th>
                <th className="px-4 py-2 text-left">Phone</th>
                <th className="px-4 py-2 text-center">Bookings</th>
                <th className="px-4 py-2 text-left">First Booking</th>
                <th className="px-4 py-2 text-left">Last Booking</th>
                <th className="px-4 py-2 text-left">Cognito</th>
                <th className="px-4 py-2 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(g => (
                <React.Fragment key={g.phone}>
                  <tr
                    className={`hover:bg-gray-50 cursor-pointer ${selected === g.phone ? 'bg-blue-50' : ''}`}
                    onClick={() => handleSelect(g.phone)}
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {g.name || <span className="text-gray-400 italic">Unknown</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600 font-mono text-xs">{g.phone}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="bg-blue-100 text-blue-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                        {g.bookingCount || (g.bookingIds?.length) || 0}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{g.firstBookingDate || '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{g.lastBookingDate || '—'}</td>
                    <td className="px-4 py-3">
                      {g.cognitoInvitedAt ? (
                        <span className="text-green-600 text-xs">✓ Invited {g.cognitoInvitedAt?.slice(0, 10)}</span>
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                      {!g.cognitoInvitedAt && g.email && (
                        <button
                          onClick={() => handleInvite(g.phone)}
                          disabled={inviting}
                          className="text-xs bg-purple-600 text-white px-2 py-1 rounded hover:bg-purple-700 disabled:opacity-50"
                        >
                          Invite
                        </button>
                      )}
                    </td>
                  </tr>

                  {/* Expanded detail row */}
                  {selected === g.phone && (
                    <tr>
                      <td colSpan={7} className="px-4 py-4 bg-blue-50 border-t border-blue-100">
                        {detailLoading ? (
                          <div className="text-gray-400 text-sm">Loading booking history…</div>
                        ) : detail ? (
                          <div>
                            <div className="flex items-center gap-6 mb-3 text-sm">
                              <div><span className="text-gray-500">Phone:</span> <span className="font-mono">{detail.phone}</span></div>
                              {detail.email && <div><span className="text-gray-500">Email:</span> {detail.email}</div>}
                              {detail.name && <div><span className="text-gray-500">Name:</span> {detail.name}</div>}
                            </div>

                            {detail.bookings?.length > 0 ? (
                              <table className="w-full text-xs bg-white rounded border border-blue-100">
                                <thead className="bg-gray-50 text-gray-500 uppercase">
                                  <tr>
                                    <th className="px-3 py-1.5 text-left">Booking ID</th>
                                    <th className="px-3 py-1.5 text-left">VIN</th>
                                    <th className="px-3 py-1.5 text-left">Start</th>
                                    <th className="px-3 py-1.5 text-left">End</th>
                                    <th className="px-3 py-1.5 text-left">Status</th>
                                    <th className="px-3 py-1.5 text-right">Total</th>
                                    <th className="px-3 py-1.5 text-center">View</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {detail.bookings.map(b => (
                                    <tr key={b.bookingId} className="hover:bg-gray-50">
                                      <td className="px-3 py-1.5 font-mono text-gray-600">{b.bookingId}</td>
                                      <td className="px-3 py-1.5 text-gray-600">{b.vin}</td>
                                      <td className="px-3 py-1.5 text-gray-500">{b.startTime?.slice(0, 10)}</td>
                                      <td className="px-3 py-1.5 text-gray-500">{b.endTime?.slice(0, 10)}</td>
                                      <td className="px-3 py-1.5">
                                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                                          b.status === 'completed' ? 'bg-green-100 text-green-700' :
                                          b.status === 'canceled'  ? 'bg-red-100 text-red-600' :
                                          b.status === 'active'    ? 'bg-blue-100 text-blue-700' :
                                          'bg-gray-100 text-gray-600'
                                        }`}>{b.status}</span>
                                      </td>
                                      <td className="px-3 py-1.5 text-right">{fmt$(b.totalAmountCents)}</td>
                                      <td className="px-3 py-1.5 text-center">
                                        <a href={`/admin/bookings/${b.bookingId}`}
                                          className="text-blue-600 hover:underline" target="_blank" rel="noreferrer">
                                          →
                                        </a>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            ) : (
                              <div className="text-gray-400 text-xs italic">No booking history available.</div>
                            )}
                          </div>
                        ) : (
                          <div className="text-gray-400 text-sm">Could not load details.</div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
    </AdminLayout>
  );
}
