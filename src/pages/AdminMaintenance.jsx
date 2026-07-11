/**
 * AdminMaintenance.jsx
 * View and manage maintenance records across all vehicles.
 * Route: /admin/maintenance
 *
 * Features:
 *  - Lists all maintenance records grouped by vehicle
 *  - Add / Edit / Delete records via modal
 *  - Filter by vehicle
 */
import { useState, useEffect, useCallback } from 'react';
import { useApi } from '../context/AuthContext';
import AdminLayout from '../components/AdminNav';

const MAINTENANCE_TYPES = [
  'Oil Change',
  'Tire Rotation',
  'Tire Replacement',
  'Brake Service',
  'Battery Service',
  'Charging Port Service',
  'Software Update',
  'Recall',
  'Inspection',
  'Detailing',
  'Windshield',
  'Other',
];

function formatDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString(); } catch { return iso; }
}

function formatCost(cents) {
  if (!cents && cents !== 0) return '—';
  return `$${(cents / 100).toFixed(2)}`;
}

// ── Record Modal ──────────────────────────────────────────────────────────────
function MaintenanceModal({ vehicles, record, onSave, onClose }) {
  const api = useApi();
  const isEdit = !!record?.timestamp;

  const [vin,         setVin]         = useState(record?.vin         || (vehicles[0]?.vin || ''));
  const [type,        setType]        = useState(record?.maintenanceType || 'Oil Change');
  const [description, setDesc]        = useState(record?.description  || '');
  const [mileage,     setMileage]     = useState(record?.mileageAtService || '');
  const [performedBy, setPerformedBy] = useState(record?.performedBy  || '');
  const [cost,        setCost]        = useState(record?.cost != null ? String(record.cost / 100) : '');
  const [performedAt, setPerformedAt] = useState(record?.performedAt?.slice(0, 10) || new Date().toISOString().slice(0, 10));
  const [nextDueDate, setNextDueDate] = useState(record?.nextDueDate?.slice(0, 10) || '');
  const [nextDueMileage, setNextDueMileage] = useState(record?.nextDueMileage || '');
  const [isPublic,    setIsPublic]    = useState(record?.isPublic ?? false);
  const [saving,      setSaving]      = useState(false);
  const [err,         setErr]         = useState('');

  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent';

  const handleSave = async () => {
    if (!vin || !description || !mileage || !performedAt) {
      setErr('VIN, description, mileage, and performed date are required.');
      return;
    }
    setSaving(true); setErr('');
    const body = {
      maintenanceType:  type,
      description,
      mileageAtService: parseInt(mileage, 10),
      performedBy,
      cost:             cost ? Math.round(parseFloat(cost) * 100) : 0,
      performedAt,
      nextDueDate:      nextDueDate || undefined,
      nextDueMileage:   nextDueMileage ? parseInt(nextDueMileage, 10) : undefined,
      isPublic,
    };
    try {
      if (isEdit) {
        await api.put(`/admin/vehicles/${vin}/maintenance/${record.timestamp}`, body);
      } else {
        await api.post(`/admin/vehicles/${vin}/maintenance`, body);
      }
      onSave();
    } catch (e) {
      setErr(e.response?.data?.error || e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">
            {isEdit ? 'Edit Maintenance Record' : 'Add Maintenance Record'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {err && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{err}</div>}

          {/* Vehicle */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Vehicle</label>
            <select value={vin} onChange={e => setVin(e.target.value)} disabled={isEdit} className={inp + ' bg-white'}>
              {vehicles.map(v => (
                <option key={v.vin} value={v.vin}>{v.year} {v.make} {v.model} ({v.vin})</option>
              ))}
            </select>
          </div>

          {/* Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Maintenance Type</label>
            <select value={type} onChange={e => setType(e.target.value)} className={inp + ' bg-white'}>
              {MAINTENANCE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
            <textarea
              value={description}
              onChange={e => setDesc(e.target.value)}
              rows={2}
              placeholder="e.g. Rotated all 4 tires, checked brake pads"
              className={inp + ' resize-none'}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Mileage */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mileage at Service *</label>
              <input type="number" value={mileage} onChange={e => setMileage(e.target.value)} placeholder="e.g. 25000" className={inp} />
            </div>
            {/* Performed At */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date Performed *</label>
              <input type="date" value={performedAt} onChange={e => setPerformedAt(e.target.value)} className={inp} />
            </div>
            {/* Performed By */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Performed By</label>
              <input type="text" value={performedBy} onChange={e => setPerformedBy(e.target.value)} placeholder="e.g. Jiffy Lube" className={inp} />
            </div>
            {/* Cost */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cost ($)</label>
              <input type="number" step="0.01" value={cost} onChange={e => setCost(e.target.value)} placeholder="e.g. 49.99" className={inp} />
            </div>
            {/* Next Due Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Next Due Date</label>
              <input type="date" value={nextDueDate} onChange={e => setNextDueDate(e.target.value)} className={inp} />
            </div>
            {/* Next Due Mileage */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Next Due Mileage</label>
              <input type="number" value={nextDueMileage} onChange={e => setNextDueMileage(e.target.value)} placeholder="e.g. 30000" className={inp} />
            </div>
          </div>

          {/* Public toggle */}
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={e => setIsPublic(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600"
            />
            Show on public vehicle page (visible to renters)
          </label>
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Record'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AdminMaintenance() {
  const api = useApi();

  const [vehicles,  setVehicles]  = useState([]);
  const [records,   setRecords]   = useState([]); // flat list of all records
  const [loading,   setLoading]   = useState(true);
  const [err,       setErr]       = useState('');
  const [msg,       setMsg]       = useState('');

  // Filter
  const [filterVin, setFilterVin] = useState('');

  // Modal state
  const [showModal,    setShowModal]    = useState(false);
  const [editRecord,   setEditRecord]   = useState(null);

  const loadAll = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const vRes = await api.get('/admin/vehicles');
      const vList = vRes.data || [];
      setVehicles(vList);

      // Fetch maintenance for each vehicle in parallel
      const results = await Promise.allSettled(
        vList.map(v =>
          api.get(`/admin/vehicles/${v.vin}/maintenance`)
            .then(r => (r.data || []).map(rec => ({
              ...rec,
              vin:         v.vin,
              vehicleName: `${v.year} ${v.make} ${v.model}`,
            })))
        )
      );
      const all = results
        .filter(r => r.status === 'fulfilled')
        .flatMap(r => r.value);
      // Sort newest first
      all.sort((a, b) => (b.performedAt || '').localeCompare(a.performedAt || ''));
      setRecords(all);
    } catch (e) {
      setErr(`Failed to load: ${e.response?.data?.error || e.message}`);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleDelete = async (rec) => {
    if (!window.confirm(`Delete this ${rec.maintenanceType} record for ${rec.vehicleName}?`)) return;
    setMsg(''); setErr('');
    try {
      await api.delete(`/admin/vehicles/${rec.vin}/maintenance/${rec.timestamp}`);
      setMsg('Record deleted.');
      loadAll();
    } catch (e) {
      setErr(e.response?.data?.error || 'Delete failed');
    }
  };

  const openAdd  = () => { setEditRecord(null); setShowModal(true); };
  const openEdit = (rec) => { setEditRecord(rec); setShowModal(true); };
  const onSaved  = () => { setShowModal(false); setMsg('Record saved.'); loadAll(); };

  const displayed = filterVin
    ? records.filter(r => r.vin === filterVin)
    : records;

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Maintenance</h1>
            <p className="text-sm text-gray-500 mt-0.5">Service history across all vehicles.</p>
          </div>
          <button
            onClick={openAdd}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition"
          >
            + Add Record
          </button>
        </div>

        {err && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{err}</div>}
        {msg && <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">{msg}</div>}

        {/* Vehicle filter */}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setFilterVin('')}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border transition ${
              !filterVin ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
            }`}
          >
            All Vehicles
          </button>
          {vehicles.map(v => (
            <button
              key={v.vin}
              onClick={() => setFilterVin(v.vin)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium border transition ${
                filterVin === v.vin ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
              }`}
            >
              {v.year} {v.make} {v.model}
            </button>
          ))}
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : displayed.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">
            No maintenance records found.{' '}
            <button onClick={openAdd} className="text-blue-600 hover:underline">Add the first one →</button>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Vehicle', 'Type', 'Description', 'Date', 'Mileage', 'Cost', 'Next Due', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {displayed.map((rec, i) => (
                  <tr key={`${rec.vin}-${rec.timestamp || i}`} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="font-medium text-gray-800 text-xs">{rec.vehicleName}</p>
                      <p className="text-xs text-gray-400 font-mono">{rec.vin}</p>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-medium">
                        {rec.maintenanceType || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <p className="text-gray-700 text-xs line-clamp-2">{rec.description || '—'}</p>
                      {rec.performedBy && (
                        <p className="text-xs text-gray-400 mt-0.5">by {rec.performedBy}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs">{formatDate(rec.performedAt)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs">
                      {rec.mileageAtService ? rec.mileageAtService.toLocaleString() + ' mi' : '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs">{formatCost(rec.cost)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs">
                      {rec.nextDueDate ? (
                        <span className={`${new Date(rec.nextDueDate) < new Date() ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
                          {formatDate(rec.nextDueDate)}
                        </span>
                      ) : rec.nextDueMileage ? (
                        <span className="text-gray-600">{rec.nextDueMileage.toLocaleString()} mi</span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex gap-2">
                        <button
                          onClick={() => openEdit(rec)}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(rec)}
                          className="text-xs text-red-500 hover:underline"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <MaintenanceModal
          vehicles={vehicles}
          record={editRecord}
          onSave={onSaved}
          onClose={() => setShowModal(false)}
        />
      )}
    </AdminLayout>
  );
}
