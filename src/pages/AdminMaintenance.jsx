import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useApi } from "../context/AuthContext";
import AdminLayout from "../components/AdminNav";

const STATUS_META = {
  red:    { label: "Overdue",   dot: "bg-red-500",    row: "bg-red-50 dark:bg-red-900/20" },
  yellow: { label: "Due Soon",  dot: "bg-yellow-400",  row: "bg-yellow-50 dark:bg-yellow-900/20" },
  green:  { label: "OK",        dot: "bg-green-500",   row: "" },
  gray:   { label: "As Needed", dot: "bg-gray-400",    row: "" },
};

function StatusDot({ status }) {
  const meta = STATUS_META[status] || STATUS_META.gray;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`w-2.5 h-2.5 rounded-full ${meta.dot}`} />
      <span className="text-xs text-gray-500 dark:text-gray-400">{meta.label}</span>
    </span>
  );
}

function money(cents) {
  return `$${((cents || 0) / 100).toFixed(2)}`;
}

// ── Tax Expense Link Picker (browse + search + create-new) ──────────────────
function TaxLinkPicker({ onSelect, onCreateNew }) {
  const api = useApi();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const search = useCallback(async (q) => {
    setLoading(true);
    try {
      const res = await api.get(`/admin/tax-expenses/search?q=${encodeURIComponent(q || "")}&unlinkedOnly=1`);
      setResults(res.data || []);
    } catch (e) { /* ignore */ }
    setLoading(false);
  }, [api]);

  // Load recent/browsable expenses immediately on mount, then re-search as user types.
  useEffect(() => {
    const t = setTimeout(() => search(query), query ? 350 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <div className="border-t pt-3 dark:border-gray-700">
      <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
        Link to Tax Tracker Expense (optional — avoids double-entering cost)
      </label>
      <input type="text" value={query} onChange={e => setQuery(e.target.value)}
        placeholder="Search by description/merchant, or browse recent below..."
        className="w-full border rounded px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
      <div className="mt-1 max-h-40 overflow-y-auto border rounded dark:border-gray-600">
        {loading && <div className="px-3 py-2 text-xs text-gray-400">Loading…</div>}
        {!loading && results.length === 0 && (
          <div className="px-3 py-2 text-xs text-gray-400">
            No unlinked expenses found{query ? " matching that search" : ""}.
          </div>
        )}
        {!loading && results.map(r => (
          <button key={r.timestamp} onClick={() => onSelect(r)}
            className="w-full text-left px-3 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-white border-b last:border-b-0 dark:border-gray-700">
            {r.description || r.merchant || "(no description)"} — {money(r.amountCents)} ({r.date})
          </button>
        ))}
      </div>
      {onCreateNew && (
        <button type="button" onClick={onCreateNew}
          className="mt-2 text-xs text-blue-600 dark:text-blue-400 underline">
          + Can't find it? Create a new Tax Tracker expense
        </button>
      )}
    </div>
  );
}

// ── Quick-create Tax Expense inline (used from the link picker) ─────────────
function QuickCreateTaxExpenseModal({ defaultDescription, defaultAmountCents, onClose, onCreated }) {
  const api = useApi();
  const [description, setDescription] = useState(defaultDescription || "");
  const [category, setCategory] = useState("Vehicle Maintenance");
  const [amount, setAmount] = useState(defaultAmountCents ? (defaultAmountCents / 100).toFixed(2) : "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    if (!description.trim() || !amount) {
      setError("Description and amount are required");
      return;
    }
    setSaving(true);
    try {
      const res = await api.post("/admin/tax-expenses", {
        category, description, date,
        amountCents: Math.round(parseFloat(amount) * 100),
      });
      onCreated({ timestamp: res.data.timestamp, description, amountCents: Math.round(parseFloat(amount) * 100), date });
    } catch (e) {
      setError(e?.response?.data?.error || "Failed to create expense");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md p-6">
        <h3 className="text-lg font-semibold mb-4 dark:text-white">New Tax Tracker Expense</h3>
        {error && <div className="mb-3 text-sm text-red-600">{error}</div>}
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Description</label>
            <input type="text" value={description} onChange={e => setDescription(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Category</label>
            <input type="text" value={category} onChange={e => setCategory(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Amount ($)</label>
              <input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded border dark:border-gray-600 dark:text-white">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm rounded bg-blue-600 text-white disabled:opacity-50">
            {saving ? "Saving..." : "Create & Link"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Mark Done Modal ───────────────────────────────────────────────────────────
function MarkDoneModal({ vin, item, onClose, onSaved }) {
  const api = useApi();
  const [mileage, setMileage] = useState("");
  const [performedAt, setPerformedAt] = useState(new Date().toISOString().slice(0, 10));
  const [cost, setCost] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedLink, setSelectedLink] = useState(null);
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    setError("");
    if (!mileage && !item.asNeeded) {
      setError("Mileage at service is required");
      return;
    }
    setSaving(true);
    try {
      const body = {
        maintenanceType: item.label,
        description: item.label,
        notes,
        mileageAtService: parseInt(mileage || "0", 10),
        performedAt,
        itemKey: item.itemKey,
      };
      if (selectedLink) {
        body.linkedTaxExpenseTs = selectedLink.timestamp;
      } else if (cost) {
        body.cost = Math.round(parseFloat(cost) * 100);
      }
      await api.post(`/admin/vehicles/${vin}/maintenance`, body);
      onSaved();
    } catch (e) {
      setError(e?.response?.data?.error || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md p-6">
        <h3 className="text-lg font-semibold mb-4 dark:text-white">Mark Done: {item.label}</h3>
        {error && <div className="mb-3 text-sm text-red-600">{error}</div>}
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Performed On</label>
            <input type="date" value={performedAt} onChange={e => setPerformedAt(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Mileage at Service</label>
            <input type="number" value={mileage} onChange={e => setMileage(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              placeholder="e.g. 42000" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Notes</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
          </div>

          {!selectedLink && (
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Cost ($)</label>
              <input type="number" step="0.01" value={cost} onChange={e => setCost(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                placeholder="0.00" />
            </div>
          )}

          {selectedLink ? (
            <div className="border-t pt-3 dark:border-gray-700">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                Linked Tax Tracker Expense
              </label>
              <div className="flex items-center justify-between bg-blue-50 dark:bg-blue-900/30 rounded px-3 py-2 text-sm">
                <span>🔗 {selectedLink.description} — {money(selectedLink.amountCents)} ({selectedLink.date})</span>
                <button onClick={() => setSelectedLink(null)} className="text-xs text-red-600 ml-2">Remove</button>
              </div>
            </div>
          ) : (
            <TaxLinkPicker
              onSelect={(r) => setSelectedLink(r)}
              onCreateNew={() => setShowQuickCreate(true)}
            />
          )}
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded border dark:border-gray-600 dark:text-white">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm rounded bg-blue-600 text-white disabled:opacity-50">
            {saving ? "Saving..." : "Mark Done"}
          </button>
        </div>
      </div>
      {showQuickCreate && (
        <QuickCreateTaxExpenseModal
          defaultDescription={notes || item.label}
          defaultAmountCents={cost ? Math.round(parseFloat(cost) * 100) : null}
          onClose={() => setShowQuickCreate(false)}
          onCreated={(created) => { setSelectedLink(created); setShowQuickCreate(false); }}
        />
      )}
    </div>
  );
}

// ── Snooze Modal ───────────────────────────────────────────────────────────
function SnoozeModal({ vin, item, onClose, onSaved }) {
  const api = useApi();
  const [extraMiles, setExtraMiles] = useState("");
  const [newDate, setNewDate] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const body = { overrideNote: note };
      if (extraMiles) {
        const baseMiles = item.lastPerformedMileage || 0;
        body.manualOverrideMiles = baseMiles + parseInt(extraMiles, 10);
      }
      if (newDate) {
        body.manualOverrideDate = newDate;
      }
      await api.put(`/admin/vehicles/${vin}/maintenance-schedule/${item.itemKey}`, body);
      onSaved();
    } catch (e) {
      alert(e?.response?.data?.error || "Failed to snooze");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md p-6">
        <h3 className="text-lg font-semibold mb-1 dark:text-white">Snooze: {item.label}</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Push out the due date/mileage without marking it done.
        </p>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
              Push out additional miles (from last performed)
            </label>
            <input type="number" value={extraMiles} onChange={e => setExtraMiles(e.target.value)}
              placeholder="e.g. 2000"
              className="w-full border rounded px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Or set new due date</label>
            <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Note</label>
            <input type="text" value={note} onChange={e => setNote(e.target.value)}
              placeholder="e.g. Tires still have good tread"
              className="w-full border rounded px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded border dark:border-gray-600 dark:text-white">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm rounded bg-yellow-500 text-white disabled:opacity-50">
            {saving ? "Saving..." : "Snooze"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Add Custom Item Modal ───────────────────────────────────────────────────
function AddCustomItemModal({ vin, onClose, onSaved }) {
  const api = useApi();
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState("Other/Misc");
  const [intervalMiles, setIntervalMiles] = useState("");
  const [intervalMonths, setIntervalMonths] = useState("");
  const [intervalLogic, setIntervalLogic] = useState("either");
  const [asNeeded, setAsNeeded] = useState(false);
  const [saving, setSaving] = useState(false);

  const bothIntervalsSet = !!(intervalMiles && intervalMonths);

  const handleSave = async () => {
    if (!label.trim()) return;
    setSaving(true);
    try {
      await api.post(`/admin/vehicles/${vin}/maintenance-schedule`, {
        label, category,
        intervalMiles: intervalMiles ? parseInt(intervalMiles, 10) : null,
        intervalMonths: intervalMonths ? parseInt(intervalMonths, 10) : null,
        intervalLogic,
        asNeeded,
      });
      onSaved();
    } catch (e) {
      alert(e?.response?.data?.error || "Failed to add item");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md p-6">
        <h3 className="text-lg font-semibold mb-4 dark:text-white">Add Custom Maintenance Item</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Label</label>
            <input type="text" value={label} onChange={e => setLabel(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Category</label>
            <input type="text" value={category} onChange={e => setCategory(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Interval (Miles)</label>
              <input type="number" value={intervalMiles} onChange={e => setIntervalMiles(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Interval (Months)</label>
              <input type="number" value={intervalMonths} onChange={e => setIntervalMonths(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
            </div>
          </div>
          {bothIntervalsSet && (
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                When both are set, item is due when:
              </label>
              <select value={intervalLogic} onChange={e => setIntervalLogic(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                <option value="either">Either is reached (whichever comes first)</option>
                <option value="both">Both are reached (whichever comes later)</option>
              </select>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm dark:text-gray-300">
            <input type="checkbox" checked={asNeeded} onChange={e => setAsNeeded(e.target.checked)} />
            As-needed (informational only, no urgency tracking)
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded border dark:border-gray-600 dark:text-white">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm rounded bg-blue-600 text-white disabled:opacity-50">
            {saving ? "Saving..." : "Add Item"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Edit Cadence Modal (edit interval/logic for any tracked item) ───────────
function EditCadenceModal({ vin, item, onClose, onSaved }) {
  const api = useApi();
  const [label, setLabel] = useState(item.label || "");
  const [category, setCategory] = useState(item.category || "");
  const [intervalMiles, setIntervalMiles] = useState(item.intervalMiles ?? "");
  const [intervalMonths, setIntervalMonths] = useState(item.intervalMonths ?? "");
  const [intervalLogic, setIntervalLogic] = useState(item.intervalLogic || "either");
  const [asNeeded, setAsNeeded] = useState(!!item.asNeeded);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const bothIntervalsSet = !!(intervalMiles && intervalMonths);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const body = {
        intervalMiles: intervalMiles !== "" ? parseInt(intervalMiles, 10) : null,
        intervalMonths: intervalMonths !== "" ? parseInt(intervalMonths, 10) : null,
        intervalLogic,
        asNeeded,
      };
      if (item.isCustom) {
        body.label = label;
        body.category = category;
      }
      await api.put(`/admin/vehicles/${vin}/maintenance-schedule/${item.itemKey}`, body);
      onSaved();
    } catch (e) {
      setError(e?.response?.data?.error || "Failed to save cadence");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md p-6">
        <h3 className="text-lg font-semibold mb-4 dark:text-white">Edit Cadence: {item.label}</h3>
        {error && <div className="mb-3 text-sm text-red-600">{error}</div>}
        <div className="space-y-3">
          {item.isCustom && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Label</label>
                <input type="text" value={label} onChange={e => setLabel(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Category</label>
                <input type="text" value={category} onChange={e => setCategory(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
              </div>
            </>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Interval (Miles)</label>
              <input type="number" value={intervalMiles} onChange={e => setIntervalMiles(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Interval (Months)</label>
              <input type="number" value={intervalMonths} onChange={e => setIntervalMonths(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
            </div>
          </div>
          {bothIntervalsSet && (
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                When both are set, item is due when:
              </label>
              <select value={intervalLogic} onChange={e => setIntervalLogic(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                <option value="either">Either is reached (whichever comes first)</option>
                <option value="both">Both are reached (whichever comes later)</option>
              </select>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm dark:text-gray-300">
            <input type="checkbox" checked={asNeeded} onChange={e => setAsNeeded(e.target.checked)} />
            As-needed (informational only, no urgency tracking)
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded border dark:border-gray-600 dark:text-white">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm rounded bg-blue-600 text-white disabled:opacity-50">
            {saving ? "Saving..." : "Save Cadence"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Fleet Overview (scalable to hundreds of vehicles) ────────────────────────
function FleetOverview({ vehicles, scheduleByVin, filterVin, setFilterVin }) {
  const summaries = useMemo(() => {
    return vehicles.map(v => {
      const items = (scheduleByVin[v.vin] || []).filter(i => i.active !== false);
      const counts = { red: 0, yellow: 0, green: 0, gray: 0 };
      items.forEach(i => { counts[i.status] = (counts[i.status] || 0) + 1; });
      return { vin: v.vin, name: `${v.year || ""} ${v.make || ""} ${v.model || ""}`.trim(), counts, tracked: items.length };
    });
  }, [vehicles, scheduleByVin]);

  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setFilterVin("")}
          className={`px-3 py-1.5 text-xs rounded-full border ${!filterVin ? "bg-blue-600 text-white border-blue-600" : "dark:border-gray-600 dark:text-gray-300"}`}>
          All Vehicles ({vehicles.length})
        </button>
        {summaries.map(s => (
          <button key={s.vin} onClick={() => setFilterVin(s.vin)}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs rounded-full border ${filterVin === s.vin ? "bg-blue-600 text-white border-blue-600" : "dark:border-gray-600 dark:text-gray-300"}`}>
            <span>{s.name || s.vin}</span>
            {s.counts.red > 0 && <span className="w-4 h-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center">{s.counts.red}</span>}
            {s.counts.yellow > 0 && <span className="w-4 h-4 rounded-full bg-yellow-400 text-white text-[10px] flex items-center justify-center">{s.counts.yellow}</span>}
            {s.counts.red === 0 && s.counts.yellow === 0 && s.tracked > 0 && (
              <span className="w-4 h-4 rounded-full bg-green-500 text-white text-[10px] flex items-center justify-center">✓</span>
            )}
          </button>
        ))}
      </div>
      <p className="text-xs text-gray-400 mt-1">
        Red/yellow badges show overdue/due-soon counts per vehicle. Click a vehicle to drill in — this scales to large fleets without listing every item at once.
      </p>
    </div>
  );
}

// ── Schedule Status Board ───────────────────────────────────────────────────
function ScheduleBoard({ vehicles, filterVin, setFilterVin, scheduleByVin, setScheduleByVin, loading, loadAll }) {
  const api = useApi();
  const [markDoneTarget, setMarkDoneTarget] = useState(null); // {vin, item}
  const [snoozeTarget, setSnoozeTarget] = useState(null);
  const [editCadenceTarget, setEditCadenceTarget] = useState(null);
  const [addCustomVin, setAddCustomVin] = useState(null);
  const [expandedCategories, setExpandedCategories] = useState({});
  const [showInactive, setShowInactive] = useState(false);

  const handleDeactivate = async (vin, item) => {
    if (!window.confirm(`${item.isCustom ? "Delete" : "Stop tracking"} "${item.label}"?`)) return;
    try {
      await api.delete(`/admin/vehicles/${vin}/maintenance-schedule/${item.itemKey}`);
      loadAll();
    } catch (e) {
      alert(e?.response?.data?.error || "Failed");
    }
  };

  const handleActivate = async (vin, item) => {
    try {
      await api.put(`/admin/vehicles/${vin}/maintenance-schedule/${item.itemKey}`, { active: true });
      loadAll();
    } catch (e) {
      alert(e?.response?.data?.error || "Failed to start tracking");
    }
  };

  const vehicleName = (vin) => {
    const v = vehicles.find(x => x.vin === vin);
    return v ? `${v.year || ""} ${v.make || ""} ${v.model || ""}`.trim() : vin;
  };

  const activeRows = [];
  const inactiveRows = [];
  Object.entries(scheduleByVin).forEach(([vin, items]) => {
    if (filterVin && filterVin !== vin) return;
    items.forEach(item => {
      if (item.active === false) inactiveRows.push({ vin, item });
      else activeRows.push({ vin, item });
    });
  });

  const statusRank = { red: 0, yellow: 1, green: 2, gray: 3 };
  activeRows.sort((a, b) => (statusRank[a.item.status] ?? 4) - (statusRank[b.item.status] ?? 4));

  // Group inactive (suggested/not-tracked) items by category for scanability.
  const inactiveByCategory = {};
  inactiveRows.forEach(({ vin, item }) => {
    const cat = item.category || "Other";
    if (!inactiveByCategory[cat]) inactiveByCategory[cat] = [];
    inactiveByCategory[cat].push({ vin, item });
  });
  const categoryNames = Object.keys(inactiveByCategory).sort();

  const toggleCategory = (cat) => setExpandedCategories(p => ({ ...p, [cat]: !p[cat] }));

  if (loading) return <div className="text-sm text-gray-500 dark:text-gray-400 py-4">Loading schedule…</div>;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {filterVin && (
          <button onClick={() => setAddCustomVin(filterVin)}
            className="px-3 py-1 text-xs rounded bg-green-600 text-white">
            + Add Custom Item
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded border dark:border-gray-700">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">Status</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">Vehicle</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">Item</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">Last Performed</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">Due</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">Total Cost</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y dark:divide-gray-700">
            {activeRows.map(({ vin, item }) => {
              const meta = STATUS_META[item.status] || STATUS_META.gray;
              return (
                <tr key={`${vin}-${item.itemKey}`} className={meta.row}>
                  <td className="px-3 py-2"><StatusDot status={item.status} /></td>
                  <td className="px-3 py-2 text-gray-700 dark:text-gray-200">{vehicleName(vin)}</td>
                  <td className="px-3 py-2 dark:text-white">
                    <span className="text-[10px] uppercase tracking-wide text-gray-400 mr-1">{item.category}</span>
                    {item.label}
                    {item.overrideNote && (
                      <div className="text-xs text-gray-400 italic">Note: {item.overrideNote}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-500 dark:text-gray-400">
                    {item.lastPerformedAt ? item.lastPerformedAt.slice(0, 10) : "Never"}
                    {item.lastPerformedMileage != null ? ` @ ${item.lastPerformedMileage} mi` : ""}
                  </td>
                  <td className="px-3 py-2 text-gray-500 dark:text-gray-400">
                    {item.dueDate || ""}{item.dueDate && item.dueMiles ? (item.intervalLogic === "both" ? " and " : " or ") : ""}{item.dueMiles ? `${item.dueMiles} mi` : ""}
                    {!item.dueDate && !item.dueMiles ? "—" : ""}
                  </td>
                  <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{money(item.totalCostCents)}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1 flex-wrap">
                      <button onClick={() => setMarkDoneTarget({ vin, item })}
                        className="px-2 py-1 text-xs rounded bg-green-600 text-white">Mark Done</button>
                      {item.status !== "gray" && (
                        <button onClick={() => setSnoozeTarget({ vin, item })}
                          className="px-2 py-1 text-xs rounded bg-yellow-500 text-white">Snooze</button>
                      )}
                      <button onClick={() => setEditCadenceTarget({ vin, item })}
                        className="px-2 py-1 text-xs rounded border dark:border-gray-600 dark:text-gray-300">Edit</button>
                      <button onClick={() => handleDeactivate(vin, item)}
                        className="px-2 py-1 text-xs rounded border dark:border-gray-600 dark:text-gray-300">
                        {item.isCustom ? "Delete" : "Stop Tracking"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {activeRows.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-400">
                No items currently tracked{filterVin ? " for this vehicle" : ""}. Use "Suggested Items" below to start tracking.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Suggested / Not Tracked items — opt-in, grouped by category */}
      <div className="mt-5">
        <button onClick={() => setShowInactive(s => !s)}
          className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300">
          <span>{showInactive ? "▼" : "▶"}</span>
          Suggested Items — Not Tracked ({inactiveRows.length})
        </button>
        {showInactive && (
          <div className="mt-2 space-y-2">
            {categoryNames.length === 0 && (
              <div className="text-xs text-gray-400 px-2">Nothing suggested — all default items are already tracked.</div>
            )}
            {categoryNames.map(cat => {
              const rows = inactiveByCategory[cat];
              const expanded = expandedCategories[cat] ?? false;
              return (
                <div key={cat} className="border rounded dark:border-gray-700">
                  <button onClick={() => toggleCategory(cat)}
                    className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700/50">
                    <span>{expanded ? "▼" : "▶"} {cat} ({rows.length})</span>
                  </button>
                  {expanded && (
                    <div className="divide-y dark:divide-gray-700">
                      {rows.map(({ vin, item }) => (
                        <div key={`${vin}-${item.itemKey}`} className="flex items-center justify-between px-3 py-2 text-sm">
                          <div>
                            <span className="dark:text-white">{item.label}</span>
                            <span className="text-xs text-gray-400 ml-2">{vehicleName(vin)}</span>
                            <span className="text-xs text-gray-400 ml-2">
                              {item.intervalMiles ? `every ${item.intervalMiles} mi` : ""}
                              {item.intervalMiles && item.intervalMonths ? (item.intervalLogic === "both" ? " and " : " or ") : ""}
                              {item.intervalMonths ? `every ${item.intervalMonths} mo` : ""}
                              {!item.intervalMiles && !item.intervalMonths ? "as needed" : ""}
                            </span>
                          </div>
                          <div className="flex gap-1">
                            <button onClick={() => handleActivate(vin, item)}
                              className="px-2 py-1 text-xs rounded bg-blue-600 text-white">
                              {item.isCustom ? "Reactivate" : "Start Tracking"}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {markDoneTarget && (
        <MarkDoneModal vin={markDoneTarget.vin} item={markDoneTarget.item}
          onClose={() => setMarkDoneTarget(null)}
          onSaved={() => { setMarkDoneTarget(null); loadAll(); }} />
      )}
      {snoozeTarget && (
        <SnoozeModal vin={snoozeTarget.vin} item={snoozeTarget.item}
          onClose={() => setSnoozeTarget(null)}
          onSaved={() => { setSnoozeTarget(null); loadAll(); }} />
      )}
      {addCustomVin && (
        <AddCustomItemModal vin={addCustomVin}
          onClose={() => setAddCustomVin(null)}
          onSaved={() => { setAddCustomVin(null); loadAll(); }} />
      )}
      {editCadenceTarget && (
        <EditCadenceModal vin={editCadenceTarget.vin} item={editCadenceTarget.item}
          onClose={() => setEditCadenceTarget(null)}
          onSaved={() => { setEditCadenceTarget(null); loadAll(); }} />
      )}
    </div>
  );
}

// ── Edit History Record Modal ───────────────────────────────────────────────
function EditHistoryRecordModal({ record, onClose, onSaved }) {
  const api = useApi();
  const [maintenanceType, setMaintenanceType] = useState(record.maintenanceType || "");
  const [notes, setNotes] = useState(record.notes || "");
  const [mileage, setMileage] = useState(record.mileageAtService ?? "");
  const [performedAt, setPerformedAt] = useState((record.performedAt || "").slice(0, 10));
  const [cost, setCost] = useState(record.cost ? (record.cost / 100).toFixed(2) : "");
  const [isPublic, setIsPublic] = useState(!!record.isPublic);
  const [selectedLink, setSelectedLink] = useState(null);
  const [linkLoaded, setLinkLoaded] = useState(!record.linkedTaxExpenseTs);
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [itemKey, setItemKey] = useState(record.itemKey || "");
  const [scheduleItems, setScheduleItems] = useState([]);

  useEffect(() => {
    let cancelled = false;
    if (record.linkedTaxExpenseTs) {
      api.get(`/admin/tax-expenses/${encodeURIComponent(record.linkedTaxExpenseTs)}`)
        .then(res => { if (!cancelled) setSelectedLink(res.data); })
        .catch(() => {})
        .finally(() => { if (!cancelled) setLinkLoaded(true); });
    }
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record.linkedTaxExpenseTs]);

  useEffect(() => {
    let cancelled = false;
    api.get(`/admin/vehicles/${record.vin}/maintenance-schedule`)
      .then(res => { if (!cancelled) setScheduleItems(res.data || []); })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record.vin]);

  const handleUnlink = () => setSelectedLink({ __unlinked: true });

  const handleSave = async () => {
    setError("");
    setSaving(true);
    try {
      const body = {
        maintenanceType,
        notes,
        mileageAtService: mileage !== "" ? parseInt(mileage, 10) : undefined,
        performedAt,
        isPublic,
        itemKey: itemKey || null,
      };
      if (selectedLink && !selectedLink.__unlinked) {
        body.linkedTaxExpenseTs = selectedLink.timestamp;
      } else if (selectedLink && selectedLink.__unlinked) {
        body.linkedTaxExpenseTs = null;
        if (cost) body.cost = Math.round(parseFloat(cost) * 100);
      } else if (cost) {
        body.cost = Math.round(parseFloat(cost) * 100);
      }
      await api.put(`/admin/vehicles/${record.vin}/maintenance/${encodeURIComponent(record.timestamp)}`, body);
      onSaved();
    } catch (e) {
      setError(e?.response?.data?.error || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const currentlyLinked = selectedLink && !selectedLink.__unlinked
    ? selectedLink
    : (!selectedLink && record.linkedTaxExpenseTs ? { __pending: true } : null);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md p-6">
        <h3 className="text-lg font-semibold mb-4 dark:text-white">Edit Maintenance Record</h3>
        {error && <div className="mb-3 text-sm text-red-600">{error}</div>}
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Type</label>
            <input type="text" value={maintenanceType} onChange={e => setMaintenanceType(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Performed On</label>
            <input type="date" value={performedAt} onChange={e => setPerformedAt(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Mileage at Service</label>
            <input type="number" value={mileage} onChange={e => setMileage(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Notes</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
          </div>

          {(!currentlyLinked) && (
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Cost ($)</label>
              <input type="number" step="0.01" value={cost} onChange={e => setCost(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                placeholder="0.00" />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
              Associated Schedule Item (for maintenance tracking)
            </label>
            <select value={itemKey} onChange={e => setItemKey(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white">
              <option value="">— None —</option>
              {scheduleItems.map(si => (
                <option key={si.itemKey} value={si.itemKey}>{si.label}{si.active === false ? " (inactive)" : ""}</option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm dark:text-gray-300">
            <input type="checkbox" checked={isPublic} onChange={e => setIsPublic(e.target.checked)} />
            Show to guest (public)
          </label>

          {!linkLoaded ? (
            <div className="text-xs text-gray-400 border-t pt-3 dark:border-gray-700">Loading linked expense…</div>
          ) : currentlyLinked && currentlyLinked.__pending ? (
            <div className="text-xs text-gray-400 border-t pt-3 dark:border-gray-700">Loading linked expense…</div>
          ) : currentlyLinked ? (
            <div className="border-t pt-3 dark:border-gray-700">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                Linked Tax Tracker Expense
              </label>
              <div className="flex items-center justify-between bg-blue-50 dark:bg-blue-900/30 rounded px-3 py-2 text-sm">
                <span>🔗 {currentlyLinked.description} — {money(currentlyLinked.amountCents)} ({currentlyLinked.date})</span>
                <button onClick={handleUnlink} className="text-xs text-red-600 ml-2">Unlink</button>
              </div>
            </div>
          ) : (
            <TaxLinkPicker
              onSelect={(r) => setSelectedLink(r)}
              onCreateNew={() => setShowQuickCreate(true)}
            />
          )}
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded border dark:border-gray-600 dark:text-white">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm rounded bg-blue-600 text-white disabled:opacity-50">
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
      {showQuickCreate && (
        <QuickCreateTaxExpenseModal
          defaultDescription={notes || maintenanceType}
          defaultAmountCents={cost ? Math.round(parseFloat(cost) * 100) : null}
          onClose={() => setShowQuickCreate(false)}
          onCreated={(created) => { setSelectedLink(created); setShowQuickCreate(false); }}
        />
      )}
    </div>
  );
}

// ── History Table (legacy MAINTENANCE# log) ─────────────────────────────────
function HistoryTable({ vehicles, filterVin, refreshKey, onChanged }) {
  const api = useApi();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editTarget, setEditTarget] = useState(null);
  const [linkedExpenses, setLinkedExpenses] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    const all = [];
    await Promise.all(vehicles.map(async (v) => {
      try {
        const res = await api.get(`/admin/vehicles/${v.vin}/maintenance`);
        (res.data || []).forEach(r => all.push({ ...r, vin: v.vin }));
      } catch (e) { /* ignore */ }
    }));
    all.sort((a, b) => (b.performedAt || "").localeCompare(a.performedAt || ""));
    setRecords(all);
    setLoading(false);

    const uniqueTs = Array.from(new Set(all.map(r => r.linkedTaxExpenseTs).filter(Boolean)));
    if (uniqueTs.length) {
      const entries = await Promise.all(uniqueTs.map(async (ts) => {
        try {
          const res = await api.get(`/admin/tax-expenses/${encodeURIComponent(ts)}`);
          return [ts, res.data];
        } catch (e) {
          return [ts, null];
        }
      }));
      setLinkedExpenses(Object.fromEntries(entries));
    } else {
      setLinkedExpenses({});
    }
  }, [api, vehicles]);

  useEffect(() => { if (vehicles.length) load(); }, [vehicles, load, refreshKey]);

  const vehicleName = (vin) => {
    const v = vehicles.find(x => x.vin === vin);
    return v ? `${v.year || ""} ${v.make || ""} ${v.model || ""}`.trim() : vin;
  };

  const handleDelete = async (r) => {
    if (!window.confirm(`Delete this ${r.maintenanceType} record from ${(r.performedAt || "").slice(0, 10)}?`)) return;
    try {
      await api.delete(`/admin/vehicles/${r.vin}/maintenance/${encodeURIComponent(r.timestamp)}`);
      load();
      if (onChanged) onChanged();
    } catch (e) {
      alert(e?.response?.data?.error || "Failed to delete");
    }
  };

  const filtered = filterVin ? records.filter(r => r.vin === filterVin) : records;

  if (loading) return <div className="text-sm text-gray-500 dark:text-gray-400 py-4">Loading history…</div>;

  return (
    <div className="overflow-x-auto rounded border dark:border-gray-700">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 dark:bg-gray-700">
          <tr>
            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">Date</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">Vehicle</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">Type</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">Notes</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">Mileage</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">Cost</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">Linked</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300"></th>
          </tr>
        </thead>
        <tbody className="divide-y dark:divide-gray-700">
          {filtered.map(r => (
            <tr key={`${r.vin}-${r.timestamp}`}>
              <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{(r.performedAt || "").slice(0, 10)}</td>
              <td className="px-3 py-2 dark:text-gray-200">{vehicleName(r.vin)}</td>
              <td className="px-3 py-2 dark:text-white">{r.maintenanceType}</td>
              <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{r.notes || r.description || ""}</td>
              <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{r.mileageAtService}</td>
              <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{money(r.cost)}</td>
              <td className="px-3 py-2">
                {r.linkedTaxExpenseTs ? (
                  <button onClick={() => setEditTarget(r)}
                    className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200 hover:opacity-80">
                    🔗 {linkedExpenses[r.linkedTaxExpenseTs]?.description || linkedExpenses[r.linkedTaxExpenseTs]?.merchant || "Linked"}
                  </button>
                ) : "—"}
              </td>
              <td className="px-3 py-2">
                <div className="flex gap-1">
                  <button onClick={() => setEditTarget(r)}
                    className="px-2 py-1 text-xs rounded border dark:border-gray-600 dark:text-gray-300">Edit</button>
                  <button onClick={() => handleDelete(r)}
                    className="px-2 py-1 text-xs rounded border border-red-300 text-red-600 dark:border-red-800 dark:text-red-400">Delete</button>
                </div>
              </td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-400">
              No maintenance records{filterVin ? " for this vehicle" : ""}
            </td></tr>
          )}
        </tbody>
      </table>
      {editTarget && (
        <EditHistoryRecordModal record={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => { setEditTarget(null); load(); if (onChanged) onChanged(); }} />
      )}
    </div>
  );
}


export default function AdminMaintenance() {
  const api = useApi();
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterVin, setFilterVin] = useState("");
  const [scheduleByVin, setScheduleByVin] = useState({});
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);


  useEffect(() => {
    (async () => {
      try {
        const res = await api.get("/admin/vehicles");
        setVehicles((res.data || []).filter(v => v.status !== "retired"));
      } catch (e) { /* ignore */ }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadAllSchedules = useCallback(async () => {
    setScheduleLoading(true);
    const result = {};
    await Promise.all(vehicles.map(async (v) => {
      try {
        const res = await api.get(`/admin/vehicles/${v.vin}/maintenance-schedule`);
        result[v.vin] = res.data || [];
      } catch (e) {
        result[v.vin] = [];
      }
    }));
    setScheduleByVin(result);
    setScheduleLoading(false);
  }, [api, vehicles]);

  useEffect(() => { if (vehicles.length) loadAllSchedules(); }, [vehicles, loadAllSchedules]);

  const reloadAll = useCallback(() => {
    loadAllSchedules();
    setHistoryRefreshKey(k => k + 1);
  }, [loadAllSchedules]);


  return (
    <AdminLayout>
      <div className="p-4 sm:p-6 max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold mb-1 dark:text-white">Maintenance</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          Fleet-wide maintenance schedule with recurring items, urgency indicators, and cost tracking.
        </p>

        {loading ? (
          <div className="text-gray-500 dark:text-gray-400">Loading vehicles…</div>
        ) : (
          <>
            <section className="mb-8">
              <h2 className="text-lg font-semibold mb-3 dark:text-white">Fleet Overview</h2>
              <FleetOverview vehicles={vehicles} scheduleByVin={scheduleByVin}
                filterVin={filterVin} setFilterVin={setFilterVin} />
              <ScheduleBoard
                vehicles={vehicles}
                filterVin={filterVin}
                setFilterVin={setFilterVin}
                scheduleByVin={scheduleByVin}
                setScheduleByVin={setScheduleByVin}
                loading={scheduleLoading}
                loadAll={reloadAll}
              />
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-3 dark:text-white">
                History {filterVin ? "(filtered to selected vehicle)" : ""}
              </h2>
              <HistoryTable vehicles={vehicles} filterVin={filterVin} refreshKey={historyRefreshKey} onChanged={reloadAll} />
            </section>

          </>
        )}
      </div>
    </AdminLayout>
  );
}
