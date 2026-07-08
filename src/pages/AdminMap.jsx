/**
 * AdminMap.jsx — Live Tesla GPS + trip history polylines using Leaflet.js.
 * Route: /admin/map
 *
 * Features:
 *  - Map always at top (mobile-first layout)
 *  - Vehicle cards as horizontal scroll row below map on mobile, sidebar on desktop
 *  - Single-click vehicle card → load trip list
 *  - Double-click vehicle card → pan map to that vehicle's location
 *  - Car photo circle markers with colored ring (green=live/moving, blue=parked)
 *  - Trip list below map; click Show → polyline + start/end pins
 *  - Dead-reckoning: smooth position interpolation between 10-second telemetry polls
 */
import { useState, useEffect, useCallback, useRef, Component } from 'react';
import { useApi } from '../context/AuthContext';
import AdminLayout from '../components/AdminNav';
import {
  MapContainer, TileLayer, Marker, Popup, Polyline, useMap,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// ── Leaflet default icon fix ───────────────────────────────────────────────
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Speed below which a vehicle is considered stationary (matches backend threshold).
// Filters out GPS jitter that makes parked cars appear to be moving slowly.
const MOVING_SPEED_THRESHOLD_MPH = 5;

// ── Car photo circle marker ────────────────────────────────────────────────
function makeCarIcon(imageUrl, borderColor = '#2563eb') {
  const size = 44;
  const border = 3;
  if (imageUrl) {
    return L.divIcon({
      className: '',
      html: `<div style="
        width:${size}px;height:${size}px;border-radius:50%;
        border:${border}px solid ${borderColor};
        background-image:url('${imageUrl}');
        background-size:cover;background-position:center;
        box-shadow:0 2px 6px rgba(0,0,0,.45);
        overflow:hidden;"></div>`,
      iconSize:    [size, size],
      iconAnchor:  [size / 2, size / 2],
      popupAnchor: [0, -(size / 2 + 4)],
    });
  }
  const label = borderColor === '#16a34a' ? '▶' : 'P';
  return L.divIcon({
    className: '',
    html: `<div style="
      background:${borderColor};border:2px solid #fff;border-radius:50%;
      width:${size}px;height:${size}px;display:flex;align-items:center;
      justify-content:center;font-size:14px;color:#fff;font-weight:700;
      box-shadow:0 2px 6px rgba(0,0,0,.4);">${label}</div>`,
    iconSize:    [size, size],
    iconAnchor:  [size / 2, size / 2],
    popupAnchor: [0, -(size / 2 + 4)],
  });
}

// Trip start / end pins
function makeCircleIcon(color, label = '') {
  return L.divIcon({
    className: '',
    html: `<div style="
      background:${color};border:2px solid #fff;border-radius:50%;
      width:22px;height:22px;display:flex;align-items:center;
      justify-content:center;font-size:11px;color:#fff;font-weight:700;
      box-shadow:0 1px 4px rgba(0,0,0,.4);">${label}</div>`,
    iconSize:   [22, 22],
    iconAnchor: [11, 11],
    popupAnchor:[0, -12],
  });
}

const START_ICON = makeCircleIcon('#16a34a', 'S');
const END_ICON   = makeCircleIcon('#dc2626', 'E');

// ── Fly-to helper ──────────────────────────────────────────────────────────
function FlyTo({ position, zoom = 13 }) {
  const map = useMap();
  useEffect(() => {
    if (position) map.flyTo(position, zoom, { duration: 1 });
  }, [position, zoom, map]);
  return null;
}

// ── Error Boundary ─────────────────────────────────────────────────────────
class MapErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-white rounded-xl border border-red-200 h-96 flex items-center justify-center">
          <div className="text-center text-red-500 px-4">
            <p className="text-lg mb-2">⚠️</p>
            <p className="text-sm font-medium">Map failed to render</p>
            <p className="text-xs text-gray-400 mt-1">{String(this.state.error)}</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

// "Live" = has GPS coords AND telemetry timestamp is within the last 5 minutes
// AND speed is above the noise threshold (or we have a very recent timestamp).
const LIVE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

function isRecentTimestamp(ts) {
  if (!ts) return false;
  try {
    return (Date.now() - new Date(ts).getTime()) < LIVE_THRESHOLD_MS;
  } catch {
    return false;
  }
}

/**
 * Determine if a vehicle is genuinely moving (not GPS noise).
 * Requires: recent telemetry AND speed > MOVING_SPEED_THRESHOLD_MPH.
 */
function isVehicleMoving(tel) {
  if (!tel) return false;
  if (!isRecentTimestamp(tel.timestamp)) return false;
  const speed = tel.speedMph != null ? Number(tel.speedMph) : 0;
  return speed > MOVING_SPEED_THRESHOLD_MPH;
}

/**
 * Dead-reckoning: extrapolate a new [lat, lon] from a known position,
 * heading (degrees, 0=North clockwise), speed (mph), and elapsed time (ms).
 *
 * Uses flat-earth approximation — accurate enough for <30 second intervals.
 * At 43°N latitude: 1° lat ≈ 69.0 mi, 1° lon ≈ 50.5 mi.
 */
function extrapolatePosition(lat, lon, headingDeg, speedMph, elapsedMs) {
  if (!lat || !lon || !speedMph || speedMph <= MOVING_SPEED_THRESHOLD_MPH) {
    return [lat, lon];
  }
  const elapsedHours = elapsedMs / 3600000;
  const distanceMiles = speedMph * elapsedHours;
  const headingRad = (headingDeg * Math.PI) / 180;
  const LAT_MILES = 69.0;
  const LON_MILES = 50.5; // approximate at ~43°N
  const dLat = (distanceMiles * Math.cos(headingRad)) / LAT_MILES;
  const dLon = (distanceMiles * Math.sin(headingRad)) / LON_MILES;
  return [lat + dLat, lon + dLon];
}

// ── Vehicle Card ───────────────────────────────────────────────────────────
function VehicleCard({ v, telemetry, displayPositions, selectedVin, onSingleClick, onDoubleClick }) {
  const tel      = telemetry[v.vin];
  // "Live" = recent telemetry AND speed > threshold (not GPS noise)
  const moving   = isVehicleMoving(tel);
  // "Parked" = has a known position but not moving
  const hasLat   = tel?.latitude || tel?.lastKnownLatitude;
  const hasLon   = tel?.longitude || tel?.lastKnownLongitude;
  const isParked = !moving && hasLat && hasLon;
  const hasPos   = moving || isParked;

  const speed = tel?.speedMph != null ? Number(tel.speedMph) : 0;

  return (
    <button
      onClick={() => onSingleClick(v.vin)}
      onDoubleClick={() => onDoubleClick(v.vin)}
      title={hasPos ? 'Single-click: load trips · Double-click: pan to vehicle' : 'Single-click: load trips'}
      className={`flex-shrink-0 text-left bg-white rounded-xl border p-3 transition select-none
        ${selectedVin === v.vin ? 'border-blue-500 shadow-sm' : 'border-gray-200 hover:border-blue-300'}
        lg:w-full w-48`}
    >
      {v.imageUrl && (
        <div className="w-full h-20 rounded-lg overflow-hidden mb-2 bg-gray-100">
          <img src={v.imageUrl} alt={`${v.year} ${v.model}`}
            className="w-full h-full object-cover" />
        </div>
      )}
      <p className="font-medium text-gray-800 text-sm leading-tight">{v.year} {v.make} {v.model}</p>
      <p className="text-xs text-gray-400 truncate">{v.vin}</p>
      {tel ? (
        <div className="mt-1.5 space-y-0.5 text-xs text-gray-500">
          {(() => {
            const liveBatt = tel.batteryLevel != null;
            const batt     = liveBatt ? tel.batteryLevel      : tel.lastKnownBatteryLevel;
            const range    = liveBatt ? tel.batteryRange      : tel.lastKnownBatteryRange;
            const battTs   = !liveBatt && tel.lastKnownBatteryTimestamp;
            if (batt == null) return null;
            return (
              <p>
                🔋 {Number(batt).toFixed(0)}%{range ? ` · ${Number(range).toFixed(0)} mi` : ''}
                {battTs && <span className="text-gray-300 ml-1">(as of {new Date(battTs).toLocaleTimeString()})</span>}
              </p>
            );
          })()}
          <p>
            {moving   ? '🟢 Live' : ''}
            {isParked ? '🔵 Parked' : ''}
            {!moving && !isParked ? '⚫ No GPS' : ''}
            {hasPos && ' · dbl-click to pan'}
          </p>
          {/* Only show speed if above noise threshold */}
          {speed > MOVING_SPEED_THRESHOLD_MPH && <p>🚗 {speed.toFixed(0)} mph</p>}
        </div>
      ) : (
        <p className="mt-1 text-xs text-gray-400 italic">No telemetry</p>
      )}
    </button>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function AdminMap() {
  const api = useApi();

  const [vehicles, setVehicles]               = useState([]);
  const [telemetry, setTelemetry]             = useState({});
  // displayPositions: interpolated positions for smooth map animation
  // { [vin]: { lat, lon, lastRealTs } }
  const [displayPositions, setDisplayPositions] = useState({});
  const [selectedVin, setSelectedVin]         = useState(null);
  const [trips, setTrips]                     = useState([]);
  const [tripsLoading, setTripsLoading]       = useState(false);
  const [activeTrip, setActiveTrip]           = useState(null);
  const [tripLoading, setTripLoading]         = useState(false);
  const [flyTo, setFlyTo]                     = useState(null);
  const [loading, setLoading]                 = useState(true);
  const [err, setErr]                         = useState('');
  const [lastUpdated, setLastUpdated]         = useState(null);

  const vehiclesRef  = useRef([]);
  const telemetryRef = useRef({});
  useEffect(() => { vehiclesRef.current  = vehicles;  }, [vehicles]);
  useEffect(() => { telemetryRef.current = telemetry; }, [telemetry]);

  const fetchLatestTelemetry = useCallback((vin) =>
    api.get(`/admin/vehicles/${vin}/telemetry-latest`)
      .then(r => ({ vin, data: r.data || null }))
      .catch(() => ({ vin, data: null })),
  [api]);

  // Poll all vehicles and merge results into telemetry state
  const refreshTelemetry = useCallback(() => {
    const vins = vehiclesRef.current;
    if (vins.length === 0) return;
    Promise.all(vins.map(v => fetchLatestTelemetry(v.vin)))
      .then(results => {
        setTelemetry(prev => {
          const updated = { ...prev };
          results.forEach(r => { if (r.data) updated[r.vin] = r.data; });
          return updated;
        });
        // Snap display positions to real GPS on each poll
        setDisplayPositions(prev => {
          const next = { ...prev };
          results.forEach(r => {
            if (!r.data) return;
            const lat = r.data.latitude  ? Number(r.data.latitude)  : null;
            const lon = r.data.longitude ? Number(r.data.longitude) : null;
            if (lat && lon) {
              next[r.vin] = { lat, lon, lastRealTs: Date.now() };
            }
          });
          return next;
        });
        setLastUpdated(new Date());
      })
      .catch(() => {});
  }, [fetchLatestTelemetry]);

  useEffect(() => {
    // Initial load
    api.get('/admin/vehicles')
      .then(r => {
        const teslaVehicles = (r.data || []).filter(v => v.teslaEnabled);
        setVehicles(teslaVehicles);
        vehiclesRef.current = teslaVehicles;
        return Promise.all(teslaVehicles.map(v => fetchLatestTelemetry(v.vin)));
      })
      .then(results => {
        const map = {};
        const positions = {};
        results.forEach(r => {
          if (r.data) {
            map[r.vin] = r.data;
            const lat = r.data.latitude  ? Number(r.data.latitude)  : null;
            const lon = r.data.longitude ? Number(r.data.longitude) : null;
            if (lat && lon) positions[r.vin] = { lat, lon, lastRealTs: Date.now() };
          }
        });
        setTelemetry(map);
        setDisplayPositions(positions);
        setLastUpdated(new Date());
      })
      .catch(e => setErr(`Failed to load vehicles: ${e.response?.status} — ${e.response?.data?.error || e.message}`))
      .finally(() => setLoading(false));

    // Poll every 10 s for updated positions
    const pollInterval = setInterval(refreshTelemetry, 10000);
    return () => clearInterval(pollInterval);
  }, [api, fetchLatestTelemetry, refreshTelemetry]);

  // ── Dead-reckoning animation ─────────────────────────────────────────────
  // Every 100ms, advance each moving vehicle's display position based on
  // its last known heading and speed. When real telemetry arrives (above),
  // displayPositions snaps back to the true GPS coordinates.
  useEffect(() => {
    const animInterval = setInterval(() => {
      const tel = telemetryRef.current;
      setDisplayPositions(prev => {
        const next = { ...prev };
        let changed = false;
        Object.keys(prev).forEach(vin => {
          const t = tel[vin];
          if (!t) return;
          const speed   = t.speedMph   != null ? Number(t.speedMph)   : 0;
          const heading = t.heading    != null ? Number(t.heading)    : 0;
          if (speed <= MOVING_SPEED_THRESHOLD_MPH) return; // parked — don't extrapolate
          if (!isRecentTimestamp(t.timestamp)) return;     // stale data — don't extrapolate

          const pos = prev[vin];
          if (!pos) return;
          const elapsed = Date.now() - (pos.lastRealTs || Date.now());
          // Cap extrapolation at 15 seconds to avoid drifting too far from truth
          if (elapsed > 15000) return;

          const [newLat, newLon] = extrapolatePosition(pos.lat, pos.lon, heading, speed, 100);
          next[vin] = { ...pos, lat: newLat, lon: newLon };
          changed = true;
        });
        return changed ? next : prev;
      });
    }, 100);
    return () => clearInterval(animInterval);
  }, []); // stable — reads telemetryRef directly

  const loadTrips = (vin) => {
    setSelectedVin(vin);
    setTrips([]);
    setActiveTrip(null);
    setTripsLoading(true);
    const from = new Date(Date.now() - 7 * 86400000).toISOString();
    const to   = new Date().toISOString();
    api.get(`/admin/vehicles/${vin}/trips?from=${from}&to=${to}`)
      .then(r => setTrips(r.data || []))
      .catch(() => setTrips([]))
      .finally(() => setTripsLoading(false));
  };

  const panToVehicle = (vin) => {
    const pos = displayPositions[vin];
    if (pos) setFlyTo([pos.lat, pos.lon]);
  };

  const loadTripDetail = (vin, trip) => {
    if (activeTrip?.startTime === trip.startTime) {
      setActiveTrip(null);
      return;
    }
    if (trip.waypoints && trip.waypoints.length > 0) {
      setActiveTrip(trip);
      _flyToTrip(trip);
      return;
    }
    setTripLoading(true);
    api.get(`/admin/vehicles/${vin}/trips/${encodeURIComponent(trip.startTime)}`)
      .then(r => { const d = r.data || trip; setActiveTrip(d); _flyToTrip(d); })
      .catch(() => { setActiveTrip(trip); _flyToTrip(trip); })
      .finally(() => setTripLoading(false));
  };

  const _flyToTrip = (trip) => {
    const lat = Number(trip.startLatitude);
    const lon = Number(trip.startLongitude);
    if (lat && lon) setFlyTo([lat, lon]);
  };

  const center = [43.0389, -87.9065];

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
    </div>
  );

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Live Map</h1>
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-xs text-gray-400">
                Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={refreshTelemetry}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs text-gray-600 hover:bg-gray-50 shadow-sm"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>
        </div>

        {err && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 font-mono">{err}</div>
        )}

        <div className="flex flex-col lg:flex-row gap-4">

          {/* Desktop sidebar */}
          <div className="hidden lg:flex lg:flex-col lg:w-56 xl:w-64 gap-3 flex-shrink-0">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tesla Vehicles</h2>
            {vehicles.length === 0 && <p className="text-gray-400 text-sm">No Tesla vehicles found.</p>}
            {vehicles.map(v => (
              <VehicleCard key={v.vin} v={v}
                telemetry={telemetry} displayPositions={displayPositions}
                selectedVin={selectedVin}
                onSingleClick={loadTrips} onDoubleClick={panToVehicle} />
            ))}
          </div>

          {/* Map + mobile cards + trips */}
          <div className="flex-1 space-y-4 min-w-0">

            <MapErrorBoundary>
              <div
                className="bg-white rounded-xl border border-gray-200 overflow-hidden"
                style={{ height: '480px', isolation: 'isolate' }}
              >
                <MapContainer center={center} zoom={11} style={{ height: '100%', width: '100%' }}>
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  {flyTo && <FlyTo position={flyTo} zoom={13} />}

                  {/* Vehicle markers — use dead-reckoned displayPositions for smooth motion */}
                  {vehicles.map(v => {
                    const tel = telemetry[v.vin];
                    if (!tel) return null;

                    const dp      = displayPositions[v.vin];
                    const moving  = isVehicleMoving(tel);
                    const speed   = tel.speedMph != null ? Number(tel.speedMph) : 0;

                    // Use interpolated position for moving vehicles, raw for parked
                    const dispLat = dp ? dp.lat : null;
                    const dispLon = dp ? dp.lon : null;

                    // Fallback to lastKnown if no live position
                    const pkLat = tel.lastKnownLatitude  ? Number(tel.lastKnownLatitude)  : null;
                    const pkLon = tel.lastKnownLongitude ? Number(tel.lastKnownLongitude) : null;

                    const imgUrl = v.imageUrl || null;

                    if (moving && dispLat && dispLon) {
                      return (
                        <Marker key={v.vin} position={[dispLat, dispLon]}
                          icon={makeCarIcon(imgUrl, '#16a34a')}>
                          <Popup>
                            <strong>{v.year} {v.make} {v.model}</strong><br />
                            {tel.batteryLevel != null && <>🔋 {Number(tel.batteryLevel).toFixed(0)}%{tel.batteryRange ? ` · ${Number(tel.batteryRange).toFixed(0)} mi` : ''}<br /></>}
                            {speed > MOVING_SPEED_THRESHOLD_MPH ? `🚗 ${speed.toFixed(0)} mph` : '🅿 Parked'}<br />
                            {tel.locked != null ? (tel.locked ? '🔒 Locked' : '🔓 Unlocked') : ''}
                          </Popup>
                        </Marker>
                      );
                    }

                    // Parked: use last known position (live or lastKnown fallback)
                    const parkedLat = dispLat || pkLat;
                    const parkedLon = dispLon || pkLon;

                    if (parkedLat && parkedLon) {
                      return (
                        <Marker key={v.vin} position={[parkedLat, parkedLon]}
                          icon={makeCarIcon(imgUrl, '#2563eb')}>
                          <Popup>
                            <strong>{v.year} {v.make} {v.model}</strong><br />
                            🅿 Parked<br />
                            {tel.timestamp && <>🕐 {new Date(tel.timestamp).toLocaleString()}<br /></>}
                            {tel.batteryLevel != null && <>🔋 {Number(tel.batteryLevel).toFixed(0)}%</>}
                          </Popup>
                        </Marker>
                      );
                    }

                    return null;
                  })}

                  {/* Active trip polyline + pins */}
                  {activeTrip && (() => {
                    const waypoints = (activeTrip.waypoints || [])
                      .filter(w => w.lat != null && w.lon != null)
                      .map(w => [Number(w.lat), Number(w.lon)]);
                    const startLat = activeTrip.startLatitude  ? Number(activeTrip.startLatitude)  : null;
                    const startLon = activeTrip.startLongitude ? Number(activeTrip.startLongitude) : null;
                    const endLat   = activeTrip.endLatitude    ? Number(activeTrip.endLatitude)    : null;
                    const endLon   = activeTrip.endLongitude   ? Number(activeTrip.endLongitude)   : null;
                    return (
                      <>
                        {waypoints.length >= 2 && (
                          <Polyline positions={waypoints} color="#2563eb" weight={4} opacity={0.8}>
                            <Popup>
                              {Number(activeTrip.distanceMiles).toFixed(1)} mi · Max {Number(activeTrip.maxSpeedMph).toFixed(0)} mph<br />
                              {new Date(activeTrip.startTime).toLocaleString()}
                            </Popup>
                          </Polyline>
                        )}
                        {startLat && startLon && (
                          <Marker position={[startLat, startLon]} icon={START_ICON}>
                            <Popup>
                              <strong>Trip Start</strong><br />
                              {new Date(activeTrip.startTime).toLocaleString()}<br />
                              🔋 {activeTrip.startBatteryPct != null ? `${Number(activeTrip.startBatteryPct).toFixed(0)}%` : '—'}
                            </Popup>
                          </Marker>
                        )}
                        {endLat && endLon && (
                          <Marker position={[endLat, endLon]} icon={END_ICON}>
                            <Popup>
                              <strong>Trip End</strong><br />
                              {new Date(activeTrip.endTime).toLocaleString()}<br />
                              🔋 {activeTrip.endBatteryPct != null ? `${Number(activeTrip.endBatteryPct).toFixed(0)}%` : '—'}
                            </Popup>
                          </Marker>
                        )}
                      </>
                    );
                  })()}
                </MapContainer>
              </div>
            </MapErrorBoundary>

            {/* Map legend */}
            <div className="flex flex-wrap gap-4 text-xs text-gray-500 px-1">
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full border-2 border-green-600 bg-gray-200" /> Live / Moving (&gt;{MOVING_SPEED_THRESHOLD_MPH} mph)</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full border-2 border-blue-600 bg-gray-200" /> Parked (last known)</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-green-600" /> Trip Start</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-red-600" /> Trip End</span>
              <span className="flex items-center gap-1"><span className="inline-block w-8 h-1 bg-blue-600 rounded" /> Route</span>
            </div>

            {/* Mobile vehicle cards */}
            <div className="lg:hidden">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Tesla Vehicles</h2>
              {vehicles.length === 0
                ? <p className="text-gray-400 text-sm">No Tesla vehicles found.</p>
                : (
                  <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
                    {vehicles.map(v => (
                      <VehicleCard key={v.vin} v={v}
                        telemetry={telemetry} displayPositions={displayPositions}
                        selectedVin={selectedVin}
                        onSingleClick={loadTrips} onDoubleClick={panToVehicle} />
                    ))}
                  </div>
                )
              }
            </div>

            {/* Trip list */}
            {selectedVin && (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-700">
                    Recent Trips — {selectedVin} (last 7 days)
                  </h3>
                  {tripLoading && (
                    <span className="text-xs text-blue-500 flex items-center gap-1">
                      <span className="animate-spin inline-block w-3 h-3 border border-blue-500 border-t-transparent rounded-full" />
                      Loading route…
                    </span>
                  )}
                </div>

                {tripsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
                    <span className="ml-3 text-sm text-gray-500">Loading trips…</span>
                  </div>
                ) : trips.length === 0 ? (
                  <div className="px-4 py-6 text-center text-sm text-gray-400">
                    No trips recorded in the last 7 days for this vehicle.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          {['Start', 'End', 'Distance', 'Max Speed', 'Battery Used', 'Route'].map(h => (
                            <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {trips.map((t, i) => {
                          const isActive  = activeTrip?.startTime === t.startTime;
                          const hasCoords = t.startLatitude && t.startLongitude;
                          return (
                            <tr key={i} className={`transition ${isActive ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                              <td className="px-4 py-2 whitespace-nowrap">{new Date(t.startTime).toLocaleString()}</td>
                              <td className="px-4 py-2 whitespace-nowrap">{new Date(t.endTime).toLocaleString()}</td>
                              <td className="px-4 py-2">{Number(t.distanceMiles).toFixed(1)} mi</td>
                              <td className="px-4 py-2">{Number(t.maxSpeedMph).toFixed(0)} mph</td>
                              <td className="px-4 py-2">
                                {(t.startBatteryPct != null && t.endBatteryPct != null)
                                  ? `${(Number(t.startBatteryPct) - Number(t.endBatteryPct)).toFixed(0)}%`
                                  : '—'}
                              </td>
                              <td className="px-4 py-2">
                                {hasCoords ? (
                                  <button
                                    onClick={() => loadTripDetail(selectedVin, t)}
                                    className={`text-xs px-2 py-1 rounded transition ${
                                      isActive ? 'bg-blue-600 text-white' : 'bg-gray-100 text-blue-600 hover:bg-blue-50'
                                    }`}
                                  >
                                    {isActive ? 'Hide' : 'Show'}
                                  </button>
                                ) : (
                                  <span className="text-xs text-gray-300">No GPS</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
