import React, { useState, useEffect, useCallback } from 'react';
import { useApi } from '../context/AuthContext';
import AdminLayout from '../components/AdminNav';

// ── Cost categories for manual entry ─────────────────────────────────────────
const COST_CATEGORIES = [
  'Insurance', 'Registration', 'Loan Interest', 'Depreciation',
  'Cleaning Supplies', 'Detailing', 'Parking', 'Tolls',
  'Overhead', 'Marketing', 'Other',
];

const COMPUTED_CATEGORIES = new Set(['Loan Interest', 'Registration', 'TTR', 'Maintenance']);

const RANGE_OPTIONS = [
  { key: '7d',    label: '1 week' },
  { key: '30d',   label: '1 month' },
  { key: '90d',   label: '3 months' },
  { key: '180d',  label: '6 months' },
  { key: '365d',  label: '1 year' },
  { key: '1825d', label: '5 years' },
  { key: 'all',   label: 'All time' },
];

const TABS = [
  { key: 'overview',     icon: '📊', label: 'Overview' },
  { key: 'utilization',  icon: '🚗', label: 'Fleet & Utilization' },
  { key: 'financials',   icon: '💵', label: 'Financials' },
  { key: 'maintenance',  icon: '🔧', label: 'Maintenance' },
  { key: 'depreciation', icon: '📉', label: 'Depreciation' },
  { key: 'expenses',     icon: '🧾', label: 'Business Expenses' },
];

const RANGE_STORAGE_KEY = 'adminAnalytics.range';
const TAB_STORAGE_KEY = 'adminAnalytics.tab';

function fmt$(cents) {
  if (cents == null) return '—';
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${(Math.abs(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function ProfitBadge({ cents }) {
  if (cents == null) return <span className="text-gray-400">—</span>;
  const cls = cents >= 0 ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold';
  return <span className={cls}>{fmt$(cents)}</span>;
}

// ── Delta badge for "vs previous period" comparisons ─────────────────────────
function DeltaBadge({ pct, invert = false }) {
  if (pct == null || !isFinite(pct)) return null;
  const rounded = Math.round(pct * 10) / 10;
  const isUp = rounded > 0;
  const isFlat = rounded === 0;
  const good = isFlat ? null : (invert ? !isUp : isUp);
  const cls = isFlat ? 'text-gray-400 bg-gray-50' : good ? 'text-green-700 bg-green-50' : 'text-red-700 bg-red-50';
  const arrow = isFlat ? '' : isUp ? '▲' : '▼';
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded ${cls}`}>
      {arrow} {Math.abs(rounded)}%
    </span>
  );
}

function RangeSelect({ value, onChange, className = '' }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className={`border border-gray-300 rounded px-2 py-1 text-sm ${className}`}
    >
      {RANGE_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
    </select>
  );
}

// ── Lightweight inline SVG line chart (no npm dependency) ────────────────────
function DepreciationChart({ history }) {
  if (!history || history.length === 0) {
    return <div className="text-gray-400 text-sm italic py-6 text-center">No depreciation history yet.</div>;
  }

  const width = 720, height = 260, padL = 60, padR = 20, padT = 20, padB = 40;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  const allVals = history.flatMap(h => [h.estimatedValueCents, h.actualValueCents].filter(v => v != null));
  if (allVals.length === 0) {
    return <div className="text-gray-400 text-sm italic py-6 text-center">No value data available.</div>;
  }
  const maxV = Math.max(...allVals);
  const minV = Math.min(...allVals, 0);
  const range = maxV - minV || 1;

  const n = history.length;
  const xFor = (i) => padL + (n === 1 ? 0 : (i / (n - 1)) * innerW);
  const yFor = (v) => padT + innerH - ((v - minV) / range) * innerH;

  const estPath = history.map((h, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i)} ${yFor(h.estimatedValueCents)}`).join(' ');

  // Actual line: draw segments only where consecutive points both exist (gap nulls)
  const actualSegments = [];
  let seg = [];
  history.forEach((h, i) => {
    if (h.actualValueCents != null) {
      seg.push(`${seg.length === 0 ? 'M' : 'L'} ${xFor(i)} ${yFor(h.actualValueCents)}`);
    } else if (seg.length) {
      actualSegments.push(seg.join(' '));
      seg = [];
    }
  });
  if (seg.length) actualSegments.push(seg.join(' '));

  // X-axis labels: show ~6 evenly spaced months
  const labelStep = Math.max(1, Math.floor(n / 6));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-64">
      {/* Axes */}
      <line x1={padL} y1={padT} x2={padL} y2={padT + innerH} stroke="#e5e7eb" />
      <line x1={padL} y1={padT + innerH} x2={padL + innerW} y2={padT + innerH} stroke="#e5e7eb" />
      {/* Y labels */}
      <text x={4} y={padT + 4} fontSize="10" fill="#9ca3af">${Math.round(maxV / 100).toLocaleString()}</text>
      <text x={4} y={padT + innerH} fontSize="10" fill="#9ca3af">${Math.round(minV / 100).toLocaleString()}</text>
      {/* X labels */}
      {history.map((h, i) => (
        i % labelStep === 0 ? (
          <text key={i} x={xFor(i)} y={height - 10} fontSize="9" fill="#9ca3af" textAnchor="middle">{h.month}</text>
        ) : null
      ))}
      {/* Estimated line (dashed, indigo) */}
      <path d={estPath} fill="none" stroke="#818cf8" strokeWidth="2" strokeDasharray="5,4" />
      {/* Actual line (solid, green), gapped */}
      {actualSegments.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="#16a34a" strokeWidth="2.5" />
      ))}
      {/* Legend */}
      <line x1={padL} y1={8} x2={padL + 20} y2={8} stroke="#818cf8" strokeWidth="2" strokeDasharray="5,4" />
      <text x={padL + 24} y={11} fontSize="10" fill="#6b7280">Estimated (OTDcheck)</text>
      <line x1={padL + 160} y1={8} x2={padL + 180} y2={8} stroke="#16a34a" strokeWidth="2.5" />
      <text x={padL + 184} y={11} fontSize="10" fill="#6b7280">Actual (monthly snapshot)</text>
    </svg>
  );
}

