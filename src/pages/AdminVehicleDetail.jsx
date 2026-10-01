/**
 * AdminVehicleDetail.jsx — Full detail/management page for a single vehicle.
 * Route: /admin/vehicles/:vin
 *
 * Organised into tabs; every editable attribute is also rendered read-only via
 * the shared schema in utils/vehicleFields, so nothing is hidden until you
 * click "Edit".
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useApi } from '../context/AuthContext';
import AdminLayout from '../components/AdminNav';
import { VehicleFieldsCard } from '../components/VehicleFields';
import { groupsByIds } from '../utils/vehicleFields';
import { normalisePortalUrl } from '../utils/guestPortal';

const STATUS_COLORS = {
  available:   'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  rented:      'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  maintenance: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  retired:     'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
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
  page_ready:          'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  guest_mode_active:   'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  guest_mode_disabled: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  failed:              'bg-red-200 text-red-900 dark:bg-red-900/40 dark:text-red-200',
};

const GK_STATUS_LABELS = {
  page_ready:          'Portal Ready',
  guest_mode_active:   'Guest Mode Active ✓',
  guest_mode_disabled: 'Access Ended',
  failed:              'Failed',
};

// Module-level so these arrays keep a stable identity across renders.
const OVERVIEW_GROUPS  = groupsByIds(['identity', 'pricing', 'location']);
const ACCESS_GROUPS    = groupsByIds(['access']);
const MILEAGE_GROUPS   = groupsByIds(['odometer']);
const FINANCIAL_GROUPS = groupsByIds(['acquisition']);
const MEDIA_GROUPS     = groupsByIds(['media']);

const TABS = [
  { id: 'overview',    label: 'Overview' },
  { id: 'financials',  label: 'Financials' },
  { id: 'maintenance', label: 'Maintenance' },
  { id: 'access',      label: 'Access & Tesla' },
  { id: 'rentals',     label: 'Rentals' },
  { id: 'photos',      label: 'Photos' },
];

function fmtDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}
function fmtDay(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString(); } catch { return iso; }
}
function fmtMoney(cents) {
  if (cents === undefined || cents === null) return '—';
  return `$${(cents / 100).toFixed(2)}`;
}

// ── Shared panel shells ──────────────────────────────────────────────────────
function Card({ title, description, action, children }) {
  return (
    <section className="bg-white rounded-xl border border-gray-200 dark:bg-gray-800 dark:border-gray-700">
      <header className="flex items-start justify-between gap-4 px-6 py-4 border-b border-gray-100 dark:border-gray-700">
        <div>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{title}</h2>
          {description && <p className="text-xs text-gray-400 mt-0.5 dark:text-gray-500">{description}</p>}
        </div>
        {action}
      </header>
      <div className="p-6">{children}</div>
    </section>
  );
}

function Alert({ kind, children }) {
  if (!children) return null;
  const cls = kind === 'error'
    ? 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-900 dark:text-red-300'
    : 'bg-green-50 border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-900 dark:text-green-300';
  return <div className={`mb-3 p-3 border rounded-lg text-sm ${cls}`}>{children}</div>;
}

function Empty({ children }) {
  return <p className="text-sm text-gray-400 dark:text-gray-500">{children}</p>;
}

const MODAL_INPUT = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100';

/** "Showing N of M · Show more" footer shared by every long list on this page. */
function ShowMore({ shown, total, step, onMore, onLess }) {
  if (total <= step) return null;
  return (
    <div className="flex items-center justify-between pt-3 mt-3 border-t border-gray-100 dark:border-gray-700">
      <span className="text-xs text-gray-400 dark:text-gray-500">Showing {shown} of {total}</span>
      <div className="flex gap-3">
        {shown > step && <button onClick={onLess} className="text-xs text-gray-500 hover:underline dark:text-gray-400">Show less</button>}
        {shown < total && <button onClick={onMore} className="text-xs text-blue-600 hover:underline">Show {Math.min(step, total - shown)} more</button>}
      </div>
    </div>
  );
}

function usePaged(total, step) {
  const [limit, setLimit] = useState(step);
  useEffect(() => { setLimit(step); }, [total, step]);
  return {
    limit,
    pageProps: {
      shown: Math.min(limit, total), total, step,
      onMore: () => setLimit(l => l + step),
      onLess: () => setLimit(step),
    },
  };
}

