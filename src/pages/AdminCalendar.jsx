/**
 * AdminCalendar.jsx — Fleet availability calendar (Gantt + Month views).
 * Route: /admin/calendar
 *
 * Features:
 *  1. Gantt (timeline) view: today is the 2nd column; scrolls ~90 days
 *  2. Sticky vehicle name column with car thumbnail
 *  3. Infinite horizontal scroll (no fixed window cap)
 *  4. Month view: multi-car filter, traditional calendar grid
 *  5. Interactive blocking: click a day cell to block a date range
 *  6. Google Calendar / iCal sync button
 */
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../context/AuthContext';
import AdminLayout from '../components/AdminNav';

// ── Constants ────────────────────────────────────────────────────────────────

const STATUS_BG = {
  pending:   'bg-yellow-400',
  confirmed: 'bg-blue-500',
  active:    'bg-green-500',
  completed: 'bg-gray-400',
  canceled:  'bg-red-400',
  disputed:  'bg-purple-500',
};
const STATUS_HOVER = {
  pending:   'hover:bg-yellow-500',
  confirmed: 'hover:bg-blue-600',
  active:    'hover:bg-green-600',
  completed: 'hover:bg-gray-500',
  canceled:  'hover:bg-red-500',
  disputed:  'hover:bg-purple-600',
};
const TURO_BG    = 'bg-orange-400';
const TURO_HOVER = 'hover:bg-orange-500';
const BLOCK_BG   = 'bg-red-600';
const BLOCK_HOVER = 'hover:bg-red-700';

// Distinct colors for multi-car month view
const CAR_COLORS = [
  { bg: 'bg-blue-500',   text: 'text-white', dot: 'bg-blue-500' },
  { bg: 'bg-green-500',  text: 'text-white', dot: 'bg-green-500' },
  { bg: 'bg-purple-500', text: 'text-white', dot: 'bg-purple-500' },
  { bg: 'bg-orange-400', text: 'text-white', dot: 'bg-orange-400' },
  { bg: 'bg-pink-500',   text: 'text-white', dot: 'bg-pink-500' },
  { bg: 'bg-teal-500',   text: 'text-white', dot: 'bg-teal-500' },
];

const DAY_WIDTH_PX  = 40;
const GANTT_DAYS    = 92;   // ~3 months
const ROW_HEIGHT_PX = 56;
const LABEL_WIDTH   = 176;  // px — sticky left column

// ── Helpers ──────────────────────────────────────────────────────────────────