// ── Monthly Revenue / Utilization Trend chart ────────────────────────────────
function MonthlyTrendChart({ trend }) {
  if (!trend || trend.length === 0) {
    return <div className="text-gray-400 text-sm italic py-6 text-center">No booking history in this range yet.</div>;
  }

  const width = 720, height = 280, padL = 60, padR = 50, padT = 20, padB = 40;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  const n = trend.length;
  const xFor = (i) => padL + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);

  const revenues = trend.map(t => t.revenueCents || 0);
  const maxRev = Math.max(...revenues, 1);

  const maxUtil = 100;

  const barW = Math.max(6, (innerW / n) * 0.5);

  const utilPoints = trend
    .map((t, i) => (t.utilizationPct != null ? [xFor(i), padT + innerH - (t.utilizationPct / maxUtil) * innerH] : null))
    .filter(Boolean);
  const utilPath = utilPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ');

  // Gridlines at 0/25/50/75/100%
  const gridFracs = [0, 0.25, 0.5, 0.75, 1];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-72">
      {/* Horizontal gridlines */}
      {gridFracs.map((f, i) => {
        const y = padT + innerH - f * innerH;
        return <line key={i} x1={padL} y1={y} x2={padL + innerW} y2={y} stroke="#f3f4f6" strokeWidth="1" />;
      })}
      <line x1={padL} y1={padT} x2={padL} y2={padT + innerH} stroke="#e5e7eb" />
      <line x1={padL} y1={padT + innerH} x2={padL + innerW} y2={padT + innerH} stroke="#e5e7eb" />
      {/* Left axis label (revenue) */}
      <text x={4} y={padT + 4} fontSize="10" fill="#9ca3af">${Math.round(maxRev / 100).toLocaleString()}</text>
      <text x={4} y={padT + innerH} fontSize="10" fill="#9ca3af">$0</text>
      {/* Right axis label (utilization %) */}
      <text x={width - padR + 6} y={padT + 4} fontSize="10" fill="#9ca3af">100%</text>
      <text x={width - padR + 6} y={padT + innerH} fontSize="10" fill="#9ca3af">0%</text>
      {/* Revenue bars (lowered opacity so the utilization line stays readable) */}
      {trend.map((t, i) => {
        const barH = ((t.revenueCents || 0) / maxRev) * innerH;
        return (
          <rect
            key={i}
            x={xFor(i) - barW / 2}
            y={padT + innerH - barH}
            width={barW}
            height={barH}
            fill="#34d399"
            fillOpacity="0.45"
            stroke="#10b981"
            strokeOpacity="0.5"
            strokeWidth="1"
          >
            <title>{`${t.month}: ${fmt$(t.revenueCents)} revenue${t.utilizationPct != null ? `, ${t.utilizationPct}% utilization` : ''}`}</title>
          </rect>
        );
      })}
      {/* Utilization line — white halo underneath for contrast against bars */}
      {utilPath && <path d={utilPath} fill="none" stroke="#ffffff" strokeWidth="5" strokeLinejoin="round" />}
      {utilPath && <path d={utilPath} fill="none" stroke="#4f46e5" strokeWidth="2.5" strokeLinejoin="round" />}
      {utilPoints.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3.5" fill="#4f46e5" stroke="#ffffff" strokeWidth="1.5">
          <title>{`${trend[i].month}: ${trend[i].utilizationPct}% utilization`}</title>
        </circle>
      ))}
      {/* X labels */}
      {trend.map((t, i) => (
        <text key={i} x={xFor(i)} y={height - 10} fontSize="9" fill="#9ca3af" textAnchor="middle">{t.month}</text>
      ))}
      {/* Legend */}
      <rect x={padL} y={4} width="14" height="10" fill="#34d399" fillOpacity="0.45" stroke="#10b981" strokeOpacity="0.5" />
      <text x={padL + 18} y={13} fontSize="10" fill="#6b7280">Revenue</text>
      <line x1={padL + 100} y1={9} x2={padL + 120} y2={9} stroke="#4f46e5" strokeWidth="2.5" />
      <text x={padL + 124} y={13} fontSize="10" fill="#6b7280">Utilization %</text>
    </svg>
  );
}

function SectionHeader({ icon, title, subtitle }) {
  return (
    <div className="mb-3">
      <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">{icon} {title}</h2>
      {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
    </div>
  );
}

function SortHeader({ label, field, sort, setSort, align = 'right' }) {
  const active = sort.field === field;
  const nextDir = active && sort.dir === 'desc' ? 'asc' : 'desc';
  return (
    <th
      className={`px-3 py-2 text-${align} cursor-pointer select-none hover:text-gray-900`}
      onClick={() => setSort({ field, dir: nextDir })}
    >
      {label} {active ? (sort.dir === 'desc' ? '▼' : '▲') : <span className="text-gray-300">↕</span>}
    </th>
  );
}

function sortVehicles(vehicles, sort) {
  if (!sort.field) return vehicles;
  const arr = [...vehicles];
  arr.sort((a, b) => {
    let av = a[sort.field];
    let bv = b[sort.field];
    if (sort.field === 'name') { av = (a.name || a.vin || '').toLowerCase(); bv = (b.name || b.vin || '').toLowerCase(); }
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'string') return sort.dir === 'desc' ? bv.localeCompare(av) : av.localeCompare(bv);
    return sort.dir === 'desc' ? bv - av : av - bv;
  });
  return arr;
}

