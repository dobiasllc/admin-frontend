/**
 * AdminUsers.jsx — User table with tier badges, verification status, approve/reject.
 * Route: /admin/users
 */
import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApi } from '../context/AuthContext';
import AdminLayout from '../components/AdminNav';

const TIER_COLORS = {
  bronze:   'bg-orange-100 text-orange-700',
  silver:   'bg-gray-100 text-gray-600',
  gold:     'bg-yellow-100 text-yellow-700',
  platinum: 'bg-blue-100 text-blue-700',
};
const VERIFY_COLORS = {
  unverified:     'bg-gray-100 text-gray-500',
  pending_upload: 'bg-yellow-100 text-yellow-700',
  pending_admin:  'bg-blue-100 text-blue-700',
  verified:       'bg-green-100 text-green-700',
  rejected:       'bg-red-100 text-red-700',
};

export default function AdminUsers() {
  const api = useApi();
  const [params, setParams] = useSearchParams();
  const [users, setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setMsg]   = useState('');
  const [loadErr, setLoadErr] = useState('');

  const tier = params.get('tier') || '';

  const load = () => {
    setLoading(true);
    setLoadErr('');
    const q = tier ? `?tier=${tier}` : '';
    api.get(`/admin/users${q}`)
      .then(r => setUsers(r.data || []))
      .catch(e => setLoadErr(`Failed to load users: ${e.response?.status} — ${e.response?.data?.error || e.message}`))
      .finally(() => setLoading(false));
  };

  useEffect(load, [tier]);

  const setFilter = (val) => {
    const next = new URLSearchParams(params);
    if (val) next.set('tier', val); else next.delete('tier');
    setParams(next);
  };

  const doVerify = async (userId, action) => {
    setMsg('');
    try {
      await api.post(`/admin/users/${userId}/verify/${action}`);
      setMsg(`User ${action}d successfully.`);
      load();
    } catch (e) {
      setMsg(`Error: ${e.response?.data?.error || action + ' failed'}`);
    }
  };

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Users</h1>

        {loadErr && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 font-mono">{loadErr}</div>
        )}

        {actionMsg && (
          <div className={`rounded-lg p-3 text-sm ${actionMsg.startsWith('Error') ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
            {actionMsg}
          </div>
        )}

        {/* Tier filter */}
        <div className="flex gap-2 flex-wrap">
          {['', 'bronze', 'silver', 'gold', 'platinum'].map(t => (
            <button key={t} onClick={() => setFilter(t)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium border transition capitalize
                ${tier === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'}`}>
              {t || 'All Tiers'}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
        ) : users.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-12">No users found.</p>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Name / Email', 'Tier', 'Points', 'Rentals', 'Verification', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map(u => (
                  <tr key={u.userId || u.sub} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800">{u.fullName || '—'}</p>
                      <p className="text-xs text-gray-400">{u.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${TIER_COLORS[u.tier] || 'bg-gray-100 text-gray-500'}`}>
                        {u.tier || 'bronze'}
                      </span>
                    </td>
                    <td className="px-4 py-3">{u.points || 0}</td>
                    <td className="px-4 py-3">{u.totalRentals || 0}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${VERIFY_COLORS[u.verificationStatus] || 'bg-gray-100 text-gray-500'}`}>
                        {u.verificationStatus || 'unverified'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {u.verificationStatus === 'pending_admin' && (
                          <>
                            <button onClick={() => doVerify(u.userId || u.sub, 'approve')}
                              className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700 transition">
                              Approve
                            </button>
                            <button onClick={() => doVerify(u.userId || u.sub, 'reject')}
                              className="text-xs bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700 transition">
                              Reject
                            </button>
                          </>
                        )}
                        <Link to={`/users/${u.userId || u.sub}`}
                          className="text-xs text-blue-600 hover:underline">
                          View
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
