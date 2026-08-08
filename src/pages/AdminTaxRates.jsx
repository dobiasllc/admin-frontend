import React, { useState, useEffect, useCallback } from 'react';
import { useApi } from '../context/AuthContext';
import AdminLayout from '../components/AdminNav';

export default function AdminTaxRates() {
  const api = useApi();
  const [rates, setRates]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [editingCounty, setEditingCounty] = useState(null);
  const [editValue, setEditValue]         = useState('');
  const [saving, setSaving]   = useState(false);
  const [search, setSearch]   = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/admin/tax-rates');
      setRates(res.data || []);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load tax rates');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const startEdit = (r) => {
    setEditingCounty(r.county);
    setEditValue(String(r.ratePct));
  };

  const cancelEdit = () => {
    setEditingCounty(null);
    setEditValue('');
  };

  const saveEdit = async (county) => {
    const val = parseFloat(editValue);
    if (isNaN(val) || val < 0) { alert('Enter a valid non-negative rate'); return; }
    setSaving(true);
    try {
      await api.put(`/admin/tax-rates/${encodeURIComponent(county)}`, { ratePct: val });
      cancelEdit();
      await load();
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to update tax rate');
    } finally {
      setSaving(false);
    }
  };

  const filtered = rates.filter(r =>
    !search || r.county.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AdminLayout>
      <div className="p-4 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">🧮 WI County Tax Rates</h1>
          <input
            type="text"
            placeholder="Search county…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-sm dark:border-gray-600"
          />
        </div>

        <div className="bg-blue-50 border border-blue-300 rounded-lg p-3 mb-6 text-sm text-blue-800 dark:bg-blue-900/20">
          ℹ️ These effective sales tax rates (WI state 5% + local county tax where applicable) are
          looked up automatically based on the delivery/pickup location's zip code for each booking.
          If a zip code can't be matched to a WI county, the fallback rate configured in{' '}
          <a href="/admin/settings" className="underline">Settings</a> is used instead.
        </div>

        {loading ? (
          <div className="text-gray-400 text-sm p-4 dark:text-gray-500">Loading…</div>
        ) : error ? (
          <div className="text-red-600 text-sm p-4">{error}</div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden dark:bg-gray-800 dark:border-gray-700">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex justify-between items-center dark:bg-gray-900/40 dark:border-gray-700">
              <h2 className="font-semibold text-gray-700 dark:text-gray-300">Counties</h2>
              <span className="text-sm text-gray-500 dark:text-gray-400">{filtered.length} of {rates.length}</span>
            </div>
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-200 dark:bg-gray-900/40 dark:text-gray-400 dark:border-gray-700">
                <tr>
                  <th className="px-4 py-2 text-left">County</th>
                  <th className="px-4 py-2 text-right">Effective Rate (%)</th>
                  <th className="px-4 py-2 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {filtered.map(r => (
                  <tr key={r.county} className="hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-900/40">
                    <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{r.county}</td>
                    <td className="px-4 py-2 text-right">
                      {editingCounty === r.county ? (
                        <input
                          type="number" step="0.01" min="0"
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          className="w-24 border border-gray-300 rounded px-2 py-1 text-sm text-right dark:border-gray-600"
                          autoFocus
                        />
                      ) : (
                        <span className="font-medium text-gray-800 dark:text-gray-100">{r.ratePct}%</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-center whitespace-nowrap">
                      {editingCounty === r.county ? (
                        <>
                          <button onClick={() => saveEdit(r.county)} disabled={saving}
                            className="text-green-600 hover:text-green-800 text-xs font-medium mr-2 disabled:opacity-50">
                            {saving ? 'Saving…' : 'Save'}
                          </button>
                          <button onClick={cancelEdit} className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400">Cancel</button>
                        </>
                      ) : (
                        <button onClick={() => startEdit(r)} className="text-blue-600 hover:text-blue-800 text-xs font-medium">
                          Edit
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
