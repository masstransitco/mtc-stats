'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Script from 'next/script';

type CarparkPoint = {
  park_id: string;
  park_name: string;
  district: string | null;
  carpark_type: string | null;
  lat: number;
  lon: number;
  hour: number;
  avg_vacancy: number;
  stddev_vacancy: number;
  min_vacancy: number;
  max_vacancy: number;
  sample_count: number;
  overall_max_vacancy: number;
  avg_hourly_stddev: number;
  occupancy_rate: number;
};

type DwellPoint = {
  vin: string;
  district: string | null;
  lat: number;
  lon: number;
  start_ts: string;
  end_ts: string;
  duration_sec: number;
};

type MovementPoint = {
  vin: string;
  ts: string;
  lat: number;
  lon: number;
  speed: number | null;
};

type MeteredCarparkPoint = {
  carpark_id: string;
  carpark_name: string;
  district: string | null;
  lat: number;
  lon: number;
  hour: number;
  avg_vacancy_rate: number;
  stddev_vacancy_rate: number;
  min_vacancy_rate: number;
  max_vacancy_rate: number;
  sample_count: number;
  overall_max_vacancy_rate: number;
  avg_hourly_stddev: number;
  occupancy_rate: number;
};

function normalize(points: { weight: number }[]) {
  const max = Math.max(...points.map((p) => p.weight), 1);
  return points.map((p) => ({ ...p, weight: p.weight / max }));
}

