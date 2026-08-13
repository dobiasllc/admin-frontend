/**
 * AdminUserDetail.jsx — Single user profile + identity verification review.
 * Route: /admin/users/:id  and  /admin/users/:id/verification
 */
import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useApi } from '../context/AuthContext';
import AdminLayout from '../components/AdminNav';

const TIER_COLORS = {
  bronze:   'bg-orange-100 text-orange-700',
  silver:   'bg-gray-100 text-gray-600 dark:text-gray-300',
  gold:     'bg-yellow-100 text-yellow-700',
  platinum: 'bg-blue-100 text-blue-700',
};
const VERIFY_COLORS = {
  unverified:     'bg-gray-100 text-gray-500 dark:text-gray-400',
  pending_upload: 'bg-yellow-100 text-yellow-700',
  pending_admin:  'bg-blue-100 text-blue-700',
  verified:       'bg-green-100 text-green-700',
  rejected:       'bg-red-100 text-red-700',
};

function fmtDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

export default function AdminUserDetail() {
  const { id } = useParams();
  const api = useApi();

  const [user, setUser] = useState(null);
  const [verification, setVerification] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [actionMsg, setActionMsg] = useState('');
  const [acting, setActing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);

  const [profileEditing, setProfileEditing] = useState(false);
  const [profileForm, setProfileForm] = useState({});
  const [profileSaving, setProfileSaving] = useState(false);


  const load = useCallback(() => {
    setLoading(true);
    setErr('');
    Promise.all([
      api.get(`/admin/users/${id}`),
      api.get(`/admin/users/${id}/verification`),
    ])
      .then(([userRes, verRes]) => {
        setUser(userRes.data);
        setVerification(verRes.data);
      })
      .catch(e => setErr(`Failed to load user: ${e.response?.status} — ${e.response?.data?.error || e.message}`))
      .finally(() => setLoading(false));
  }, [api, id]);

  useEffect(load, [load]);

  const doVerify = async (action) => {
    setActionMsg('');
    let reason;
    if (action === 'reject') {
      reason = window.prompt('Reason for rejection (shown to the user):', '');
      if (reason === null) return; // cancelled
    }
    setActing(true);
    try {
      if (action === 'approve') {
        await api.post(`/admin/users/${id}/verify/approve`);
      } else {
        await api.post(`/admin/users/${id}/verify/reject`, { reason: reason || '' });
      }
      setActionMsg(`User ${action}d successfully.`);
      load();
    } catch (e) {
      setActionMsg(`Error: ${e.response?.data?.error || action + ' failed'}`);
    } finally {
      setActing(false);
    }
  };

  const startEdit = () => {
    setEditForm({
      dlExpiryDate:        verification?.dlExpiryDate || '',
      insuranceExpiryDate: verification?.insuranceExpiryDate || '',
      insurancePolicyNum:  verification?.insurancePolicyNum || '',
      dlFaceDetected:      verification?.dlFaceDetected === true ? 'true' : verification?.dlFaceDetected === false ? 'false' : '',
    });
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setEditForm({});
  };

  const saveEdit = async () => {
    setSaving(true);
    setActionMsg('');
    try {
      const payload = {
        dlExpiryDate:        editForm.dlExpiryDate,
        insuranceExpiryDate: editForm.insuranceExpiryDate,
        insurancePolicyNum:  editForm.insurancePolicyNum,
      };
      if (editForm.dlFaceDetected !== '') {
        payload.dlFaceDetected = editForm.dlFaceDetected === 'true';
      }
      await api.put(`/admin/users/${id}/verification`, payload);
      setActionMsg('Verification fields updated successfully.');
      setEditing(false);
      load();
    } catch (e) {
      setActionMsg(`Error: ${e.response?.data?.error || 'Failed to update fields'}`);
    } finally {
      setSaving(false);
    }
  };

  const startProfileEdit = () => {
    setProfileForm({
      fullName: user?.fullName || '',
      phone:    user?.phone || '',
      address:  user?.address || '',
      city:     user?.city || '',
      dob:      user?.dob || '',
      dlNumber: user?.dlNumber || '',
      dlState:  user?.dlState || '',
    });
    setProfileEditing(true);
  };

  const cancelProfileEdit = () => {
    setProfileEditing(false);
    setProfileForm({});
  };

  const saveProfileEdit = async () => {
    setProfileSaving(true);
    setActionMsg('');
    try {
      await api.put(`/admin/users/${id}`, profileForm);
      setActionMsg('Profile updated successfully.');
      setProfileEditing(false);
      load();
    } catch (e) {
      setActionMsg(`Error: ${e.response?.data?.error || 'Failed to update profile'}`);
    } finally {
      setProfileSaving(false);
    }
  };

  const status = verification?.verificationStatus || user?.verificationStatus || 'unverified';


  return (
    <AdminLayout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <Link to="/users" className="text-sm text-blue-600 hover:underline">← Back to Users</Link>

        {err && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 font-mono dark:bg-red-900/20">{err}</div>
        )}

        {actionMsg && (
          <div className={`rounded-lg p-3 text-sm ${actionMsg.startsWith('Error') ? 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/20' : 'bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/20'}`}>
            {actionMsg}
          </div>
        )}

        {loading || !user ? (
          <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
        ) : (
          <>
            {/* Profile summary */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 dark:bg-gray-800 dark:border-gray-700">
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{user.fullName || '—'}</h1>
                  <p className="text-sm text-gray-400 mt-1 dark:text-gray-500">{user.email}</p>
                  {user.phone && <p className="text-sm text-gray-400 dark:text-gray-500">{user.phone}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${TIER_COLORS[user.tier] || 'bg-gray-100 text-gray-500 dark:text-gray-400'}`}>
                    {user.tier || 'bronze'}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${VERIFY_COLORS[status] || 'bg-gray-100 text-gray-500 dark:text-gray-400'}`}>
                    {status}
                  </span>
                </div>
              </div>
              <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm mt-6">
                <div><dt className="text-gray-400 text-xs dark:text-gray-500">Points</dt><dd>{user.points || 0}</dd></div>
                <div><dt className="text-gray-400 text-xs dark:text-gray-500">Total Rentals</dt><dd>{user.totalRentals || 0}</dd></div>
                <div><dt className="text-gray-400 text-xs dark:text-gray-500">User ID</dt><dd className="truncate">{user.userId || user.sub || id}</dd></div>
                <div><dt className="text-gray-400 text-xs dark:text-gray-500">Joined</dt><dd>{fmtDate(user.createdAt)}</dd></div>
                <div><dt className="text-gray-400 text-xs dark:text-gray-500">Updated</dt><dd>{fmtDate(user.updatedAt)}</dd></div>
              </dl>
            </div>

            {/* Editable profile fields */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 dark:bg-gray-800 dark:border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide dark:text-gray-400">Profile Details</h2>
                <div className="flex gap-2">
                  {!profileEditing ? (
                    <button onClick={startProfileEdit}
                      className="text-xs bg-gray-600 text-white px-3 py-1.5 rounded-lg hover:bg-gray-700 transition">
                      Edit Profile
                    </button>
                  ) : (
                    <>
                      <button onClick={saveProfileEdit} disabled={profileSaving}
                        className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition disabled:opacity-50">
                        {profileSaving ? 'Saving…' : 'Save'}
                      </button>
                      <button onClick={cancelProfileEdit} disabled={profileSaving}
                        className="text-xs bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-300 transition dark:bg-gray-700 dark:text-gray-200">
                        Cancel
                      </button>
                    </>
                  )}
                </div>
              </div>

              {profileEditing ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <label className="text-gray-400 text-xs block mb-0.5">Full Name</label>
                    <input type="text" value={profileForm.fullName || ''}
                      onChange={e => setProfileForm(f => ({ ...f, fullName: e.target.value }))}
                      className="w-full text-sm border border-gray-300 rounded px-2 py-1 dark:bg-gray-700 dark:border-gray-600" />
                  </div>
                  <div>
                    <label className="text-gray-400 text-xs block mb-0.5">Phone</label>
                    <input type="text" value={profileForm.phone || ''}
                      onChange={e => setProfileForm(f => ({ ...f, phone: e.target.value }))}
                      className="w-full text-sm border border-gray-300 rounded px-2 py-1 dark:bg-gray-700 dark:border-gray-600" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-gray-400 text-xs block mb-0.5">Home Address</label>
                    <input type="text" value={profileForm.address || ''}
                      onChange={e => setProfileForm(f => ({ ...f, address: e.target.value }))}
                      className="w-full text-sm border border-gray-300 rounded px-2 py-1 dark:bg-gray-700 dark:border-gray-600" />
                  </div>
                  <div>
                    <label className="text-gray-400 text-xs block mb-0.5">City / State / ZIP</label>
                    <input type="text" value={profileForm.city || ''}
                      onChange={e => setProfileForm(f => ({ ...f, city: e.target.value }))}
                      className="w-full text-sm border border-gray-300 rounded px-2 py-1 dark:bg-gray-700 dark:border-gray-600" />
                  </div>
                  <div>
                    <label className="text-gray-400 text-xs block mb-0.5">Date of Birth</label>
                    <input type="date" value={profileForm.dob || ''}
                      onChange={e => setProfileForm(f => ({ ...f, dob: e.target.value }))}
                      className="w-full text-sm border border-gray-300 rounded px-2 py-1 dark:bg-gray-700 dark:border-gray-600" />
                  </div>
                  <div>
                    <label className="text-gray-400 text-xs block mb-0.5">Driver's License #</label>
                    <input type="text" value={profileForm.dlNumber || ''}
                      onChange={e => setProfileForm(f => ({ ...f, dlNumber: e.target.value }))}
                      className="w-full text-sm border border-gray-300 rounded px-2 py-1 dark:bg-gray-700 dark:border-gray-600" />
                  </div>
                  <div>
                    <label className="text-gray-400 text-xs block mb-0.5">License State</label>
                    <input type="text" value={profileForm.dlState || ''} maxLength={2}
                      onChange={e => setProfileForm(f => ({ ...f, dlState: e.target.value }))}
                      className="w-full text-sm border border-gray-300 rounded px-2 py-1 dark:bg-gray-700 dark:border-gray-600" />
                  </div>
                </div>
              ) : (
                <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                  <div><dt className="text-gray-400 text-xs dark:text-gray-500">Phone</dt><dd>{user.phone || '—'}</dd></div>
                  <div><dt className="text-gray-400 text-xs dark:text-gray-500">Address</dt><dd>{user.address || '—'}</dd></div>
                  <div><dt className="text-gray-400 text-xs dark:text-gray-500">City/State/ZIP</dt><dd>{user.city || '—'}</dd></div>
                  <div><dt className="text-gray-400 text-xs dark:text-gray-500">Date of Birth</dt><dd>{user.dob || '—'}</dd></div>
                  <div><dt className="text-gray-400 text-xs dark:text-gray-500">DL Number</dt><dd>{user.dlNumber || '—'}</dd></div>
                  <div><dt className="text-gray-400 text-xs dark:text-gray-500">DL State</dt><dd>{user.dlState || '—'}</dd></div>
                </dl>
              )}
            </div>

            {/* Verification review */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 dark:bg-gray-800 dark:border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide dark:text-gray-400">Identity Verification</h2>
                <div className="flex gap-2">
                  {status === 'pending_admin' && (
                    <>
                      <button onClick={() => doVerify('approve')} disabled={acting}
                        className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 transition disabled:opacity-50">
                        Approve
                      </button>
                      <button onClick={() => doVerify('reject')} disabled={acting}
                        className="text-xs bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700 transition disabled:opacity-50">
                        Reject
                      </button>
                    </>
                  )}
                  {verification && (verification.dlS3Key || verification.insuranceS3Key) && !editing && (
                    <button onClick={startEdit}
                      className="text-xs bg-gray-600 text-white px-3 py-1.5 rounded-lg hover:bg-gray-700 transition">
                      Edit Fields
                    </button>
                  )}
                  {editing && (
                    <>
                      <button onClick={saveEdit} disabled={saving}
                        className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition disabled:opacity-50">
                        {saving ? 'Saving…' : 'Save'}
                      </button>
                      <button onClick={cancelEdit} disabled={saving}
                        className="text-xs bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-300 transition dark:bg-gray-700 dark:text-gray-200">
                        Cancel
                      </button>
                    </>
                  )}
                </div>
              </div>

              {!verification || (!verification.dlS3Key && !verification.insuranceS3Key) ? (
                <p className="text-sm text-gray-400 dark:text-gray-500">No verification documents submitted yet.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {/* Driver's license */}
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase mb-2 dark:text-gray-500">Driver's License</p>
                    {verification.dlImageUrl ? (
                      <img src={verification.dlImageUrl} alt="Driver's license"
                        className="w-full rounded-lg border border-gray-200 dark:border-gray-700 mb-3" />
                    ) : (
                      <p className="text-sm text-gray-400 dark:text-gray-500 mb-3">No image on file.</p>
                    )}
                    {editing ? (
                      <div className="space-y-2 text-sm">
                        <div>
                          <label className="text-gray-400 text-xs block mb-0.5">Expiry (MM/DD/YYYY)</label>
                          <input type="text" value={editForm.dlExpiryDate}
                            onChange={e => setEditForm(f => ({ ...f, dlExpiryDate: e.target.value }))}
                            className="w-full text-sm border border-gray-300 rounded px-2 py-1 dark:bg-gray-700 dark:border-gray-600" />
                        </div>
                        <div>
                          <label className="text-gray-400 text-xs block mb-0.5">Face Detected</label>
                          <select value={editForm.dlFaceDetected}
                            onChange={e => setEditForm(f => ({ ...f, dlFaceDetected: e.target.value }))}
                            className="w-full text-sm border border-gray-300 rounded px-2 py-1 dark:bg-gray-700 dark:border-gray-600">
                            <option value="">—</option>
                            <option value="true">Yes</option>
                            <option value="false">No</option>
                          </select>
                        </div>
                      </div>
                    ) : (
                      <dl className="text-sm space-y-1">
                        <div>
                          <dt className="text-gray-400 text-xs inline dark:text-gray-500">Expiry: </dt>
                          <dd className="inline">{verification.dlExpiryDate || '—'}</dd>
                          {verification.dlExpired && (
                            <span className="ml-2 px-1.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Expired</span>
                          )}
                        </div>
                        <div><dt className="text-gray-400 text-xs inline dark:text-gray-500">Face Detected: </dt><dd className="inline">{verification.dlFaceDetected === true ? 'Yes' : verification.dlFaceDetected === false ? 'No' : '—'}</dd></div>
                      </dl>
                    )}
                  </div>

                  {/* Insurance */}
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase mb-2 dark:text-gray-500">Insurance</p>
                    {verification.insuranceImageUrl ? (
                      <img src={verification.insuranceImageUrl} alt="Insurance card"
                        className="w-full rounded-lg border border-gray-200 dark:border-gray-700 mb-3" />
                    ) : (
                      <p className="text-sm text-gray-400 dark:text-gray-500 mb-3">No image on file.</p>
                    )}
                    {editing ? (
                      <div className="space-y-2 text-sm">
                        <div>
                          <label className="text-gray-400 text-xs block mb-0.5">Policy #</label>
                          <input type="text" value={editForm.insurancePolicyNum}
                            onChange={e => setEditForm(f => ({ ...f, insurancePolicyNum: e.target.value }))}
                            className="w-full text-sm border border-gray-300 rounded px-2 py-1 dark:bg-gray-700 dark:border-gray-600" />
                        </div>
                        <div>
                          <label className="text-gray-400 text-xs block mb-0.5">Expiry (MM/DD/YYYY)</label>
                          <input type="text" value={editForm.insuranceExpiryDate}
                            onChange={e => setEditForm(f => ({ ...f, insuranceExpiryDate: e.target.value }))}
                            className="w-full text-sm border border-gray-300 rounded px-2 py-1 dark:bg-gray-700 dark:border-gray-600" />
                        </div>
                      </div>
                    ) : (
                      <dl className="text-sm space-y-1">
                        <div><dt className="text-gray-400 text-xs inline dark:text-gray-500">Policy #: </dt><dd className="inline">{verification.insurancePolicyNum || '—'}</dd></div>
                        <div>
                          <dt className="text-gray-400 text-xs inline dark:text-gray-500">Expiry: </dt>
                          <dd className="inline">{verification.insuranceExpiryDate || '—'}</dd>
                          {verification.insuranceExpired && (
                            <span className="ml-2 px-1.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Expired</span>
                          )}
                        </div>
                      </dl>
                    )}
                  </div>
                </div>
              )}


              {/* Verification history */}
              {(verification?.verifiedAt || verification?.verificationRejectedAt) && (
                <div className="mt-6 border-t border-gray-100 pt-4 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400 space-y-1">
                  {verification.verifiedAt && (
                    <p>✅ Approved {fmtDate(verification.verifiedAt)} by {verification.verifiedByAdmin || 'admin'}</p>
                  )}
                  {verification.verificationRejectedAt && (
                    <p>
                      ❌ Rejected {fmtDate(verification.verificationRejectedAt)} by {verification.verificationRejectedBy || 'admin'}
                      {verification.verificationRejectReason ? ` — "${verification.verificationRejectReason}"` : ''}
                    </p>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
