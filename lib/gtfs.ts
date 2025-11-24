import { supabase } from './db';

type RouteSummary = {
  route_id: string;
  agency_id: string | null;
  route_short_name: string | null;
  route_long_name: string | null;
  route_type: number | null;
  route_url?: string | null;
};

type Stop = {
  stop_id: string;
  stop_name: string | null;
  stop_lat: number;
  stop_lon: number;
  zone_id?: string | null;
  location_type?: number | null;
  stop_timezone?: string | null;
};

type Frequency = {
  trip_id: string;
  start_time: string;
  end_time: string;
  headway_secs: number;
};

type StopTime = {
  trip_id: string;
  stop_id: string;
  stop_sequence: number;
};

type FareAttribute = {
  fare_id: string;
  price: number;
  currency_type: string;
  payment_method: number;
  transfers: number;
  agency_id?: string | null;
};

type FareRule = {
  fare_id: string;
  route_id: string;
  origin_id?: string | null;
  destination_id?: string | null;
  contains_id?: string | null;
};

let routesCache: Promise<RouteSummary[]> | null = null;

export async function getRouteSummaries(): Promise<RouteSummary[]> {
  if (!routesCache) {
    const { data, error } = await supabase.rpc('gtfs_routes_full');
    if (error) throw error;
    const arr = Array.isArray(data) ? (data as RouteSummary[]) : [];
    routesCache = Promise.resolve(arr);
  }
  return routesCache;
}

async function getStopsById(): Promise<Map<string, Stop>> {
  const { data, error } = await supabase
    .from('gtfs_stops')
    .select('stop_id,stop_name,stop_lat,stop_lon,zone_id,location_type,stop_timezone')
    .limit(10000); // current dataset has ~9.4k
  if (error) throw error;
  const map = new Map<string, Stop>();
  (data ?? []).forEach((s) => {
    if (s.stop_id && s.stop_lat && s.stop_lon) map.set(s.stop_id, s as Stop);
  });
  return map;
}

async function getTripsForRoute(routeId: string): Promise<{ trip_id: string; direction_id: number | null }[]> {
  const { data, error } = await supabase
    .from('gtfs_trips')
    .select('trip_id,direction_id')
    .eq('route_id', routeId)
    .order('trip_id', { ascending: true })
    .limit(200);
  if (error) throw error;
  return data ?? [];
}

async function getStopTimesForTrip(tripId: string): Promise<StopTime[]> {
  const { data, error } = await supabase
    .from('gtfs_stop_times')
    .select('trip_id,stop_id,stop_sequence')
    .eq('trip_id', tripId)
    .order('stop_sequence', { ascending: true })
    .limit(5000);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    trip_id: r.trip_id!,
    stop_id: r.stop_id!,
    stop_sequence: r.stop_sequence!
  }));
}

async function getFrequenciesForTrips(tripIds: string[]): Promise<Frequency[]> {
  if (tripIds.length === 0) return [];
  // Supabase in filter caps at 1000; chunk if needed.
  const chunkSize = 900;
  const results: Frequency[] = [];
  for (let i = 0; i < tripIds.length; i += chunkSize) {
    const chunk = tripIds.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from('gtfs_frequencies')
      .select('trip_id,start_time,end_time,headway_secs')
      .in('trip_id', chunk);
    if (error) throw error;
    results.push(
      ...(data ?? []).map((r) => ({
        trip_id: r.trip_id!,
        start_time: r.start_time!,
        end_time: r.end_time!,
        headway_secs: Number(r.headway_secs ?? 0)
      }))
    );
  }
  return results;
}

