/**
 * AdminVehicleDetail.jsx — Full detail/management page for a single vehicle.
 * Route: /admin/vehicles/:vin
 */
import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useApi } from '../context/AuthContext';
import AdminLayout from '../components/AdminNav';

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

const MAINTENANCE_TYPES = [
  'Oil Change', 'Tire Rotation', 'Tire Replacement', 'Brake Service',
  'Battery Service', 'Charging Port Service', 'Software Update',
  'Recall', 'Inspection', 'Detailing', 'Windshield', 'Other',
];

const GK_STATUS_COLORS = {
  page_ready:          'bg-blue-100 text-blue-700',
  guest_mode_active:   'bg-green-100 text-green-700',
  guest_mode_disabled: 'bg-gray-100 text-gray-600',
  failed:              'bg-red-200 text-red-900',
};

const GK_STATUS_LABELS = {
  page_ready:          'Portal Ready',
  guest_mode_active:   'Guest Mode Active ✓',
  guest_mode_disabled: 'Access Ended',
  failed:              'Failed',
};

function fmtDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}
function fmtMoney(cents) {
  if (cents === undefined || cents === null) return '—';
  return `$${(cents / 100).toFixed(2)}`;
}

function normalisePortalUrl(raw) {
  if (!raw) return '';
  try {
    const u = new URL(raw);
    const bookingId = u.pathname.replace(/^\//, '').split('/').pop();
    if (!bookingId) return raw;
    return `https://guest.drivedobias.com/${bookingId}`;
  } catch { return raw; }
}

// ── Header Panel ─────────────────────────────────────────────────────────────
function HeaderPanel({ vehicle, onRetire }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {vehicle.imageUrl && (
        <img src={vehicle.imageUrl} alt={vehicle.model} className="w-full h-56 object-cover" />
      )}
      <div className="p-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{vehicle.year} {vehicle.make} {vehicle.model}</h1>
          <p className="text-sm text-gray-400 mt-1">{vehicle.vin} · {vehicle.licensePlate}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${STATUS_COLORS[vehicle.status] || ''}`}>
            {STATUS_LABELS[vehicle.status] || vehicle.status}
          </span>
          {vehicle.status !== 'retired' && (
            <button
              onClick={onRetire}
              className="text-xs border border-red-300 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50 transition"
            >
              Retire Vehicle
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Photo Gallery Panel ──────────────────────────────────────────────────────
function PhotoGalleryPanel({ vin }) {
  const api = useApi();
  const [photos, setPhotos]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/admin/vehicles/${vin}/photos`)
      .then(r => setPhotos(r.data?.photos || []))
      .catch(e => setErr(e.response?.data?.error || 'Failed to load photos'))
      .finally(() => setLoading(false));
  }, [api, vin]);

  useEffect(load, [load]);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setErr('');
    try {
      const urlRes = await api.get(`/admin/vehicles/${vin}/photo-upload-url`, { params: { filename: file.name } });
      const { upload_url, content_type } = urlRes.data;
      await fetch(upload_url, { method: 'PUT', headers: { 'Content-Type': content_type }, body: file });
      load();
    } catch (e2) {
      setErr(e2.response?.data?.error || e2.message || 'Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDelete = async (filename) => {
    if (!window.confirm(`Delete photo ${filename}?`)) return;
    try {
      await api.delete(`/admin/vehicles/${vin}/photos/${filename}`);
      load();
    } catch (e2) {
      setErr(e2.response?.data?.error || 'Delete failed');
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Photo Gallery</h2>
        <label className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg cursor-pointer hover:bg-blue-700 transition">
          {uploading ? 'Uploading…' : '+ Add Photo'}
          <input type="file" accept="image/*" className="hidden" onChange={handleUpload} disabled={uploading} />
        </label>
      </div>
      {err && <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{err}</div>}
      {loading ? (
        <div className="text-sm text-gray-400">Loading…</div>
      ) : photos.length === 0 ? (
        <p className="text-sm text-gray-400">No photos uploaded yet.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {photos.map(p => (
            <div key={p.s3_key} className="relative group">
              <img src={p.url} alt={p.filename} className="w-full h-28 object-cover rounded-lg border border-gray-100" />
              <button
                onClick={() => handleDelete(p.filename)}
                className="absolute top-1 right-1 bg-red-600 text-white rounded-full w-6 h-6 text-xs opacity-0 group-hover:opacity-100 transition"
                title="Delete photo"
              >×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Editable Fields Panel ────────────────────────────────────────────────────
function EditableFieldsPanel({ vehicle, onSaved }) {
  const api = useApi();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(vehicle);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => { setForm(vehicle); }, [vehicle]);

  const fields = [
    ['make', 'Make', 'text'],
    ['model', 'Model', 'text'],
    ['year', 'Year', 'number'],
    ['licensePlate', 'License Plate', 'text'],
    ['color', 'Color', 'text'],
    ['dailyRateCents', 'Daily Rate (cents)', 'number'],
    ['imageUrl', 'Image URL', 'text'],
    ['lockboxCode', 'Lockbox Code', 'text'],
    ['freeMilesPerDay', 'Free Miles / Day', 'number'],
    ['teslaVehicleId', 'Tesla Vehicle ID', 'text'],
    ['teslaAccountId', 'Tesla Account ID', 'text'],
    ['ownerUserId', 'Owner User ID (Cognito)', 'text'],
    ['purchasePrice', 'Purchase Price ($)', 'number'],
    ['purchaseDate', 'Purchase Date', 'date'],
    ['ttrCents', 'TTR — Tax/Title/Registration ($, one-time)', 'number'],
    ['annualRegistrationCents', 'Annual Registration ($/yr)', 'number'],
    ['loanPrincipalCents', 'Loan Principal ($)', 'number'],
    ['loanAPR', 'APR (e.g. 0.0649 for 6.49%)', 'number'],
    ['loanTermMonths', 'Loan Term (months)', 'number'],
    ['loanStartDate', 'Loan Start Date', 'date'],
  ];

  const handleSave = async () => {
    setSaving(true); setErr(''); setMsg('');
    try {
      const payload = { ...form, year: Number(form.year), dailyRateCents: Number(form.dailyRateCents) };
      await api.put(`/admin/vehicles/${vehicle.vin}`, payload);
      setMsg('Vehicle updated.');
      setEditing(false);
      onSaved();
    } catch (e) {
      setErr(e.response?.data?.error || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Vehicle Details</h2>
        {!editing ? (
          <button onClick={() => setEditing(true)} className="text-xs border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition">Edit</button>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => { setEditing(false); setForm(vehicle); }} className="text-xs border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
          </div>
        )}
      </div>
      {msg && <div className="mb-3 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{msg}</div>}
      {err && <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{err}</div>}

      {editing ? (
        <div className="grid grid-cols-2 gap-4">
          {fields.map(([key, label, type]) => (
            <div key={key}>
              <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
              <input type={type} value={form[key] ?? ''}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
          ))}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
            <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              {['available', 'rented', 'maintenance', 'retired'].map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Default Source</label>
            <select value={form.defaultSource} onChange={e => setForm(f => ({ ...f, defaultSource: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              {['private', 'turo', 'both'].map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="col-span-2 flex items-center gap-2">
            <input type="checkbox" id="teslaEnabled" checked={!!form.teslaEnabled}
              onChange={e => setForm(f => ({ ...f, teslaEnabled: e.target.checked }))} />
            <label htmlFor="teslaEnabled" className="text-sm text-gray-700">Tesla Enabled</label>
          </div>
        </div>
      ) : (
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          <div><dt className="text-gray-400 text-xs">Color</dt><dd>{vehicle.color || '—'}</dd></div>
          <div><dt className="text-gray-400 text-xs">Daily Rate</dt><dd>{fmtMoney(vehicle.dailyRateCents)}</dd></div>
          <div><dt className="text-gray-400 text-xs">Default Source</dt><dd className="capitalize">{vehicle.defaultSource || '—'}</dd></div>
          <div><dt className="text-gray-400 text-xs">Free Miles/Day</dt><dd>{vehicle.freeMilesPerDay ?? '—'}</dd></div>
          <div><dt className="text-gray-400 text-xs">Tesla Enabled</dt><dd>{vehicle.teslaEnabled ? 'Yes' : 'No'}</dd></div>
          <div><dt className="text-gray-400 text-xs">Lockbox Code</dt><dd>{vehicle.lockboxCode || '—'}</dd></div>
          <div><dt className="text-gray-400 text-xs">Tesla Vehicle ID</dt><dd className="truncate">{vehicle.teslaVehicleId || '—'}</dd></div>
          <div><dt className="text-gray-400 text-xs">Purchase Price</dt><dd>{vehicle.purchasePrice ? `$${Number(vehicle.purchasePrice).toLocaleString()}` : '—'}</dd></div>
          <div><dt className="text-gray-400 text-xs">Purchase Date</dt><dd>{vehicle.purchaseDate || '—'}</dd></div>
          <div><dt className="text-gray-400 text-xs">Loan Principal</dt><dd>{vehicle.loanPrincipalCents ? `$${Number(vehicle.loanPrincipalCents).toLocaleString()}` : '—'}</dd></div>
          <div><dt className="text-gray-400 text-xs">Loan APR</dt><dd>{vehicle.loanAPR || '—'}</dd></div>
          <div><dt className="text-gray-400 text-xs">Annual Registration</dt><dd>{vehicle.annualRegistrationCents ? `$${Number(vehicle.annualRegistrationCents).toLocaleString()}` : '—'}</dd></div>
        </dl>
      )}
    </div>
  );
}

// ── Valuation / OTD Panel ────────────────────────────────────────────────────
function ValuationPanel({ vehicle, onRefreshed }) {
  const api = useApi();
  const [refreshing, setRefreshing] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const handleRefresh = async () => {
    setRefreshing(true); setMsg(''); setErr('');
    try {
      const r = await api.post(`/admin/vehicles/${vehicle.vin}/refresh-valuation`);
      setMsg(`✓ Refreshed${r.data?.valuation?.marketValue ? ` — market value: $${r.data.valuation.marketValue.toLocaleString()}` : ''}`);
      onRefreshed();
    } catch (e) {
      setErr(e.response?.data?.error || 'Valuation refresh failed');
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">📊 OTDcheck Valuation</h2>
        <button onClick={handleRefresh} disabled={refreshing}
          className="text-xs border border-indigo-300 text-indigo-700 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition disabled:opacity-50">
          {refreshing ? '⏳ Refreshing…' : 'Refresh Value'}
        </button>
      </div>
      {msg && <div className="mb-3 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{msg}</div>}
      {err && <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{err}</div>}

      {(vehicle.otdcheckMarketValue || vehicle.otdcheckLastRefreshed) ? (
        <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-3 text-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-indigo-700">Market Value</span>
            {vehicle.otdcheckRecallCount > 0 && (
              <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-xs font-medium">
                {vehicle.otdcheckRecallCount} recall{vehicle.otdcheckRecallCount > 1 ? 's' : ''}
              </span>
            )}
          </div>
          {vehicle.otdcheckMarketValue && (
            <div className="flex items-baseline gap-2">
              <span className="text-indigo-900 font-bold text-lg">${vehicle.otdcheckMarketValue.toLocaleString()}</span>
              {vehicle.otdcheckMarketValueSource && vehicle.otdcheckMarketValueSource !== 'fair_price' && (
                <span className="text-indigo-400 text-xs">
                  ({vehicle.otdcheckMarketValueSource === 'listing' ? 'listing price' :
                    vehicle.otdcheckMarketValueSource === 'wholesale' ? 'wholesale est.' : 'depreciation est.'})
                </span>
              )}
            </div>
          )}
          {vehicle.otdcheckRetailMin && vehicle.otdcheckRetailMax && (
            <div className="text-indigo-600 text-xs">
              Retail range: ${vehicle.otdcheckRetailMin.toLocaleString()} – ${vehicle.otdcheckRetailMax.toLocaleString()}
            </div>
          )}
          {vehicle.otdcheckLastRefreshed && (
            <div className="text-indigo-400 text-xs">Refreshed: {fmtDate(vehicle.otdcheckLastRefreshed)}</div>
          )}
        </div>
      ) : (
        <div className="bg-gray-50 border border-dashed border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-400">
          No valuation data yet — auto-refreshes monthly via OTDcheck.
        </div>
      )}
    </div>
  );
}

// ── Drivers Panel ────────────────────────────────────────────────────────────
function DriversPanel({ vehicle }) {
  const api = useApi();
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [revoking, setRevoking] = useState(false);

  const load = useCallback(() => {
    if (!vehicle.teslaEnabled) { setLoading(false); return; }
    setLoading(true);
    api.get(`/admin/vehicles/${vehicle.vin}/drivers`)
      .then(r => setDrivers(r.data?.drivers || []))
      .catch(e => setErr(e.response?.data?.error || 'Failed to load drivers'))
      .finally(() => setLoading(false));
  }, [api, vehicle.vin, vehicle.teslaEnabled]);

  useEffect(load, [load]);

  const handleRevoke = async () => {
    if (!window.confirm(`Revoke all guest drivers from ${vehicle.vin}? This removes any phone keys paired via Guest Mode.`)) return;
    setRevoking(true); setMsg(''); setErr('');
    try {
      await api.post(`/admin/vehicles/${vehicle.vin}/revoke-drivers`);
      setMsg('✓ Drivers revoked.');
      load();
    } catch (e) {
      setErr(e.response?.data?.error || 'Revoke drivers failed');
    } finally {
      setRevoking(false);
    }
  };

  if (!vehicle.teslaEnabled) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Drivers</h2>
        <p className="text-sm text-gray-400">Not applicable — this vehicle is not Tesla-enabled.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Drivers ({drivers.length})</h2>
        <button onClick={handleRevoke} disabled={revoking}
          className="text-xs border border-purple-300 text-purple-700 px-3 py-1.5 rounded-lg hover:bg-purple-50 transition disabled:opacity-50">
          🔑 Revoke Drivers
        </button>
      </div>
      {msg && <div className="mb-3 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{msg}</div>}
      {err && <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{err}</div>}
      {loading ? (
        <div className="text-sm text-gray-400">Loading…</div>
      ) : drivers.length === 0 ? (
        <p className="text-sm text-gray-400">No drivers currently listed.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {drivers.map((d, i) => (
            <li key={i} className="border border-gray-100 rounded-lg px-3 py-2">
              {d.driverFirstName || d.firstName || ''} {d.driverLastName || d.lastName || ''} {d.publicKey ? <span className="text-gray-400 text-xs ml-1">(key holder)</span> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Guest Mode & Guest Keys Panel ────────────────────────────────────────────
function GuestKeysPanel({ vin }) {
  const api = useApi();
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [actingId, setActingId] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    api.get('/admin/guest-keys')
      .then(r => setKeys((r.data || []).filter(k => k.vin === vin)))
      .catch(e => setErr(e.response?.data?.error || 'Failed to load guest keys'))
      .finally(() => setLoading(false));
  }, [api, vin]);

  useEffect(load, [load]);

  const callAction = async (bookingId, action) => {
    setActingId(bookingId); setMsg(''); setErr('');
    try {
      await api.post(`/admin/guest-keys/${bookingId}/${action}`);
      setMsg(`✓ ${action} completed`);
      load();
    } catch (e) {
      setErr(e.response?.data?.error || `${action} failed`);
    } finally {
      setActingId(null);
    }
  };

  const now = new Date();
  const upcoming = keys.filter(k => k.startTime && new Date(k.startTime) >= now);


  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Guest Mode & Guest Keys</h2>
      {msg && <div className="mb-3 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{msg}</div>}
      {err && <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{err}</div>}
      {loading ? (
        <div className="text-sm text-gray-400">Loading…</div>
      ) : keys.length === 0 ? (
        <p className="text-sm text-gray-400">No guest keys for this vehicle.</p>
      ) : (
        <div className="space-y-4">
          {upcoming.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Upcoming Schedule</p>
              <div className="space-y-2">
                {upcoming.map(k => (
                  <div key={k.bookingId} className="border border-gray-100 rounded-lg p-3 text-sm flex items-center justify-between">
                    <div>
                      <p className="font-medium">
                        <Link to={`/bookings/${k.bookingId}`} className="text-blue-600 hover:underline">{k.bookingId}</Link>
                        {' '}— {k.guestName || k.guestEmail || 'Guest'}
                      </p>
                      <p className="text-xs text-gray-400">{fmtDate(k.startTime)} → {fmtDate(k.endTime)}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${GK_STATUS_COLORS[k.guestKeyStatus] || 'bg-gray-100 text-gray-600'}`}>
                      {GK_STATUS_LABELS[k.guestKeyStatus] || k.guestKeyStatus || '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase mb-2">All Guest Mode Events</p>
            <div className="space-y-2">
              {keys.map(k => {
                const portalUrl = normalisePortalUrl(k.guestAccessUrl || k.guestKeyLink);
                return (
                  <div key={k.bookingId} className="border border-gray-100 rounded-lg p-3 text-sm">
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-medium">
                        <Link to={`/bookings/${k.bookingId}`} className="text-blue-600 hover:underline">{k.bookingId}</Link>
                        {' '}— {k.guestName || k.guestEmail || 'Guest'}
                      </p>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${GK_STATUS_COLORS[k.guestKeyStatus] || 'bg-gray-100 text-gray-600'}`}>
                        {GK_STATUS_LABELS[k.guestKeyStatus] || k.guestKeyStatus || '—'}
                      </span>
                    </div>
                    <dl className="grid grid-cols-2 gap-2 text-xs text-gray-500 mb-2">
                      <div>Created: {fmtDate(k.guestKeyCreatedAt)}</div>
                      <div>Enabled: {fmtDate(k.guestModeEnabledAt || k.guestKeyActivatedAt)}</div>
                      <div>Disabled: {fmtDate(k.guestModeDisabledAt || k.guestKeyRevokedAt)}</div>
                      <div>Erase Data: {k.eraseUserDataStatus === 'erased' ? `✓ ${fmtDate(k.eraseUserDataAt)}` : (k.eraseUserDataStatus || '—')}</div>
                    </dl>
                    <div className="flex flex-wrap gap-2">
                      {portalUrl && (
                        <a href={portalUrl} target="_blank" rel="noopener noreferrer"
                          className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 transition">Open Portal ↗</a>
                      )}
                      <button disabled={actingId === k.bookingId}
                        onClick={() => window.confirm('Enable Guest Mode now?') && callAction(k.bookingId, 'enable-guest-mode')}
                        className="text-xs border border-green-300 text-green-700 px-2 py-1 rounded hover:bg-green-50 transition disabled:opacity-50">Enable</button>
                      <button disabled={actingId === k.bookingId}
                        onClick={() => window.confirm('Disable Guest Mode now?') && callAction(k.bookingId, 'disable-guest-mode')}
                        className="text-xs border border-orange-300 text-orange-700 px-2 py-1 rounded hover:bg-orange-50 transition disabled:opacity-50">Disable</button>
                      <button disabled={actingId === k.bookingId}
                        onClick={() => window.confirm('Erase renter data from vehicle?') && callAction(k.bookingId, 'erase-user-data')}
                        className="text-xs border border-red-300 text-red-700 px-2 py-1 rounded hover:bg-red-50 transition disabled:opacity-50">Erase Data</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Maintenance Panel ────────────────────────────────────────────────────────
function MaintenancePanel({ vin }) {
  const api = useApi();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [form, setForm] = useState({ maintenanceType: 'Other', description: '', mileageAtService: '', performedBy: '', cost: '', performedAt: new Date().toISOString().slice(0, 10), isPublic: false });
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/admin/vehicles/${vin}/maintenance`)
      .then(r => setRecords(r.data || []))
      .catch(e => setErr(e.response?.data?.error || 'Failed to load maintenance'))
      .finally(() => setLoading(false));
  }, [api, vin]);

  useEffect(load, [load]);

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/admin/vehicles/${vin}/maintenance`, {
        ...form,
        mileageAtService: Number(form.mileageAtService),
        cost: Math.round(Number(form.cost) * 100),
      });
      setForm({ maintenanceType: 'Other', description: '', mileageAtService: '', performedBy: '', cost: '', performedAt: new Date().toISOString().slice(0, 10), isPublic: false });
      setShowForm(false);
      load();
    } catch (e2) {
      setErr(e2.response?.data?.error || 'Save failed');
    }
  };

  const handleDelete = async (ts) => {
    if (!window.confirm('Delete this maintenance record?')) return;
    try {
      await api.delete(`/admin/vehicles/${vin}/maintenance/${ts}`);
      load();
    } catch (e2) {
      setErr(e2.response?.data?.error || 'Delete failed');
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Maintenance Records</h2>
        <button onClick={() => setShowForm(s => !s)} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition">
          {showForm ? 'Cancel' : '+ Add Record'}
        </button>
      </div>
      {err && <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{err}</div>}

      {showForm && (
        <form onSubmit={handleSave} className="space-y-3 mb-6 border-b border-gray-100 pb-6">
          <select value={form.maintenanceType} onChange={e => setForm(f => ({ ...f, maintenanceType: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
            {MAINTENANCE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <input placeholder="Description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <div className="grid grid-cols-2 gap-3">
            <input type="number" placeholder="Mileage" value={form.mileageAtService} onChange={e => setForm(f => ({ ...f, mileageAtService: e.target.value }))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <input placeholder="Performed by" value={form.performedBy} onChange={e => setForm(f => ({ ...f, performedBy: e.target.value }))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <input type="number" step="0.01" placeholder="Cost ($)" value={form.cost} onChange={e => setForm(f => ({ ...f, cost: e.target.value }))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <input type="date" value={form.performedAt} onChange={e => setForm(f => ({ ...f, performedAt: e.target.value }))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={form.isPublic} onChange={e => setForm(f => ({ ...f, isPublic: e.target.checked }))} />
            Show to renters (public)
          </label>
          <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition">Add Record</button>
        </form>
      )}

      {loading ? (
        <div className="text-sm text-gray-400">Loading…</div>
      ) : records.length === 0 ? (
        <p className="text-sm text-gray-400">No maintenance records.</p>
      ) : (
        <div className="space-y-3">
          {records.map((m, i) => (
            <div key={i} className="border border-gray-100 rounded-lg p-3 text-sm">
              <div className="flex justify-between">
                <span className="font-medium">{m.maintenanceType}</span>
                <div className="flex items-center gap-2">
                  {m.isPublic && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Public</span>}
                  <button onClick={() => handleDelete(m.timestamp)} className="text-xs text-red-500 hover:underline">Delete</button>
                </div>
              </div>
              <p className="text-gray-500 text-xs mt-1">{m.description}</p>
              <p className="text-gray-400 text-xs">{m.mileageAtService?.toLocaleString()} mi · {m.performedBy} · {fmtDate(m.performedAt)} · {fmtMoney(m.cost)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Rental History Panel ─────────────────────────────────────────────────────
function RentalHistoryPanel({ vin }) {
  const api = useApi();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    setLoading(true);
    api.get(`/admin/vehicles/${vin}/bookings`)
      .then(r => setBookings(r.data || []))
      .catch(e => setErr(e.response?.data?.error || 'Failed to load rental history'))
      .finally(() => setLoading(false));
  }, [api, vin]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Rental History</h2>
      {err && <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{err}</div>}
      {loading ? (
        <div className="text-sm text-gray-400">Loading…</div>
      ) : bookings.length === 0 ? (
        <p className="text-sm text-gray-400">No rental history yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200">
              <tr>
                {['Booking', 'Guest', 'Start', 'End', 'Status', 'Total'].map(h => (
                  <th key={h} className="px-2 py-2 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {bookings.map(b => (
                <tr key={b.bookingId} className="hover:bg-gray-50">
                  <td className="px-2 py-2 whitespace-nowrap">
                    <Link to={`/bookings/${b.bookingId}`} className="text-blue-600 hover:underline text-xs">{b.bookingId}</Link>
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap text-xs">{b.guestName || '—'}</td>
                  <td className="px-2 py-2 whitespace-nowrap text-xs">{fmtDate(b.startTime)}</td>
                  <td className="px-2 py-2 whitespace-nowrap text-xs">{fmtDate(b.endTime)}</td>
                  <td className="px-2 py-2 whitespace-nowrap text-xs capitalize">{b.status}</td>
                  <td className="px-2 py-2 whitespace-nowrap text-xs">{fmtMoney(b.totalAmountCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AdminVehicleDetail() {
  const { vin } = useParams();
  const api = useApi();
  const [vehicle, setVehicle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const reload = useCallback(() => {
    setLoading(true);
    api.get(`/admin/vehicles/${vin}`)
      .then(r => setVehicle(r.data))
      .catch(e => setErr(e.response?.data?.error || 'Failed to load vehicle'))
      .finally(() => setLoading(false));
  }, [api, vin]);

  useEffect(reload, [reload]);

  const handleRetire = async () => {
    if (!window.confirm('Retire this vehicle? It will no longer be bookable.')) return;
    try {
      await api.put(`/admin/vehicles/${vin}`, { ...vehicle, status: 'retired' });
      reload();
    } catch (e) {
      setErr(e.response?.data?.error || 'Retire failed');
    }
  };

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <Link to="/vehicles" className="text-sm text-blue-600 hover:underline">← Back to Vehicles</Link>

        {err && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{err}</div>}

        {loading || !vehicle ? (
          <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
        ) : (
          <>
            <HeaderPanel vehicle={vehicle} onRetire={handleRetire} />
            <PhotoGalleryPanel vin={vin} />
            <EditableFieldsPanel vehicle={vehicle} onSaved={reload} />
            <ValuationPanel vehicle={vehicle} onRefreshed={reload} />
            <DriversPanel vehicle={vehicle} />
            <GuestKeysPanel vin={vin} />
            <MaintenancePanel vin={vin} />
            <RentalHistoryPanel vin={vin} />
          </>
        )}
      </div>
    </AdminLayout>
  );
}
