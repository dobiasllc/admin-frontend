/**
 * TuroCsvImportButton.jsx — shared "Import Turo Trip Earnings CSV" control.
 * Used on both AdminAnalytics (Financials tab) and AdminBookings pages.
 *
 * Usage:
 *   <TuroCsvImportButton onImported={() => reloadMyData()} />
 */
import React, { useRef, useState } from 'react';
import { useApi } from '../context/AuthContext';

export default function TuroCsvImportButton({ onImported, className = '', label = '⬆ Import Turo CSV' }) {
  const api = useApi();
  const fileInputRef = useRef(null);
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');

  const handleImportClick = () => {
    setError('');
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;
    setImporting(true);
    setError('');
    setSummary(null);
    try {
      const text = await file.text();
      const res = await api.post('/admin/turo-trips/import', { csv: text });
      setSummary(res.data);
      if (onImported) onImported(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to import CSV');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className={className}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={handleFileSelected}
      />
      <button
        onClick={handleImportClick}
        disabled={importing}
        className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded font-medium disabled:opacity-50 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200"
        title="Upload Turo's 'trip earnings export' CSV to bulk-import historical trip income as booking records"
      >
        {importing ? 'Importing…' : label}
      </button>

      {error && (
        <div className="mt-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex items-start justify-between gap-2 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600 dark:text-red-500">✕</button>
        </div>
      )}

      {summary && (
        <div className="mt-2 bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-900 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-200">
          <div className="flex items-start justify-between gap-2">
            <strong>Turo CSV Import Complete</strong>
            <button onClick={() => setSummary(null)} className="text-blue-400 hover:text-blue-600 dark:text-blue-300">✕</button>
          </div>
          <ul className="mt-1 space-y-0.5 text-xs">
            <li>✅ Imported: <strong>{summary.imported ?? 0}</strong></li>
            <li>🔄 Updated: <strong>{summary.updated ?? 0}</strong></li>
            <li>⏭ Skipped (already synced/authoritative): <strong>{summary.skipped_duplicates ?? 0}</strong></li>
            <li>⏭ Skipped ($0 revenue): <strong>{summary.skipped_zero_revenue ?? 0}</strong></li>
            <li>⏭ Skipped (unrecognized status): <strong>{summary.skipped_unrecognized_status ?? 0}</strong></li>
            {summary.date_range && (summary.date_range.min || summary.date_range.max) && (
              <li>📅 Date range: {summary.date_range.min || '—'} to {summary.date_range.max || '—'}</li>
            )}
          </ul>
          {summary.unmatched_vins && summary.unmatched_vins.length > 0 && (
            <div className="mt-2 pt-2 border-t border-blue-200 dark:border-blue-800">
              <div className="font-medium text-xs mb-1">⚠️ Unmatched VINs (rows skipped — vehicle not found in fleet):</div>
              <ul className="text-xs space-y-0.5">
                {summary.unmatched_vins.map((u, i) => (
                  <li key={i}>{u.vin} — {u.vehicleName} ({u.count} row{u.count !== 1 ? 's' : ''})</li>
                ))}
              </ul>
            </div>
          )}
          {summary.errors && summary.errors.length > 0 && (
            <div className="mt-2 pt-2 border-t border-blue-200 dark:border-blue-800">
              <div className="font-medium text-xs mb-1">⚠️ Errors:</div>
              <ul className="text-xs space-y-0.5">
                {summary.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
