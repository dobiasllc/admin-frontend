import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useApi } from '../context/AuthContext';
import AdminLayout from '../components/AdminNav';

const TAX_CATEGORIES = [
  'Mileage', 'Home Office', 'Vehicle Depreciation', 'Insurance',
  'Repairs & Maintenance', 'Supplies', 'Professional Services',
  'Advertising & Marketing', 'Software & Subscriptions', 'Meals & Entertainment',
  'Travel', 'Utilities', 'Employee Expenses', 'Other',
];

const RANGE_OPTIONS = [
  { value: 'this_year', label: 'This Year' },
  { value: 'last_3mo',  label: 'Last 3 Months' },
  { value: 'last_6mo',  label: 'Last 6 Months' },
  { value: 'last_12mo', label: 'Last 12 Months' },
  { value: 'all',       label: 'All Time' },
];
const CURRENT_YEAR = new Date().getFullYear();
for (let y = CURRENT_YEAR - 1; y >= CURRENT_YEAR - 4; y--) {
  RANGE_OPTIONS.push({ value: String(y), label: String(y) });
}

function fmt$(cents) {
  if (cents == null) return '—';
  const abs = Math.abs(cents);
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${(abs / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const IMPORT_INFO_DISMISSED_KEY = 'taxImportInfoDismissed';

function ImportInfoText() {
  return (
    <>
      <p><span className="font-semibold">✅ New transactions</span> in your file will be added.</p>
      <p><span className="font-semibold">🔄 Matching transactions</span> (same date, merchant, account, and amount) will have their category/description/notes <span className="font-semibold">updated</span> if changed.</p>
      <p><span className="font-semibold">🗑️ Removed transactions:</span> any previously-imported transaction whose date falls <span className="underline">within this file's date range</span> but is no longer present in the new file <span className="font-semibold">will be deleted automatically</span>.</p>
      <p><span className="font-semibold">⚠️ Important:</span> transactions dated <span className="underline">outside</span> this file's date range are left untouched — even if that category no longer exists in your new file. If you're switching tracking methods and want a clean slate, make sure your new CSV's date range fully covers the same period as your previous upload(s).</p>
      <p><span className="font-semibold">✏️ Manually-added expenses</span> (not from a CSV) are <span className="font-semibold">never</span> affected by import.</p>
      <p><span className="font-semibold">🚫 Unparseable rows</span> (bad dates/amounts) are quarantined for manual review, not deleted.</p>
    </>
  );
}


export default function AdminExpenses() {
  const api = useApi();
  const fileInputRef = useRef(null);
  const [range, setRange]         = useState('this_year');
  const [expenses, setExpenses]   = useState([]);
  const [ytdTotals, setYtdTotals] = useState({});
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState({
    category: 'Mileage',
    description: '',
    amountCents: '',
    date: new Date().toISOString().slice(0, 10),
    notes: '',
    type: 'expense', // 'expense' | 'credit'
  });
  const [saving, setSaving]       = useState(false);
  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState(null);
  const [editingTs, setEditingTs] = useState(null);
  const [editForm, setEditForm]   = useState({});
  const [linkingTs, setLinkingTs] = useState(null);
  const [vehicles, setVehicles]   = useState([]);
  const [linkVin, setLinkVin]     = useState('');
  const [linkItems, setLinkItems] = useState([]);
  const [linkItemKey, setLinkItemKey] = useState('');
  const [linking, setLinking]     = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showImportTooltip, setShowImportTooltip] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);



  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/admin/expenses?range=${range}`);
      setExpenses(res.data.expenses || []);
      setYtdTotals(res.data.ytd_totals || {});
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load expenses');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const dollars = parseFloat(form.amountCents);
    if (isNaN(dollars) || dollars <= 0) { alert('Enter a valid amount'); return; }
    setSaving(true);
    try {
      const signedCents = form.type === 'credit'
        ? -Math.round(dollars * 100)
        : Math.round(dollars * 100);
      await api.post('/admin/expenses', {
        category:    form.category,
        description: form.description,
        amountCents: signedCents,
        date:        form.date,
        notes:       form.notes,
      });
      setForm({ category: 'Mileage', description: '', amountCents: '', date: new Date().toISOString().slice(0, 10), notes: '', type: 'expense' });
      setShowForm(false);
      await load();
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to save expense');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (ts) => {
    if (!window.confirm('Delete this expense record?')) return;
    try {
      await api.delete(`/admin/expenses/${encodeURIComponent(ts)}`);
      await load();
    } catch (e) {
      alert('Failed to delete expense');
    }
  };

  const handleUnlink = async (ts, link) => {
    if (!window.confirm(`Unlink "${link.itemLabel}" from this expense?`)) return;
    try {
      await api.post(`/admin/expenses/${encodeURIComponent(ts)}/unlink`, { vin: link.vin, itemKey: link.itemKey });
      await load();
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to unlink');
    }
  };

  const startLink = async (exp) => {
    setLinkingTs(exp.timestamp);
    setLinkVin('');
    setLinkItems([]);
    setLinkItemKey('');
    if (vehicles.length === 0) {
      try {
        const res = await api.get('/admin/vehicles');
        setVehicles(res.data || []);
      } catch (e) {
        alert('Failed to load vehicles');
      }
    }
  };

  const cancelLink = () => {
    setLinkingTs(null);
    setLinkVin('');
    setLinkItems([]);
    setLinkItemKey('');
  };

  const handleLinkVinChange = async (vin) => {
    setLinkVin(vin);
    setLinkItemKey('');
    setLinkItems([]);
    if (!vin) return;
    try {
      const res = await api.get(`/admin/vehicles/${vin}/maintenance-schedule`);
      setLinkItems(res.data || []);
    } catch (e) {
      alert('Failed to load maintenance items for that vehicle');
    }
  };

  const saveLink = async (ts) => {
    if (!linkVin || !linkItemKey) { alert('Select a vehicle and a maintenance item'); return; }
    setLinking(true);
    try {
      await api.post(`/admin/expenses/${encodeURIComponent(ts)}/link`, { vin: linkVin, itemKey: linkItemKey });
      cancelLink();
      await load();
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to link');
    } finally {
      setLinking(false);
    }
  };




  const handleImportClick = () => {
    const dismissed = localStorage.getItem(IMPORT_INFO_DISMISSED_KEY) === 'true';
    if (dismissed) {
      fileInputRef.current?.click();
    } else {
      setDontShowAgain(false);
      setShowImportModal(true);
    }
  };

  const handleModalChooseFile = () => {
    if (dontShowAgain) {
      localStorage.setItem(IMPORT_INFO_DISMISSED_KEY, 'true');
    }
    setShowImportModal(false);
    fileInputRef.current?.click();
  };

  const handleModalCancel = () => {
    if (dontShowAgain) {
      localStorage.setItem(IMPORT_INFO_DISMISSED_KEY, 'true');
    }
    setShowImportModal(false);
  };


  const handleFileSelected = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // reset so the same file can be re-selected later
    if (!file) return;
    setImporting(true);
    setImportSummary(null);
    try {
      const text = await file.text();
      const res = await api.post('/admin/expenses/import', { csv: text });
      setImportSummary(res.data);
      await load();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to import CSV');
    } finally {
      setImporting(false);
    }
  };

  const startEdit = (exp) => {
    setEditingTs(exp.timestamp);
    setEditForm({
      category:    exp.category || 'Other',
      description: exp.description || '',
      amountDollars: exp.amountCents != null ? (exp.amountCents / 100).toString() : '',
      date:        exp.date || '',
      notes:       exp.notes || '',
    });
  };

  const cancelEdit = () => {
    setEditingTs(null);
    setEditForm({});
  };

  const saveEdit = async (exp) => {
    const dollars = parseFloat(editForm.amountDollars);
    if (isNaN(dollars)) { alert('Enter a valid amount'); return; }
    try {
      const payload = {
        category:    editForm.category,
        description: editForm.description,
        amountCents: Math.round(dollars * 100),
        date:        editForm.date,
        notes:       editForm.notes,
      };
      if (exp.invalid) {
        payload.clearInvalid = true;
      }
      await api.put(`/admin/expenses/${encodeURIComponent(exp.timestamp)}`, payload);
      cancelEdit();
      await load();
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to update expense');
    }
  };

  const grandTotal = Object.values(ytdTotals).reduce((s, v) => s + v, 0);
  const invalidExpenses = expenses.filter(e => e.invalid);
  const validExpenses   = expenses.filter(e => !e.invalid);
  const rangeLabel = RANGE_OPTIONS.find(r => r.value === range)?.label || range;

  return (
    <AdminLayout>
    <div className="p-4 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">🧾 Expense Tracker</h1>
        <div className="flex items-center gap-3">
          <select value={range} onChange={e => setRange(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-sm dark:border-gray-600">
            {RANGE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <input
            type="file"
            accept=".csv,text/csv"
            ref={fileInputRef}
            onChange={handleFileSelected}
            className="hidden"
          />
          <div className="relative flex items-center gap-1">
            <button onClick={handleImportClick} disabled={importing}
              className="bg-gray-700 text-white px-3 py-1.5 rounded text-sm hover:bg-gray-800 disabled:opacity-50">
              {importing ? 'Importing…' : '⬆ Import CSV'}
            </button>
            <button
              type="button"
              onMouseEnter={() => setShowImportTooltip(true)}
              onMouseLeave={() => setShowImportTooltip(false)}
              onClick={() => setShowImportTooltip(v => !v)}
              className="w-5 h-5 flex items-center justify-center rounded-full bg-gray-200 text-gray-600 text-xs font-bold hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300"
              aria-label="How CSV import works"
            >
              ⓘ
            </button>
            {showImportTooltip && (
              <div className="absolute top-full right-0 mt-2 w-80 bg-white border border-gray-300 rounded-lg shadow-lg p-3 text-xs text-gray-700 z-20 space-y-1.5 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300">
                <div className="font-semibold text-gray-800 mb-1 dark:text-gray-100">How CSV Import Works</div>
                <ImportInfoText />
              </div>
            )}
          </div>

          <button onClick={() => setShowForm(f => !f)}
            className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700">
            + Add Expense
          </button>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-3 mb-6 text-sm text-yellow-800 dark:bg-yellow-900/20">
        ⚠️ <strong>Informational only.</strong> This tool is for record-keeping purposes only and does not
        constitute tax advice. Consult a qualified tax professional for guidance on deductibility.
      </div>

      {/* Import Summary */}
      {importSummary && (
        <div className="bg-blue-50 border border-blue-300 rounded-lg p-3 mb-6 text-sm text-blue-800 flex justify-between items-start dark:bg-blue-900/20">
          <div>
            <strong>Import complete.</strong>{' '}
            Added: {importSummary.imported} · Updated: {importSummary.updated} · Removed: {importSummary.removed} ·
            {' '}Already up-to-date: {importSummary.skipped_duplicates} ·
            {' '}Quarantined (invalid): {importSummary.invalid_rows}
            {importSummary.date_range?.min && (
              <div className="text-xs text-blue-600 mt-1">
                Date range covered: {importSummary.date_range.min} → {importSummary.date_range.max}
              </div>
            )}
          </div>
          <button onClick={() => setImportSummary(null)} className="text-blue-400 hover:text-blue-700 text-xs">✕</button>
        </div>
      )}

      {/* Quarantined / Invalid Rows */}
      {invalidExpenses.length > 0 && (
        <div className="mb-6">
          <h2 className="font-semibold text-red-700 mb-2">⚠️ Needs Correction ({invalidExpenses.length})</h2>
          <div className="space-y-2">
            {invalidExpenses.map(exp => (
              <div key={exp.timestamp} className="border-2 border-red-400 bg-red-50 rounded-lg p-3 dark:bg-red-900/20">
                {editingTs === exp.timestamp ? (
                  <EditRow exp={exp} editForm={editForm} setEditForm={setEditForm}
                    onSave={() => saveEdit(exp)} onCancel={cancelEdit} />
                ) : (
                  <div className="flex justify-between items-start">
                    <div className="text-sm">
                      <div className="text-red-700 font-medium">{exp.invalidReason || 'Could not parse this row'}</div>
                      <div className="text-gray-600 mt-1 dark:text-gray-300">
                        {exp.description || exp.merchant || '(no description)'}
                        {exp.notes && <span className="text-gray-400 dark:text-gray-500"> — {exp.notes}</span>}
                      </div>
                      <div className="text-xs text-gray-400 mt-1 dark:text-gray-500">
                        Raw date: {exp.date || '—'} · Category: {exp.category || '—'}
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => startEdit(exp)}
                        className="text-blue-600 hover:text-blue-800 text-xs font-medium">Fix</button>
                      <button onClick={() => handleDelete(exp.timestamp)}
                        className="text-red-400 hover:text-red-600 text-xs">✕</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Totals by Category */}
      {Object.keys(ytdTotals).length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6 dark:bg-gray-800 dark:border-gray-700">
          <h2 className="font-semibold text-gray-700 mb-3 dark:text-gray-300">Totals — {rangeLabel}</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {Object.entries(ytdTotals).sort((a, b) => b[1] - a[1]).map(([cat, cents]) => (
              <div key={cat} className="bg-gray-50 rounded p-3 dark:bg-gray-900/40">
                <div className="text-xs text-gray-500 mb-1 dark:text-gray-400">{cat}</div>
                <div className="font-semibold text-gray-800 dark:text-gray-100">{fmt$(cents)}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-gray-200 flex justify-between dark:border-gray-700">
            <span className="font-semibold text-gray-700 dark:text-gray-300">Grand Total (net of credits)</span>
            <span className="font-bold text-gray-900 dark:text-gray-100">{fmt$(grandTotal)}</span>
          </div>
        </div>
      )}

      {/* Add Expense Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-blue-200 p-4 mb-6 grid grid-cols-2 gap-3 dark:bg-gray-800">
          <h3 className="col-span-2 font-semibold text-gray-700 mb-1 dark:text-gray-300">New Entry</h3>
          <div className="col-span-2 flex gap-4">
            <label className="flex items-center gap-1 text-sm">
              <input type="radio" name="entryType" checked={form.type === 'expense'}
                onChange={() => setForm(f => ({ ...f, type: 'expense' }))} />
              Expense
            </label>
            <label className="flex items-center gap-1 text-sm">
              <input type="radio" name="entryType" checked={form.type === 'credit'}
                onChange={() => setForm(f => ({ ...f, type: 'credit' }))} />
              Credit / Refund
            </label>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1 dark:text-gray-300">Category</label>
            <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              className="w-full border border-gray-300 rounded px-2 py-1 text-sm dark:border-gray-600">
              {TAX_CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1 dark:text-gray-300">Amount ($)</label>
            <input type="number" step="0.01" min="0" placeholder="0.00"
              value={form.amountCents}
              onChange={e => setForm(f => ({ ...f, amountCents: e.target.value }))}
              className="w-full border border-gray-300 rounded px-2 py-1 text-sm dark:border-gray-600" required />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1 dark:text-gray-300">Description</label>
            <input type="text" placeholder="e.g. Home office internet — July"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="w-full border border-gray-300 rounded px-2 py-1 text-sm dark:border-gray-600" required />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1 dark:text-gray-300">Date</label>
            <input type="date" value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              className="w-full border border-gray-300 rounded px-2 py-1 text-sm dark:border-gray-600" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1 dark:text-gray-300">Notes (optional)</label>
            <input type="text" placeholder="Optional notes"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full border border-gray-300 rounded px-2 py-1 text-sm dark:border-gray-600" />
          </div>
          <div className="col-span-2 flex gap-2">
            <button type="submit" disabled={saving}
              className="bg-green-600 text-white px-4 py-1.5 rounded text-sm hover:bg-green-700 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save Entry'}
            </button>
            <button type="button" onClick={() => setShowForm(false)}
              className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 dark:text-gray-300 dark:text-gray-400">Cancel</button>
          </div>
        </form>
      )}

      {/* Expense List */}
      {loading ? (
        <div className="text-gray-400 text-sm p-4 dark:text-gray-500">Loading…</div>
      ) : error ? (
        <div className="text-red-600 text-sm p-4">{error}</div>
      ) : validExpenses.length === 0 ? (
        <div className="text-gray-400 text-sm italic p-4 dark:text-gray-500">No expenses recorded for {rangeLabel}. Click "+ Add Expense" or import a CSV to get started.</div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden dark:bg-gray-800 dark:border-gray-700">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex justify-between items-center dark:bg-gray-900/40 dark:border-gray-700">
            <h2 className="font-semibold text-gray-700 dark:text-gray-300">Expenses — {rangeLabel}</h2>
            <span className="text-sm text-gray-500 dark:text-gray-400">{validExpenses.length} records</span>
          </div>
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-200 dark:bg-gray-900/40 dark:text-gray-400 dark:border-gray-700">
              <tr>
                <th className="px-4 py-2 text-left">Date</th>
                <th className="px-4 py-2 text-left">Category</th>
                <th className="px-4 py-2 text-left">Description</th>
                <th className="px-4 py-2 text-right">Amount</th>
                <th className="px-4 py-2 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {validExpenses.map(exp => (
                editingTs === exp.timestamp ? (
                  <tr key={exp.timestamp}>
                    <td colSpan={5} className="px-4 py-2 bg-blue-50 dark:bg-blue-900/20">
                      <EditRow exp={exp} editForm={editForm} setEditForm={setEditForm}
                        onSave={() => saveEdit(exp)} onCancel={cancelEdit} />
                    </td>
                  </tr>
                ) : linkingTs === exp.timestamp ? (
                  <tr key={exp.timestamp}>
                    <td colSpan={5} className="px-4 py-3 bg-purple-50 dark:bg-purple-900/20">
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
                        <div className="md:col-span-2">
                          <label className="block text-xs font-medium text-gray-600 mb-1 dark:text-gray-300">Vehicle</label>
                          <select value={linkVin} onChange={e => handleLinkVinChange(e.target.value)}
                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm dark:border-gray-600">
                            <option value="">Select vehicle…</option>
                            {vehicles.map(v => (
                              <option key={v.vin} value={v.vin}>{v.year} {v.make} {v.model} ({v.vin.slice(-6)})</option>
                            ))}
                          </select>
                        </div>
                        <div className="md:col-span-2">
                          <label className="block text-xs font-medium text-gray-600 mb-1 dark:text-gray-300">Maintenance Item</label>
                          <select value={linkItemKey} onChange={e => setLinkItemKey(e.target.value)}
                            disabled={!linkVin}
                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm disabled:opacity-50 dark:border-gray-600">
                            <option value="">Select item…</option>
                            {linkItems.map(it => (
                              <option key={it.itemKey} value={it.itemKey}>{it.label}{it.active === false ? ' (inactive)' : ''}</option>
                            ))}
                          </select>
                        </div>
                        <div className="md:col-span-4 flex gap-2 mt-1">
                          <button onClick={() => saveLink(exp.timestamp)} disabled={linking || !linkVin || !linkItemKey}
                            className="bg-purple-600 text-white px-3 py-1 rounded text-xs hover:bg-purple-700 disabled:opacity-50">
                            {linking ? 'Linking…' : 'Add Link'}
                          </button>
                          <button onClick={cancelLink} className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 dark:text-gray-300 dark:text-gray-400">Done</button>
                        </div>
                      </div>
                      {(exp.linkedItems || []).length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {exp.linkedItems.map((l, idx) => (
                            <span key={idx} className="bg-purple-100 text-purple-700 text-xs px-2 py-0.5 rounded dark:bg-purple-900/30">
                              🔧 {l.itemLabel}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ) : (
                  <tr key={exp.timestamp} className="hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-900/40">
                    <td className="px-4 py-2 text-gray-500 whitespace-nowrap dark:text-gray-400">{exp.date || exp.createdAt?.slice(0, 10)}</td>
                    <td className="px-4 py-2">
                      <span className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded dark:bg-blue-900/20">{exp.category}</span>
                      {exp.source === 'csv_import' && (
                        <span className="ml-1 bg-gray-100 text-gray-500 text-xs px-1.5 py-0.5 rounded dark:text-gray-400">CSV</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-gray-700 dark:text-gray-300">
                      <div>{exp.description}</div>
                      {exp.notes && <div className="text-xs text-gray-400 dark:text-gray-500">{exp.notes}</div>}
                      {(exp.linkedItems || []).length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {exp.linkedItems.map((l, idx) => (
                            <span key={idx} className="flex items-center gap-1 bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded text-xs dark:bg-purple-900/20">
                              🔧 <a href={`/vehicles/${l.vin}`} className="underline">{l.itemLabel || 'Maintenance'}</a>
                              <button onClick={() => handleUnlink(exp.timestamp, l)}
                                className="text-gray-400 hover:text-red-500 dark:text-gray-500">✕</button>
                            </span>
                          ))}
                        </div>
                      )}
                      <button onClick={() => startLink(exp)} className="mt-1 text-xs text-purple-600 hover:underline block">
                        🔧 {(exp.linkedItems || []).length > 0 ? 'Link Another Item' : 'Link to Maintenance'}
                      </button>
                    </td>
                    <td className={`px-4 py-2 text-right font-medium ${exp.amountCents < 0 ? 'text-green-600' : 'text-gray-800 dark:text-gray-100'}`}>
                      {fmt$(exp.amountCents)}
                    </td>
                    <td className="px-4 py-2 text-center whitespace-nowrap">
                      <button onClick={() => startEdit(exp)}
                        className="text-blue-500 hover:text-blue-700 text-xs mr-2">Edit</button>
                      <button onClick={() => handleDelete(exp.timestamp)}
                        className="text-red-400 hover:text-red-600 text-xs">✕</button>
                    </td>

                  </tr>
                )

              ))}
            </tbody>
            <tfoot className="border-t-2 border-gray-300 bg-gray-50 dark:bg-gray-900/40 dark:border-gray-600">
              <tr>
                <td colSpan={3} className="px-4 py-2 text-right text-sm font-semibold text-gray-700 dark:text-gray-300">Total (net):</td>
                <td className="px-4 py-2 text-right font-bold text-gray-900 dark:text-gray-100">{fmt$(grandTotal)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Import Info Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-5 dark:bg-gray-800">
            <h3 className="font-semibold text-gray-800 mb-3 dark:text-gray-100">How CSV Import Works</h3>
            <div className="text-sm text-gray-700 space-y-2 dark:text-gray-300">
              <ImportInfoText />
            </div>
            <label className="flex items-center gap-2 mt-4 text-sm text-gray-600 dark:text-gray-300">
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={e => setDontShowAgain(e.target.checked)}
              />
              Don't show this again
            </label>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={handleModalCancel}
                className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 dark:text-gray-300 dark:hover:text-gray-100">
                Cancel
              </button>
              <button onClick={handleModalChooseFile}
                className="bg-gray-700 text-white px-4 py-1.5 rounded text-sm hover:bg-gray-800">
                Choose File →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </AdminLayout>
  );
}

function EditRow({ exp, editForm, setEditForm, onSave, onCancel }) {

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1 dark:text-gray-300">Category</label>
        <input type="text" value={editForm.category || ''}
          onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))}
          className="w-full border border-gray-300 rounded px-2 py-1 text-sm dark:border-gray-600" />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1 dark:text-gray-300">Amount ($, negative = credit)</label>
        <input type="number" step="0.01" value={editForm.amountDollars || ''}
          onChange={e => setEditForm(f => ({ ...f, amountDollars: e.target.value }))}
          className="w-full border border-gray-300 rounded px-2 py-1 text-sm dark:border-gray-600" />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1 dark:text-gray-300">Date</label>
        <input type="date" value={editForm.date || ''}
          onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))}
          className="w-full border border-gray-300 rounded px-2 py-1 text-sm dark:border-gray-600" />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1 dark:text-gray-300">Description</label>
        <input type="text" value={editForm.description || ''}
          onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
          className="w-full border border-gray-300 rounded px-2 py-1 text-sm dark:border-gray-600" />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1 dark:text-gray-300">Notes</label>
        <input type="text" value={editForm.notes || ''}
          onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
          className="w-full border border-gray-300 rounded px-2 py-1 text-sm dark:border-gray-600" />
      </div>
      <div className="col-span-2 md:col-span-5 flex gap-2 mt-1">
        <button onClick={onSave} className="bg-green-600 text-white px-3 py-1 rounded text-xs hover:bg-green-700">
          Save
        </button>
        <button onClick={onCancel} className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 dark:text-gray-300 dark:text-gray-400">Cancel</button>
      </div>
    </div>
  );
}