async function getFaresForRoute(
  routeId: string
): Promise<{ fares: Array<FareRule & FareAttribute>; total: number }> {
  const { data: rules, error: rulesErr, count } = await supabase
    .from('gtfs_fare_rules')
    .select('fare_id,route_id,origin_id,destination_id,contains_id', { count: 'exact' })
    .eq('route_id', routeId)
    .limit(1000);
  if (rulesErr) throw rulesErr;

  const fareIds = Array.from(new Set((rules ?? []).map((r) => r.fare_id).filter(Boolean))) as string[];
  if (fareIds.length === 0) return { fares: [], total: count ?? 0 };

  const chunkSize = 900;
  const attrs: FareAttribute[] = [];
  for (let i = 0; i < fareIds.length; i += chunkSize) {
    const chunk = fareIds.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from('gtfs_fare_attributes')
      .select('fare_id,price,currency_type,payment_method,transfers,agency_id')
      .in('fare_id', chunk);
    if (error) throw error;
    attrs.push(
      ...(data ?? []).map((r) => ({
        fare_id: r.fare_id!,
        price: Number(r.price ?? 0),
        currency_type: r.currency_type!,
        payment_method: Number(r.payment_method ?? 0),
        transfers: Number(r.transfers ?? 0),
        agency_id: r.agency_id
      }))
    );
  }
  const attrMap = new Map(attrs.map((a) => [a.fare_id, a]));
  const fares = (rules ?? [])
    .map((r) => {
      const attr = attrMap.get(r.fare_id);
      if (!attr) return null;
      return { ...r, ...attr } as FareRule & FareAttribute;
    })
    .filter(Boolean) as Array<FareRule & FareAttribute>;

  return { fares, total: count ?? fares.length };
}

function inferDirectionFromTripId(tripId: string, direction_id?: number | null): string {
  if (direction_id === 0 || direction_id === 1) return String(direction_id);
  const parts = tripId.split('-');
  return parts[1] ?? '0';
}

export type RouteDetail = {
  route: RouteSummary | undefined;
  directions: Array<{
    direction_id: string;
    trip_id: string;
    polyline: Array<{ lat: number; lon: number; stop_id: string; stop_name: string | null }>;
  }>;
  headways: Array<{
    direction_id: string;
    start_time: string;
    end_time: string;
    headway_secs: number;
  }>;
  fares: Array<
    FareAttribute & {
      origin_id?: string | null;
      destination_id?: string | null;
      contains_id?: string | null;
    }
  >;
  fare_count: number;
};

export async function getRouteDetail(routeId: string): Promise<RouteDetail> {
  const { data, error } = await supabase.rpc('gtfs_route_detail', { route_id: routeId });
  if (error) throw error;
  const detail = (data || {}) as any;
  const route = detail.route as RouteSummary | undefined;
  const directions: RouteDetail['directions'] = Array.isArray(detail.directions)
    ? detail.directions.map((d: any) => ({
        direction_id: String(d.direction_id ?? '0'),
        trip_id: d.trip_id,
        polyline: Array.isArray(d.polyline)
          ? d.polyline
              .filter((p: any) => p && p.lat && p.lon)
              .map((p: any) => ({
                lat: Number(p.lat),
                lon: Number(p.lon),
                stop_id: p.stop_id,
                stop_name: p.stop_name ?? null
              }))
          : []
      }))
    : [];

  const headways: RouteDetail['headways'] = Array.isArray(detail.headways)
    ? detail.headways.flatMap((h: any) => {
        const dir = String(h.direction_id ?? '0');
        const items = Array.isArray(h.items) ? h.items : [];
        return items.map((i: any) => ({
          direction_id: dir,
          start_time: i.start_time,
          end_time: i.end_time,
          headway_secs: Number(i.headway_secs ?? 0)
        }));
      })
    : [];

  const fares: RouteDetail['fares'] = Array.isArray(detail.fares)
    ? detail.fares.map((f: any) => ({
        fare_id: f.fare_id,
        price: Number(f.price ?? 0),
        currency_type: f.currency_type,
        payment_method: Number(f.payment_method ?? 0),
        transfers: Number(f.transfers ?? 0),
        agency_id: f.agency_id,
        origin_id: f.origin_id,
        destination_id: f.destination_id,
        contains_id: f.contains_id
      }))
    : [];

  return {
    route,
    directions,
    headways,
    fares,
    fare_count: Number(detail.fare_count ?? fares.length)
  };
}
