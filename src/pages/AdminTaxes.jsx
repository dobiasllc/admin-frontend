import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useApi } from '../context/AuthContext';
import AdminLayout from '../components/AdminNav';

const TAX_CATEGORIES = [
  'Mileage', 'Home Office', 'Vehicle Depreciation', 'Insurance',
  'Repairs & Maintenance', 'Supplies', 'Professional Services',
  'Advertising & Marketing', 'Software & Subscriptions', 'Meals & Entertainment',
  'Travel', 'Utilities', 'Employee Expenses', 'Other',
];


function fmt$(cents) {
  if (cents == null) return '—';
  const abs = Math.abs(cents);
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${(abs / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2];

export default function AdminTaxes() {
  const api = useApi();
  const fileInputRef = useRef(null);
  const [year, setYear]           = useState(String(CURRENT_YEAR));
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

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/admin/tax-expenses?year=${year}`);
      setExpenses(res.data.expenses || []);
      setYtdTotals(res.data.ytd_totals || {});
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load tax expenses');
    } finally {
      setLoading(false);
    }
  }, [year]);

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
      await api.post('/admin/tax-expenses', {
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
      await api.delete(`/admin/tax-expenses/${encodeURIComponent(ts)}`);
      await load();
    } catch (e) {
      alert('Failed to delete expense');
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // reset so the same file can be re-selected later
    if (!file) return;
    setImporting(true);
    setImportSummary(null);
    try {
      const text = await file.text();
      const res = await api.post('/admin/tax-expenses/import', { csv: text });
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
      await api.put(`/admin/tax-expenses/${encodeURIComponent(exp.timestamp)}`, payload);
      cancelEdit();
      await load();
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to update expense');
    }
  };

  const grandTotal = Object.values(ytdTotals).reduce((s, v) => s + v, 0);
  const invalidExpenses = expenses.filter(e => e.invalid);
  const validExpenses   = expenses.filter(e => !e.invalid);

  return (
    <AdminLayout>
    <div className="p-4 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900">🧾 Tax Expense Tracker</h1>
        <div className="flex items-center gap-3">
          <select value={year} onChange={e => setYear(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-sm">
            {YEAR_OPTIONS.map(y => <option key={y} value={String(y)}>{y}</option>)}
          </select>
          <input
            type="file"
            accept=".csv,text/csv"
            ref={fileInputRef}
            onChange={handleFileSelected}
            className="hidden"
          />
          <button onClick={handleImportClick} disabled={importing}
            className="bg-gray-700 text-white px-3 py-1.5 rounded text-sm hover:bg-gray-800 disabled:opacity-50">
            {importing ? 'Importing…' : '⬆ Import CSV'}
          </button>
          <button onClick={() => setShowForm(f => !f)}
            className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700">
            + Add Expense
          </button>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-3 mb-6 text-sm text-yellow-800">
        ⚠️ <strong>Informational only.</strong> This tool is for record-keeping purposes only and does not
        constitute tax advice. Consult a qualified tax professional for guidance on deductibility.
      </div>

      {/* Import Summary */}
      {importSummary && (
        <div className="bg-blue-50 border border-blue-300 rounded-lg p-3 mb-6 text-sm text-blue-800 flex justify-between items-start">
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
              <div key={exp.timestamp} className="border-2 border-red-400 bg-red-50 rounded-lg p-3">
                {editingTs === exp.timestamp ? (
                  <EditRow exp={exp} editForm={editForm} setEditForm={setEditForm}
                    onSave={() => saveEdit(exp)} onCancel={cancelEdit} />
                ) : (
                  <div className="flex justify-between items-start">
                    <div className="text-sm">
                      <div className="text-red-700 font-medium">{exp.invalidReason || 'Could not parse this row'}</div>
                      <div className="text-gray-600 mt-1">
                        {exp.description || exp.merchant || '(no description)'}
                        {exp.notes && <span className="text-gray-400"> — {exp.notes}</span>}
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
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

      {/* YTD Totals by Category */}
      {Object.keys(ytdTotals).length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
          <h2 className="font-semibold text-gray-700 mb-3">YTD Totals — {year}</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {Object.entries(ytdTotals).sort((a, b) => b[1] - a[1]).map(([cat, cents]) => (
              <div key={cat} className="bg-gray-50 rounded p-3">
                <div className="text-xs text-gray-500 mb-1">{cat}</div>
                <div className="font-semibold text-gray-800">{fmt$(cents)}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-gray-200 flex justify-between">
            <span className="font-semibold text-gray-700">Grand Total (net of credits)</span>
            <span className="font-bold text-gray-900">{fmt$(grandTotal)}</span>
          </div>
        </div>
      )}

      {/* Add Expense Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-blue-200 p-4 mb-6 grid grid-cols-2 gap-3">
          <h3 className="col-span-2 font-semibold text-gray-700 mb-1">New Entry</h3>
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
            <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
            <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              className="w-full border border-gray-300 rounded px-2 py-1 text-sm">
              {TAX_CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Amount ($)</label>
            <input type="number" step="0.01" min="0" placeholder="0.00"
              value={form.amountCents}
              onChange={e => setForm(f => ({ ...f, amountCents: e.target.value }))}
              className="w-full border border-gray-300 rounded px-2 py-1 text-sm" required />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
            <input type="text" placeholder="e.g. Home office internet — July"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="w-full border border-gray-300 rounded px-2 py-1 text-sm" required />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
            <input type="date" value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              className="w-full border border-gray-300 rounded px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes (optional)</label>
            <input type="text" placeholder="Optional notes"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full border border-gray-300 rounded px-2 py-1 text-sm" />
          </div>
          <div className="col-span-2 flex gap-2">
            <button type="submit" disabled={saving}
              className="bg-green-600 text-white px-4 py-1.5 rounded text-sm hover:bg-green-700 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save Entry'}
            </button>
            <button type="button" onClick={() => setShowForm(false)}
              className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
          </div>
        </form>
      )}

      {/* Expense List */}
      {loading ? (
        <div className="text-gray-400 text-sm p-4">Loading…</div>
      ) : error ? (
        <div className="text-red-600 text-sm p-4">{error}</div>
      ) : validExpenses.length === 0 ? (
        <div className="text-gray-400 text-sm italic p-4">No expenses recorded for {year}. Click "+ Add Expense" or import a CSV to get started.</div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
            <h2 className="font-semibold text-gray-700">Expenses — {year}</h2>
            <span className="text-sm text-gray-500">{validExpenses.length} records</span>
          </div>
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-2 text-left">Date</th>
                <th className="px-4 py-2 text-left">Category</th>
                <th className="px-4 py-2 text-left">Description</th>
                <th className="px-4 py-2 text-right">Amount</th>
                <th className="px-4 py-2 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {validExpenses.map(exp => (
                editingTs === exp.timestamp ? (
                  <tr key={exp.timestamp}>
                    <td colSpan={5} className="px-4 py-2 bg-blue-50">
                      <EditRow exp={exp} editForm={editForm} setEditForm={setEditForm}
                        onSave={() => saveEdit(exp)} onCancel={cancelEdit} />
                    </td>
                  </tr>
                ) : (
                  <tr key={exp.timestamp} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-500 whitespace-nowrap">{exp.date || exp.createdAt?.slice(0, 10)}</td>
                    <td className="px-4 py-2">
                      <span className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded">{exp.category}</span>
                      {exp.source === 'csv_import' && (
                        <span className="ml-1 bg-gray-100 text-gray-500 text-xs px-1.5 py-0.5 rounded">CSV</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-gray-700">
                      <div>{exp.description}</div>
                      {exp.notes && <div className="text-xs text-gray-400">{exp.notes}</div>}
                    </td>
                    <td className={`px-4 py-2 text-right font-medium ${exp.amountCents < 0 ? 'text-green-600' : 'text-gray-800'}`}>
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
            <tfoot className="border-t-2 border-gray-300 bg-gray-50">
              <tr>
                <td colSpan={3} className="px-4 py-2 text-right text-sm font-semibold text-gray-700">Total (net):</td>
                <td className="px-4 py-2 text-right font-bold text-gray-900">{fmt$(grandTotal)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
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
        <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
        <input type="text" value={editForm.category || ''}
          onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))}
          className="w-full border border-gray-300 rounded px-2 py-1 text-sm" />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Amount ($, negative = credit)</label>
        <input type="number" step="0.01" value={editForm.amountDollars || ''}
          onChange={e => setEditForm(f => ({ ...f, amountDollars: e.target.value }))}
          className="w-full border border-gray-300 rounded px-2 py-1 text-sm" />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
        <input type="date" value={editForm.date || ''}
          onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))}
          className="w-full border border-gray-300 rounded px-2 py-1 text-sm" />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
        <input type="text" value={editForm.description || ''}
          onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
          className="w-full border border-gray-300 rounded px-2 py-1 text-sm" />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
        <input type="text" value={editForm.notes || ''}
          onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
          className="w-full border border-gray-300 rounded px-2 py-1 text-sm" />
      </div>
      <div className="col-span-2 md:col-span-5 flex gap-2 mt-1">
        <button onClick={onSave} className="bg-green-600 text-white px-3 py-1 rounded text-xs hover:bg-green-700">
          Save
        </button>
        <button onClick={onCancel} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
      </div>
    </div>
  );
}
