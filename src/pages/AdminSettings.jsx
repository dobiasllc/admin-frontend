/**
 * AdminSettings.jsx
 * Settings page — Tesla account reconnect, and other admin configuration.
 * Route: /admin/settings
 */
import { useState, useEffect } from 'react';
import { useApi } from '../context/AuthContext';
import AdminLayout from '../components/AdminNav';
import { API_BASE_URL } from '../config/const';

export default function AdminSettings() {
  const api = useApi();
  const [profile, setProfile]   = useState(null);
  const [loading, setLoading]   = useState(true);
  const [err, setErr]           = useState('');

  useEffect(() => {
    api.get('/users/me')
      .then(r => setProfile(r.data))
      .catch(e => setErr(`Failed to load profile: ${e.response?.data?.error || e.message}`))
      .finally(() => setLoading(false));
  }, []);

  const handleConnectTesla = () => {
    window.location.href = `${API_BASE_URL}/auth/tesla/login`;
  };

  const teslaStored      = profile?.tesla_token_stored === true;
  const teslaConnectedAt = profile?.tesla_connected_at || profile?.updated_at;

  return (
    <AdminLayout>
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-sm text-gray-500 mt-1">Admin configuration and account connections.</p>
        </div>

        {err && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{err}</div>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : (
          <>
            {/* ── Tesla Account ── */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl ${
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
                      <p className="text-sm text-red-600 mt-0.5">
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
                  {teslaStored ? '↻ Re-authorize Tesla' : 'Connect Tesla Account'}
                </button>
              </div>

              <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-gray-400 space-y-1">
                <p>
                  <strong className="text-gray-600">When to re-authorize:</strong> Only needed if you see
                  "token expired" errors in CloudWatch, or if you revoked access from your Tesla account.
                </p>
                <p>
                  <strong className="text-gray-600">Auto-refresh:</strong> Tokens are refreshed automatically
                  every 6 hours by the token refresher Lambda — no manual action needed under normal operation.
                </p>
                <p>
                  <strong className="text-gray-600">OAuth flow:</strong> Clicking the button above will redirect
                  you to Tesla's login page. After authorizing, you'll be redirected back to the dashboard.
                </p>
              </div>
            </div>

            {/* ── Admin Profile ── */}
            {profile && (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Admin Profile</h2>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-gray-400">Name</dt>
                    <dd className="font-medium">{profile.fullName || profile.name || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-400">Email</dt>
                    <dd>{profile.email || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-400">User ID</dt>
                    <dd className="font-mono text-xs text-gray-500">{profile.userId || profile.sub || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-400">Tier</dt>
                    <dd className="capitalize">{profile.tier || 'admin'}</dd>
                  </div>
                </dl>
              </div>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
