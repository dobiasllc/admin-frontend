/**
 * AdminVehicles.jsx — Vehicle list (simplified tiles) + Add Vehicle modal.
 * Route: /admin/vehicles
 * Click a tile to go to /admin/vehicles/:vin for full detail/management.
 */
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
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

const BLANK_VEHICLE = {
  vin: '', make: '', model: '', year: '', licensePlate: '', color: '',
  status: 'available', teslaEnabled: false, dailyRateCents: '',
  defaultSource: 'private', imageUrl: '', lockboxCode: '',
  freeMilesPerDay: '', teslaVehicleId: '', teslaAccountId: '', ownerUserId: '',
  purchasePrice: '', purchaseDate: '',
  loanPrincipalCents: '', loanAPR: '', loanTermMonths: '', loanStartDate: '',
  ttrCents: '', annualRegistrationCents: '',
};

// ── Add Vehicle Modal ────────────────────────────────────────────────────────
function AddVehicleModal({ onClose, onSaved }) {
  const api = useApi();
  const [form, setForm] = useState(BLANK_VEHICLE);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true); setErr('');
    try {
      const payload = { ...form, year: Number(form.year), dailyRateCents: Number(form.dailyRateCents) };
      await api.post('/admin/vehicles', payload);
      onSaved();
    } catch (e2) {
      setErr(e2.response?.data?.error || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-800">Add Vehicle</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
          </div>

          {err && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 mb-4">{err}</div>}

          <form onSubmit={handleSave} className="grid grid-cols-2 gap-4">
            {[
              ['vin', 'VIN', 'text'],
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
            ].map(([key, label, type]) => (
              <div key={key}>
                <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                <input type={type} value={form[key] || ''}
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

            <div className="col-span-2 border-t border-gray-100 pt-3 mt-1">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Acquisition Cost</p>
              <p className="text-xs text-gray-400 mb-3">
                Enter once at purchase. Market value is refreshed automatically each month via OTDcheck.
              </p>
            </div>
            {[
              ['purchasePrice', 'Purchase Price ($)', 'number'],
              ['purchaseDate', 'Purchase Date', 'date'],
              ['ttrCents', 'TTR — Tax/Title/Registration ($, one-time)', 'number'],
              ['annualRegistrationCents', 'Annual Registration ($/yr)', 'number'],
            ].map(([key, label, type]) => (
              <div key={key}>
                <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                <input type={type} value={form[key] || ''}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
            ))}

            <div className="col-span-2 border-t border-gray-100 pt-3 mt-1">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Financing (optional)</p>
            </div>
            {[
              ['loanPrincipalCents', 'Loan Principal ($)', 'number'],
              ['loanAPR', 'APR (e.g. 0.0649 for 6.49%)', 'number'],
              ['loanTermMonths', 'Loan Term (months)', 'number'],
              ['loanStartDate', 'Loan Start Date', 'date'],
            ].map(([key, label, type]) => (
              <div key={key}>
                <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                <input type={type} step={key === 'loanAPR' ? '0.0001' : undefined} value={form[key] || ''}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
            ))}

            <div className="col-span-2 flex items-center gap-2">
              <input type="checkbox" id="teslaEnabled" checked={form.teslaEnabled}
                onChange={e => setForm(f => ({ ...f, teslaEnabled: e.target.checked }))} />
              <label htmlFor="teslaEnabled" className="text-sm text-gray-700">Tesla Enabled</label>
            </div>
            <div className="col-span-2 flex gap-3">
              <button type="submit" disabled={saving} className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50">
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button type="button" onClick={onClose}
                className="border border-gray-300 text-gray-700 px-5 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition">Cancel</button>
            </div>
          </form>
        </div>
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

  const load = () => {
    setLoading(true);
    api.get('/admin/vehicles')
      .then(r => setVehicles(r.data || []))
      .catch(e => setErr(`Failed to load vehicles: ${e.response?.status} ${e.response?.data?.error || e.message}`))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Vehicles</h1>
          <button onClick={() => setShowAddModal(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition">
            + Add Vehicle
          </button>
        </div>

        {msg && <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">{msg}</div>}
        {err && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{err}</div>}

        {/* Status filter bar */}
        {!loading && (
          <div className="flex flex-wrap gap-2">
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
                all:         active ? 'bg-gray-800 text-white border-gray-800'         : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50',
                available:   active ? 'bg-green-600 text-white border-green-600'       : 'bg-white text-green-700 border-green-300 hover:bg-green-50',
                rented:      active ? 'bg-blue-600 text-white border-blue-600'         : 'bg-white text-blue-700 border-blue-300 hover:bg-blue-50',
                maintenance: active ? 'bg-yellow-500 text-white border-yellow-500'     : 'bg-white text-yellow-700 border-yellow-300 hover:bg-yellow-50',
                retired:     active ? 'bg-gray-500 text-white border-gray-500'         : 'bg-white text-gray-500 border-gray-300 hover:bg-gray-50',
              };
              return (
                <button key={key} onClick={() => setStatusFilter(key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${colorMap[key]}`}>
                  {label}
                  <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${active ? 'bg-white/25' : 'bg-gray-100 text-gray-500'}`}>{count}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Vehicle tile grid */}
        {loading ? (
          <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {vehicles.filter(v => statusFilter === 'all' || v.status === statusFilter).map(v => (
              <Link key={v.vin} to={`/vehicles/${v.vin}`}
                className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md hover:border-blue-300 transition">
                {v.imageUrl && <img src={v.imageUrl} alt={v.model} className="w-full h-36 object-cover" />}
                <div className="p-4">
                  <div className="flex items-start justify-between mb-1">
                    <div>
                      <p className="font-semibold text-gray-800">{v.year} {v.make} {v.model}</p>
                      <p className="text-xs text-gray-400">{v.vin} · {v.licensePlate}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[v.status] || ''}`}>{STATUS_LABELS[v.status] || v.status}</span>
                  </div>
                  <p className="text-sm text-gray-600">${((v.dailyRateCents || 0) / 100).toFixed(0)}/day</p>
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
