/**
 * vehicleFields.js — Single source of truth for vehicle attributes.
 *
 * Both the "Add Vehicle" modal and the vehicle detail page render from these
 * group definitions, so a field can never be editable-but-invisible (or vice
 * versa) the way it used to be when the two screens kept separate field lists.
 *
 * Field types:
 *   text | number | date | select | checkbox | list  — stored as entered
 *   dollars  — stored in *cents*, entered/displayed in dollars
 *   plainDollars — stored as a whole-dollar number (legacy `purchasePrice`)
 *   percent  — stored as a decimal fraction (0.0649), displayed as 6.49%
 */

export const VEHICLE_TYPES = ['sedan', 'suv', 'truck', 'minivan', 'sports', 'coupe'];

export const STATUS_OPTIONS = [
  { value: 'available',   label: 'Available' },
  { value: 'rented',      label: 'Rented' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'retired',     label: 'Retired' },
];

export const SOURCE_OPTIONS = [
  { value: 'private', label: 'Private (direct)' },
  { value: 'turo',    label: 'Turo' },
  { value: 'both',    label: 'Both' },
];

const CABIN_OVERHEAT_OPTIONS = [
  { value: 'off',    label: 'Off (saves battery while parked)' },
  { value: 'no_ac',  label: 'On — Fan Only' },
  { value: 'on',     label: 'On — Full A/C' },
];

const CLIMATE_KEEPER_OPTIONS = [
  { value: 'off',  label: 'Off' },
  { value: 'keep', label: 'Keep Mode' },
  { value: 'dog',  label: 'Dog Mode' },
  { value: 'camp', label: 'Camp Mode' },
];

export const FIELD_GROUPS = [
  {
    id: 'identity',
    title: 'Identity & Listing',
    fields: [
      { key: 'vin',           label: 'VIN',             type: 'text',   createOnly: true, required: true },
      { key: 'make',          label: 'Make',            type: 'text',   required: true },
      { key: 'model',         label: 'Model',           type: 'text',   required: true },
      { key: 'year',          label: 'Year',            type: 'number', required: true },
      { key: 'licensePlate',  label: 'License Plate',   type: 'text' },
      { key: 'color',         label: 'Color',           type: 'text' },
      { key: 'vehicleType',   label: 'Vehicle Type',    type: 'select', allowEmpty: true,
        options: VEHICLE_TYPES.map(t => ({ value: t, label: t })) },
      { key: 'status',        label: 'Status',          type: 'select', options: STATUS_OPTIONS, default: 'available' },
      { key: 'defaultSource', label: 'Default Source',  type: 'select', options: SOURCE_OPTIONS, default: 'private' },
      { key: 'turoUrl',       label: 'Turo Listing URL', type: 'text',  full: true },
      { key: 'ownerUserId',   label: 'Owner User ID (Cognito)', type: 'text', advanced: true },
    ],
  },
  {
    id: 'pricing',
    title: 'Pricing & Extras',
    fields: [
      { key: 'dailyRateCents',           label: 'Daily Rate',             type: 'dollars', suffix: '/day', required: true },
      { key: 'freeMilesPerDay',          label: 'Free Miles / Day',       type: 'number',  suffix: ' mi' },
      { key: 'unlimitedMileageFeeCents', label: 'Unlimited Mileage Fee',  type: 'dollars', suffix: '/day', zeroDefault: true },
      { key: 'deliveryFeeCents',         label: 'Delivery Fee',           type: 'dollars', hint: 'flat, per rental', zeroDefault: true },
      { key: 'prepaidEnergyFeeCents',    label: 'Prepaid Energy Fee',     type: 'dollars', hint: 'flat, per rental', zeroDefault: true },
      { key: 'manualRevenueAdjustmentCents', label: 'Manual Revenue Adjustment', type: 'dollars',
        hint: 'Added to this vehicle\u2019s revenue in Analytics', advanced: true },
    ],
  },
  {
    id: 'location',
    title: 'Home Base Address',
    hint: 'Used for Wisconsin sales-tax lookup on "No Delivery" bookings.',
    fields: [
      { key: 'homeAddress', label: 'Street Address', type: 'text', full: true },
      { key: 'homeCity',    label: 'City',           type: 'text' },
      { key: 'homeState',   label: 'State',          type: 'text', default: 'WI' },
      { key: 'homeZip',     label: 'Zip Code',       type: 'text' },
    ],
  },
  {
    id: 'access',
    title: 'Tesla & Access',
    fields: [
      { key: 'teslaEnabled',   label: 'Tesla Enabled',     type: 'checkbox' },
      { key: 'lockboxCode',    label: 'Lockbox Code',      type: 'text' },
      { key: 'teslaVehicleId', label: 'Tesla Vehicle ID',  type: 'text', advanced: true },
      { key: 'teslaAccountId', label: 'Tesla Account ID',  type: 'text', advanced: true },
      { key: 'postEraseCabinOverheatMode', label: 'Cabin Overheat Protection (post-checkout)',
        type: 'select', options: CABIN_OVERHEAT_OPTIONS, default: 'off', dependsOn: 'teslaEnabled' },
      { key: 'postEraseClimateKeeperMode', label: 'Climate Keeper Mode (post-checkout)',
        type: 'select', options: CLIMATE_KEEPER_OPTIONS, default: 'off', dependsOn: 'teslaEnabled' },
    ],
    footnote:
      'Tesla\u2019s "erase user data" checkout step resets several settings to factory defaults. ' +
      'The two modes above are automatically restored after each erase.',
  },
  {
    id: 'odometer',
    title: 'Mileage',
    fields: [
      { key: 'totalOdometerMiles',       label: 'Current Odometer',        type: 'number', suffix: ' mi' },
      { key: 'purchaseOdometerMiles',    label: 'Odometer at Purchase',    type: 'number', suffix: ' mi',
        hint: 'Drives $/mile analytics \u2014 edit only to correct errors.', advanced: true },
      { key: 'rentalStartDate',          label: 'Rental Service Start',    type: 'date' },
      { key: 'rentalStartOdometerMiles', label: 'Odometer at Rental Start', type: 'number', suffix: ' mi' },
    ],
    footnote:
      'Rental service start is when the vehicle first became bookable, if different from the purchase ' +
      'date. Improves "All time" utilization, $/mile and $/day accuracy.',
  },
  {
    id: 'acquisition',
    title: 'Acquisition & Financing',
    fields: [
      { key: 'purchasePrice',           label: 'Purchase Price',              type: 'plainDollars' },
      { key: 'purchaseDate',            label: 'Purchase Date',               type: 'date' },
      { key: 'ttrCents',                label: 'Tax / Title / Registration',  type: 'dollars', hint: 'one-time' },
      { key: 'annualRegistrationCents', label: 'Annual Registration',         type: 'dollars', suffix: '/yr' },
      { key: 'loanPrincipalCents',      label: 'Loan Principal',              type: 'dollars' },
      { key: 'loanAPR',                 label: 'Loan APR',                    type: 'percent',
        hint: 'Enter as a decimal \u2014 0.0649 means 6.49%', step: '0.0001' },
      { key: 'loanTermMonths',          label: 'Loan Term',                   type: 'number', suffix: ' mo' },
      { key: 'loanStartDate',           label: 'Loan Start Date',             type: 'date' },
    ],
  },
  {
    id: 'media',
    title: 'Images',
    fields: [
      { key: 'imageUrl',  label: 'Primary Image URL',      type: 'text', full: true },
      { key: 'imageUrls', label: 'Additional Image URLs',  type: 'list', full: true, hint: 'One URL per line' },
    ],
  },
];