function startOfDay(d) {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function fmtDay(d) {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function isToday(d) {
  const t = new Date();
  return d.getFullYear() === t.getFullYear() &&
         d.getMonth()    === t.getMonth()    &&
         d.getDate()     === t.getDate();
}

function isWeekend(d) {
  const day = d.getDay();
  return day === 0 || day === 6;
}

function isoDate(d) {
  // Returns YYYY-MM-DD for a Date
  return d.toISOString().slice(0, 10);
}

/**
 * Compute bar position for Gantt view.
 * Returns { left (days), width (days) } or null if outside window.
 */
function computeBar(startTime, endTime, windowStart, windowEnd) {
  const bStart = startOfDay(new Date(startTime));
  const bEnd   = startOfDay(new Date(endTime));

  if (bEnd < windowStart || bStart > windowEnd) return null;

  const clampedStart = bStart < windowStart ? windowStart : bStart;
  const clampedEnd   = bEnd   > windowEnd   ? windowEnd   : bEnd;

  const msPerDay = 86400000;
  const left  = Math.round((clampedStart - windowStart) / msPerDay);
  const width = Math.max(1, Math.round((clampedEnd - clampedStart) / msPerDay) + 1);
  return { left, width };
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

function BookingTooltip({ booking, vehicleName }) {
  const guest       = booking.guestName || booking.turoGuestName || booking.userId || '—';
  const phone       = booking.guestPhone || '';
  const location    = booking.pickupLocation || '';
  const tripUrl     = booking.turoTripUrl || (booking.source === 'turo' && booking.turoTripId ? `https://turo.com/reservation/${booking.turoTripId}` : '');
  const start = new Date(booking.startTime).toLocaleDateString();
  const end   = new Date(booking.endTime).toLocaleDateString();
  return (
    <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-gray-900 text-white text-xs rounded-lg p-3 shadow-xl pointer-events-none">
      <p className="font-semibold text-sm mb-1">{vehicleName}</p>
      <p className="text-gray-300 mb-1">{guest}</p>
      {phone && <p className="text-gray-400 mb-0.5">📞 {phone}</p>}
      <p className="mb-1">{start} → {end}</p>
      {location && (
        <p className="text-gray-300 mb-0.5 flex items-start gap-1">
          <span className="shrink-0">📍</span>
          <span className="break-words">{location}</span>
        </p>
      )}
      {tripUrl && (
        <p className="text-blue-400 mt-1 truncate">🔗 {tripUrl}</p>
      )}
      <div className="flex items-center justify-between mt-1.5">
        <span className="capitalize text-gray-400">{booking.status}</span>
        {booking.source === 'turo' && (
          <span className="bg-orange-500 text-white px-1.5 py-0.5 rounded text-xs">Turo</span>
        )}
      </div>
      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
    </div>
  );
}

// ── Booking bar (Gantt) ───────────────────────────────────────────────────────

function BookingBar({ booking, bar, vehicleName, navigate }) {
  const [hovered, setHovered] = useState(false);
  const isTuro = booking.source === 'turo';
  const isBlock = booking._isBlock;
  const bg  = isBlock ? BLOCK_BG  : isTuro ? TURO_BG  : (STATUS_BG[booking.status]    || 'bg-gray-400');
  const hov = isBlock ? BLOCK_HOVER : isTuro ? TURO_HOVER : (STATUS_HOVER[booking.status] || 'hover:bg-gray-500');
  const guest = booking.guestName || booking.turoGuestName || '';
  const label = isBlock ? (booking.reason || 'Unavailable') : (guest || booking.status);

  return (
    <div
      className="absolute top-1.5 bottom-1.5 flex items-center"
      style={{ left: `${bar.left * DAY_WIDTH_PX}px`, width: `${bar.width * DAY_WIDTH_PX - 2}px` }}
    >
      <div
        className={`relative w-full h-full rounded-md ${bg} ${hov} cursor-pointer transition-colors flex items-center px-1.5 overflow-hidden ${isBlock ? 'opacity-80' : ''}`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => {
          if (isBlock) {
            booking._onBlockClick && booking._onBlockClick();
          } else {
            booking.bookingId && navigate(`/bookings/${booking.bookingId}`);
          }
        }}
      >
        {bar.width >= 2 && (
          <span className="text-white text-xs font-medium truncate leading-none select-none">
            {label}
          </span>
        )}
        {isBlock && bar.width >= 2 && (
          <span className="ml-auto text-white/70 text-xs">🔒</span>
        )}
        {hovered && !isBlock && (
          <BookingTooltip booking={booking} vehicleName={vehicleName} />
        )}
        {hovered && isBlock && (
          <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-44 bg-gray-900 text-white text-xs rounded-lg p-2.5 shadow-xl pointer-events-none">
            <p className="font-semibold mb-1">🔒 Unavailable</p>
            <p className="text-gray-300">{booking.reason || 'Manual block'}</p>
            <p className="text-gray-400 mt-1">{new Date(booking.startTime).toLocaleDateString()} → {new Date(booking.endTime).toLocaleDateString()}</p>
            <p className="text-gray-500 mt-1 text-xs">Click to remove</p>
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Block Date Modal ──────────────────────────────────────────────────────────

function BlockModal({ vin, vehicleName, defaultStart, onSave, onClose }) {
  const [startDate, setStartDate] = useState(defaultStart || isoDate(new Date()));
  const [endDate,   setEndDate]   = useState(defaultStart || isoDate(new Date()));
  const [reason,    setReason]    = useState('Maintenance');
  const [saving,    setSaving]    = useState(false);

  const handleSave = async () => {
    if (!startDate || !endDate) return;
    setSaving(true);
    await onSave({
      startTime: new Date(startDate + 'T00:00:00').toISOString(),
      endTime:   new Date(endDate   + 'T23:59:59').toISOString(),
      reason,
    });
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Block Dates</h3>
        <p className="text-sm text-gray-500 mb-4">{vehicleName}</p>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Start Date</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">End Date</label>
            <input type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Reason</label>
            <input type="text" value={reason} onChange={e => setReason(e.target.value)}
              placeholder="e.g. Maintenance, Personal use"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <button onClick={handleSave} disabled={saving}
            className="flex-1 bg-red-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition disabled:opacity-50">
            {saving ? 'Saving…' : '🔒 Block Dates'}
          </button>
          <button onClick={onClose}
            className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Remove Block Confirm ──────────────────────────────────────────────────────

function RemoveBlockModal({ block, vehicleName, onConfirm, onClose }) {
  const [removing, setRemoving] = useState(false);
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Remove Block?</h3>
        <p className="text-sm text-gray-500 mb-3">{vehicleName}</p>
        <p className="text-sm text-gray-700 mb-1"><span className="font-medium">Reason:</span> {block.reason}</p>
        <p className="text-sm text-gray-700 mb-4">
          {new Date(block.startTime).toLocaleDateString()} → {new Date(block.endTime).toLocaleDateString()}
        </p>
        <div className="flex gap-3">
          <button onClick={async () => { setRemoving(true); await onConfirm(); setRemoving(false); }}
            disabled={removing}
            className="flex-1 bg-red-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition disabled:opacity-50">
            {removing ? 'Removing…' : 'Remove Block'}
          </button>
          <button onClick={onClose}
            className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── iCal Modal ────────────────────────────────────────────────────────────────

function ICalModal({ apiBase, onClose }) {
  const [token, setToken] = useState('');
  const [copied, setCopied] = useState(false);

  const icalUrl = token
    ? `${apiBase}/admin/calendar/ical?token=${encodeURIComponent(token)}`
    : '';

  const googleUrl = icalUrl
    ? `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(icalUrl)}`
    : '';

  const copyUrl = () => {
    if (!icalUrl) return;
    navigator.clipboard.writeText(icalUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">📅 Google Calendar Sync</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <p className="text-sm text-gray-600 mb-4">
          Subscribe to your fleet calendar in Google Calendar, Apple Calendar, or any app that supports iCal feeds.
        </p>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-xs text-blue-800">
          <strong>Setup:</strong> Store a secret token in AWS SSM at <code className="bg-blue-100 px-1 rounded">/fleet/ical/token</code> using the AWS console or CLI, then enter it below.
        </div>

        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-600 mb-1">iCal Token (from SSM)</label>
          <input
            type="text"
            value={token}
            onChange={e => setToken(e.target.value)}
            placeholder="Paste your token here"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"
          />
        </div>

        {icalUrl && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">iCal Feed URL</label>
              <div className="flex gap-2">
                <input readOnly value={icalUrl}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono bg-gray-50 text-gray-600 truncate" />
                <button onClick={copyUrl}
                  className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-medium transition whitespace-nowrap">
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
              </div>
            </div>

            <a href={googleUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/>
              </svg>
              Add to Google Calendar
            </a>

            <p className="text-xs text-gray-400 text-center">
              In Google Calendar: Other calendars → + → From URL → paste the feed URL above
            </p>
          </div>
        )}

        {!icalUrl && (
          <p className="text-xs text-gray-400 text-center mt-2">Enter your token above to generate the feed URL.</p>
        )}
      </div>
    </div>
  );
}

// ── Month View ────────────────────────────────────────────────────────────────

function MonthView({ vehicles, bookings, blocksByVin, selectedVins, onToggleVin, onBlockSave, onBlockRemove, api }) {
  const today = startOfDay(new Date());
  const [monthOffset, setMonthOffset] = useState(0);
  const [blockModal, setBlockModal]   = useState(null); // { vin, date }
  const [removeModal, setRemoveModal] = useState(null); // { block, vin }

  const viewDate = useMemo(() => {
    const d = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
    return d;
  }, [monthOffset]);

  const monthLabel = viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Build calendar grid: weeks × 7 days
  const calDays = useMemo(() => {
    const year  = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const first = new Date(year, month, 1);
    const last  = new Date(year, month + 1, 0);

    // Pad to start on Sunday
    const startPad = first.getDay(); // 0=Sun
    const endPad   = 6 - last.getDay();

    const days = [];
    for (let i = -startPad; i <= last.getDate() - 1 + endPad; i++) {
      const d = new Date(year, month, 1 + i);
      days.push(d);
    }
    return days;
  }, [viewDate]);

  // Color map for selected vehicles
  const colorMap = useMemo(() => {
    const m = {};
    vehicles.forEach((v, i) => {
      m[v.vin] = CAR_COLORS[i % CAR_COLORS.length];
    });
    return m;
  }, [vehicles]);

  // Events per day: { 'YYYY-MM-DD': [{ vin, label, color, isBlock, booking/block }] }
  const eventsByDay = useMemo(() => {
    const m = {};

    const addEvent = (dateKey, event) => {
      if (!m[dateKey]) m[dateKey] = [];
      m[dateKey].push(event);
    };

    selectedVins.forEach(vin => {
      const color = colorMap[vin] || CAR_COLORS[0];
      const vehicle = vehicles.find(v => v.vin === vin);
      const vName = vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}`.trim() : vin;

      // Bookings
      (bookings[vin] || []).forEach(b => {
        if (!b.startTime || !b.endTime) return;
        const s = startOfDay(new Date(b.startTime));
        const e = startOfDay(new Date(b.endTime));
        let cur = new Date(s);
        while (cur <= e) {
          const key = isoDate(cur);
          addEvent(key, {
            vin, color, isBlock: false,
            label: b.guestName || b.turoGuestName || b.status || 'Booked',
            source: b.source,
            booking: b,
          });
          cur.setDate(cur.getDate() + 1);
        }
      });

      // Manual blocks
      (blocksByVin[vin] || []).forEach(blk => {
        if (!blk.startTime || !blk.endTime) return;
        const s = startOfDay(new Date(blk.startTime));
        const e = startOfDay(new Date(blk.endTime));
        let cur = new Date(s);
        while (cur <= e) {
          const key = isoDate(cur);
          addEvent(key, {
            vin, color, isBlock: true,
            label: blk.reason || 'Unavailable',
            block: blk,
            vName,
          });
          cur.setDate(cur.getDate() + 1);
        }
      });
    });

    return m;
  }, [selectedVins, bookings, blocksByVin, vehicles, colorMap]);

  const currentMonth = viewDate.getMonth();

  return (
    <div>
      {/* Vehicle filter pills */}
      <div className="flex flex-wrap gap-2 mb-4">
        <span className="text-xs font-medium text-gray-500 self-center mr-1">Filter:</span>
        {vehicles.map((v, i) => {
          const color = CAR_COLORS[i % CAR_COLORS.length];
          const active = selectedVins.includes(v.vin);
          const vName = `${v.year} ${v.make} ${v.model}`.trim();
          return (
            <button
              key={v.vin}
              onClick={() => onToggleVin(v.vin)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition
                ${active
                  ? `${color.bg} ${color.text} border-transparent`
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                }`}
            >
              {v.imageUrl && (
                <img src={v.imageUrl} alt="" className="w-4 h-4 rounded-full object-cover" />
              )}
              {vName}
              {active && <span className="ml-0.5 opacity-70">✓</span>}
            </button>
          );
        })}
      </div>

      {/* Month navigation */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => setMonthOffset(o => o - 1)}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white hover:bg-gray-50 text-gray-700 transition">
          ← Prev
        </button>
        <h2 className="text-base font-semibold text-gray-800">{monthLabel}</h2>
        <button onClick={() => setMonthOffset(o => o + 1)}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white hover:bg-gray-50 text-gray-700 transition">
          Next →
        </button>
      </div>

      {/* Calendar grid */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Day-of-week headers */}
        <div className="grid grid-cols-7 border-b border-gray-200">
          {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
            <div key={d} className="py-2 text-center text-xs font-semibold text-gray-500 uppercase">
              {d}
            </div>
          ))}
        </div>

        {/* Weeks */}
        <div className="grid grid-cols-7">
          {calDays.map((d, idx) => {
            const key      = isoDate(d);
            const inMonth  = d.getMonth() === currentMonth;
            const todayDay = isToday(d);
            const events   = eventsByDay[key] || [];
            const isPast   = d < today && !todayDay;

            return (
              <div
                key={idx}
                onClick={() => {
                  if (!inMonth) return;
                  // If only one vehicle selected, open block modal for that vehicle
                  if (selectedVins.length === 1) {
                    setBlockModal({ vin: selectedVins[0], date: key });
                  }
                }}
                className={`min-h-[90px] border-r border-b border-gray-100 p-1.5 relative
                  ${!inMonth ? 'bg-gray-50/60' : ''}
                  ${todayDay ? 'bg-blue-50' : ''}
                  ${isPast && inMonth ? 'bg-gray-50/30' : ''}
                  ${inMonth && selectedVins.length === 1 ? 'cursor-pointer hover:bg-blue-50/40' : ''}
                `}
              >
                <span className={`text-xs font-medium block mb-1
                  ${!inMonth ? 'text-gray-300' : todayDay ? 'text-blue-700 font-bold' : 'text-gray-600'}
                `}>
                  {d.getDate() === 1
                    ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    : d.getDate()
                  }
                </span>

                {/* Events */}
                <div className="space-y-0.5">
                  {events.slice(0, 3).map((ev, ei) => {
                    const loc = !ev.isBlock && ev.booking ? (ev.booking.pickupLocation || '') : '';
                    const phone = !ev.isBlock && ev.booking ? (ev.booking.guestPhone || '') : '';
                    const tooltipParts = [ev.label];
                    if (phone) tooltipParts.push(`📞 ${phone}`);
                    if (loc)   tooltipParts.push(`📍 ${loc}`);
                    return (
                    <div
                      key={ei}
                      onClick={e => {
                        e.stopPropagation();
                        if (ev.isBlock) {
                          const vehicle = vehicles.find(v => v.vin === ev.vin);
                          const vName = vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}`.trim() : ev.vin;
                          setRemoveModal({ block: ev.block, vin: ev.vin, vName });
                        }
                      }}
                      className={`text-xs px-1.5 py-0.5 rounded truncate leading-tight
                        ${ev.isBlock
                          ? 'bg-red-100 text-red-700 cursor-pointer hover:bg-red-200'
                          : `${ev.color.bg} ${ev.color.text} opacity-90`
                        }
                      `}
                      title={tooltipParts.join('\n')}
                    >
                      {ev.isBlock ? `🔒 ${ev.label}` : ev.label}
                      {loc && <span className="ml-1 opacity-70">📍</span>}
                    </div>
                    );
                  })}
                  {events.length > 3 && (
                    <div className="text-xs text-gray-400 pl-1">+{events.length - 3} more</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Block modal */}
      {blockModal && (() => {
        const vehicle = vehicles.find(v => v.vin === blockModal.vin);
        const vName = vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}`.trim() : blockModal.vin;
        return (
          <BlockModal
            vin={blockModal.vin}
            vehicleName={vName}
            defaultStart={blockModal.date}
            onSave={async (data) => {
              await onBlockSave(blockModal.vin, data);
              setBlockModal(null);
            }}
            onClose={() => setBlockModal(null)}
          />
        );
      })()}

      {/* Remove block modal */}
      {removeModal && (
        <RemoveBlockModal
          block={removeModal.block}
          vehicleName={removeModal.vName}
          onConfirm={async () => {
            await onBlockRemove(removeModal.vin, removeModal.block);
            setRemoveModal(null);
          }}
          onClose={() => setRemoveModal(null)}
        />
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function AdminCalendar() {
  const api      = useApi();
  const navigate = useNavigate();

  const [vehicles,    setVehicles]    = useState([]);
  const [bookings,    setBookings]    = useState([]);
  const [blocksByVin, setBlocksByVin] = useState({}); // { vin: [block, ...] }
  const [loading,     setLoading]     = useState(true);
  const [viewMode,    setViewMode]    = useState('gantt'); // 'gantt' | 'month'
  const [selectedVins, setSelectedVins] = useState([]); // for month view filter

  // Gantt state
  const scrollRef = useRef(null);

  // Modal state
  const [blockModal,  setBlockModal]  = useState(null); // { vin, date }
  const [removeModal, setRemoveModal] = useState(null); // { block, vin, vName }
  const [icalModal,   setIcalModal]   = useState(false);

  // ── Gantt window: yesterday = day[0], today = day[1] ──────────────────────
  const ganttStart = useMemo(() => {
    const d = startOfDay(new Date());
    d.setDate(d.getDate() - 1); // yesterday
    return d;
  }, []);

  const ganttEnd = useMemo(() => {
    const d = new Date(ganttStart);
    d.setDate(d.getDate() + GANTT_DAYS - 1);
    return d;
  }, [ganttStart]);

  const days = useMemo(() => {
    const arr = [];
    for (let i = 0; i < GANTT_DAYS; i++) {
      const d = new Date(ganttStart);
      d.setDate(d.getDate() + i);
      arr.push(d);
    }
    return arr;
  }, [ganttStart]);

  // ── Fetch data ─────────────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get('/admin/vehicles'),
      api.get('/admin/bookings'),
    ])
      .then(async ([vRes, bRes]) => {
        const vList = vRes.data || [];
        setVehicles(vList);
        setBookings(bRes.data || []);
        setSelectedVins(vList.map(v => v.vin)); // all selected by default

        // Fetch blocks for each vehicle in parallel
        const blockResults = await Promise.allSettled(
          vList.map(v => api.get(`/admin/vehicles/${v.vin}/unavailability`))
        );
        const bMap = {};
        vList.forEach((v, i) => {
          const r = blockResults[i];
          bMap[v.vin] = r.status === 'fulfilled' ? (r.value.data || []) : [];
        });
        setBlocksByVin(bMap);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // ── Scroll today into 2nd column position on load ─────────────────────────
  useEffect(() => {
    if (!loading && scrollRef.current) {
      // day[0] = yesterday, day[1] = today → scroll so today is 2nd visible column
      // We want left edge of scroll = 0 (yesterday is already at left)
      scrollRef.current.scrollLeft = 0;
    }
  }, [loading]);

  // ── Derived maps ───────────────────────────────────────────────────────────
  const vehicleMap = useMemo(() => {
    const m = {};
    vehicles.forEach(v => { m[v.vin] = `${v.year} ${v.make} ${v.model}`.trim(); });
    return m;
  }, [vehicles]);

  const bookingsByVin = useMemo(() => {
    const m = {};
    bookings.forEach(b => {
      if (!b.vin) return;
      // Exclude cancelled bookings from the calendar view
      if (b.status === 'canceled') return;
      if (!m[b.vin]) m[b.vin] = [];
      m[b.vin].push(b);
    });
    return m;
  }, [bookings]);

  // ── Block CRUD ─────────────────────────────────────────────────────────────
  const handleBlockSave = useCallback(async (vin, data) => {
    try {
      const res = await api.post(`/admin/vehicles/${vin}/unavailability`, data);
      const newBlock = { ...data, vin, createdAt: res.data?.timestamp || new Date().toISOString(), type: 'manual_block' };
      setBlocksByVin(prev => ({ ...prev, [vin]: [...(prev[vin] || []), newBlock] }));
    } catch (e) {
      console.error('Failed to save block:', e);
      alert('Failed to save block: ' + (e.response?.data?.error || e.message));
    }
  }, [api]);

  const handleBlockRemove = useCallback(async (vin, block) => {
    // The timestamp is the createdAt value used as the SK
    const ts = block.createdAt;
    try {
      await api.delete(`/admin/vehicles/${vin}/unavailability/${encodeURIComponent(ts)}`);
      setBlocksByVin(prev => ({
        ...prev,
        [vin]: (prev[vin] || []).filter(b => b.createdAt !== ts),
      }));
    } catch (e) {
      console.error('Failed to remove block:', e);
      alert('Failed to remove block: ' + (e.response?.data?.error || e.message));
    }
  }, [api]);

  // ── Month view toggle ──────────────────────────────────────────────────────
  const toggleVin = useCallback((vin) => {
    setSelectedVins(prev =>
      prev.includes(vin) ? prev.filter(v => v !== vin) : [...prev, vin]
    );
  }, []);

  // ── Scroll helpers ─────────────────────────────────────────────────────────
  const scrollByDays = (n) => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: n * DAY_WIDTH_PX, behavior: 'smooth' });
    }
  };

  const scrollToToday = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ left: 0, behavior: 'smooth' });
    }
  };

  // ── API base for iCal ──────────────────────────────────────────────────────
  const apiBase = useMemo(() => {
    // Derive from the axios baseURL if available, else use window.location
    try {
      const base = api.defaults?.baseURL || '';
      return base.replace(/\/$/, '');
    } catch {
      return '';
    }
  }, [api]);

  const totalWidth = GANTT_DAYS * DAY_WIDTH_PX;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <AdminLayout>
      <div className="py-6 px-4">
        <div className="max-w-full mx-auto space-y-4">

          {/* ── Header ── */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Fleet Calendar</h1>
              {viewMode === 'gantt' && (
                <p className="text-sm text-gray-500 mt-0.5">
                  {fmtDay(ganttStart)} — {fmtDay(ganttEnd)}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* View toggle */}
              <div className="flex rounded-lg border border-gray-300 overflow-hidden">
                <button
                  onClick={() => setViewMode('gantt')}
                  className={`px-3 py-1.5 text-sm font-medium transition ${viewMode === 'gantt' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                >
                  📊 Timeline
                </button>
                <button
                  onClick={() => setViewMode('month')}
                  className={`px-3 py-1.5 text-sm font-medium transition border-l border-gray-300 ${viewMode === 'month' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                >
                  📅 Month
                </button>
              </div>

              {/* Gantt navigation (only in gantt mode) */}
              {viewMode === 'gantt' && (
                <>
                  <button onClick={() => scrollByDays(-30)}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white hover:bg-gray-50 text-gray-700 transition">
                    ← Month
                  </button>
                  <button onClick={() => scrollByDays(-7)}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white hover:bg-gray-50 text-gray-700 transition">
                    ← Week
                  </button>
                  <button onClick={scrollToToday}
                    className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium">
                    Today
                  </button>
                  <button onClick={() => scrollByDays(7)}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white hover:bg-gray-50 text-gray-700 transition">
                    Week →
                  </button>
                  <button onClick={() => scrollByDays(30)}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white hover:bg-gray-50 text-gray-700 transition">
                    Month →
                  </button>
                </>
              )}

              {/* iCal sync */}
              <button
                onClick={() => setIcalModal(true)}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white hover:bg-gray-50 text-gray-700 transition flex items-center gap-1.5"
              >
                📅 Sync Calendar
              </button>
            </div>
          </div>

          {/* ── Legend ── */}
          <div className="flex flex-wrap gap-3 text-xs">
            {[
              { label: 'Pending',     cls: 'bg-yellow-400' },
              { label: 'Confirmed',   cls: 'bg-blue-500' },
              { label: 'Active',      cls: 'bg-green-500' },
              { label: 'Completed',   cls: 'bg-gray-400' },
              { label: 'Canceled',    cls: 'bg-red-400' },
              { label: 'Turo',        cls: 'bg-orange-400' },
              { label: 'Unavailable', cls: 'bg-red-600' },
            ].map(({ label, cls }) => (
              <div key={label} className="flex items-center gap-1.5">
                <div className={`w-3 h-3 rounded-sm ${cls}`} />
                <span className="text-gray-600">{label}</span>
              </div>
            ))}
          </div>

          {/* ── Content ── */}
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : vehicles.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-12">No vehicles found.</p>
          ) : viewMode === 'month' ? (
            <MonthView
              vehicles={vehicles}
              bookings={bookingsByVin}
              blocksByVin={blocksByVin}
              selectedVins={selectedVins}
              onToggleVin={toggleVin}
              onBlockSave={handleBlockSave}
              onBlockRemove={handleBlockRemove}
              api={api}
            />
          ) : (
            /* ── Gantt View ── */
            /*
             * Layout strategy:
             *  - Outer div: flex row, full width
             *  - Left column: fixed-width sticky label column (no scroll)
             *  - Right column: single overflow-x-auto scroll container
             *    containing BOTH the header row and all vehicle rows
             *    so they all scroll together horizontally.
             */
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="flex">
                {/* ── Sticky left label column ── */}
                <div className="shrink-0 z-20" style={{ width: `${LABEL_WIDTH}px` }}>
                  {/* Header cell */}
                  <div
                    className="bg-gray-50 border-r border-b border-gray-200 flex items-center px-3 py-2"
                    style={{ height: '40px' }}
                  >
                    <span className="text-xs font-semibold text-gray-500 uppercase">Vehicle</span>
                  </div>
                  {/* Vehicle name cells */}
                  {vehicles.map((vehicle, vi) => {
                    const vName = vehicleMap[vehicle.vin] || vehicle.vin;
                    return (
                      <div
                        key={vehicle.vin}
                        className={`flex items-center gap-2 px-2 border-r border-b border-gray-200 ${vi % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`}
                        style={{ height: `${ROW_HEIGHT_PX}px` }}
                      >
                        {vehicle.imageUrl ? (
                          <img
                            src={vehicle.imageUrl}
                            alt={vName}
                            className="w-9 h-9 rounded-lg object-cover shrink-0 border border-gray-200"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 text-lg">
                            🚗
                          </div>
                        )}
                        <div className="min-w-0">
                          <span className="text-xs font-medium text-gray-800 truncate block leading-tight">{vName}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* ── Single scrollable area (header + all rows) ── */}
                <div
                  ref={scrollRef}
                  className="overflow-x-auto flex-1"
                  style={{ scrollbarWidth: 'thin' }}
                >
                  <div style={{ width: `${totalWidth}px` }}>
                    {/* Day header row */}
                    <div
                      className="flex border-b border-gray-200 bg-gray-50 sticky top-0 z-10"
                      style={{ height: '40px' }}
                    >
                      {days.map((d, i) => (
                        <div
                          key={i}
                          style={{ width: `${DAY_WIDTH_PX}px` }}
                          className={`shrink-0 text-center py-1 border-r border-gray-100 text-xs font-medium flex flex-col items-center justify-center
                            ${isToday(d) ? 'bg-blue-50 text-blue-700 font-bold' : isWeekend(d) ? 'text-gray-400 bg-gray-50' : 'text-gray-500'}
                          `}
                        >
                          {(d.getDate() === 1 || i === 0) ? (
                            <span className="block text-xs font-bold text-gray-700 leading-none">
                              {d.toLocaleDateString('en-US', { month: 'short' })}
                            </span>
                          ) : null}
                          <span className="leading-none">{d.getDate()}</span>
                        </div>
                      ))}
                    </div>

                    {/* Vehicle rows */}
                    {vehicles.map((vehicle, vi) => {
                      const vBookings = bookingsByVin[vehicle.vin] || [];
                      const vBlocks   = blocksByVin[vehicle.vin]   || [];
                      const vName     = vehicleMap[vehicle.vin] || vehicle.vin;

                      const allBars = [
                        ...vBookings.map(b => ({ ...b, _isBlock: false })),
                        ...vBlocks.map(blk => ({
                          ...blk,
                          _isBlock: true,
                          _onBlockClick: () => {
                            setRemoveModal({ block: blk, vin: vehicle.vin, vName });
                          },
                        })),
                      ];

                      return (
                        <div
                          key={vehicle.vin}
                          className={`relative flex border-b border-gray-100 ${vi % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`}
                          style={{ height: `${ROW_HEIGHT_PX}px`, width: `${totalWidth}px` }}
                        >
                          {/* Day column backgrounds (clickable to block) */}
                          {days.map((d, i) => (
                            <div
                              key={i}
                              style={{ width: `${DAY_WIDTH_PX}px` }}
                              className={`shrink-0 h-full border-r border-gray-100 cursor-pointer
                                ${isToday(d) ? 'bg-blue-50/60' : isWeekend(d) ? 'bg-gray-100/40' : ''}
                                hover:bg-blue-50/30
                              `}
                              onClick={() => setBlockModal({ vin: vehicle.vin, date: isoDate(d) })}
                            />
                          ))}

                          {/* Booking + block bars (absolutely positioned) */}
                          {allBars.map((b, bi) => {
                            const bar = computeBar(b.startTime, b.endTime, ganttStart, ganttEnd);
                            if (!bar) return null;
                            return (
                              <BookingBar
                                key={b.bookingId || b.turoReservationId || b.createdAt || `${vehicle.vin}-${bi}`}
                                booking={b}
                                bar={bar}
                                vehicleName={vName}
                                navigate={navigate}
                              />
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Footer ── */}
          {!loading && (
            <p className="text-xs text-gray-400 text-right">
              {vehicles.length} vehicle{vehicles.length !== 1 ? 's' : ''} · {bookings.length} booking{bookings.length !== 1 ? 's' : ''} total
              {viewMode === 'gantt' && (
                <span className="ml-2 text-gray-300">· Click any day cell to block dates</span>
              )}
            </p>
          )}
        </div>
      </div>

      {/* ── Block modal (Gantt) ── */}
      {blockModal && (() => {
        const vehicle = vehicles.find(v => v.vin === blockModal.vin);
        const vName = vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}`.trim() : blockModal.vin;
        return (
          <BlockModal
            vin={blockModal.vin}
            vehicleName={vName}
            defaultStart={blockModal.date}
            onSave={async (data) => {
              await handleBlockSave(blockModal.vin, data);
              setBlockModal(null);
            }}
            onClose={() => setBlockModal(null)}
          />
        );
      })()}

      {/* ── Remove block modal ── */}
      {removeModal && (
        <RemoveBlockModal
          block={removeModal.block}
          vehicleName={removeModal.vName}
          onConfirm={async () => {
            await handleBlockRemove(removeModal.vin, removeModal.block);
            setRemoveModal(null);
          }}
          onClose={() => setRemoveModal(null)}
        />
      )}

      {/* ── iCal modal ── */}
      {icalModal && (
        <ICalModal
          apiBase={apiBase}
          onClose={() => setIcalModal(false)}
        />
      )}
    </AdminLayout>
  );
}
