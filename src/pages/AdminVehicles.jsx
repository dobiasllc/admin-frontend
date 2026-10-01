/**
 * AdminVehicles.jsx — Vehicle list (simplified tiles) + Add Vehicle modal.
 * Route: /admin/vehicles
 * Click a tile to go to /admin/vehicles/:vin for full detail/management.
 */
import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../context/AuthContext';
import AdminLayout from '../components/AdminNav';
import { FieldGroupInputs } from '../components/VehicleFields';
import { FIELD_GROUPS, vehicleToForm, formToPayload } from '../utils/vehicleFields';

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

const SORT_OPTIONS = [
  { value: 'name',       label: 'Name (A–Z)' },
  { value: 'rate_desc',  label: 'Daily rate (high → low)' },
  { value: 'rate_asc',   label: 'Daily rate (low → high)' },
  { value: 'miles_desc', label: 'Odometer (high → low)' },
  { value: 'year_desc',  label: 'Year (newest first)' },
];

const vehicleName = v => `${v.year || ''} ${v.make || ''} ${v.model || ''}`.trim();

// ── Add Vehicle Modal ────────────────────────────────────────────────────────
function AddVehicleModal({ onClose, onSaved }) {
  const api = useApi();
  const [form, setForm] = useState(() => vehicleToForm({}));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true); setErr('');
    try {
      await api.post('/admin/vehicles', formToPayload(form, FIELD_GROUPS, { create: true }));
      onSaved();
    } catch (e2) {
      setErr(e2.response?.data?.error || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto dark:bg-gray-800">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between dark:bg-gray-800 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Add Vehicle</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl dark:text-gray-500 dark:hover:text-gray-300">×</button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-6">
          {err && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 dark:bg-red-900/20 dark:border-red-900 dark:text-red-300">{err}</div>}

          {FIELD_GROUPS.map(group => (
            <fieldset key={group.id} className="border-t border-gray-100 pt-4 first:border-t-0 first:pt-0 dark:border-gray-700">
              <legend className="sr-only">{group.title}</legend>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1 dark:text-gray-500">{group.title}</p>
              {group.hint && <p className="text-xs text-gray-400 mb-3 dark:text-gray-500">{group.hint}</p>}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-3">
                <FieldGroupInputs group={group} form={form} setForm={setForm} create />
              </div>
              {group.footnote && <p className="mt-3 text-[11px] text-gray-400 dark:text-gray-500">{group.footnote}</p>}
            </fieldset>
          ))}

          <div className="flex gap-3 border-t border-gray-100 pt-4 dark:border-gray-700">
            <button type="submit" disabled={saving}
              className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={onClose}
              className="border border-gray-300 text-gray-700 px-5 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AdminVehicles() {
  const api = useApi();
  const [vehicles, setVehicles]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [msg, setMsg]             = useState('');
  const [err, setErr]             = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('name');

  const load = () => {
    setLoading(true);
    api.get('/admin/vehicles')
      .then(r => setVehicles(r.data || []))
      .catch(e => setErr(`Failed to load vehicles: ${e.response?.status} ${e.response?.data?.error || e.message}`))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = vehicles.filter(v => {
      if (statusFilter !== 'all' && v.status !== statusFilter) return false;
      if (!q) return true;
      return `${vehicleName(v)} ${v.vin || ''} ${v.licensePlate || ''} ${v.color || ''} ${v.vehicleType || ''}`
        .toLowerCase().includes(q);
    });
    return rows.sort((a, b) => {
      switch (sortBy) {
        case 'rate_desc':  return (b.dailyRateCents || 0) - (a.dailyRateCents || 0);
        case 'rate_asc':   return (a.dailyRateCents || 0) - (b.dailyRateCents || 0);
        case 'miles_desc': return (b.totalOdometerMiles || 0) - (a.totalOdometerMiles || 0);
        case 'year_desc':  return (b.year || 0) - (a.year || 0);
        default:           return vehicleName(a).localeCompare(vehicleName(b));
      }
    });
  }, [vehicles, statusFilter, search, sortBy]);

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Vehicles</h1>
          <button onClick={() => setShowAddModal(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition">
            + Add Vehicle
          </button>
        </div>

        {msg && <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700 dark:bg-green-900/20">{msg}</div>}
        {err && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 dark:bg-red-900/20">{err}</div>}

        {/* Status filter bar */}
        {!loading && (
          <div className="flex flex-wrap items-center gap-2">
            {[
              { key: 'all',         label: 'All' },
              { key: 'available',   label: 'Available' },
              { key: 'rented',      label: 'Rented' },
              { key: 'maintenance', label: 'Maintenance' },
              { key: 'retired',     label: 'Retired' },
            ].map(({ key, label }) => {
              const count = key === 'all' ? vehicles.length : vehicles.filter(v => v.status === key).length;
              const active = statusFilter === key;
              const colorMap = {
                all:         active ? 'bg-gray-800 text-white border-gray-800'         : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-800 dark:bg-gray-900/40 dark:text-gray-300 dark:border-gray-600',
                available:   active ? 'bg-green-600 text-white border-green-600'       : 'bg-white text-green-700 border-green-300 hover:bg-green-50 dark:bg-gray-800 dark:bg-green-900/20',
                rented:      active ? 'bg-blue-600 text-white border-blue-600'         : 'bg-white text-blue-700 border-blue-300 hover:bg-blue-50 dark:bg-gray-800 dark:bg-blue-900/20',
                maintenance: active ? 'bg-yellow-500 text-white border-yellow-500'     : 'bg-white text-yellow-700 border-yellow-300 hover:bg-yellow-50 dark:bg-gray-800 dark:bg-yellow-900/20',
                retired:     active ? 'bg-gray-500 text-white border-gray-500'         : 'bg-white text-gray-500 border-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-800 dark:bg-gray-900/40 dark:text-gray-400 dark:border-gray-600',
              };
              return (
                <button key={key} onClick={() => setStatusFilter(key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${colorMap[key]}`}>
                  {label}
                  <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${active ? 'bg-white/25 dark:bg-gray-800' : 'bg-gray-100 text-gray-500 dark:text-gray-400'}`}>{count}</span>
                </button>
              );
            })}

            <div className="flex items-center gap-2 ml-auto">
              <input type="search" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search name, VIN, plate…"
                className="w-56 border border-gray-300 rounded-lg px-3 py-1.5 text-xs dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" />
              <select value={sortBy} onChange={e => setSortBy(e.target.value)}
                className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100">
                {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* Vehicle tile grid */}
        {loading ? (
          <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
        ) : visible.length === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center dark:text-gray-500">No vehicles match the current filters.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visible.map(v => (
              <Link key={v.vin} to={`/vehicles/${v.vin}`}
                className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md hover:border-blue-300 transition dark:bg-gray-800 dark:border-gray-700">
                {v.imageUrl && <img src={v.imageUrl} alt={v.model} className="w-full h-36 object-cover" />}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-800 truncate dark:text-gray-100">{vehicleName(v)}</p>
                      <p className="text-xs text-gray-400 font-mono truncate dark:text-gray-500">{v.vin}{v.licensePlate ? ` · ${v.licensePlate}` : ''}</p>
                    </div>
                    <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[v.status] || ''}`}>{STATUS_LABELS[v.status] || v.status}</span>
                  </div>
                  <dl className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <dt className="text-gray-400 dark:text-gray-500">Rate</dt>
                      <dd className="text-gray-700 font-medium dark:text-gray-300">${((v.dailyRateCents || 0) / 100).toFixed(0)}/day</dd>
                    </div>
                    <div>
                      <dt className="text-gray-400 dark:text-gray-500">Odometer</dt>
                      <dd className="text-gray-700 font-medium dark:text-gray-300">{v.totalOdometerMiles != null ? `${Number(v.totalOdometerMiles).toLocaleString()} mi` : '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-400 dark:text-gray-500">Source</dt>
                      <dd className="text-gray-700 font-medium capitalize dark:text-gray-300">{v.defaultSource || '—'}</dd>
                    </div>
                  </dl>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {showAddModal && (
        <AddVehicleModal
          onClose={() => setShowAddModal(false)}
          onSaved={() => { setShowAddModal(false); setMsg('Vehicle created.'); load(); }}
        />
      )}
    </AdminLayout>
  );
}
