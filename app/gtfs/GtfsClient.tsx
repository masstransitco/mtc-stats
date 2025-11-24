'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Script from 'next/script';

type RouteSummary = {
  route_id: string;
  agency_id: string;
  route_short_name: string;
  route_long_name: string;
  route_type: string;
  route_url?: string;
};

type RouteDetail = {
  route?: RouteSummary;
  directions: Array<{
    direction_id: string;
    trip_id: string;
    polyline: Array<{ lat: number; lon: number; stop_id: string; stop_name: string }>;
  }>;
  headways: Array<{
    direction_id: string;
    start_time: string;
    end_time: string;
    headway_secs: number;
  }>;
  fares: Array<{
    fare_id: string;
    price: number;
    currency_type: string;
    payment_method: number;
    transfers: number;
    agency_id?: string;
    origin_id?: string;
    destination_id?: string;
    contains_id?: string;
  }>;
  fare_count: number;
};

const HK_CENTER = { lat: 22.3193, lng: 114.1694 };

function getAgencyIcon(agencyId?: string | null) {
  if (!agencyId) return null;
  return `https://sssyxnpanayqvamstind.supabase.co/storage/v1/object/public/favicons/${agencyId}.ico`;
}

export default function GtfsClient({ routes }: { routes: RouteSummary[] }) {
  const firstRoute = routes[0];
  const initialMode = firstRoute?.route_type != null ? String(firstRoute.route_type) : '';
  const initialAgency = firstRoute?.agency_id ?? '';

  const [selectedRouteId, setSelectedRouteId] = useState(() => firstRoute?.route_id ?? '');
  const [filterTerm, setFilterTerm] = useState('');
  const [pendingFilter, setPendingFilter] = useState('');
  const [selectedMode, setSelectedMode] = useState<string>(initialMode);
  const [pendingMode, setPendingMode] = useState<string>(initialMode);
  const [selectedAgency, setSelectedAgency] = useState<string>(initialAgency);
  const [pendingAgency, setPendingAgency] = useState<string>(initialAgency);
  const [detail, setDetail] = useState<RouteDetail | null>(null);
  const [ready, setReady] = useState(false);
  const initialRouteChosen = useRef(false);

  const mapRef = useRef<google.maps.Map>();
  const polylinesRef = useRef<google.maps.Polyline[]>([]);
  const markersRef = useRef<google.maps.Marker[]>([]);

  const modeOptions = useMemo(() => {
    const unique = Array.from(
      new Set(
        routes
          .map((r) => (r.route_type as any) ?? null)
          .filter((r): r is number => typeof r === 'number' || typeof r === 'string')
      )
    )
      .map((v) => Number(v))
      .sort((a, b) => a - b);
    return unique;
  }, [routes]);

  const agencyOptions = useMemo(() => {
    const unique = Array.from(new Set(routes.map((r) => r.agency_id).filter(Boolean))) as string[];
    unique.sort();
    return unique;
  }, [routes]);

  const agencyModeMap = useMemo(() => {
    const map = new Map<string, string>();
    routes.forEach((r) => {
      if (r.agency_id && r.route_type != null) {
        map.set(r.agency_id, String(r.route_type));
      }
    });
    return map;
  }, [routes]);

  const modeLabel = (mode?: number | null) => {
    switch (mode) {
      case 0:
        return 'Tram';
      case 1:
        return 'Subway';
      case 2:
        return 'Rail';
      case 3:
        return 'Bus';
      case 4:
        return 'Ferry';
      case 5:
        return 'Cable car';
      case 6:
        return 'Gondola';
      case 7:
        return 'Funicular';
      default:
        return 'Other';
    }
  };

  const filterRoutes = (modeVal: string, agencyVal: string, termVal: string) => {
    const term = termVal.trim().toLowerCase();
    return routes.filter((r) => {
      if (modeVal && String(r.route_type) !== modeVal) return false;
      if (agencyVal && r.agency_id !== agencyVal) return false;
      if (!term) return true;
      return (
        r.route_id.toLowerCase().includes(term) ||
        (r.route_short_name ?? '').toLowerCase().includes(term) ||
        (r.route_long_name ?? '').toLowerCase().includes(term) ||
        (r.agency_id ?? '').toLowerCase().includes(term)
      );
    });
  };

  const filteredRoutes = useMemo(
    () => filterRoutes(selectedMode, selectedAgency, filterTerm),
    [filterTerm, routes, selectedMode, selectedAgency]
  );

  const pickRandomFor = (modeVal: string, agencyVal: string, termVal: string) => {
    const candidatesByMode = filterRoutes(modeVal, '', termVal);
    if (candidatesByMode.length === 0) return { mode: modeVal, agency: agencyVal, routeId: '' };
    let agencyPick = agencyVal;
    const agencies = Array.from(new Set(candidatesByMode.map((r) => r.agency_id))).filter(Boolean) as string[];
    if (!agencyPick || !agencies.includes(agencyPick)) {
      agencyPick = agencies[Math.floor(Math.random() * agencies.length)];
    }
    const finalCandidates = candidatesByMode.filter((r) => r.agency_id === agencyPick);
    const route =
      finalCandidates[Math.floor(Math.random() * finalCandidates.length)] ?? candidatesByMode[0];
    return { mode: modeVal, agency: agencyPick, routeId: route?.route_id ?? '' };
  };

  useEffect(() => {
    if (initialRouteChosen.current) return;
    if (routes.length === 0) return;
    const random = routes[Math.floor(Math.random() * routes.length)];
    setSelectedRouteId(random.route_id);
    const mode = random.route_type != null ? String(random.route_type) : '';
    const agency = random.agency_id ?? '';
    setSelectedMode(mode);
    setPendingMode(mode);
    setSelectedAgency(agency);
    setPendingAgency(agency);
    initialRouteChosen.current = true;
  }, [routes]);

  useEffect(() => {
    if (!selectedRouteId && filteredRoutes.length > 0) {
      setSelectedRouteId(filteredRoutes[0].route_id);
      return;
    }
    const exists = filteredRoutes.some((r) => r.route_id === selectedRouteId);
    if (!exists && filteredRoutes.length > 0) {
      setSelectedRouteId(filteredRoutes[0].route_id);
    }
  }, [filteredRoutes, selectedRouteId]);

  useEffect(() => {
    if (!selectedRouteId) return;
    const controller = new AbortController();
    (async () => {
        try {
          const res = await fetch(`/api/gtfs/route/${selectedRouteId}`, { signal: controller.signal });
          if (!res.ok) return;
          const json = (await res.json()) as RouteDetail;
          setDetail(json);
        } catch (err: any) {
          if (err?.name === 'AbortError') return;
          console.error(err);
        }
    })();
    return () => controller.abort();
  }, [selectedRouteId]);

  useEffect(() => {
    if (!ready || !mapRef.current || !detail) return;

    // Clear old overlays.
    polylinesRef.current.forEach((p) => p.setMap(null));
    markersRef.current.forEach((m) => m.setMap(null));
    polylinesRef.current = [];
    markersRef.current = [];

    const bounds = new google.maps.LatLngBounds();

    detail.directions.forEach((dir, idx) => {
      const path = dir.polyline.map((p) => ({ lat: p.lat, lng: p.lon }));
      if (path.length === 0) return;
      path.forEach((pt) => bounds.extend(pt));
      const polyline = new google.maps.Polyline({
        path,
        map: mapRef.current!,
        strokeColor: idx === 0 ? '#0ea5e9' : '#a855f7',
        strokeWeight: 4,
        strokeOpacity: 0.85
      });
      polylinesRef.current.push(polyline);

      const markers = dir.polyline.map((p, i) => {
        const marker = new google.maps.Marker({
          position: { lat: p.lat, lng: p.lon },
          map: mapRef.current!,
          title: p.stop_name,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 4,
            fillColor: '#ffffff',
            fillOpacity: 0.9,
            strokeColor: '#0f172a',
            strokeWeight: 1
          },
          label: i === 0 ? '•' : undefined
        });
        return marker;
      });
      markersRef.current.push(...markers);
    });

    if (!bounds.isEmpty()) {
      mapRef.current.fitBounds(bounds, 48);
    }
  }, [detail, ready]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:gap-4">
          <div className="flex items-center gap-2 min-w-[200px]">
            <label className="text-xs uppercase tracking-[0.2em] text-slate-500">Mode</label>
            <select
              value={pendingMode}
              onChange={(e) => {
                const newMode = e.target.value;
                const picked = pickRandomFor(newMode, selectedAgency, filterTerm);
                setPendingMode(newMode);
                setSelectedMode(newMode);
                setPendingAgency(picked.agency);
                setSelectedAgency(picked.agency);
                if (picked.routeId) setSelectedRouteId(picked.routeId);
              }}
              className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-inner"
            >
              {modeOptions.map((m) => (
                <option key={m} value={String(m)}>
                  {modeLabel(m)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 min-w-[200px]">
            <div className="flex items-center gap-2">
              <label className="text-xs uppercase tracking-[0.2em] text-slate-500">Operator</label>
              {pendingAgency ? (
                <img
                  src={getAgencyIcon(pendingAgency) ?? ''}
                  alt={pendingAgency}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                  className="h-5 w-5 rounded-sm border border-slate-200 object-contain"
                />
              ) : null}
            </div>
            <select
              value={pendingAgency}
              onChange={(e) => {
                const newAgency = e.target.value;
                const inferredMode = agencyModeMap.get(newAgency) ?? selectedMode;
                const picked = pickRandomFor(inferredMode, newAgency, filterTerm);
                setPendingAgency(newAgency);
                setSelectedAgency(newAgency);
                setSelectedMode(inferredMode);
                setPendingMode(inferredMode);
                if (picked.routeId) setSelectedRouteId(picked.routeId);
              }}
              className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-inner"
            >
              {agencyOptions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs uppercase tracking-[0.2em] text-slate-500">Route</label>
            <select
              value={selectedRouteId}
              onChange={(e) => setSelectedRouteId(e.target.value)}
              className="min-w-[220px] rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-inner"
            >
              {filteredRoutes.map((r) => (
                <option key={r.route_id} value={r.route_id}>
                  {r.route_short_name || r.route_id} · {r.agency_id} — {r.route_long_name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 min-w-[240px] md:min-w-[280px]">
            <span aria-hidden className="text-slate-500">🔍</span>
            <input
              value={pendingFilter}
              onChange={(e) => setPendingFilter(e.target.value)}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-inner"
              placeholder="Search route id, name, agency"
            />
          </div>
          <button
            onClick={() => {
              const picked = pickRandomFor(pendingMode, pendingAgency, pendingFilter);
              setFilterTerm(pendingFilter);
              setSelectedMode(picked.mode);
              setPendingMode(picked.mode);
              setSelectedAgency(picked.agency);
              setPendingAgency(picked.agency);
              if (picked.routeId) setSelectedRouteId(picked.routeId);
            }}
            className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
          >
            Apply
          </button>
          <button
            onClick={() => {
              setPendingFilter('');
              const newRoute = routes[Math.floor(Math.random() * routes.length)];
              const mode = newRoute?.route_type != null ? String(newRoute.route_type) : '';
              const agency = newRoute?.agency_id ?? '';
              setPendingMode(mode);
              setPendingAgency(agency);
              setFilterTerm('');
              setSelectedMode(mode);
              setSelectedAgency(agency);
              if (newRoute?.route_id) setSelectedRouteId(newRoute.route_id);
            }}
            className="rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Reset
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr,1fr]">
        <div className="overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
          <div id="gtfs-map" className="h-[520px] w-full" />
        </div>
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Route details</p>
            <p className="text-lg font-semibold text-slate-900">
              {detail?.route?.route_short_name ?? selectedRouteId}{' '}
              <span className="text-slate-500">{detail?.route?.route_long_name}</span>
            </p>
            <div className="mt-2 flex items-center gap-2 text-sm text-slate-600">
              {detail?.route?.agency_id ? (
                <img
                  src={getAgencyIcon(detail.route.agency_id) ?? ''}
                  alt={detail.route.agency_id}
                  onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
                  className="h-5 w-5 rounded-sm border border-slate-200 object-contain"
                />
              ) : null}
              <span>Agency: {detail?.route?.agency_id ?? '—'}</span>
              <span>·</span>
              <span>Type: {detail?.route?.route_type ?? '—'}</span>
            </div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <p className="mb-2 text-xs uppercase tracking-[0.18em] text-slate-500">Headways</p>
            <div className="flex flex-col gap-1">
              {detail?.headways?.length ? (
                detail.headways
                  .slice(0, 12)
                  .map((h, idx) => (
                    <div
                      key={`${h.direction_id}-${h.start_time}-${idx}`}
                      className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm text-slate-700 shadow-inner"
                    >
                      <span className="font-medium text-slate-900">Dir {h.direction_id}</span>
                      <span>
                        {h.start_time}–{h.end_time}
                      </span>
                      <span className="font-semibold text-sky-700">{Math.round(h.headway_secs / 60)} min</span>
                    </div>
                  ))
              ) : (
                <p className="text-sm text-slate-500">No headway windows published.</p>
              )}
            </div>
          </div>
          <div className="rounded-xl border border-amber-100 bg-amber-50 p-3">
            <p className="mb-2 text-xs uppercase tracking-[0.18em] text-amber-800">Fares</p>
            {detail?.fares?.length ? (
              <div className="space-y-2">
                {(() => {
                  const prices = detail.fares.map((f) => f.price);
                  const min = Math.min(...prices);
                  const max = Math.max(...prices);
                  const currency = detail.fares[0].currency_type;
                  const total = detail.fare_count ?? detail.fares.length;
                  const truncated = total > detail.fares.length;
                  return (
                    <div className="flex flex-col gap-1 text-sm text-amber-900">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">
                          {total} fares · min {currency} {min} — max {currency} {max}
                        </span>
                        <span className="text-xs text-amber-700">currency: {currency}</span>
                      </div>
                      {truncated ? (
                        <span className="text-xs text-amber-700">
                          Showing {detail.fares.length} of {total} fares (sampled)
                        </span>
                      ) : null}
                    </div>
                  );
                })()}
                <div className="grid grid-cols-1 gap-2">
                  {detail.fares.slice(0, 10).map((f, idx) => (
                    <div
                      key={`${f.fare_id}-${f.origin_id ?? ''}-${f.destination_id ?? ''}-${idx}`}
                      className="rounded-lg bg-white px-3 py-2 text-sm text-amber-900 shadow-inner"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">HK${f.price.toFixed(2)}</span>
                        <span className="text-xs text-amber-700">fare {f.fare_id}</span>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs text-amber-700">
                        <span>pay: {f.payment_method === 0 ? 'on board' : 'prepaid'}</span>
                        <span>transfers: {f.transfers}</span>
                        {f.origin_id && <span>origin: {f.origin_id}</span>}
                        {f.destination_id && <span>dest: {f.destination_id}</span>}
                        {f.contains_id && <span>contains: {f.contains_id}</span>}
                        {f.agency_id && <span>agency: {f.agency_id}</span>}
                      </div>
                    </div>
                  ))}
                  {detail.fares.length > 10 ? (
                    <p className="text-xs text-amber-700">+ {detail.fares.length - 10} more fares not shown</p>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="text-sm text-amber-800">No fare rules matched this route.</p>
            )}
          </div>
        </div>
      </div>

      <Script
        src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=geometry&v=beta`}
        strategy="afterInteractive"
        onLoad={() => {
          const container = document.getElementById('gtfs-map');
          if (!container || mapRef.current) return;
          mapRef.current = new google.maps.Map(container, {
            center: HK_CENTER,
            zoom: 11,
            mapId: process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID
          });
          setReady(true);
        }}
      />
    </div>
  );
}
