/**
 * VehicleFields.jsx — Renderers for the field schema in utils/vehicleFields.
 *
 * `FieldInput` draws the editor for one field; `VehicleFieldsCard` draws a
 * read-only definition list for a set of groups with an inline edit mode.
 * Every field defined in a group is rendered in *both* modes, so nothing is
 * hidden until you click "Edit".
 */
import { useEffect, useState } from 'react';
import { useApi } from '../context/AuthContext';
import {
  formToPayload, formatFieldValue, vehicleToForm,
} from '../utils/vehicleFields';

const INPUT_CLS =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900 ' +
  'focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 ' +
  'dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100';

export function FieldInput({ field, value, onChange }) {
  const common = { className: INPUT_CLS, value: value ?? '', onChange: e => onChange(e.target.value) };

  if (field.type === 'checkbox') {
    return (
      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 h-[38px]">
        <input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)}
          className="rounded border-gray-300 dark:border-gray-600" />
        {field.label}
      </label>
    );
  }
  if (field.type === 'select') {
    return (
      <select {...common}>
        {field.allowEmpty && <option value="">— none —</option>}
        {field.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  }
  if (field.type === 'list') {
    return (
      <textarea rows={3} className={INPUT_CLS}
        value={(Array.isArray(value) ? value : []).join('\n')}
        onChange={e => onChange(e.target.value.split('\n').map(s => s.trim()).filter(Boolean))} />
    );
  }

  const numeric = ['number', 'dollars', 'plainDollars', 'percent'].includes(field.type);
  return (
    <input
      {...common}
      type={field.type === 'date' ? 'date' : numeric ? 'number' : 'text'}
      step={field.step || (field.type === 'dollars' || field.type === 'plainDollars' ? '0.01' : undefined)}
      inputMode={numeric ? 'decimal' : undefined}
    />
  );
}

function FieldLabel({ field }) {
  return (
    <label className="block text-xs font-medium text-gray-600 mb-1 dark:text-gray-300">
      {field.label}
      {field.required && <span className="text-red-500 ml-0.5">*</span>}
      {field.type === 'dollars' || field.type === 'plainDollars' ? (
        <span className="text-gray-400 dark:text-gray-500"> ($)</span>
      ) : null}
    </label>
  );
}

/** Edit-mode inputs for one group (no card chrome) — used by the Add modal too. */
export function FieldGroupInputs({ group, form, setForm, create = false }) {
  const visible = group.fields.filter(f => (create || !f.createOnly) && (!f.dependsOn || form[f.dependsOn]));
  return (
    <>
      {visible.map(f => (
        <div key={f.key} className={f.full ? 'sm:col-span-2 lg:col-span-3' : ''}>
          {f.type !== 'checkbox' && <FieldLabel field={f} />}
          <FieldInput field={f} value={form[f.key]}
            onChange={val => setForm(s => ({ ...s, [f.key]: val }))} />
          {f.hint && <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">{f.hint}</p>}
        </div>
      ))}
    </>
  );
}

function ReadOnlyGroup({ vehicle, group }) {
  const visible = group.fields.filter(f => !f.dependsOn || vehicle[f.dependsOn]);
  return (
    <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4 text-sm">
      {visible.map(f => (
        <div key={f.key} className={f.full ? 'col-span-2 sm:col-span-3' : ''}>
          <dt className="text-gray-400 text-xs dark:text-gray-500">{f.label}</dt>
          <dd className="text-gray-800 break-words dark:text-gray-200">{formatFieldValue(vehicle, f)}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Read-only card for one or more field groups, with an inline "Edit" mode that
 * saves only the fields belonging to those groups.
 */
export function VehicleFieldsCard({ vehicle, groups, title, onSaved, description }) {
  const api = useApi();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() => vehicleToForm(vehicle, groups));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => { setForm(vehicleToForm(vehicle, groups)); }, [vehicle, groups]);

  const handleSave = async () => {
    setSaving(true); setErr(''); setMsg('');
    try {
      await api.put(`/admin/vehicles/${vehicle.vin}`, formToPayload(form, groups));
      setMsg('Saved.');
      setEditing(false);
      onSaved?.();
    } catch (e) {
      setErr(e.response?.data?.error || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="bg-white rounded-xl border border-gray-200 dark:bg-gray-800 dark:border-gray-700">
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
        <div>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{title}</h2>
          {description && <p className="text-xs text-gray-400 mt-0.5 dark:text-gray-500">{description}</p>}
        </div>
        {!editing ? (
          <button onClick={() => setEditing(true)}
            className="text-xs border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">
            Edit
          </button>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => { setEditing(false); setErr(''); setForm(vehicleToForm(vehicle, groups)); }}
              className="text-xs border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving}
              className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </header>

      <div className="p-6 space-y-6">
        {msg && <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 dark:bg-green-900/20 dark:border-green-900">{msg}</div>}
        {err && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 dark:bg-red-900/20 dark:border-red-900">{err}</div>}

        {groups.map((group, i) => (
          <div key={group.id} className={i > 0 ? 'pt-6 border-t border-gray-100 dark:border-gray-700' : ''}>
            {groups.length > 1 && (
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1 dark:text-gray-500">{group.title}</h3>
            )}
            {group.hint && <p className="text-xs text-gray-400 mb-3 dark:text-gray-500">{group.hint}</p>}
            <div className={groups.length > 1 || group.hint ? 'mt-3' : ''}>
              {editing ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <FieldGroupInputs group={group} form={form} setForm={setForm} />
                </div>
              ) : (
                <ReadOnlyGroup vehicle={vehicle} group={group} />
              )}
            </div>
            {group.footnote && (
              <p className="mt-3 text-[11px] text-gray-400 dark:text-gray-500">{group.footnote}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