function downloadCsv(filename, rows) {
  const csv = rows.map(r => r.map(cell => {
    const s = cell == null ? '' : String(cell);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function AdminAnalytics() {
  const api = useApi();
  const [analytics, setAnalytics]   = useState(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [selectedVin, setSelectedVin] = useState(null);
  const [costs, setCosts]           = useState([]);
  const [costsLoading, setCostsLoading] = useState(false);
  const [showCostForm, setShowCostForm] = useState(false);
  const [costForm, setCostForm]     = useState({ category: 'Insurance', description: '', amountCents: '', date: new Date().toISOString().slice(0, 10), notes: '' });
  const [saving, setSaving]         = useState(false);

  // Active tab (persisted)
  const [activeTab, setActiveTab] = useState(() => {
    try { return localStorage.getItem(TAB_STORAGE_KEY) || 'overview'; } catch { return 'overview'; }
  });
  useEffect(() => {
    try { localStorage.setItem(TAB_STORAGE_KEY, activeTab); } catch { /* ignore */ }
  }, [activeTab]);

  // Global range selector (persisted)
  const [range, setRange] = useState(() => {
    try { return localStorage.getItem(RANGE_STORAGE_KEY) || '90d'; } catch { return '90d'; }
  });
  useEffect(() => {
    try { localStorage.setItem(RANGE_STORAGE_KEY, range); } catch { /* ignore */ }
  }, [range]);

  // Manual revenue adjustment inline editor
  const [editingRevenueVin, setEditingRevenueVin] = useState(null);
  const [revenueDraft, setRevenueDraft] = useState('');
  const [savingRevenue, setSavingRevenue] = useState(false);

  // Depreciation chart vehicle selector
  const [depVin, setDepVin] = useState(null);

  // Utilization display mode: percent or days
  const [utilDisplay, setUtilDisplay] = useState('pct'); // 'pct' | 'days'

  // Business expenses (YTD) panel
  const [taxExpenses, setTaxExpenses] = useState(null);
  const [taxLoading, setTaxLoading]   = useState(false);

  // Per-vehicle filter/search (applies across whichever table is active)
  const [vehicleFilter, setVehicleFilter] = useState('');

  // Sortable Financial Efficiency table
  const [finSort, setFinSort] = useState({ field: null, dir: 'desc' });

  const loadAnalytics = useCallback(async (rangeKey) => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/admin/analytics?range=${rangeKey || range}`);
      setAnalytics(res.data);
      setDepVin(prev => prev || (res.data?.vehicles?.length ? res.data.vehicles[0].vin : null));
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  useEffect(() => { loadAnalytics(range); }, [range]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setTaxLoading(true);
    api.get(`/admin/tax-expenses?year=${new Date().getFullYear()}`)
      .then(r => setTaxExpenses(r.data))
      .catch(() => setTaxExpenses(null))
      .finally(() => setTaxLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadCosts = useCallback(async (vin) => {
    setCostsLoading(true);
    try {
      const res = await api.get(`/admin/vehicles/${vin}/costs`);
      setCosts(res.data || []);
    } catch (e) {
      setCosts([]);
    } finally {
      setCostsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectVin = (vin) => {
    setSelectedVin(vin === selectedVin ? null : vin);
    setShowCostForm(false);
    if (vin !== selectedVin) loadCosts(vin);
  };

  const handleAddCost = async (e) => {
    e.preventDefault();
    if (!selectedVin) return;
    const dollars = parseFloat(costForm.amountCents);
    if (isNaN(dollars) || dollars <= 0) { alert('Enter a valid amount'); return; }
    setSaving(true);
    try {
      await api.post(`/admin/vehicles/${selectedVin}/costs`, {
        category:    costForm.category,
        description: costForm.description,
        amountCents: Math.round(dollars * 100),
        date:        costForm.date,
        notes:       costForm.notes,
      });
      setCostForm({ category: 'Insurance', description: '', amountCents: '', date: new Date().toISOString().slice(0, 10), notes: '' });
      setShowCostForm(false);
      await loadCosts(selectedVin);
      await loadAnalytics(range);
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to save cost');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCost = async (vin, ts) => {
    if (!window.confirm('Delete this cost record?')) return;
    try {
      await api.delete(`/admin/vehicles/${vin}/costs/${encodeURIComponent(ts)}`);
      await loadCosts(vin);
      await loadAnalytics(range);
    } catch (e) {
      alert('Failed to delete cost');
    }
  };

  const startEditRevenue = (v) => {
    setEditingRevenueVin(v.vin);
    setRevenueDraft(((v.manualRevenueAdjustmentCents || 0) / 100).toString());
  };

  const saveRevenueAdjustment = async (vin) => {
    const dollars = parseFloat(revenueDraft);
    if (isNaN(dollars)) { alert('Enter a valid dollar amount'); return; }
    setSavingRevenue(true);
    try {
      await api.put(`/admin/vehicles/${vin}`, { manualRevenueAdjustmentCents: Math.round(dollars * 100) });
      setEditingRevenueVin(null);
      await loadAnalytics(range);
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to save revenue adjustment');
    } finally {
      setSavingRevenue(false);
    }
  };

  if (loading && !analytics) return <AdminLayout><div className="p-6 text-gray-500">Loading analytics…</div></AdminLayout>;
  if (error)   return <AdminLayout><div className="p-6 text-red-600">{error}</div></AdminLayout>;
  if (!analytics) return null;

  const { vehicles = [], fleet = {} } = analytics;
  const selectedVehicle = vehicles.find(v => v.vin === selectedVin);
  const depVehicle = vehicles.find(v => v.vin === depVin);

  const rangeLabel = fleet.rangeLabel || RANGE_OPTIONS.find(o => o.key === range)?.label || range;
  const coverageDays = fleet.dataCoverageDays;
  const rangeDays = fleet.rangeDays; // null means "all time"
  const showCoverageWarning = rangeDays != null && coverageDays != null && coverageDays < rangeDays;

  // Filtered vehicles (applies to all tables across tabs)
  const filterText = vehicleFilter.trim().toLowerCase();
  const filteredVehicles = filterText
    ? vehicles.filter(v => (v.name || '').toLowerCase().includes(filterText) || (v.vin || '').toLowerCase().includes(filterText))
    : vehicles;

  const sortedFinancialVehicles = sortVehicles(filteredVehicles, finSort);

  // ── Insights (rule-based, computed client-side) ──────────────────────────
  const insights = [];
  if (fleet.avgUtilizationPct != null) {
    if (fleet.avgUtilizationPct >= 70) {
      insights.push(`🚀 Fleet utilization is ${fleet.avgUtilizationPct}% (${rangeLabel}) — your fleet is running hot. Consider adding a vehicle to capture more demand.`);
    } else if (fleet.avgUtilizationPct <= 30) {
      insights.push(`📉 Fleet utilization is only ${fleet.avgUtilizationPct}% (${rangeLabel}) — there may be excess capacity. Focus on marketing before buying another vehicle.`);
    } else {
      insights.push(`📊 Fleet utilization is ${fleet.avgUtilizationPct}% (${rangeLabel}) — a healthy middle ground. Target is ~70%.`);
    }
  }
  if (fleet.avgProfitPerDayCents != null) {
    const monthlyAdd = fleet.avgProfitPerDayCents * 30;
    insights.push(`💰 A new vehicle performing at your fleet's average profit/day (${fmt$(fleet.avgProfitPerDayCents)}/day) would add roughly ${fmt$(monthlyAdd)}/month.`);
  }
  vehicles.forEach(v => {
    if (v.utilizationPct != null && v.utilizationPct < 20) {
      insights.push(`⚠️ ${v.name || v.vin} has low utilization (${v.utilizationPct}%) — consider adjusting pricing, marketing, or retiring it.`);
    }
    if (v.depreciation != null && v.profitCents != null && v.depreciation > v.profitCents && v.depreciation > 0) {
      insights.push(`🔻 ${v.name || v.vin}'s depreciation (${fmt$(v.depreciation)}) has outpaced its net profit (${fmt$(v.profitCents)}) — consider a retirement/replacement plan.`);
    }
  });

  const exportFinancialCsv = () => {
    const header = ['Vehicle', 'VIN', 'Revenue', 'Manual Revenue Adj.', 'Vehicle Costs', 'Net Profit', '$/Billed Day', 'Avg Rental Length (d)', '$/Day', 'Miles', '$/Mile', 'Depreciation'];
    const rows = [header, ...sortedFinancialVehicles.map(v => [
      v.name || '', v.vin || '',
      v.revenueCents != null ? (v.revenueCents / 100).toFixed(2) : '',
      v.manualRevenueAdjustmentCents != null ? (v.manualRevenueAdjustmentCents / 100).toFixed(2) : '',
      v.totalCostCents != null ? (v.totalCostCents / 100).toFixed(2) : '',
      v.profitCents != null ? (v.profitCents / 100).toFixed(2) : '',
      v.revenuePerBilledDayCents != null ? (v.revenuePerBilledDayCents / 100).toFixed(2) : '',
      v.avgRentalLengthDays != null ? v.avgRentalLengthDays : '',
      v.profitPerDayCents != null ? (v.profitPerDayCents / 100).toFixed(2) : '',
      v.odometerMiles != null ? v.odometerMiles : '',
      v.costPerMile != null ? v.costPerMile : '',
      v.depreciation != null ? (v.depreciation / 100).toFixed(2) : '',
    ])];
    downloadCsv(`financial-efficiency-${range}-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  };

  const FilterBox = (
    <div className="flex items-center gap-2">
      <input
        type="text"
        placeholder="🔍 Filter vehicles…"
        value={vehicleFilter}
        onChange={e => setVehicleFilter(e.target.value)}
        className="border border-gray-300 rounded px-2 py-1 text-sm w-48"
      />
      {vehicleFilter && (
        <button onClick={() => setVehicleFilter('')} className="text-xs text-gray-400 hover:text-gray-600">✕ clear</button>
      )}
    </div>
  );

  return (
    <AdminLayout>
    <div className="p-4 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-2xl font-bold text-gray-900">📊 Analytics</h1>
        <div className="flex items-center gap-3">
          <label className="text-xs text-gray-500 font-medium">Time range:</label>
          <RangeSelect value={range} onChange={setRange} />
          <button onClick={() => loadAnalytics(range)} className="text-sm text-blue-600 hover:underline">↻ Refresh</button>
        </div>
      </div>

      {/* Tab bar — persistent across the whole page */}
      <div className="sticky top-0 z-10 bg-gray-50/95 backdrop-blur border-b border-gray-200 mb-6 -mx-4 px-4 pt-1">
        <div className="flex flex-wrap gap-1 overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`px-3 py-2 text-sm font-medium rounded-t-lg whitespace-nowrap border-b-2 transition-colors ${
                activeTab === t.key
                  ? 'border-blue-600 text-blue-700 bg-white'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-white/60'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Data coverage disclaimer (shown on every tab) */}
      {showCoverageWarning && (
        <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-3 mb-6 text-sm text-yellow-800 flex items-start gap-2">
          <span className="text-lg leading-none">⚠️</span>
          <div>
            <strong>Limited data history:</strong> You selected "{rangeLabel}", but the system only has{' '}
            <strong>{coverageDays} day{coverageDays === 1 ? '' : 's'}</strong> of real booking history so far.
            Metrics below (especially utilization) are computed against the full {rangeLabel.toLowerCase()} window and
            will appear <strong>understated</strong> until more history accumulates. Consider selecting a shorter range
            (e.g. "1 week" or "1 month") for a more representative snapshot right now.
          </div>
        </div>
      )}

      {/* ══════════════════════════ OVERVIEW TAB ══════════════════════════ */}
      {activeTab === 'overview' && (
        <>
          {/* Fleet Summary */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
              <div className="text-xl font-bold text-green-700">{fmt$(fleet.revenueCents)}</div>
              <div className="text-xs text-green-600 mt-1 flex items-center justify-center gap-1 flex-wrap">
                Revenue ({rangeLabel}) <DeltaBadge pct={fleet.revenueDeltaPct} />
              </div>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
              <div className="text-xl font-bold text-red-700">{fmt$(fleet.totalCostCents)}</div>
              <div className="text-xs text-red-600 mt-1">Vehicle Costs</div>
            </div>
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 text-center">
              <div className="text-xl font-bold text-orange-700">{fmt$(fleet.totalBusinessExpenseCents)}</div>
              <div className="text-xs text-orange-600 mt-1">Business Expenses (YTD)</div>
            </div>
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 text-center">
              <div className="text-xl font-bold text-purple-700">{fmt$(fleet.totalBusinessOverheadCents)}</div>
              <div className="text-xs text-purple-600 mt-1">Total Business Overhead</div>
            </div>
            <div className={`border rounded-lg p-4 text-center ${fleet.profitCents >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'}`}>
              <div className={`text-xl font-bold ${fleet.profitCents >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>{fmt$(fleet.profitCents)}</div>
              <div className={`text-xs mt-1 flex items-center justify-center gap-1 flex-wrap ${fleet.profitCents >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                Net Profit <DeltaBadge pct={fleet.profitDeltaPct} />
              </div>
            </div>
          </div>

          {/* Insights Panel */}
          {insights.length > 0 && (
            <div className="bg-white border border-blue-200 rounded-lg p-4 mb-8">
              <h2 className="font-semibold text-gray-700 mb-3">💡 Insights</h2>
              <ul className="space-y-2 text-sm text-gray-700">
                {insights.map((line, i) => <li key={i}>{line}</li>)}
              </ul>
              <p className="text-xs text-gray-400 mt-3 flex flex-wrap items-center gap-2">
                Fleet avg utilization ({rangeLabel}): {fleet.avgUtilizationPct != null ? `${fleet.avgUtilizationPct}%` : '—'} <DeltaBadge pct={fleet.utilizationDeltaPct} /> ·
                {' '}Fleet avg profit/day: {fmt$(fleet.avgProfitPerDayCents)}
              </p>
            </div>
          )}

          {/* Monthly Trend Chart */}
          <div className="bg-white rounded-lg border border-gray-200 p-4 mb-8">
            <SectionHeader icon="📈" title="Monthly Revenue & Utilization Trend"
              subtitle={`Bucketed by calendar month within the selected range (${rangeLabel}). Hover over bars/points for exact values.`} />
            <MonthlyTrendChart trend={fleet.monthlyTrend} />
          </div>

          {/* Customer & Demand Insights (folded into Overview) */}
          <div className="bg-white rounded-lg border border-gray-200 p-4 mb-8">
            <SectionHeader icon="🧑‍🤝‍🧑" title="Customer & Demand Insights"
              subtitle="Booking lead time, unconstrained demand, customer acquisition cost." />
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <div className="text-lg font-bold text-gray-800">
                  {fleet.avgBookingLeadTimeDays != null ? `${fleet.avgBookingLeadTimeDays} d` : '—'}
                </div>
                <div className="text-xs text-gray-500 mt-1">Avg Booking Lead Time</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center flex flex-col justify-center">
                <div className="text-sm font-semibold text-gray-500">Not currently tracked</div>
                <div className="text-xs text-gray-400 mt-1">Unconstrained Demand — no data source yet (Private/Turo don't expose rejected-booking data)</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center flex flex-col justify-center">
                <div className="text-sm font-semibold text-gray-500">Not currently tracked</div>
                <div className="text-xs text-gray-400 mt-1">Customer Acquisition Cost (CAC) — requires marketing spend tracking</div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ══════════════════════════ FLEET & UTILIZATION TAB ══════════════════════════ */}
      {activeTab === 'utilization' && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-8">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <SectionHeader icon="🚗" title="Fleet & Utilization"
              subtitle="Utilization rate (target ~70%), idle time per vehicle." />
            <div className="flex items-center gap-3 flex-wrap">
              {FilterBox}
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span>Show utilization as:</span>
                <button
                  onClick={() => setUtilDisplay('pct')}
                  className={`px-2 py-0.5 rounded ${utilDisplay === 'pct' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}
                >%</button>
                <button
                  onClick={() => setUtilDisplay('days')}
                  className={`px-2 py-0.5 rounded ${utilDisplay === 'days' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}
                >days</button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-2 gap-4 my-4">
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <div className="text-lg font-bold text-gray-800 flex items-center justify-center gap-2">
                {fleet.avgUtilizationPct != null ? `${fleet.avgUtilizationPct}%` : '—'}
                <DeltaBadge pct={fleet.utilizationDeltaPct} />
              </div>
              <div className="text-xs text-gray-500 mt-1">Avg Fleet Utilization <span className="text-gray-400">(target ~70%)</span></div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <div className="text-lg font-bold text-gray-800">
                {fmt$(fleet.avgProfitPerDayCents)}
              </div>
              <div className="text-xs text-gray-500 mt-1">Avg Profit / Day</div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">Vehicle</th>
                  <th className="px-3 py-2 text-right">Utilization ({rangeLabel})</th>
                  <th className="px-3 py-2 text-right">Idle Days</th>
                  <th className="px-3 py-2 text-right">Bookings</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredVehicles.map(v => (
                  <tr key={v.vin} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium text-gray-900">{v.name || v.vin}</td>
                    <td className="px-3 py-2 text-right text-gray-700">
                      {utilDisplay === 'pct'
                        ? (v.utilizationPct != null ? `${v.utilizationPct}%` : '—')
                        : (v.utilizationBookedDays != null ? `${v.utilizationBookedDays} d` : '—')}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-500">{v.idleDays != null ? `${v.idleDays} d` : '—'}</td>
                    <td className="px-3 py-2 text-right text-gray-500">{v.totalBookings ?? 0}</td>
                  </tr>
                ))}
                {filteredVehicles.length === 0 && (
                  <tr><td colSpan={4} className="px-3 py-4 text-center text-gray-400 italic">No vehicles match "{vehicleFilter}"</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════════════════════════ FINANCIALS TAB ══════════════════════════ */}
      {activeTab === 'financials' && (
        <>
          <div className="bg-white rounded-lg border border-gray-200 p-4 mb-8">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
              <SectionHeader icon="💵" title="Financial Efficiency"
                subtitle="Revenue per unit (RPU), revenue per billed day, average rental length. Click column headers to sort." />
              <div className="flex items-center gap-3 flex-wrap">
                {FilterBox}
                <button
                  onClick={exportFinancialCsv}
                  className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded font-medium"
                >
                  ⬇ Export CSV
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 my-4">
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <div className="text-lg font-bold text-gray-800">{fmt$(fleet.revenuePerUnitCents)}</div>
                <div className="text-xs text-gray-500 mt-1">Revenue per Unit (RPU)</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <div className="text-lg font-bold text-gray-800">{fmt$(fleet.revenuePerBilledDayCents)}</div>
                <div className="text-xs text-gray-500 mt-1">Revenue per Billed Day</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <div className="text-lg font-bold text-gray-800">
                  {fleet.avgRentalLengthDays != null ? `${fleet.avgRentalLengthDays} d` : '—'}
                </div>
                <div className="text-xs text-gray-500 mt-1">Avg Rental Length</div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
                  <tr>
                    <SortHeader label="Vehicle" field="name" sort={finSort} setSort={setFinSort} align="left" />
                    <SortHeader label="Revenue" field="revenueCents" sort={finSort} setSort={setFinSort} />
                    <SortHeader label="Vehicle Costs" field="totalCostCents" sort={finSort} setSort={setFinSort} />
                    <SortHeader label="Net Profit" field="profitCents" sort={finSort} setSort={setFinSort} />
                    <SortHeader label="$/Billed Day" field="revenuePerBilledDayCents" sort={finSort} setSort={setFinSort} />
                    <SortHeader label="Avg Rental Length" field="avgRentalLengthDays" sort={finSort} setSort={setFinSort} />
                    <SortHeader label="$/Day" field="profitPerDayCents" sort={finSort} setSort={setFinSort} />
                    <SortHeader label="Miles" field="odometerMiles" sort={finSort} setSort={setFinSort} />
                    <SortHeader label="$/Mile" field="costPerMile" sort={finSort} setSort={setFinSort} />
                    <SortHeader label="Depreciation" field="depreciation" sort={finSort} setSort={setFinSort} />
                    <th className="px-3 py-2 text-center">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sortedFinancialVehicles.map(v => (
                    <tr key={v.vin} className={`hover:bg-gray-50 ${selectedVin === v.vin ? 'bg-blue-50' : ''}`}>
                      <td className="px-3 py-2 font-medium text-gray-900">
                        <div>{v.name || v.vin}</div>
                        <div className="text-xs text-gray-400">{v.vin}</div>
                      </td>
                      <td className="px-3 py-2 text-right text-green-700">
                        <div>{fmt$(v.revenueCents)}</div>
                        {editingRevenueVin === v.vin ? (
                          <div className="flex items-center justify-end gap-1 mt-1">
                            <span className="text-xs text-gray-400">$</span>
                            <input
                              type="number" step="0.01" value={revenueDraft}
                              onChange={e => setRevenueDraft(e.target.value)}
                              className="w-20 border border-gray-300 rounded px-1 py-0.5 text-xs text-right"
                            />
                            <button onClick={() => saveRevenueAdjustment(v.vin)} disabled={savingRevenue}
                              className="text-xs text-blue-600 hover:underline disabled:opacity-50">Save</button>
                            <button onClick={() => setEditingRevenueVin(null)} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
                          </div>
                        ) : (
                          <button onClick={() => startEditRevenue(v)} className="text-xs text-gray-400 hover:text-blue-600 mt-0.5">
                            {v.manualRevenueAdjustmentCents ? `+${fmt$(v.manualRevenueAdjustmentCents)} manual` : '+ add manual revenue'}
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-red-600">{fmt$(v.totalCostCents)}</td>
                      <td className="px-3 py-2 text-right"><ProfitBadge cents={v.profitCents} /></td>
                      <td className="px-3 py-2 text-right text-gray-600">{fmt$(v.revenuePerBilledDayCents)}</td>
                      <td className="px-3 py-2 text-right text-gray-600">{v.avgRentalLengthDays != null ? `${v.avgRentalLengthDays} d` : '—'}</td>
                      <td className="px-3 py-2 text-right text-gray-600">{v.profitPerDayCents != null ? fmt$(v.profitPerDayCents) : '—'}</td>
                      <td className="px-3 py-2 text-right text-gray-600">{v.odometerMiles != null ? v.odometerMiles.toLocaleString() : '—'}</td>
                      <td className="px-3 py-2 text-right text-gray-600">{v.costPerMile != null ? `$${v.costPerMile}` : '—'}</td>
                      <td className="px-3 py-2 text-right text-gray-600">{v.depreciation != null ? fmt$(v.depreciation) : '—'}</td>
                      <td className="px-3 py-2 text-center">
                        <button
                          onClick={() => handleSelectVin(v.vin)}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          {selectedVin === v.vin ? 'Hide' : 'Costs'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {sortedFinancialVehicles.length === 0 && (
                    <tr><td colSpan={11} className="px-3 py-4 text-center text-gray-400 italic">No vehicles match "{vehicleFilter}"</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-gray-400 mt-2">
              Costs (maintenance, manual costs, loan interest, registration) and odometer miles above are scoped to the
              selected range ({rangeLabel}), consistent with revenue and utilization. Lifetime totals (e.g. total loan
              interest paid to date, lifetime maintenance) are shown separately in the vehicle's cost detail panel below.
            </p>
          </div>

          {/* Cost Detail Panel */}
          {selectedVin && selectedVehicle && (
            <div className="bg-white rounded-lg border border-blue-200 p-4 mb-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-800">
                  💰 Cost Records — {selectedVehicle.name || selectedVin}
                </h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowCostForm(f => !f)}
                    className="text-sm bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
                  >
                    + Add Cost
                  </button>
                  <button onClick={() => setSelectedVin(null)} className="text-sm text-gray-500 hover:text-gray-700">✕ Close</button>
                </div>
              </div>

              {/* Category breakdown (computed + manual) */}
              {selectedVehicle.costsByCategory && Object.keys(selectedVehicle.costsByCategory).length > 0 && (
                <div className="bg-gray-50 rounded-lg p-3 mb-4">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">
                    Cost Breakdown <span className="normal-case font-normal text-gray-400">({rangeLabel})</span>
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {Object.entries(selectedVehicle.costsByCategory).sort((a, b) => b[1] - a[1]).map(([cat, cents]) => (
                      <div key={cat} className="bg-white border border-gray-100 rounded px-2 py-1.5">
                        <div className="text-xs text-gray-500 flex items-center gap-1">
                          {cat}
                          {COMPUTED_CATEGORIES.has(cat) && (
                            <span className="text-[10px] bg-indigo-100 text-indigo-600 px-1 rounded" title="Computed from vehicle fields — takes precedence over manual entries of this category">computed</span>
                          )}
                        </div>
                        <div className="font-semibold text-gray-800 text-sm">{fmt$(cents)}</div>
                      </div>
                    ))}
                  </div>

                  {(selectedVehicle.loanMonthlyPaymentCents != null || selectedVehicle.loanRemainingBalanceCents != null || selectedVehicle.loanInterestPaidToDateCents != null) && (
                    <div className="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-200">
                      Loan (lifetime): monthly payment {fmt$(selectedVehicle.loanMonthlyPaymentCents)}, remaining balance {fmt$(selectedVehicle.loanRemainingBalanceCents)}, interest paid to date {fmt$(selectedVehicle.loanInterestPaidToDateCents)}
                    </div>
                  )}
                  {(selectedVehicle.ttrLifetimeCents != null || selectedVehicle.maintenanceCostLifetimeCents != null) && (
                    <div className="text-xs text-gray-500 mt-1">
                      Lifetime totals: TTR {fmt$(selectedVehicle.ttrLifetimeCents)}, maintenance {fmt$(selectedVehicle.maintenanceCostLifetimeCents)}
                    </div>
                  )}
                  <p className="text-[11px] text-gray-400 mt-2">
                    "Computed" categories (Loan Interest, Registration, TTR, Maintenance) are calculated automatically from
                    vehicle fields / records — scoped to the selected range above — and take precedence over manually
                    entered cost records of the same category to avoid double-counting. "Lifetime" figures above are
                    always purchase-to-date regardless of the selected range.
                  </p>
                </div>
              )}

              {showCostForm && (
                <form onSubmit={handleAddCost} className="bg-gray-50 rounded-lg p-4 mb-4 grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
                    <select value={costForm.category} onChange={e => setCostForm(f => ({ ...f, category: e.target.value }))}
                      className="w-full border border-gray-300 rounded px-2 py-1 text-sm">
                      {COST_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Amount ($)</label>
                    <input type="number" step="0.01" min="0" placeholder="0.00"
                      value={costForm.amountCents}
                      onChange={e => setCostForm(f => ({ ...f, amountCents: e.target.value }))}
                      className="w-full border border-gray-300 rounded px-2 py-1 text-sm" required />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                    <input type="text" placeholder="e.g. Annual insurance premium"
                      value={costForm.description}
                      onChange={e => setCostForm(f => ({ ...f, description: e.target.value }))}
                      className="w-full border border-gray-300 rounded px-2 py-1 text-sm" required />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
                    <input type="date" value={costForm.date}
                      onChange={e => setCostForm(f => ({ ...f, date: e.target.value }))}
                      className="w-full border border-gray-300 rounded px-2 py-1 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Notes (optional)</label>
                    <input type="text" placeholder="Optional notes"
                      value={costForm.notes}
                      onChange={e => setCostForm(f => ({ ...f, notes: e.target.value }))}
                      className="w-full border border-gray-300 rounded px-2 py-1 text-sm" />
                  </div>
                  <div className="col-span-2 flex gap-2">
                    <button type="submit" disabled={saving}
                      className="bg-green-600 text-white px-4 py-1.5 rounded text-sm hover:bg-green-700 disabled:opacity-50">
                      {saving ? 'Saving…' : 'Save Cost'}
                    </button>
                    <button type="button" onClick={() => setShowCostForm(false)}
                      className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
                  </div>
                </form>
              )}

              {costsLoading ? (
                <div className="text-gray-400 text-sm">Loading costs…</div>
              ) : costs.length === 0 ? (
                <div className="text-gray-400 text-sm italic">No manual cost records yet. Click "+ Add Cost" to add one.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-xs text-gray-500 uppercase border-b border-gray-200">
                    <tr>
                      <th className="py-2 text-left">Date</th>
                      <th className="py-2 text-left">Category</th>
                      <th className="py-2 text-left">Description</th>
                      <th className="py-2 text-right">Amount</th>
                      <th className="py-2 text-center">Delete</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {costs.map(c => (
                      <tr key={c.timestamp} className="hover:bg-gray-50">
                        <td className="py-2 text-gray-500">{c.date || c.createdAt?.slice(0, 10)}</td>
                        <td className="py-2">
                          <span className="bg-gray-100 text-gray-700 text-xs px-2 py-0.5 rounded">{c.category}</span>
                        </td>
                        <td className="py-2 text-gray-700">{c.description}</td>
                        <td className="py-2 text-right font-medium text-red-600">{fmt$(c.amountCents)}</td>
                        <td className="py-2 text-center">
                          <button onClick={() => handleDeleteCost(selectedVin, c.timestamp)}
                            className="text-red-400 hover:text-red-600 text-xs">✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-gray-200">
                    <tr>
                      <td colSpan={3} className="py-2 text-right text-xs font-medium text-gray-600">Manual Total:</td>
                      <td className="py-2 text-right font-bold text-red-700">
                        {fmt$(costs.reduce((s, c) => s + (c.amountCents || 0), 0))}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════ MAINTENANCE TAB ══════════════════════════ */}
      {activeTab === 'maintenance' && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-8">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <SectionHeader icon="🔧" title="Maintenance & Operations"
              subtitle="Out-of-service (OOS) rate, maintenance cost per mile (both scoped to selected range)." />
            {FilterBox}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4 mt-2">
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <div className="text-lg font-bold text-gray-800">
                {fleet.avgOosRatePct != null ? `${fleet.avgOosRatePct}%` : '—'}
              </div>
              <div className="text-xs text-gray-500 mt-1">Avg Out-of-Service Rate ({rangeLabel})</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <div className="text-lg font-bold text-gray-800">
                {fleet.avgMaintenanceCostPerMileCents != null ? `$${(fleet.avgMaintenanceCostPerMileCents / 100).toFixed(2)}` : '—'}
              </div>
              <div className="text-xs text-gray-500 mt-1">Avg Maintenance Cost / Mile</div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">Vehicle</th>
                  <th className="px-3 py-2 text-right">OOS Rate</th>
                  <th className="px-3 py-2 text-right">Maintenance $/Mile</th>
                  <th className="px-3 py-2 text-right">Lifetime Maintenance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredVehicles.map(v => (
                  <tr key={v.vin} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium text-gray-900">{v.name || v.vin}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{v.oosRatePct != null ? `${v.oosRatePct}%` : '—'}</td>
                    <td className="px-3 py-2 text-right text-gray-600">
                      {v.maintenanceCostPerMileCents != null ? `$${(v.maintenanceCostPerMileCents / 100).toFixed(2)}` : '—'}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-400">{fmt$(v.maintenanceCostLifetimeCents)}</td>
                  </tr>
                ))}
                {filteredVehicles.length === 0 && (
                  <tr><td colSpan={4} className="px-3 py-4 text-center text-gray-400 italic">No vehicles match "{vehicleFilter}"</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════════════════════════ DEPRECIATION TAB ══════════════════════════ */}
      {activeTab === 'depreciation' && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-700">📉 Depreciation — Estimated vs. Actual</h2>
            <select value={depVin || ''} onChange={e => setDepVin(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1 text-sm">
              {vehicles.map(v => <option key={v.vin} value={v.vin}>{v.name || v.vin}</option>)}
            </select>
          </div>
          <DepreciationChart history={depVehicle?.depreciationHistory} />
          <p className="text-xs text-gray-400 mt-2">
            Estimated curve is interpolated from OTDcheck's 1/3/5-year depreciation projections at purchase.
            Actual values are recorded monthly starting the month this feature was deployed — earlier months will
            show a gap in the actual line until enough history accumulates. This chart always shows full
            purchase-to-date history and is not affected by the global time range selector above.
          </p>
        </div>
      )}

      {/* ══════════════════════════ BUSINESS EXPENSES TAB ══════════════════════════ */}
      {activeTab === 'expenses' && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-8">
          <h2 className="font-semibold text-gray-700 mb-3">🧾 Business Expenses — YTD {new Date().getFullYear()}</h2>
          {taxLoading ? (
            <div className="text-gray-400 text-sm">Loading…</div>
          ) : taxExpenses && Object.keys(taxExpenses.ytd_totals || {}).length > 0 ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Object.entries(taxExpenses.ytd_totals).sort((a, b) => b[1] - a[1]).map(([cat, cents]) => (
                  <div key={cat} className="bg-gray-50 rounded p-3">
                    <div className="text-xs text-gray-500 mb-1">{cat}</div>
                    <div className="font-semibold text-gray-800">{fmt$(cents)}</div>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-gray-200 flex justify-between">
                <span className="font-semibold text-gray-700">Grand Total</span>
                <span className="font-bold text-gray-900">
                  {fmt$(Object.values(taxExpenses.ytd_totals).reduce((s, v) => s + v, 0))}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Manage individual expense records on the <a href="/admin/taxes" className="text-blue-600 hover:underline">Taxes</a> page.
              </p>
            </>
          ) : (
            <div className="text-gray-400 text-sm italic">
              No business expenses recorded yet for this year. Add them on the{' '}
              <a href="/admin/taxes" className="text-blue-600 hover:underline">Taxes</a> page.
            </div>
          )}
        </div>
      )}

      {/* Vehicle Value Notes — OTDcheck (always visible footer) */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 text-sm text-indigo-800">
        <strong>📊 Vehicle Market Values (OTDcheck):</strong> Market values are fetched automatically from{' '}
        <a href="https://otdcheck.com" target="_blank" rel="noopener noreferrer" className="underline text-indigo-700">OTDcheck.com</a>{' '}
        once per month (up to 100 lookups/month free). The depreciation column above uses the latest OTDcheck market value
        minus the original purchase price. To trigger an immediate refresh for a specific vehicle, use the{' '}
        <a href="/admin/vehicles" className="underline text-indigo-700">Vehicles</a> page and click{' '}
        <strong>📊 Refresh Value</strong> on the vehicle card.
      </div>
    </div>
    </AdminLayout>
  );
}