export default function HeatmapClient({
  carparkPoints,
  meteredPoints,
  dwellPoints,
  movementPoints
}: {
  carparkPoints: CarparkPoint[];
  meteredPoints: MeteredCarparkPoint[];
  dwellPoints: DwellPoint[];
  movementPoints: MovementPoint[];
}) {
  const mapRef = useRef<google.maps.Map>();
  const heatRef = useRef<google.maps.visualization.HeatmapLayer>();
  const dwellMarkerRef = useRef<google.maps.Marker>();
  const movementMarkersRef = useRef<Map<string, google.maps.Marker>>(new Map());
  const movementPolylinesRef = useRef<Map<string, google.maps.Polyline>>(new Map());
  const markerAnimationRef = useRef<Map<string, { from: google.maps.LatLng; to: google.maps.LatLng; startTime: number; duration: number }>>(new Map());
  const animationFrameRef = useRef<number>();
  const [mode, setMode] = useState<'carparks' | 'metered' | 'movements'>('carparks');
  const [carparkMetric, setCarparkMetric] = useState<'volatility' | 'occupancy'>('volatility');
  const [progressHour, setProgressHour] = useState<number>(24); // 0 = 24h ago, 24 = now
  const [isPlaying, setIsPlaying] = useState(false);
  const [ready, setReady] = useState(false);

  // Timeline bounds
  const startWindow = useMemo(() => Date.now() - 24 * 3600 * 1000, []);

  // Precompute carpark hourly points by park_id
  const carparksByParkId = useMemo(() => {
    const map = new Map<string, CarparkPoint[]>();
    for (const p of carparkPoints) {
      if (!p.lat || !p.lon) continue;
      const arr = map.get(p.park_id) ?? [];
      arr.push(p);
      map.set(p.park_id, arr);
    }
    // Sort each carpark's hourly data by hour
    map.forEach((arr) => {
      arr.sort((a, b) => a.hour - b.hour);
    });
    return map;
  }, [carparkPoints]);

  // Precompute metered carpark hourly points by carpark_id
  const meteredByCarparkId = useMemo(() => {
    const map = new Map<string, MeteredCarparkPoint[]>();
    for (const p of meteredPoints) {
      if (!p.lat || !p.lon) continue;
      const arr = map.get(p.carpark_id) ?? [];
      arr.push(p);
      map.set(p.carpark_id, arr);
    }
    // Sort each carpark's hourly data by hour
    map.forEach((arr) => {
      arr.sort((a, b) => a.hour - b.hour);
    });
    return map;
  }, [meteredPoints]);

  // Filter dwell points by hour-of-day HK (used only to thin list; visuals now rely on movements)
  const filteredDwells = useMemo(() => {
    const hour = Math.floor(progressHour % 24);
    const offset = 8; // HK time
    return dwellPoints.filter((p) => {
      const start = new Date(p.start_ts);
      const end = new Date(p.end_ts);
      const hs = (start.getUTCHours() + offset) % 24;
      const he = (end.getUTCHours() + offset) % 24;
      if (hs <= he) return hour >= hs && hour <= he;
      return hour >= hs || hour <= he; // wrap around midnight
    });
  }, [dwellPoints, progressHour]);

  // Precompute movement points by VIN
  const movementsByVin = useMemo(() => {
    const map = new Map<string, MovementPoint[]>();
    for (const p of movementPoints) {
      if (!p.lat || !p.lon) continue;
      const arr = map.get(p.vin) ?? [];
      arr.push(p);
      map.set(p.vin, arr);
    }
    map.forEach((arr, vin) => {
      arr.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
    });
    return map;
  }, [movementPoints]);

  // Interpolated positions at current progress time
  const activeMovements = useMemo(() => {
    if (mode !== 'movements') return [];
    const targetMs = startWindow + (progressHour / 24) * 24 * 3600 * 1000;
    const result: MovementPoint[] = [];

    movementsByVin.forEach((points, vin) => {
      if (points.length === 0) return;

      // Find the two points that bracket the target time
      let prev = points[0];
      let next = points[points.length - 1];

      // Binary search would be more efficient, but linear is fine for now
      for (let i = 0; i < points.length - 1; i++) {
        const currTime = new Date(points[i].ts).getTime();
        const nextTime = new Date(points[i + 1].ts).getTime();

        if (currTime <= targetMs && targetMs <= nextTime) {
          prev = points[i];
          next = points[i + 1];
          break;
        } else if (currTime > targetMs) {
          // Target is before this point, use first point
          prev = points[0];
          next = points[0];
          break;
        }
      }

      const tPrev = new Date(prev.ts).getTime();
      const tNext = new Date(next.ts).getTime();
      let lat = prev.lat;
      let lon = prev.lon;
      let speed = prev.speed;

      // Interpolate if we're between two different points
      if (tNext > tPrev && targetMs >= tPrev && targetMs <= tNext) {
        const ratio = (targetMs - tPrev) / (tNext - tPrev);
        lat = prev.lat + (next.lat - prev.lat) * ratio;
        lon = prev.lon + (next.lon - prev.lon) * ratio;
      }

      result.push({ vin, ts: new Date(targetMs).toISOString(), lat, lon, speed });
    });

    return result;
  }, [mode, progressHour, movementsByVin, startWindow]);

  // Build heatmap payloads with time-based filtering
  const carparkPayload = useMemo(() => {
    const currentHour = Math.floor(progressHour); // 0-24
    const pts: { lat: number; lng: number; weight: number; meta: CarparkPoint }[] = [];

    carparksByParkId.forEach((hourlyPoints, parkId) => {
      // Filter points up to current hour
      const relevantHours = hourlyPoints.filter((p) => p.hour <= currentHour);
      if (relevantHours.length === 0) return;

      // Use the latest available hour's data for this carpark
      const latestPoint = relevantHours[relevantHours.length - 1];

      // Calculate weight based on selected metric
      let weight = 0;
      if (carparkMetric === 'volatility') {
        // Use standard deviation as volatility measure
        weight = latestPoint.stddev_vacancy || 0;
      } else {
        // Use occupancy rate (0-1, where 1 = fully occupied)
        weight = latestPoint.occupancy_rate || 0;
      }

      pts.push({
        lat: latestPoint.lat,
        lng: latestPoint.lon,
        weight,
        meta: latestPoint
      });
    });

    return normalize(pts);
  }, [carparksByParkId, progressHour, carparkMetric]);

  const meteredPayload = useMemo(() => {
    const currentHour = Math.floor(progressHour); // 0-24
    const pts: { lat: number; lng: number; weight: number; meta: MeteredCarparkPoint }[] = [];

    meteredByCarparkId.forEach((hourlyPoints, carparkId) => {
      // Filter points up to current hour
      const relevantHours = hourlyPoints.filter((p) => p.hour <= currentHour);
      if (relevantHours.length === 0) return;

      // Use the latest available hour's data for this carpark
      const latestPoint = relevantHours[relevantHours.length - 1];

      // Calculate weight based on selected metric
      let weight = 0;
      if (carparkMetric === 'volatility') {
        // Use standard deviation of vacancy rate as volatility measure
        weight = latestPoint.stddev_vacancy_rate || 0;
      } else {
        // Use occupancy rate (0-1, where 1 = fully occupied)
        weight = latestPoint.occupancy_rate || 0;
      }

      pts.push({
        lat: latestPoint.lat,
        lng: latestPoint.lon,
        weight,
        meta: latestPoint
      });
    });

    return normalize(pts);
  }, [meteredByCarparkId, progressHour, carparkMetric]);

  const dwellPayload = useMemo(() => {
    const pts = filteredDwells
      .filter((p) => p.lat && p.lon)
      .map((p) => ({
        lat: p.lat,
        lng: p.lon,
        weight: p.duration_sec / 60, // minutes
        meta: p
      }));
    return normalize(pts);
  }, [filteredDwells]);

  // Animate hour playback
  useEffect(() => {
    if (!isPlaying) return;
    const id = setInterval(
      () => setProgressHour((h) => (h + 0.25 > 24 ? 0 : h + 0.25)), // 15m per tick
      400
    );
    return () => clearInterval(id);
  }, [isPlaying]);

  // Initialize map + heat layer once Google scripts are ready
  useEffect(() => {
    if (!ready || typeof window === 'undefined' || !(window as any).google) return;
    if (!mapRef.current) {
      const center = { lat: 22.32, lng: 114.17 };
      mapRef.current = new google.maps.Map(document.getElementById('heatmap') as HTMLElement, {
        center,
        zoom: 12,
        tilt: 67.5,
        heading: 30,
        mapId: process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID,
        disableDefaultUI: true
      });
      heatRef.current = new google.maps.visualization.HeatmapLayer({
        dissipating: true,
        radius: 28
      });
      heatRef.current.setMap(mapRef.current);

      dwellMarkerRef.current = new google.maps.Marker({
        map: mapRef.current,
        visible: false,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: '#0ea5e9',
          fillOpacity: 0.9,
          strokeColor: '#0f172a',
          strokeWeight: 2
        }
      });
    }
  }, [ready]);

  // Build polylines for movement mode - create them once
  useEffect(() => {
    if (!ready || !mapRef.current) return;

    if (mode === 'movements') {
      const colors = ['#0ea5e9', '#a855f7', '#f97316', '#22c55e', '#ef4444'];
      const seen = new Set<string>();
      movementsByVin.forEach((points, vin) => {
        if (!points.length) return;
        seen.add(vin);
        let poly = movementPolylinesRef.current.get(vin);
        if (!poly) {
          const color = colors[movementPolylinesRef.current.size % colors.length];
          poly = new google.maps.Polyline({
            map: mapRef.current,
            strokeColor: color,
            strokeOpacity: 0.7,
            strokeWeight: 4,
            visible: true,
            zIndex: 100
          });
          movementPolylinesRef.current.set(vin, poly);
        }
        // Initially set empty path - will be updated by progress
        poly.setPath([]);
        poly.setVisible(true);
      });
      // hide polylines not in dataset
      movementPolylinesRef.current.forEach((poly, vin) => {
        if (!seen.has(vin)) poly.setVisible(false);
      });
    } else {
      movementPolylinesRef.current.forEach((poly) => poly.setVisible(false));
    }
  }, [ready, mode, movementsByVin]);

  // Update polyline trails based on progress
  useEffect(() => {
    if (!ready || mode !== 'movements') return;

    const targetMs = startWindow + (progressHour / 24) * 24 * 3600 * 1000;

    movementsByVin.forEach((points, vin) => {
      const poly = movementPolylinesRef.current.get(vin);
      if (!poly) return;

      // Filter points up to current time to create trail effect
      const trailPoints = points.filter((p) => new Date(p.ts).getTime() <= targetMs);
      const path = trailPoints.map((p) => new google.maps.LatLng(p.lat, p.lon));

      // Add the current interpolated position to connect the trail to the marker
      const currentMovement = activeMovements.find((m) => m.vin === vin);
      if (currentMovement && path.length > 0) {
        const currentPos = new google.maps.LatLng(currentMovement.lat, currentMovement.lon);
        // Only add if it's different from the last point
        const lastPoint = path[path.length - 1];
        if (lastPoint.lat() !== currentPos.lat() || lastPoint.lng() !== currentPos.lng()) {
          path.push(currentPos);
        }
      }

      poly.setPath(path);
    });
  }, [ready, mode, progressHour, movementsByVin, startWindow, activeMovements]);

  // Smooth marker animation loop
  useEffect(() => {
    if (mode !== 'movements' || !ready || !isPlaying) {
      // Clean up any ongoing animations when not playing
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = undefined;
      }
      return;
    }

    const animate = () => {
      const now = Date.now();
      let hasActiveAnimations = false;

      markerAnimationRef.current.forEach((anim, vin) => {
        const marker = movementMarkersRef.current.get(vin);
        if (!marker) return;

        const elapsed = now - anim.startTime;
        const progress = Math.min(elapsed / anim.duration, 1);

        // Easing function for smooth motion
        const eased = 1 - Math.pow(1 - progress, 3);

        const lat = anim.from.lat() + (anim.to.lat() - anim.from.lat()) * eased;
        const lng = anim.from.lng() + (anim.to.lng() - anim.from.lng()) * eased;

        marker.setPosition(new google.maps.LatLng(lat, lng));

        if (progress < 1) {
          hasActiveAnimations = true;
        }
      });

      if (hasActiveAnimations) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        animationFrameRef.current = undefined;
      }
    };

    // Start animation loop when playing
    if (!animationFrameRef.current) {
      animationFrameRef.current = requestAnimationFrame(animate);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = undefined;
      }
    };
  }, [mode, ready, isPlaying, activeMovements]);

  // Fit map to show all vehicles when switching to movements mode
  const hasFitBoundsRef = useRef(false);
  useEffect(() => {
    if (mode === 'movements') {
      hasFitBoundsRef.current = false;
    }
  }, [mode]);

  // Update heatmap or markers based on mode
  useEffect(() => {
    if (!ready || !mapRef.current) return;

    if (mode === 'carparks') {
      const data = carparkPayload.map((p) => ({
        location: new google.maps.LatLng(p.lat, p.lng),
        weight: p.weight
      }));

      // Set metric-specific gradient
      if (heatRef.current) {
        if (carparkMetric === 'volatility') {
          // Blue gradient for volatility (calm to volatile)
          heatRef.current.set('gradient', [
            'rgba(226,232,240,0)',
            'rgba(148,163,184,0.6)',
            'rgba(96,165,250,0.8)',
            'rgba(59,130,246,0.95)',
            'rgba(30,64,175,1)'
          ]);
        } else {
          // Red-yellow gradient for occupancy (empty to full)
          heatRef.current.set('gradient', [
            'rgba(226,232,240,0)',
            'rgba(253,224,71,0.6)',   // yellow
            'rgba(251,191,36,0.7)',   // amber
            'rgba(249,115,22,0.85)',  // orange
            'rgba(239,68,68,1)'       // red
          ]);
        }
        heatRef.current.setData(data as any);
      }

      dwellMarkerRef.current?.setVisible(false);
      movementMarkersRef.current.forEach((m) => m.setVisible(false));
    } else if (mode === 'metered') {
      const data = meteredPayload.map((p) => ({
        location: new google.maps.LatLng(p.lat, p.lng),
        weight: p.weight
      }));

      // Set metric-specific gradient (same as carparks)
      if (heatRef.current) {
        if (carparkMetric === 'volatility') {
          // Blue gradient for volatility
          heatRef.current.set('gradient', [
            'rgba(226,232,240,0)',
            'rgba(148,163,184,0.6)',
            'rgba(96,165,250,0.8)',
            'rgba(59,130,246,0.95)',
            'rgba(30,64,175,1)'
          ]);
        } else {
          // Red-yellow gradient for occupancy
          heatRef.current.set('gradient', [
            'rgba(226,232,240,0)',
            'rgba(253,224,71,0.6)',   // yellow
            'rgba(251,191,36,0.7)',   // amber
            'rgba(249,115,22,0.85)',  // orange
            'rgba(239,68,68,1)'       // red
          ]);
        }
        heatRef.current.setData(data as any);
      }

      dwellMarkerRef.current?.setVisible(false);
      movementMarkersRef.current.forEach((m) => m.setVisible(false));
    } else {
      heatRef.current?.setData([] as any);
      dwellMarkerRef.current?.setVisible(false);

      // Ensure marker per VIN and set up smooth animations
      const colors = ['#0ea5e9', '#a855f7', '#f97316', '#22c55e', '#ef4444'];
      const seen = new Set<string>();
      const animationDuration = isPlaying ? 400 : 0; // Smooth animation when playing, instant when scrubbing

      for (const mv of activeMovements) {
        seen.add(mv.vin);
        let marker = movementMarkersRef.current.get(mv.vin);
        const targetPos = new google.maps.LatLng(mv.lat, mv.lon);

        if (!marker) {
          const color = colors[movementMarkersRef.current.size % colors.length];
          const vinLabel = mv.vin.slice(-4); // Last 4 digits of VIN
          marker = new google.maps.Marker({
            map: mapRef.current,
            position: targetPos,
            visible: false,
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 10,
              fillColor: color,
              fillOpacity: 0.95,
              strokeColor: '#ffffff',
              strokeWeight: 2
            },
            label: {
              text: vinLabel,
              color: '#ffffff',
              fontSize: '11px',
              fontWeight: 'bold'
            },
            title: mv.vin,
            zIndex: 1000
          });
          movementMarkersRef.current.set(mv.vin, marker);
          marker.setVisible(true);
        } else {
          const currentPos = marker.getPosition();
          if (currentPos && animationDuration > 0) {
            // Check if position actually changed to avoid unnecessary animations
            const distance = google.maps.geometry.spherical.computeDistanceBetween(currentPos, targetPos);
            if (distance > 1) { // Only animate if moved more than 1 meter
              // Set up smooth animation
              markerAnimationRef.current.set(mv.vin, {
                from: currentPos,
                to: targetPos,
                startTime: Date.now(),
                duration: animationDuration
              });
            }
          } else {
            // Instant update when scrubbing
            marker.setPosition(targetPos);
          }
          marker.setVisible(true);
        }
      }
      // Hide markers without data this hour
      movementMarkersRef.current.forEach((marker, vin) => {
        if (!seen.has(vin)) marker.setVisible(false);
      });
      // Fit bounds to show all vehicles when first switching to movements mode
      if (activeMovements.length > 0 && !hasFitBoundsRef.current && mapRef.current) {
        const bounds = new google.maps.LatLngBounds();
        activeMovements.forEach((mv) => {
          bounds.extend(new google.maps.LatLng(mv.lat, mv.lon));
        });
        mapRef.current.fitBounds(bounds);
        // Optionally adjust zoom if too close
        setTimeout(() => {
          const currentZoom = mapRef.current?.getZoom();
          if (currentZoom && currentZoom > 13) {
            mapRef.current?.setZoom(13);
          }
        }, 100);
        hasFitBoundsRef.current = true;
      }
    }
  }, [ready, mode, carparkPayload, meteredPayload, carparkMetric, activeMovements]);

  return (
    <div className="space-y-3">
      <Script
        id="google-maps"
        src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=visualization,geometry&v=beta`}
        strategy="lazyOnload"
        onLoad={() => setReady(true)}
      />
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <div className="flex gap-2 rounded-full border border-slate-200 bg-white/80 px-2 py-1 shadow-sm">
          <button
            onClick={() => setMode('carparks')}
            className={`rounded-full px-3 py-1 ${mode === 'carparks' ? 'bg-slate-900 text-white' : 'text-slate-700'}`}
          >
            Carparks
          </button>
          <button
            onClick={() => setMode('metered')}
            className={`rounded-full px-3 py-1 ${mode === 'metered' ? 'bg-slate-900 text-white' : 'text-slate-700'}`}
          >
            Metered
          </button>
          <button
            onClick={() => setMode('movements')}
            className={`rounded-full px-3 py-1 ${mode === 'movements' ? 'bg-slate-900 text-white' : 'text-slate-700'}`}
          >
            Vehicles {mode === 'movements' && activeMovements.length > 0 && (
              <span className="ml-1 text-xs opacity-75">({activeMovements.length})</span>
            )}
          </button>
        </div>
        {(mode === 'carparks' || mode === 'metered') && (
          <div className="flex gap-2 rounded-full border border-slate-200 bg-white/80 px-2 py-1 shadow-sm">
            <button
              onClick={() => setCarparkMetric('volatility')}
              className={`rounded-full px-3 py-1 text-xs ${carparkMetric === 'volatility' ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
            >
              Volatility
            </button>
            <button
              onClick={() => setCarparkMetric('occupancy')}
              className={`rounded-full px-3 py-1 text-xs ${carparkMetric === 'occupancy' ? 'bg-orange-600 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
            >
              Occupancy
            </button>
          </div>
        )}
        <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1 shadow-sm">
          <span className="text-xs text-slate-600">Hour (HK):</span>
          <input
            type="range"
            min={0}
            max={24}
            step={0.25}
            value={progressHour}
            onChange={(e) => setProgressHour(Number(e.target.value))}
            className="accent-slate-900"
          />
          <span className="text-xs text-slate-700 w-24 text-right">
            {(() => {
              const t = new Date(startWindow + (progressHour / 24) * 24 * 3600 * 1000);
              return t.toLocaleString('en-US', { timeZone: 'Asia/Hong_Kong', hour: '2-digit', minute: '2-digit' });
            })()}
          </span>
          <button
            onClick={() => setIsPlaying((p) => !p)}
            className="rounded-full bg-slate-900 px-3 py-1 text-xs text-white hover:bg-slate-700 transition-colors"
          >
            {isPlaying ? '⏸ Pause' : '▶ Play'}
          </button>
          <button
            onClick={() => {
              setIsPlaying(false);
              setProgressHour(0);
            }}
            className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-700 hover:bg-slate-100"
          >
            ⏮ Start
          </button>
          <button
            onClick={() => {
              setIsPlaying(false);
              setProgressHour(24);
            }}
            className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-700 hover:bg-slate-100"
          >
            ⏭ Now
          </button>
        </div>
      </div>
      <div id="heatmap" className="h-[70vh] w-full overflow-hidden rounded-2xl border border-slate-200 shadow-lg" />
    </div>
  );
}