export const GROUPS_BY_ID = Object.fromEntries(FIELD_GROUPS.map(g => [g.id, g]));

export function groupsByIds(ids) {
  return ids.map(id => GROUPS_BY_ID[id]).filter(Boolean);
}

/** Convert a stored vehicle record into form state (cents → dollars, etc). */
export function vehicleToForm(vehicle = {}, groups = FIELD_GROUPS) {
  const form = {};
  for (const group of groups) {
    for (const f of group.fields) {
      const raw = vehicle[f.key];
      if (f.type === 'checkbox') {
        form[f.key] = !!raw;
      } else if (f.type === 'list') {
        form[f.key] = Array.isArray(raw) ? raw : [];
      } else if (f.type === 'dollars') {
        form[f.key] = raw === null || raw === undefined || raw === '' ? '' : Number(raw) / 100;
      } else {
        form[f.key] = raw === null || raw === undefined ? (f.default ?? '') : raw;
      }
    }
  }
  return form;
}

/** Convert form state back into an API payload (dollars → cents, blanks dropped). */
export function formToPayload(form = {}, groups = FIELD_GROUPS, { create = false } = {}) {
  const payload = {};
  for (const group of groups) {
    for (const f of group.fields) {
      if (f.createOnly && !create) continue;
      const raw = form[f.key];
      const blank = raw === '' || raw === null || raw === undefined;

      switch (f.type) {
        case 'checkbox':
          payload[f.key] = !!raw;
          break;
        case 'list':
          payload[f.key] = Array.isArray(raw) ? raw : [];
          break;
        case 'dollars':
          if (blank) { if (f.zeroDefault) payload[f.key] = 0; }
          else payload[f.key] = Math.round(Number(raw) * 100);
          break;
        case 'number':
        case 'plainDollars':
        case 'percent':
          if (!blank) payload[f.key] = Number(raw);
          break;
        default:
          // Text / select / date: send blanks through so a value can be cleared.
          payload[f.key] = blank ? '' : raw;
      }
    }
  }
  return payload;
}

/** Human-readable value for the read-only view. */
export function formatFieldValue(vehicle = {}, f) {
  const raw = vehicle[f.key];

  if (f.type === 'checkbox') return raw ? 'Yes' : 'No';
  if (f.type === 'list') {
    const n = Array.isArray(raw) ? raw.length : 0;
    return n ? `${n} image${n === 1 ? '' : 's'}` : '—';
  }
  if (raw === null || raw === undefined || raw === '') {
    // Selects with a default still have a meaningful value when unset.
    if (f.type === 'select' && f.default) {
      return f.options?.find(o => o.value === f.default)?.label ?? f.default;
    }
    return '—';
  }

  switch (f.type) {
    case 'dollars':
      return `$${(Number(raw) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${f.suffix || ''}`;
    case 'plainDollars':
      return `$${Number(raw).toLocaleString()}`;
    case 'percent':
      return `${(Number(raw) * 100).toFixed(2)}%`;
    case 'number':
      return `${Number(raw).toLocaleString()}${f.suffix || ''}`;
    case 'select':
      return f.options?.find(o => o.value === raw)?.label ?? String(raw);
    default:
      return String(raw);
  }
}