// ── Update Odometer Modal ────────────────────────────────────────────────────
function UpdateOdometerModal({ vin, currentMiles, onClose, onSaved }) {
  const api = useApi();
  const [miles, setMiles] = useState(currentMiles ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const handleSave = async (force = false) => {
    setSaving(true); setErr('');
    try {
      await api.put(`/admin/vehicles/${vin}/odometer`, { miles: Number(miles), force });
      onSaved();
      onClose();
    } catch (e) {
      if (e.response?.status === 409 && !force) {
        if (window.confirm(`${e.response.data?.error || 'New reading is lower than current value.'}\n\nOverride anyway?`)) {
          return handleSave(true);
        }
      } else {
        setErr(e.response?.data?.error || 'Update failed');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl p-6 w-full max-w-sm dark:bg-gray-800">
        <h3 className="font-semibold text-gray-800 mb-3 dark:text-gray-100">Update Odometer</h3>
        {err && <div className="mb-2 p-2 bg-red-50 text-red-700 text-xs rounded dark:bg-red-900/20">{err}</div>}
        <input type="number" placeholder="Current mileage" value={miles} onChange={e => setMiles(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm dark:border-gray-600" />
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="text-xs text-gray-500 px-3 py-1.5 dark:text-gray-400">Cancel</button>
          <button onClick={() => handleSave(false)} disabled={saving || miles === ''} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Header Panel ─────────────────────────────────────────────────────────────
function HeaderPanel({ vehicle, onRetire, onSaved }) {
  const [showOdometerModal, setShowOdometerModal] = useState(false);

  const stats = [
    { label: 'Daily Rate',   value: fmtMoney(vehicle.dailyRateCents) },
    { label: 'Odometer',     value: vehicle.totalOdometerMiles != null ? `${Number(vehicle.totalOdometerMiles).toLocaleString()} mi` : '—' },
    { label: 'Type',         value: vehicle.vehicleType || '—' },
    { label: 'Source',       value: vehicle.defaultSource || '—' },
    { label: 'Market Value', value: vehicle.otdcheckMarketValue ? `$${vehicle.otdcheckMarketValue.toLocaleString()}` : '—' },
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden dark:bg-gray-800 dark:border-gray-700">
      <div className="p-6 flex flex-col sm:flex-row gap-5">
        {vehicle.imageUrl && (
          <img src={vehicle.imageUrl} alt={vehicle.model}
            className="w-full sm:w-48 h-32 object-cover rounded-lg border border-gray-100 shrink-0 dark:border-gray-700" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {vehicle.year} {vehicle.make} {vehicle.model}
              </h1>
              <p className="text-xs text-gray-400 mt-1 font-mono dark:text-gray-500">
                {vehicle.vin}{vehicle.licensePlate ? ` · ${vehicle.licensePlate}` : ''}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[vehicle.status] || ''}`}>
                {STATUS_LABELS[vehicle.status] || vehicle.status}
              </span>
              <button onClick={() => setShowOdometerModal(true)}
                className="text-xs border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">
                Update Odometer
              </button>
              {vehicle.status !== 'retired' && (
                <button onClick={onRetire}
                  className="text-xs border border-red-300 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50 transition dark:border-red-900 dark:hover:bg-red-900/20">
                  Retire
                </button>
              )}
            </div>
          </div>

          <dl className="mt-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {stats.map(s => (
              <div key={s.label}>
                <dt className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500">{s.label}</dt>
                <dd className="text-sm font-medium text-gray-800 capitalize dark:text-gray-200">{s.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {showOdometerModal && (
        <UpdateOdometerModal
          vin={vehicle.vin}
          currentMiles={vehicle.totalOdometerMiles}
          onClose={() => setShowOdometerModal(false)}
          onSaved={onSaved}
        />
      )}
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

  const { limit, pageProps } = usePaged(photos.length, 12);

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
    <Card
      title={`Photo Gallery${photos.length ? ` (${photos.length})` : ''}`}
      action={
        <label className="shrink-0 text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg cursor-pointer hover:bg-blue-700 transition">
          {uploading ? 'Uploading…' : '+ Add Photo'}
          <input type="file" accept="image/*" className="hidden" onChange={handleUpload} disabled={uploading} />
        </label>
      }
    >
      <Alert kind="error">{err}</Alert>
      {loading ? (
        <Empty>Loading…</Empty>
      ) : photos.length === 0 ? (
        <Empty>No photos uploaded yet.</Empty>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {photos.slice(0, limit).map(p => (
              <div key={p.s3_key} className="relative group">
                <img src={p.url} alt={p.filename} className="w-full h-28 object-cover rounded-lg border border-gray-100 dark:border-gray-700" />
                <button
                  onClick={() => handleDelete(p.filename)}
                  className="absolute top-1 right-1 bg-red-600 text-white rounded-full w-6 h-6 text-xs opacity-0 group-hover:opacity-100 transition"
                  title="Delete photo"
                >×</button>
              </div>
            ))}
          </div>
          <ShowMore {...pageProps} />
        </>
      )}
    </Card>
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
    <Card
      title="Market Valuation"
      description="Auto-refreshed monthly via OTDcheck."
      action={
        <button onClick={handleRefresh} disabled={refreshing}
          className="shrink-0 text-xs border border-indigo-300 text-indigo-700 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition disabled:opacity-50 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-900/20">
          {refreshing ? 'Refreshing…' : 'Refresh Value'}
        </button>
      }
    >
      <Alert kind="success">{msg}</Alert>
      <Alert kind="error">{err}</Alert>

      {(vehicle.otdcheckMarketValue || vehicle.otdcheckLastRefreshed) ? (
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <dt className="text-gray-400 text-xs dark:text-gray-500">Market Value</dt>
            <dd className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {vehicle.otdcheckMarketValue ? `$${vehicle.otdcheckMarketValue.toLocaleString()}` : '—'}
            </dd>
            {vehicle.otdcheckMarketValueSource && vehicle.otdcheckMarketValueSource !== 'fair_price' && (
              <p className="text-[11px] text-gray-400 dark:text-gray-500">
                {vehicle.otdcheckMarketValueSource === 'listing' ? 'listing price'
                  : vehicle.otdcheckMarketValueSource === 'wholesale' ? 'wholesale est.' : 'depreciation est.'}
              </p>
            )}
          </div>
          <div>
            <dt className="text-gray-400 text-xs dark:text-gray-500">Retail Range</dt>
            <dd className="text-gray-800 dark:text-gray-200">
              {vehicle.otdcheckRetailMin && vehicle.otdcheckRetailMax
                ? `$${vehicle.otdcheckRetailMin.toLocaleString()} – $${vehicle.otdcheckRetailMax.toLocaleString()}`
                : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-gray-400 text-xs dark:text-gray-500">Open Recalls</dt>
            <dd className={vehicle.otdcheckRecallCount > 0 ? 'font-medium text-red-600 dark:text-red-400' : 'text-gray-800 dark:text-gray-200'}>
              {vehicle.otdcheckRecallCount ?? 0}
            </dd>
          </div>
          <div>
            <dt className="text-gray-400 text-xs dark:text-gray-500">Last Refreshed</dt>
            <dd className="text-gray-800 dark:text-gray-200">{fmtDate(vehicle.otdcheckLastRefreshed)}</dd>
          </div>
        </dl>
      ) : (
        <Empty>No valuation data yet — auto-refreshes monthly via OTDcheck.</Empty>
      )}
    </Card>
  );
}

// ── Vehicle Controls Panel ───────────────────────────────────────────────────
const VEHICLE_COMMANDS = [
  { command: 'door_unlock',  label: '🔓 Unlock',       cls: 'bg-blue-600 text-white hover:bg-blue-700', confirm: 'Unlock the vehicle now?' },
  { command: 'door_lock',    label: '🔒 Lock',         cls: 'bg-blue-600 text-white hover:bg-blue-700' },
  { command: 'honk_horn',    label: '📯 Honk Horn',    cls: 'border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700' },
  { command: 'flash_lights', label: '💡 Flash Lights', cls: 'border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700' },
];

function VehicleControlsPanel({ vehicle }) {
  const api = useApi();
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  if (!vehicle.teslaEnabled) return null;

  const send = async ({ command, confirm }) => {
    if (confirm && !window.confirm(confirm)) return;
    setBusy(command); setMsg(''); setErr('');
    try {
      const r = await api.post(`/admin/vehicles/${vehicle.vin}/command`, { command });
      setMsg(`✓ ${r.data?.message || `${command} sent`}`);
    } catch (e) {
      setErr(e.response?.data?.error || e.message || `${command} failed`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card title="Vehicle Controls"
      description="Sent directly to the vehicle regardless of booking status. A sleeping car may take ~20s to wake.">
      <Alert kind="success">{msg}</Alert>
      <Alert kind="error">{err}</Alert>
      <div className="flex flex-wrap gap-2">
        {VEHICLE_COMMANDS.map(c => (
          <button key={c.command} onClick={() => send(c)} disabled={!!busy}
            className={`px-3 py-1.5 text-sm rounded-lg transition disabled:opacity-50 ${c.cls}`}>
            {busy === c.command ? 'Working…' : c.label}
          </button>
        ))}
      </div>
    </Card>
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

  const teslaEnabled = !!vehicle.teslaEnabled;

  const load = useCallback(() => {
    if (!teslaEnabled) { setLoading(false); return; }
    setLoading(true);
    api.get(`/admin/vehicles/${vehicle.vin}/drivers`)
      .then(r => setDrivers(r.data?.drivers || []))
      .catch(e => setErr(e.response?.data?.error || 'Failed to load drivers'))
      .finally(() => setLoading(false));
  }, [api, vehicle.vin, teslaEnabled]);

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

  if (!teslaEnabled) {
    return <Card title="Drivers"><Empty>Not applicable — this vehicle is not Tesla-enabled.</Empty></Card>;
  }

  return (
    <Card
      title={`Drivers (${drivers.length})`}
      action={
        <button onClick={handleRevoke} disabled={revoking}
          className="shrink-0 text-xs border border-purple-300 text-purple-700 px-3 py-1.5 rounded-lg hover:bg-purple-50 transition disabled:opacity-50 dark:border-purple-800 dark:text-purple-300 dark:hover:bg-purple-900/20">
          🔑 Revoke Drivers
        </button>
      }
    >
      <Alert kind="success">{msg}</Alert>
      <Alert kind="error">{err}</Alert>
      {loading ? (
        <Empty>Loading…</Empty>
      ) : drivers.length === 0 ? (
        <Empty>No drivers currently listed.</Empty>
      ) : (
        <ul className="space-y-2 text-sm">
          {drivers.map((d, i) => (
            <li key={i} className="border border-gray-100 rounded-lg px-3 py-2 dark:border-gray-700">
              {d.driverFirstName || d.firstName || ''} {d.driverLastName || d.lastName || ''} {d.publicKey ? <span className="text-gray-400 text-xs ml-1 dark:text-gray-500">(key holder)</span> : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ── Guest Mode & Guest Keys Panel ────────────────────────────────────────────
function GuestKeyRow({ k, acting, onAction }) {
  const [open, setOpen] = useState(false);
  const portalUrl = normalisePortalUrl(k.guestAccessUrl || k.guestKeyLink);

  const guestName  = k.guestName || k.turoGuestName || '';
  const guestEmail = k.guestEmail || k.turoGuestEmail || '';
  const createdAt  = k.guestKeyCreatedAt || k.guestAccessCreatedAt || k.createdAt;
  const enabledAt  = k.guestModeEnabledAt || k.guestKeyActivatedAt;
  const disabledAt = k.guestModeDisabledAt || k.guestKeyRevokedAt;
  const erasedAt   = k.eraseUserDataAt;
  const eraseLabel = erasedAt
    ? `✓ ${fmtDate(erasedAt)}`
    : (k.eraseUserDataStatus || 'Not run');
  const driversRevokedAt = k.driversRevokedAt;
  const driversLabel = driversRevokedAt
    ? `✓ ${fmtDate(driversRevokedAt)}`
    : k.driversRevokedStatus === 'failed'
      ? 'Failed'
      : k.guestKeyRevokeAt
        ? `Scheduled ${fmtDate(k.guestKeyRevokeAt)}`
        : 'Not run';

  return (
    <div className="border border-gray-100 rounded-lg dark:border-gray-700">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-800 truncate dark:text-gray-200">
            {guestName || guestEmail || 'Guest'}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500">{fmtDay(k.startTime)} → {fmtDay(k.endTime)}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${GK_STATUS_COLORS[k.guestKeyStatus] || 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
            {GK_STATUS_LABELS[k.guestKeyStatus] || k.guestKeyStatus || '—'}
          </span>
          <span className="text-gray-400 text-xs">{open ? '▾' : '▸'}</span>
        </div>
      </button>

      {open && (
        <div className="px-3 pb-3 pt-3 border-t border-gray-100 dark:border-gray-700">
          <p className="text-xs mb-2">
            <Link to={`/bookings/${k.bookingId}`} className="text-blue-600 hover:underline font-mono">{k.bookingId}</Link>
          </p>
          {guestEmail && (
            <p className="text-xs text-gray-400 mb-2 dark:text-gray-500">{guestEmail}</p>
          )}
          <dl className="grid grid-cols-2 gap-2 text-xs text-gray-500 mb-3 dark:text-gray-400">
            <div>Portal Created: {fmtDate(createdAt)}</div>
            <div>Guest Mode Enabled: {fmtDate(enabledAt)}</div>
            <div>Guest Mode Disabled: {fmtDate(disabledAt)}</div>
            <div>Driver Access Removed: {driversLabel}</div>
            <div>Erase Data: {eraseLabel}</div>
          </dl>
          <div className="flex flex-wrap gap-2">
            {portalUrl && (
              <a href={portalUrl} target="_blank" rel="noopener noreferrer"
                className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 transition">Open Portal ↗</a>
            )}
            <button disabled={acting}
              onClick={() => window.confirm('Enable Guest Mode now?') && onAction(k.bookingId, 'enable-guest-mode')}
              className="text-xs border border-green-300 text-green-700 px-2 py-1 rounded hover:bg-green-50 transition disabled:opacity-50 dark:border-green-800 dark:text-green-300 dark:hover:bg-green-900/20">Enable</button>
            <button disabled={acting}
              onClick={() => window.confirm('Disable Guest Mode now?') && onAction(k.bookingId, 'disable-guest-mode')}
              className="text-xs border border-orange-300 text-orange-700 px-2 py-1 rounded hover:bg-orange-50 transition disabled:opacity-50 dark:border-orange-800 dark:text-orange-300 dark:hover:bg-orange-900/20">Disable</button>
            <button disabled={acting}
              onClick={() => window.confirm('Remove all guest driver access from this vehicle?') && onAction(k.bookingId, 'revoke-drivers')}
              className="text-xs border border-purple-300 text-purple-700 px-2 py-1 rounded hover:bg-purple-50 transition disabled:opacity-50 dark:border-purple-800 dark:text-purple-300 dark:hover:bg-purple-900/20">Remove Driver Access</button>
            <button disabled={acting}
              onClick={() => window.confirm('Erase renter data from vehicle?') && onAction(k.bookingId, 'erase-user-data')}
              className="text-xs border border-red-300 text-red-700 px-2 py-1 rounded hover:bg-red-50 transition disabled:opacity-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/20">Erase Data</button>
          </div>
        </div>
      )}
    </div>
  );
}

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
      setMsg(`✓ ${action.replace(/-/g, ' ')} completed`);
      load();
    } catch (e) {
      setErr(e.response?.data?.error || `${action} failed`);
    } finally {
      setActingId(null);
    }
  };

  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const started = k => (k.startTime ? new Date(k.startTime).getTime() : 0);
    return {
      upcoming: keys.filter(k => started(k) >= now).sort((a, b) => started(a) - started(b)),
      past:     keys.filter(k => started(k) < now).sort((a, b) => started(b) - started(a)),
    };
  }, [keys]);

  const { limit, pageProps } = usePaged(past.length, 5);

  return (
    <Card
      title="Guest Mode History"
      description={<>Bluetooth pairing windows for renters. Looking for Tesla driver invite links? <Link to="/driver-keys" className="text-blue-600 hover:underline">Go to Guest Keys →</Link></>}
    >
      <Alert kind="success">{msg}</Alert>
      <Alert kind="error">{err}</Alert>
      {loading ? (
        <Empty>Loading…</Empty>
      ) : keys.length === 0 ? (
        <Empty>No guest keys for this vehicle.</Empty>
      ) : (
        <div className="space-y-5">
          {upcoming.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase mb-2 dark:text-gray-500">Upcoming ({upcoming.length})</p>
              <div className="space-y-2">
                {upcoming.map(k => (
                  <GuestKeyRow key={k.bookingId} k={k} acting={actingId === k.bookingId} onAction={callAction} />
                ))}
              </div>
            </div>
          )}
          {past.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase mb-2 dark:text-gray-500">Past ({past.length})</p>
              <div className="space-y-2">
                {past.slice(0, limit).map(k => (
                  <GuestKeyRow key={k.bookingId} k={k} acting={actingId === k.bookingId} onAction={callAction} />
                ))}
              </div>
              <ShowMore {...pageProps} />
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

const SCHED_STATUS_META = {
  red:    { label: 'Overdue',   dot: 'bg-red-500',    row: 'bg-red-50 dark:bg-red-900/20' },
  yellow: { label: 'Due Soon',  dot: 'bg-yellow-400',  row: 'bg-yellow-50 dark:bg-yellow-900/20' },
  green:  { label: 'OK',        dot: 'bg-green-500',   row: '' },
  gray:   { label: 'As Needed', dot: 'bg-gray-300',    row: '' },
};

function SchedDot({ status }) {
  const meta = SCHED_STATUS_META[status] || SCHED_STATUS_META.gray;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium">
      <span className={`w-2.5 h-2.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

function SchedMarkDoneModal({ vin, item, onClose, onSaved }) {
  const api = useApi();
  const [mileage, setMileage] = useState('');
  const [performedAt, setPerformedAt] = useState(new Date().toISOString().slice(0, 10));
  const [cost, setCost] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const handleSave = async () => {
    setSaving(true); setErr('');
    try {
      await api.post(`/admin/vehicles/${vin}/maintenance`, {
        maintenanceType: item.label,
        description: notes,
        mileageAtService: mileage ? Number(mileage) : undefined,
        performedAt,
        cost: cost ? Math.round(Number(cost) * 100) : undefined,
        itemKey: item.itemKey,
      });
      onSaved();
      onClose();
    } catch (e) {
      setErr(e.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl p-6 w-full max-w-md dark:bg-gray-800">
        <h3 className="font-semibold text-gray-800 mb-3 dark:text-gray-100">Mark Done: {item.label}</h3>
        {err && <div className="mb-2 p-2 bg-red-50 text-red-700 text-xs rounded dark:bg-red-900/20">{err}</div>}
        <div className="space-y-2">
          <input type="number" placeholder="Mileage" value={mileage} onChange={e => setMileage(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm dark:border-gray-600" />
          <input type="date" value={performedAt} onChange={e => setPerformedAt(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm dark:border-gray-600" />
          <input type="number" step="0.01" placeholder="Cost ($, optional)" value={cost} onChange={e => setCost(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm dark:border-gray-600" />
          <input placeholder="Notes (optional)" value={notes} onChange={e => setNotes(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm dark:border-gray-600" />
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="text-xs text-gray-500 px-3 py-1.5 dark:text-gray-400">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function SchedSnoozeModal({ vin, item, onClose, onSaved }) {
  const api = useApi();
  const [extraMiles, setExtraMiles] = useState('');
  const [newDate, setNewDate] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const handleSave = async () => {
    setSaving(true); setErr('');
    try {
      const body = { overrideNote: note };
      if (extraMiles) {
        body.manualOverrideMiles = (Number(item.lastPerformedMileage) || 0) + Number(extraMiles);
      }
      if (newDate) body.manualOverrideDate = newDate;
      await api.put(`/admin/vehicles/${vin}/maintenance-schedule/${item.itemKey}`, body);
      onSaved();
      onClose();
    } catch (e) {
      setErr(e.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl p-6 w-full max-w-md dark:bg-gray-800">
        <h3 className="font-semibold text-gray-800 mb-3 dark:text-gray-100">Snooze: {item.label}</h3>
        {err && <div className="mb-2 p-2 bg-red-50 text-red-700 text-xs rounded dark:bg-red-900/20">{err}</div>}
        <div className="space-y-2">
          <input type="number" placeholder="Push out by extra miles" value={extraMiles} onChange={e => setExtraMiles(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm dark:border-gray-600" />
          <input type="date" placeholder="Or set new due date" value={newDate} onChange={e => setNewDate(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm dark:border-gray-600" />
          <input placeholder="Note (optional)" value={note} onChange={e => setNote(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm dark:border-gray-600" />
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="text-xs text-gray-500 px-3 py-1.5 dark:text-gray-400">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function SchedAddCustomModal({ vin, onClose, onSaved }) {
  const api = useApi();
  const [label, setLabel] = useState('');
  const [intervalMiles, setIntervalMiles] = useState('');
  const [intervalMonths, setIntervalMonths] = useState('');
  const [asNeeded, setAsNeeded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const handleSave = async () => {
    if (!label.trim()) { setErr('Label required'); return; }
    setSaving(true); setErr('');
    try {
      await api.post(`/admin/vehicles/${vin}/maintenance-schedule`, {
        label, category: 'custom', asNeeded,
        intervalMiles: intervalMiles ? Number(intervalMiles) : undefined,
        intervalMonths: intervalMonths ? Number(intervalMonths) : undefined,
      });
      onSaved();
      onClose();
    } catch (e) {
      setErr(e.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl p-6 w-full max-w-md dark:bg-gray-800">
        <h3 className="font-semibold text-gray-800 mb-3 dark:text-gray-100">Add Custom Maintenance Item</h3>
        {err && <div className="mb-2 p-2 bg-red-50 text-red-700 text-xs rounded dark:bg-red-900/20">{err}</div>}
        <div className="space-y-2">
          <input placeholder="Label" value={label} onChange={e => setLabel(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm dark:border-gray-600" />
          <input type="number" placeholder="Interval (miles)" value={intervalMiles} onChange={e => setIntervalMiles(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm dark:border-gray-600" />
          <input type="number" placeholder="Interval (months)" value={intervalMonths} onChange={e => setIntervalMonths(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm dark:border-gray-600" />
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input type="checkbox" checked={asNeeded} onChange={e => setAsNeeded(e.target.checked)} />
            As-needed (no fixed schedule)
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="text-xs text-gray-500 px-3 py-1.5 dark:text-gray-400">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Saving…' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Maintenance Schedule Panel ───────────────────────────────────────────────
function MaintenanceSchedulePanel({ vin }) {
  const api = useApi();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [markDoneItem, setMarkDoneItem] = useState(null);
  const [snoozeItem, setSnoozeItem] = useState(null);
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState({});
  const [showInactive, setShowInactive] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/admin/vehicles/${vin}/maintenance-schedule`)
      .then(r => setItems(r.data || []))
      .catch(e => setErr(e.response?.data?.error || 'Failed to load schedule'))
      .finally(() => setLoading(false));
  }, [api, vin]);

  useEffect(load, [load]);

  const order = { red: 0, yellow: 1, green: 2, gray: 3 };
  const activeRows = [...items].filter(i => i.active !== false).sort((a, b) => (order[a.status] ?? 4) - (order[b.status] ?? 4));
  const visibleRows = statusFilter === 'all' ? activeRows : activeRows.filter(i => i.status === statusFilter);
  const inactiveRows = items.filter(i => i.active === false);
  const inactiveByCategory = inactiveRows.reduce((acc, i) => {
    const cat = i.category || 'Other';
    (acc[cat] = acc[cat] || []).push(i);
    return acc;
  }, {});

  const counts = {
    all:    activeRows.length,
    red:    activeRows.filter(i => i.status === 'red').length,
    yellow: activeRows.filter(i => i.status === 'yellow').length,
    green:  activeRows.filter(i => i.status === 'green').length,
    gray:   activeRows.filter(i => i.status === 'gray').length,
  };

  const toggleCategory = (cat) => setExpandedCategories(s => ({ ...s, [cat]: !s[cat] }));

  const handleDeactivate = async (item) => {
    if (!window.confirm(`Remove "${item.label}" from schedule?`)) return;
    try {
      await api.delete(`/admin/vehicles/${vin}/maintenance-schedule/${item.itemKey}`);
      load();
    } catch (e) {
      setErr(e.response?.data?.error || 'Delete failed');
    }
  };

  const handleActivate = async (item) => {
    try {
      await api.put(`/admin/vehicles/${vin}/maintenance-schedule/${item.itemKey}`, { active: true });
      load();
    } catch (e) {
      setErr(e.response?.data?.error || 'Activate failed');
    }
  };

  return (
    <Card
      title="Maintenance Schedule"
      action={
        <button onClick={() => setShowAddCustom(true)}
          className="shrink-0 text-xs border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">
          + Add Custom Item
        </button>
      }
    >
      <Alert kind="error">{err}</Alert>

      {activeRows.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {[['all', 'All'], ['red', 'Overdue'], ['yellow', 'Due Soon'], ['green', 'OK'], ['gray', 'As Needed']].map(([key, label]) => (
            <button key={key} onClick={() => setStatusFilter(key)} disabled={key !== 'all' && counts[key] === 0}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition disabled:opacity-40 ${
                statusFilter === key
                  ? 'bg-gray-800 text-white border-gray-800 dark:bg-gray-200 dark:text-gray-900 dark:border-gray-200'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50 dark:bg-gray-900/40 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700'
              }`}>
              {label} <span className="opacity-60">{counts[key]}</span>
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <Empty>Loading…</Empty>
      ) : activeRows.length === 0 ? (
        <Empty>No items being tracked yet — see suggestions below.</Empty>
      ) : visibleRows.length === 0 ? (
        <Empty>No items match this filter.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 dark:border-gray-700">
              <tr>
                {['Status', 'Item', 'Last Performed', 'Due', 'Total Cost', ''].map((h, i) => (
                  <th key={i} className="px-2 py-2 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap dark:text-gray-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {visibleRows.map(item => (
                <tr key={item.itemKey} className={SCHED_STATUS_META[item.status]?.row || ''}>
                  <td className="px-2 py-2 whitespace-nowrap"><SchedDot status={item.status} /></td>
                  <td className="px-2 py-2">
                    <span className="text-gray-800 dark:text-gray-200">{item.label}</span>
                    <span className="ml-2 text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded dark:bg-gray-700 dark:text-gray-400">{item.category}</span>
                    {item.resetsItemKeys && item.resetsItemKeys.length > 0 && (
                      <span className="ml-1 text-[10px] bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded dark:bg-purple-900/30 dark:text-purple-300" title={`Resets: ${item.resetsItemKeys.join(', ')}`}>
                        🔄 auto-resets
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                    {item.lastPerformedAt ? fmtDay(item.lastPerformedAt) : '—'}
                    {item.lastPerformedMileage ? ` · ${Number(item.lastPerformedMileage).toLocaleString()} mi` : ''}
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                    {item.dueDate || '—'}{item.dueMiles ? ` / ${Number(item.dueMiles).toLocaleString()} mi` : ''}
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap text-xs text-gray-600 dark:text-gray-300">{fmtMoney(item.totalCostCents)}</td>
                  <td className="px-2 py-2 whitespace-nowrap text-xs text-right space-x-2">
                    <button onClick={() => setMarkDoneItem(item)} className="text-blue-600 hover:underline">Mark Done</button>
                    {!item.asNeeded && <button onClick={() => setSnoozeItem(item)} className="text-yellow-600 hover:underline">Snooze</button>}
                    <button onClick={() => handleDeactivate(item)} className="text-red-500 hover:underline">{item.isCustom ? 'Delete' : 'Stop'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {inactiveRows.length > 0 && (
        <div className="mt-6 border-t border-gray-100 pt-4 dark:border-gray-700">
          <button onClick={() => setShowInactive(s => !s)} className="text-xs font-semibold text-gray-500 uppercase tracking-wide hover:text-gray-700 dark:hover:text-gray-200 dark:text-gray-300 dark:text-gray-400">
            {showInactive ? '▾' : '▸'} Suggested Items — Not Tracked ({inactiveRows.length})
          </button>
          {showInactive && (
            <div className="mt-3 space-y-2">
              {Object.entries(inactiveByCategory).map(([cat, catItems]) => (
                <div key={cat} className="border border-gray-100 rounded-lg dark:border-gray-700">
                  <button onClick={() => toggleCategory(cat)}
                    className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-900/40 dark:text-gray-300">
                    <span>{expandedCategories[cat] ? '▾' : '▸'} {cat} ({catItems.length})</span>
                  </button>
                  {expandedCategories[cat] && (
                    <div className="divide-y divide-gray-50">
                      {catItems.map(item => (
                        <div key={item.itemKey} className="flex items-center justify-between px-3 py-2 text-xs">
                          <div>
                            <span className="text-gray-700 dark:text-gray-300">{item.label}</span>
                            <span className="text-gray-400 ml-2 dark:text-gray-500">
                              {item.asNeeded ? 'As needed' : `${item.intervalMiles ? `${item.intervalMiles.toLocaleString()} mi` : ''}${item.intervalMiles && item.intervalMonths ? ' / ' : ''}${item.intervalMonths ? `${item.intervalMonths} mo` : ''}`}
                            </span>
                          </div>
                          <button onClick={() => handleActivate(item)} className="text-blue-600 hover:underline">
                            {item.isCustom ? 'Reactivate' : 'Start Tracking'}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {markDoneItem && <SchedMarkDoneModal vin={vin} item={markDoneItem} onClose={() => setMarkDoneItem(null)} onSaved={load} />}
      {snoozeItem && <SchedSnoozeModal vin={vin} item={snoozeItem} onClose={() => setSnoozeItem(null)} onSaved={load} />}
      {showAddCustom && <SchedAddCustomModal vin={vin} onClose={() => setShowAddCustom(false)} onSaved={load} />}
    </Card>
  );
}


const MAINT_SORT_OPTIONS = [
  { value: 'date_desc', label: 'Date (Newest First)' },
  { value: 'date_asc',  label: 'Date (Oldest First)' },
  { value: 'cost_desc', label: 'Cost (Highest First)' },
  { value: 'cost_asc',  label: 'Cost (Lowest First)' },
  { value: 'mileage_desc', label: 'Mileage (Highest First)' },
  { value: 'mileage_asc',  label: 'Mileage (Lowest First)' },
];

const BLANK_MAINT_FORM = {
  maintenanceType: 'Other', description: '', mileageAtService: '', performedBy: '',
  cost: '', performedAt: new Date().toISOString().slice(0, 10), isPublic: false,
};

// ── Maintenance Records Panel ────────────────────────────────────────────────
function MaintenancePanel({ vin }) {
  const api = useApi();

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [form, setForm] = useState(BLANK_MAINT_FORM);
  const [showForm, setShowForm] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Filters
  const [searchText, setSearchText]   = useState('');
  const [typeFilter, setTypeFilter]   = useState('all');
  const [startDate, setStartDate]     = useState('');
  const [endDate, setEndDate]         = useState('');
  const [sortBy, setSortBy]           = useState('date_desc');
  const [publicOnly, setPublicOnly]   = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/admin/vehicles/${vin}/maintenance`)
      .then(r => setRecords(r.data || []))
      .catch(e => setErr(e.response?.data?.error || 'Failed to load maintenance'))
      .finally(() => setLoading(false));
  }, [api, vin]);

  useEffect(load, [load]);

  const availableTypes = Array.from(new Set(records.map(r => r.maintenanceType).filter(Boolean))).sort();

  const filteredRecords = useMemo(() => records
    .filter(m => {
      if (typeFilter !== 'all' && m.maintenanceType !== typeFilter) return false;
      if (publicOnly && !m.isPublic) return false;
      if (startDate && (m.performedAt || '') < startDate) return false;
      if (endDate && (m.performedAt || '') > endDate) return false;
      if (searchText.trim()) {
        const q = searchText.trim().toLowerCase();
        const hay = `${m.maintenanceType || ''} ${m.description || ''} ${m.notes || ''} ${m.performedBy || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'date_asc':    return (a.performedAt || '').localeCompare(b.performedAt || '');
        case 'cost_desc':   return (b.cost || 0) - (a.cost || 0);
        case 'cost_asc':    return (a.cost || 0) - (b.cost || 0);
        case 'mileage_desc':return (b.mileageAtService || 0) - (a.mileageAtService || 0);
        case 'mileage_asc': return (a.mileageAtService || 0) - (b.mileageAtService || 0);
        case 'date_desc':
        default:            return (b.performedAt || '').localeCompare(a.performedAt || '');
      }
    }),
  [records, typeFilter, publicOnly, startDate, endDate, searchText, sortBy]);

  const { limit, pageProps } = usePaged(filteredRecords.length, 10);

  const totalSpendCents = records.reduce((s, m) => s + (m.cost || 0), 0);
  const activeFilterCount =
    (searchText ? 1 : 0) + (typeFilter !== 'all' ? 1 : 0) + (startDate ? 1 : 0) + (endDate ? 1 : 0) + (publicOnly ? 1 : 0);

  const resetFilters = () => {
    setSearchText(''); setTypeFilter('all'); setStartDate(''); setEndDate('');
    setSortBy('date_desc'); setPublicOnly(false);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/admin/vehicles/${vin}/maintenance`, {
        ...form,
        mileageAtService: Number(form.mileageAtService),
        cost: Math.round(Number(form.cost) * 100),
      });
      setForm(BLANK_MAINT_FORM);
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
    <Card
      title={`Maintenance Records${records.length ? ` (${records.length})` : ''}`}
      description={records.length ? `Lifetime spend: ${fmtMoney(totalSpendCents)}` : undefined}
      action={
        <div className="flex shrink-0 gap-2">
          {records.length > 0 && (
            <button onClick={() => setShowFilters(s => !s)}
              className="text-xs border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">
              Filters{activeFilterCount ? ` (${activeFilterCount})` : ''}
            </button>
          )}
          <button onClick={() => setShowForm(s => !s)} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition">
            {showForm ? 'Cancel' : '+ Add Record'}
          </button>
        </div>
      }
    >
      <Alert kind="error">{err}</Alert>

      {showForm && (
        <form onSubmit={handleSave} className="space-y-3 mb-6 border-b border-gray-100 pb-6 dark:border-gray-700">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <select value={form.maintenanceType} onChange={e => setForm(f => ({ ...f, maintenanceType: e.target.value }))} className={MODAL_INPUT}>
              {MAINTENANCE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <input type="date" value={form.performedAt} onChange={e => setForm(f => ({ ...f, performedAt: e.target.value }))} className={MODAL_INPUT} />
            <input placeholder="Description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className={`${MODAL_INPUT} sm:col-span-2`} />
            <input type="number" placeholder="Mileage" value={form.mileageAtService} onChange={e => setForm(f => ({ ...f, mileageAtService: e.target.value }))} className={MODAL_INPUT} />
            <input placeholder="Performed by" value={form.performedBy} onChange={e => setForm(f => ({ ...f, performedBy: e.target.value }))} className={MODAL_INPUT} />
            <input type="number" step="0.01" placeholder="Cost ($)" value={form.cost} onChange={e => setForm(f => ({ ...f, cost: e.target.value }))} className={MODAL_INPUT} />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input type="checkbox" checked={form.isPublic} onChange={e => setForm(f => ({ ...f, isPublic: e.target.checked }))} />
            Show to renters (public)
          </label>
          <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition">Add Record</button>
        </form>
      )}

      {showFilters && records.length > 0 && (
        <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-2 items-end bg-gray-50 rounded-lg p-3 dark:bg-gray-900/40">
          <div className="col-span-2">
            <label className="block text-[10px] font-medium text-gray-500 mb-1 dark:text-gray-400">Search</label>
            <input type="text" placeholder="Description, notes, mechanic…" value={searchText}
              onChange={e => setSearchText(e.target.value)}
              className="w-full border border-gray-300 rounded px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-gray-500 mb-1 dark:text-gray-400">Type</label>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
              className="w-full border border-gray-300 rounded px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100">
              <option value="all">All Types</option>
              {availableTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-medium text-gray-500 mb-1 dark:text-gray-400">From</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="w-full border border-gray-300 rounded px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-gray-500 mb-1 dark:text-gray-400">To</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="w-full border border-gray-300 rounded px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-gray-500 mb-1 dark:text-gray-400">Sort By</label>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)}
              className="w-full border border-gray-300 rounded px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100">
              {MAINT_SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="col-span-2 md:col-span-6 flex items-center justify-between mt-1">
            <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
              <input type="checkbox" checked={publicOnly} onChange={e => setPublicOnly(e.target.checked)} />
              Public only
            </label>
            <button onClick={resetFilters} className="text-xs text-blue-600 hover:underline">Reset Filters</button>
          </div>
        </div>
      )}

      {loading ? (
        <Empty>Loading…</Empty>
      ) : records.length === 0 ? (
        <Empty>No maintenance records.</Empty>
      ) : filteredRecords.length === 0 ? (
        <Empty>No records match the current filters.</Empty>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 dark:border-gray-700">
                <tr>
                  {['Date', 'Type', 'Description', 'Mileage', 'By', 'Cost', ''].map((h, i) => (
                    <th key={i} className="px-2 py-2 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap dark:text-gray-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {filteredRecords.slice(0, limit).map((m, i) => (
                  <tr key={m.timestamp || i}>
                    <td className="px-2 py-2 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">{fmtDay(m.performedAt)}</td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      <span className="text-gray-800 dark:text-gray-200">{m.maintenanceType}</span>
                      {m.isPublic && <span className="ml-1.5 text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded dark:bg-green-900/30 dark:text-green-300">Public</span>}
                      {m.linkedTaxExpenseTs && <span className="ml-1 text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded dark:bg-purple-900/30 dark:text-purple-300" title="Linked tax expense">🧾</span>}
                    </td>
                    <td className="px-2 py-2 text-xs text-gray-600 max-w-xs truncate dark:text-gray-300" title={m.description}>{m.description || '—'}</td>
                    <td className="px-2 py-2 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">{m.mileageAtService ? `${m.mileageAtService.toLocaleString()} mi` : '—'}</td>
                    <td className="px-2 py-2 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">{m.performedBy || '—'}</td>
                    <td className="px-2 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-300">{fmtMoney(m.cost)}</td>
                    <td className="px-2 py-2 whitespace-nowrap text-right">
                      <button onClick={() => handleDelete(m.timestamp)} className="text-xs text-red-500 hover:underline">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ShowMore {...pageProps} />
        </>
      )}
    </Card>
  );
}

// ── Rental History Panel ─────────────────────────────────────────────────────
function RentalHistoryPanel({ vin }) {
  const api = useApi();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    setLoading(true);
    api.get(`/admin/vehicles/${vin}/bookings`)
      .then(r => setBookings(r.data || []))
      .catch(e => setErr(e.response?.data?.error || 'Failed to load rental history'))
      .finally(() => setLoading(false));
  }, [api, vin]);

  const statuses = useMemo(
    () => Array.from(new Set(bookings.map(b => b.status).filter(Boolean))).sort(),
    [bookings],
  );

  const rows = useMemo(() => {
    const filtered = statusFilter === 'all' ? bookings : bookings.filter(b => b.status === statusFilter);
    return [...filtered].sort((a, b) => new Date(b.startTime || 0) - new Date(a.startTime || 0));
  }, [bookings, statusFilter]);

  const { limit, pageProps } = usePaged(rows.length, 10);
  const totalRevenue = bookings.reduce((s, b) => s + (b.totalAmountCents || 0), 0);

  return (
    <Card
      title={`Rental History${bookings.length ? ` (${bookings.length})` : ''}`}
      description={bookings.length ? `Gross booking value: ${fmtMoney(totalRevenue)}` : undefined}
      action={statuses.length > 1 ? (
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="shrink-0 text-xs border border-gray-300 rounded-lg px-2 py-1.5 capitalize dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100">
          <option value="all">All statuses</option>
          {statuses.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      ) : null}
    >
      <Alert kind="error">{err}</Alert>
      {loading ? (
        <Empty>Loading…</Empty>
      ) : rows.length === 0 ? (
        <Empty>No rental history yet.</Empty>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 dark:border-gray-700">
                <tr>
                  {['Booking', 'Guest', 'Start', 'End', 'Status', 'Total'].map(h => (
                    <th key={h} className="px-2 py-2 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap dark:text-gray-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {rows.slice(0, limit).map(b => (
                  <tr key={b.bookingId} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-2 py-2 whitespace-nowrap">
                      <Link to={`/bookings/${b.bookingId}`} className="text-blue-600 hover:underline text-xs font-mono">{b.bookingId}</Link>
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-300">{b.guestName || '—'}</td>
                    <td className="px-2 py-2 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">{fmtDay(b.startTime)}</td>
                    <td className="px-2 py-2 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">{fmtDay(b.endTime)}</td>
                    <td className="px-2 py-2 whitespace-nowrap text-xs capitalize text-gray-700 dark:text-gray-300">{b.status}</td>
                    <td className="px-2 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-300">{fmtMoney(b.totalAmountCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ShowMore {...pageProps} />
        </>
      )}
    </Card>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AdminVehicleDetail() {
  const { vin } = useParams();
  const api = useApi();
  const [searchParams, setSearchParams] = useSearchParams();
  const [vehicle, setVehicle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const tabParam = searchParams.get('tab');
  const tab = TABS.some(t => t.id === tabParam) ? tabParam : 'overview';
  const setTab = (id) => setSearchParams(id === 'overview' ? {} : { tab: id }, { replace: true });

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
      await api.put(`/admin/vehicles/${vin}`, { status: 'retired' });
      reload();
    } catch (e) {
      setErr(e.response?.data?.error || 'Retire failed');
    }
  };

  const odometerNote = vehicle?.odometerSource
    ? `Source: ${vehicle.odometerSource === 'tesla_telemetry' ? 'Tesla telemetry'
        : vehicle.odometerSource === 'maintenance_log' ? 'maintenance log' : 'manual entry'}`
      + (vehicle.odometerUpdatedAt ? ` · updated ${fmtDate(vehicle.odometerUpdatedAt)}` : '')
    : undefined;

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <Link to="/vehicles" className="text-sm text-blue-600 hover:underline">← Back to Vehicles</Link>

        {err && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 dark:bg-red-900/20 dark:border-red-900 dark:text-red-300">{err}</div>}

        {loading || !vehicle ? (
          <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
        ) : (
          <>
            <HeaderPanel vehicle={vehicle} onRetire={handleRetire} onSaved={reload} />

            <nav className="flex gap-1 overflow-x-auto border-b border-gray-200 dark:border-gray-700">
              {TABS.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition ${
                    tab === t.id
                      ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                  }`}>
                  {t.label}
                </button>
              ))}
            </nav>

            {tab === 'overview' && (
              <div className="space-y-6">
                <VehicleFieldsCard vehicle={vehicle} groups={OVERVIEW_GROUPS} title="Vehicle Details" onSaved={reload} />
                <VehicleFieldsCard vehicle={vehicle} groups={MILEAGE_GROUPS} title="Mileage" description={odometerNote} onSaved={reload} />
              </div>
            )}

            {tab === 'financials' && (
              <div className="space-y-6">
                <VehicleFieldsCard vehicle={vehicle} groups={FINANCIAL_GROUPS} title="Acquisition & Financing" onSaved={reload} />
                <ValuationPanel vehicle={vehicle} onRefreshed={reload} />
              </div>
            )}

            {tab === 'maintenance' && (
              <div className="space-y-6">
                <MaintenanceSchedulePanel vin={vin} />
                <MaintenancePanel vin={vin} />
              </div>
            )}

            {tab === 'access' && (
              <div className="space-y-6">
                <VehicleFieldsCard vehicle={vehicle} groups={ACCESS_GROUPS} title="Tesla & Access Settings" onSaved={reload} />
                <VehicleControlsPanel vehicle={vehicle} />
                <DriversPanel vehicle={vehicle} />
                <GuestKeysPanel vin={vin} />
              </div>
            )}

            {tab === 'rentals' && <RentalHistoryPanel vin={vin} />}

            {tab === 'photos' && (
              <div className="space-y-6">
                <PhotoGalleryPanel vin={vin} />
                <VehicleFieldsCard vehicle={vehicle} groups={MEDIA_GROUPS} title="Image URLs"
                  description="External image links used on the public listing." onSaved={reload} />
              </div>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
