import React, { useState, useEffect, useCallback } from 'react';
import { useApi } from '../context/AuthContext';
import AdminLayout from '../components/AdminNav';

const LOYALTY_TIERS = ['', 'bronze', 'silver', 'gold', 'platinum'];

const EMPTY_FORM = {
  name: '', address: '', city: '', state: 'WI', zip: '',
  priceCents: '', freeIfLoyaltyTier: '', freeIfMinDays: '', active: true,
};

export default function AdminDeliveryLocations() {
  const api = useApi();
  const [locations, setLocations] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [search, setSearch]       = useState('');

  const [showForm, setShowForm]   = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [saving, setSaving]       = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/admin/delivery-locations');
      setLocations(res.data || []);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load delivery locations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (loc) => {
    setEditingId(loc.id);
    setForm({
      name: loc.name || '',
      address: loc.address || '',
      city: loc.city || '',
      state: loc.state || 'WI',
      zip: loc.zip || '',
      priceCents: loc.priceCents != null ? String(loc.priceCents) : '',
      freeIfLoyaltyTier: loc.freeIfLoyaltyTier || '',
      freeIfMinDays: loc.freeIfMinDays != null ? String(loc.freeIfMinDays) : '',
      active: loc.active !== false,
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const save = async () => {
    if (!form.name || !form.address || !form.city || !form.state || !form.zip || form.priceCents === '') {
      alert('Please fill in name, address, city, state, zip, and price.');
      return;
    }
    const priceCents = parseInt(form.priceCents, 10);
    if (isNaN(priceCents) || priceCents < 0) {
      alert('Price must be a non-negative integer (in cents).');
      return;
    }
    const payload = {
      name: form.name,
      address: form.address,
      city: form.city,
      state: form.state,
      zip: form.zip,
      priceCents,
      freeIfLoyaltyTier: form.freeIfLoyaltyTier,
      freeIfMinDays: form.freeIfMinDays === '' ? null : parseInt(form.freeIfMinDays, 10),
      active: form.active,
    };
    setSaving(true);
    try {
      if (editingId) {
        await api.put(`/admin/delivery-locations/${editingId}`, payload);
      } else {
        await api.post('/admin/delivery-locations', payload);
      }
      closeForm();
      await load();
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to save delivery location');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (loc) => {
    if (!window.confirm(`Delete delivery location "${loc.name}"?`)) return;
    try {
      await api.delete(`/admin/delivery-locations/${loc.id}`);
      await load();
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to delete delivery location');
    }
  };

  const toggleActive = async (loc) => {
    try {
      await api.put(`/admin/delivery-locations/${loc.id}`, { active: !loc.active });
      await load();
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to update delivery location');
    }
  };

  const filtered = locations.filter(l =>
    !search ||
    l.name.toLowerCase().includes(search.toLowerCase()) ||
    (l.city || '').toLowerCase().includes(search.toLowerCase()) ||
    (l.zip || '').includes(search)
  );

  return (
    <AdminLayout>
      <div className="p-4 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">🚚 Dedicated Delivery Locations</h1>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Search name, city, zip…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1 text-sm dark:border-gray-600"
            />
            <button
              onClick={openCreate}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-1.5 rounded"
            >
              + Add Location
            </button>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-300 rounded-lg p-3 mb-6 text-sm text-blue-800 dark:bg-blue-900/20">
          ℹ️ Dedicated delivery locations are predetermined spots guests can choose during
          booking. Each has its own price, plus optional "free if" rules (loyalty tier or
          minimum rental days). Sales tax for a booking using one of these locations is
          resolved from the location's zip code.
        </div>

        {showForm && (
          <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6 dark:bg-gray-800 dark:border-gray-700">
            <h2 className="font-semibold text-gray-700 dark:text-gray-300 mb-3">
              {editingId ? 'Edit Location' : 'New Location'}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1 dark:text-gray-400">Name</label>
                <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-gray-300 rounded px-2 py-1 text-sm dark:border-gray-600" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1 dark:text-gray-400">Address</label>
                <input type="text" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })}
                  className="w-full border border-gray-300 rounded px-2 py-1 text-sm dark:border-gray-600" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1 dark:text-gray-400">City</label>
                <input type="text" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })}
                  className="w-full border border-gray-300 rounded px-2 py-1 text-sm dark:border-gray-600" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1 dark:text-gray-400">State</label>
                  <input type="text" value={form.state} onChange={e => setForm({ ...form, state: e.target.value })}
                    className="w-full border border-gray-300 rounded px-2 py-1 text-sm dark:border-gray-600" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1 dark:text-gray-400">Zip</label>
                  <input type="text" value={form.zip} onChange={e => setForm({ ...form, zip: e.target.value })}
                    className="w-full border border-gray-300 rounded px-2 py-1 text-sm dark:border-gray-600" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1 dark:text-gray-400">Price (cents)</label>
                <input type="number" min="0" value={form.priceCents}
                  onChange={e => setForm({ ...form, priceCents: e.target.value })}
                  className="w-full border border-gray-300 rounded px-2 py-1 text-sm dark:border-gray-600" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1 dark:text-gray-400">Free if loyalty tier ≥</label>
                <select value={form.freeIfLoyaltyTier}
                  onChange={e => setForm({ ...form, freeIfLoyaltyTier: e.target.value })}
                  className="w-full border border-gray-300 rounded px-2 py-1 text-sm dark:border-gray-600">
                  {LOYALTY_TIERS.map(t => (
                    <option key={t} value={t}>{t === '' ? 'None' : t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1 dark:text-gray-400">Free if rental ≥ N days</label>
                <input type="number" min="0" value={form.freeIfMinDays}
                  onChange={e => setForm({ ...form, freeIfMinDays: e.target.value })}
                  className="w-full border border-gray-300 rounded px-2 py-1 text-sm dark:border-gray-600" />
              </div>
              <div className="flex items-center gap-2 mt-5">
                <input type="checkbox" id="active" checked={form.active}
                  onChange={e => setForm({ ...form, active: e.target.checked })} />
                <label htmlFor="active" className="text-sm text-gray-700 dark:text-gray-300">Active</label>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button onClick={save} disabled={saving}
                className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-3 py-1.5 rounded disabled:opacity-50">
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button onClick={closeForm} className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 px-3 py-1.5">
                Cancel
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-gray-400 text-sm p-4 dark:text-gray-500">Loading…</div>
        ) : error ? (
          <div className="text-red-600 text-sm p-4">{error}</div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden dark:bg-gray-800 dark:border-gray-700">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex justify-between items-center dark:bg-gray-900/40 dark:border-gray-700">
              <h2 className="font-semibold text-gray-700 dark:text-gray-300">Locations</h2>
              <span className="text-sm text-gray-500 dark:text-gray-400">{filtered.length} of {locations.length}</span>
            </div>
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-200 dark:bg-gray-900/40 dark:text-gray-400 dark:border-gray-700">
                <tr>
                  <th className="px-4 py-2 text-left">Name</th>
                  <th className="px-4 py-2 text-left">Address</th>
                  <th className="px-4 py-2 text-right">Price</th>
                  <th className="px-4 py-2 text-left">Free Rules</th>
                  <th className="px-4 py-2 text-center">Active</th>
                  <th className="px-4 py-2 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {filtered.map(l => (
                  <tr key={l.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-900/40">
                    <td className="px-4 py-2 text-gray-700 dark:text-gray-300 font-medium">{l.name}</td>
                    <td className="px-4 py-2 text-gray-600 dark:text-gray-400">
                      {l.address}, {l.city}, {l.state} {l.zip}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-800 dark:text-gray-100">
                      ${(l.priceCents / 100).toFixed(2)}
                    </td>
                    <td className="px-4 py-2 text-gray-600 dark:text-gray-400 text-xs">
                      {l.freeIfLoyaltyTier ? `Tier ≥ ${l.freeIfLoyaltyTier}` : ''}
                      {l.freeIfLoyaltyTier && l.freeIfMinDays ? ' or ' : ''}
                      {l.freeIfMinDays ? `${l.freeIfMinDays}+ days` : ''}
                      {!l.freeIfLoyaltyTier && !l.freeIfMinDays ? '—' : ''}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <button onClick={() => toggleActive(l)}
                        className={`text-xs font-medium px-2 py-0.5 rounded ${l.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {l.active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="px-4 py-2 text-center whitespace-nowrap">
                      <button onClick={() => openEdit(l)} className="text-blue-600 hover:text-blue-800 text-xs font-medium mr-2">
                        Edit
                      </button>
                      <button onClick={() => remove(l)} className="text-red-600 hover:text-red-800 text-xs font-medium">
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-gray-400 dark:text-gray-500">
                      No delivery locations yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
