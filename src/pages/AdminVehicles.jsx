/**
 * AdminVehicles.jsx — Vehicle CRUD + maintenance log management.
 * Route: /admin/vehicles
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
  // Purchase price/date are still manually entered (one-time at acquisition)
  purchasePrice: '', purchaseDate: '',
  // Financing / TTR / registration (Analytics overhaul)
  loanPrincipalCents: '', loanAPR: '', loanTermMonths: '', loanStartDate: '',
  ttrCents: '', annualRegistrationCents: '',
};


export default function AdminVehicles() {
  const api = useApi();
  const [vehicles, setVehicles]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState(BLANK_VEHICLE);
  const [editing, setEditing]     = useState(null); // vin being edited
  const [msg, setMsg]             = useState('');
  const [err, setErr]             = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'available' | 'rented' | 'maintenance' | 'retired'

  // Maintenance modal state
  const [maintVin, setMaintVin]   = useState(null);
  const [maint, setMaint]         = useState([]);
  const [maintForm, setMaintForm] = useState({ maintenanceType: 'other', description: '', mileageAtService: '', performedBy: '', cost: '', isPublic: false });
  const [revokeMsg, setRevokeMsg] = useState('');
  const [revokeErr, setRevokeErr] = useState('');

  // OTDcheck valuation refresh state
  const [refreshingVin, setRefreshingVin] = useState(null);
  const [refreshMsg, setRefreshMsg]       = useState('');
  const [refreshErr, setRefreshErr]       = useState('');

  const load = () => {
    setLoading(true);
    api.get('/admin/vehicles')
      .then(r => setVehicles(r.data || []))
      .catch(e => setErr(`Failed to load vehicles: ${e.response?.status} ${e.response?.data?.error || e.message}`))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openMaint = (vin) => {
    setMaintVin(vin);
    api.get(`/admin/vehicles/${vin}/maintenance`)
      .then(r => setMaint(r.data || []))
      .catch(console.error);
  };

  const handleSave = async (e) => {
    e.preventDefault(); setMsg(''); setErr('');
    try {
      const payload = { ...form, year: Number(form.year), dailyRateCents: Number(form.dailyRateCents) };
      if (editing) {
        await api.put(`/admin/vehicles/${editing}`, payload);
        setMsg('Vehicle updated.');
      } else {
        await api.post('/admin/vehicles', payload);
        setMsg('Vehicle created.');
      }
      setShowForm(false); setEditing(null); setForm(BLANK_VEHICLE); load();
    } catch (e) {
      setErr(e.response?.data?.error || 'Save failed.');
    }
  };

  const handleDelete = async (vin) => {
    if (!window.confirm(`Delete vehicle ${vin}?`)) return;
    try {
      await api.delete(`/admin/vehicles/${vin}`);
      setMsg('Vehicle deleted.'); load();
    } catch (e) {
      setErr(e.response?.data?.error || 'Delete failed.');
    }
  };

  const handleEdit = (v) => {
    setForm({ ...v, dailyRateCents: v.dailyRateCents || '' });
    setEditing(v.vin); setShowForm(true);
  };

  const handleRevokeDrivers = async (vin) => {
    if (!window.confirm(`Revoke all guest drivers from ${vin}? This calls DELETE /vehicles/${vin}/drivers and removes any phone keys paired via Guest Mode. The renter will lose Bluetooth key access immediately.`)) return;
    setRevokeMsg(''); setRevokeErr('');
    try {
      await api.post(`/admin/vehicles/${vin}/revoke-drivers`);
      setRevokeMsg(`✓ Drivers revoked for ${vin}`);
    } catch (e) {
      setRevokeErr(e.response?.data?.error || `Revoke drivers failed for ${vin}`);
    }
  };

  const handleRefreshValuation = async (vin) => {
    setRefreshingVin(vin); setRefreshMsg(''); setRefreshErr('');
    try {
      const r = await api.post(`/admin/vehicles/${vin}/refresh-valuation`);
      setRefreshMsg(`✓ Valuation refreshed for ${vin}${r.data?.valuation?.marketValue ? ` — market value: $${r.data.valuation.marketValue.toLocaleString()}` : ''}`);
      load(); // reload cards so new value shows
    } catch (e) {
      setRefreshErr(e.response?.data?.error || `Valuation refresh failed for ${vin}`);
    } finally {
      setRefreshingVin(null);
    }
  };

  const handleMaintSave = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/admin/vehicles/${maintVin}/maintenance`, {
        ...maintForm,
        mileageAtService: Number(maintForm.mileageAtService),
        cost: Number(maintForm.cost) * 100,
        performedAt: new Date().toISOString(),
      });
      setMaintForm({ maintenanceType: 'other', description: '', mileageAtService: '', performedBy: '', cost: '', isPublic: false });
      openMaint(maintVin);
    } catch (e) {
      setErr(e.response?.data?.error || 'Maintenance save failed.');
    }
  };

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Vehicles</h1>
          <button onClick={() => { setShowForm(true); setEditing(null); setForm(BLANK_VEHICLE); }}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition">
            + Add Vehicle
          </button>
        </div>

        {msg && <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">{msg}</div>}
        {err && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{err}</div>}
        {revokeMsg && <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">{revokeMsg}</div>}
        {revokeErr && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{revokeErr}</div>}
        {refreshMsg && <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">{refreshMsg}</div>}
        {refreshErr && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{refreshErr}</div>}

        {/* Vehicle form */}
        {showForm && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">{editing ? 'Edit Vehicle' : 'Add Vehicle'}</h2>
            <form onSubmit={handleSave} className="grid grid-cols-2 gap-4">
              {[
                ['vin', 'VIN', 'text', !editing],
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
              ].map(([key, label, type, disabled]) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                  <input type={type} value={form[key] || ''} disabled={disabled}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:bg-gray-50" />
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
              {/* Acquisition cost — still manually entered once at purchase */}
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

              {/* Financing — optional loan info for interest-to-date calculations */}
              <div className="col-span-2 border-t border-gray-100 pt-3 mt-1">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Financing (optional)</p>
                <p className="text-xs text-gray-400 mb-3">
                  If this vehicle is financed, enter the loan details to automatically compute interest paid to date.
                </p>
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
                <button type="submit" className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition">Save</button>
                <button type="button" onClick={() => { setShowForm(false); setEditing(null); }}
                  className="border border-gray-300 text-gray-700 px-5 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition">Cancel</button>
              </div>
            </form>
          </div>
        )}

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

        {/* Vehicle list */}
        {loading ? (
          <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {vehicles.filter(v => statusFilter === 'all' || v.status === statusFilter).map(v => (
              <div key={v.vin} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {v.imageUrl && <img src={v.imageUrl} alt={v.model} className="w-full h-36 object-cover" />}
                <div className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-semibold text-gray-800">{v.year} {v.make} {v.model}</p>
                      <p className="text-xs text-gray-400">{v.vin} · {v.licensePlate}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[v.status] || ''}`}>{STATUS_LABELS[v.status] || v.status}</span>
                  </div>
                  <p className="text-sm text-gray-600 mb-2">${((v.dailyRateCents || 0) / 100).toFixed(0)}/day</p>

                  {/* OTDcheck valuation panel */}
                  {(v.otdcheckMarketValue || v.otdcheckLastRefreshed) ? (
                    <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 mb-3 text-xs space-y-0.5">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-indigo-700">📊 OTDcheck Market Value</span>
                        {v.otdcheckRecallCount > 0 && (
                          <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium">
                            {v.otdcheckRecallCount} recall{v.otdcheckRecallCount > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                      {v.otdcheckMarketValue && (
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-indigo-900 font-bold text-sm">${v.otdcheckMarketValue.toLocaleString()}</span>
                          {v.otdcheckMarketValueSource && v.otdcheckMarketValueSource !== 'fair_price' && (
                            <span className="text-indigo-400 text-xs">
                              ({
                                v.otdcheckMarketValueSource === 'listing' ? 'listing price' :
                                v.otdcheckMarketValueSource === 'wholesale' ? 'wholesale est.' :
                                'depreciation est.'
                              })
                            </span>
                          )}
                        </div>
                      )}
                      {v.otdcheckRetailMin && v.otdcheckRetailMax && (
                        <div className="text-indigo-600">
                          Retail range: ${v.otdcheckRetailMin.toLocaleString()} – ${v.otdcheckRetailMax.toLocaleString()}
                        </div>
                      )}
                      {v.otdcheckLastRefreshed && (
                        <div className="text-indigo-400">
                          Refreshed: {new Date(v.otdcheckLastRefreshed).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="bg-gray-50 border border-dashed border-gray-200 rounded-lg px-3 py-2 mb-3 text-xs text-gray-400">
                      No valuation data yet — auto-refreshes monthly via OTDcheck.
                    </div>
                  )}

                  <div className="flex gap-2 flex-wrap">
                    <button onClick={() => handleEdit(v)} className="text-xs border border-gray-300 text-gray-700 px-2 py-1 rounded hover:bg-gray-50 transition">Edit</button>
                    <button onClick={() => openMaint(v.vin)} className="text-xs border border-blue-300 text-blue-700 px-2 py-1 rounded hover:bg-blue-50 transition">Maintenance</button>
                    <button
                      onClick={() => handleRefreshValuation(v.vin)}
                      disabled={refreshingVin === v.vin}
                      className="text-xs border border-indigo-300 text-indigo-700 px-2 py-1 rounded hover:bg-indigo-50 transition disabled:opacity-50"
                      title="Fetch latest valuation from OTDcheck (counts against monthly quota)"
                    >
                      {refreshingVin === v.vin ? '⏳ Refreshing…' : '📊 Refresh Value'}
                    </button>
                    {v.teslaEnabled && (
                      <button onClick={() => handleRevokeDrivers(v.vin)} className="text-xs border border-purple-300 text-purple-700 px-2 py-1 rounded hover:bg-purple-50 transition" title="Remove all guest phone keys from this vehicle">🔑 Revoke Drivers</button>
                    )}
                    <button onClick={() => handleDelete(v.vin)} className="text-xs border border-red-300 text-red-600 px-2 py-1 rounded hover:bg-red-50 transition">Delete</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Maintenance modal */}
        {maintVin && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-800">Maintenance — {maintVin}</h2>
                  <button onClick={() => setMaintVin(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
                </div>

                {/* Add maintenance form */}
                <form onSubmit={handleMaintSave} className="space-y-3 mb-6 border-b border-gray-100 pb-6">
                  <h3 className="text-sm font-semibold text-gray-600">Add Record</h3>
                  <select value={maintForm.maintenanceType} onChange={e => setMaintForm(f => ({ ...f, maintenanceType: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                    {['oil_change','tire_rotation','tire_replacement','brake_service','12v_battery','hvac','recall','software_update','inspection','other'].map(t => (
                      <option key={t} value={t}>{t.replace('_', ' ')}</option>
                    ))}
                  </select>
                  <input placeholder="Description" value={maintForm.description} onChange={e => setMaintForm(f => ({ ...f, description: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                  <div className="grid grid-cols-2 gap-3">
                    <input type="number" placeholder="Mileage" value={maintForm.mileageAtService} onChange={e => setMaintForm(f => ({ ...f, mileageAtService: e.target.value }))}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                    <input placeholder="Performed by" value={maintForm.performedBy} onChange={e => setMaintForm(f => ({ ...f, performedBy: e.target.value }))}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                    <input type="number" placeholder="Cost ($)" value={maintForm.cost} onChange={e => setMaintForm(f => ({ ...f, cost: e.target.value }))}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" checked={maintForm.isPublic} onChange={e => setMaintForm(f => ({ ...f, isPublic: e.target.checked }))} />
                    Show to renters (public)
                  </label>
                  <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition">Add Record</button>
                </form>

                {/* Existing records */}
                <div className="space-y-3">
                  {maint.length === 0 ? <p className="text-gray-400 text-sm">No maintenance records.</p> : maint.map((m, i) => (
                    <div key={i} className="border border-gray-100 rounded-lg p-3 text-sm">
                      <div className="flex justify-between">
                        <span className="font-medium capitalize">{m.maintenanceType?.replace('_', ' ')}</span>
                        {m.isPublic && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Public</span>}
                      </div>
                      <p className="text-gray-500 text-xs mt-1">{m.description}</p>
                      <p className="text-gray-400 text-xs">{m.mileageAtService?.toLocaleString()} mi · {m.performedBy}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
