import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Supabase environment variables are missing');
}

export const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: {
    headers: {
      Prefer: 'statement_timeout=15000'
    }
  }
});

export type DailyHeadline = {
  date: string;
  total_passengers: number;
  rolling_7d_avg: number | null;
};

export async function getDailyHeadlineSeries(params: { start?: string; end?: string }) {
  const { start, end } = params;
  let query = supabase
    .from('agg_daily_headline')
    .select('date,total_passengers,rolling_7d_avg')
    .order('date', { ascending: true });
  if (start) query = query.gte('date', start);
  if (end) query = query.lte('date', end);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as DailyHeadline[];
}

export async function getTopDays(limit = 10) {
  const { data, error } = await supabase
    .from('agg_daily_headline')
    .select('date,total_passengers,top_control_point_id,top_control_point_name,top_control_point_share,holiday_period')
    .order('total_passengers', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function getMonthlyCorridorSeries(params: { startYear?: number; endYear?: number; corridors?: string[] }) {
  const { startYear, endYear, corridors } = params;
  let query = supabase
    .from('agg_monthly_corridor')
    .select('year_month,corridor,total_passengers,total_arrivals,total_departures,hk_residents,mainland_visitors,other_visitors,hk_share,mainland_share,visitor_share,yoy_growth')
    .order('year_month', { ascending: true })
    .order('corridor', { ascending: true });

  if (startYear) query = query.gte('year_month', startYear * 100 + 1);
  if (endYear) query = query.lte('year_month', endYear * 100 + 12);
  if (corridors && corridors.length > 0) query = query.in('corridor', corridors);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getResidencyMixSeries(params: { startYear?: number; endYear?: number; corridors?: string[] }) {
  const rows = await getMonthlyCorridorSeries(params);
  const map = new Map<
    number,
    { hk_residents: number; mainland_visitors: number; other_visitors: number; total: number }
  >();

  for (const row of rows) {
    const bucket = map.get(row.year_month) ?? { hk_residents: 0, mainland_visitors: 0, other_visitors: 0, total: 0 };
    bucket.hk_residents += row.hk_residents || 0;
    bucket.mainland_visitors += row.mainland_visitors || 0;
    bucket.other_visitors += row.other_visitors || 0;
    bucket.total += row.total_passengers || 0;
    map.set(row.year_month, bucket);
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a - b)
    .map(([year_month, bucket]) => ({
      year_month,
      hk_share: bucket.hk_residents / Math.max(bucket.total, 1),
      mainland_share: bucket.mainland_visitors / Math.max(bucket.total, 1),
      other_share: bucket.other_visitors / Math.max(bucket.total, 1)
    }));
}

export async function getPatternByCorridor(params: { corridors?: string[] }) {
  const { corridors } = params;
  let query = supabase
    .from('agg_pattern_corridor')
    .select('corridor,pattern_type,avg_passengers,weekend_index,holiday_uplift,hk_share,mainland_share,other_share')
    .order('corridor', { ascending: true })
    .order('pattern_type', { ascending: true });
  if (corridors && corridors.length > 0) query = query.in('corridor', corridors);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getCorridors() {
  const { data, error } = await supabase
    .from('dim_control_point')
    .select('corridor')
    .order('corridor', { ascending: true });
  if (error) throw error;
  const unique = Array.from(new Set((data ?? []).map((row) => row.corridor).filter(Boolean)));
  return unique;
}

export async function getMonthlyModeSeries(params: { startYear?: number; endYear?: number }) {
  const { startYear, endYear } = params;
  let query = supabase
    .from('agg_monthly_transport_mode')
    .select('year_month,mode,avg_daily_pax')
    .order('year_month', { ascending: true })
    .order('mode', { ascending: true });
  if (startYear) query = query.gte('year_month', startYear * 100 + 1);
  if (endYear) query = query.lte('year_month', endYear * 100 + 12);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getLatestModeSnapshot() {
  const { data, error } = await supabase
    .from('agg_latest_transport_mode')
    .select('year_month,mode,operator_code,rail_line,avg_daily_pax')
    .order('avg_daily_pax', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getAnnualIndicators() {
  const { data, error } = await supabase
    .from('agg_annual_ptp')
    .select('year,avg_daily_ptp,yoy_growth');
  if (error) throw error;
  return data ?? [];
}

export async function getOperatorsByMode(mode: string) {
  const { data, error } = await supabase
    .from('fact_monthly_transport')
    .select('operator_code')
    .eq('mode', mode)
    .not('operator_code', 'is', null)
    .order('operator_code', { ascending: true });
  if (error) throw error;
  return Array.from(new Set((data ?? []).map((r) => r.operator_code!).filter(Boolean)));
}

export async function getOperatorTrend(params: {
  mode: string;
  operators?: string[];
  startYear?: number;
  endYear?: number;
}) {
  const { mode, operators, startYear, endYear } = params;
  let query = supabase
    .from('fact_monthly_transport')
    .select('year_month,operator_code,rail_line,avg_daily_pax')
    .eq('mode', mode)
    .order('year_month', { ascending: true })
    .order('operator_code', { ascending: true });
  if (operators && operators.length > 0) query = query.in('operator_code', operators);
  if (startYear) query = query.gte('year_month', startYear * 100 + 1);
  if (endYear) query = query.lte('year_month', endYear * 100 + 12);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getOperatorLatestRanking(params: { mode: string; yearMonth?: number }) {
  const { mode, yearMonth } = params;
  const targetYearMonth =
    yearMonth ??
    (
      await supabase
        .from('fact_monthly_transport')
        .select('year_month', { count: 'exact', head: true })
        .eq('mode', mode)
        .order('year_month', { ascending: false })
        .limit(1)
    ).data?.[0]?.year_month;

  if (!targetYearMonth) return [];

  const { data, error } = await supabase
    .from('fact_monthly_transport')
    .select('year_month,operator_code,rail_line,avg_daily_pax')
    .eq('mode', mode)
    .eq('year_month', targetYearMonth)
    .order('avg_daily_pax', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// Parking pattern analysis queries
export async function getParking5MinTrend() {
  const { data, error } = await supabase
    .from('agg_parking_5min_trend')
    .select('*')
    .order('time_bucket', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getParkingHourlyPattern() {
  const { data, error } = await supabase
    .rpc('get_parking_hourly_aggregated');
  if (error) throw error;
  return data ?? [];
}

export async function getMetered5MinTrend() {
  const { data, error} = await supabase
    .from('agg_metered_5min_trend')
    .select('*')
    .order('time_bucket', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getMeteredHourlyPattern() {
  const { data, error } = await supabase
    .from('agg_metered_hourly_pattern')
    .select('*')
    .order('hour_of_day', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// Busiest districts and carparks analysis
export async function getBusiestDistrictsParking() {
  const { data, error } = await supabase
    .from('agg_busiest_districts_parking')
    .select('*')
    .order('stddev_vacancy', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getBusiestDistrictsMetered() {
  const { data, error } = await supabase
    .from('agg_busiest_districts_metered')
    .select('*')
    .order('stddev_vacancy_rate', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getBusiestCarparks(limit = 20) {
  const { data, error } = await supabase
    .from('agg_busiest_carparks')
    .select('*')
    .order('stddev_vacancy', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

// Fleet / iSmart telemetry analysis
export type VehicleStateSummary = {
  state: string;
  count: number;
  total_duration_sec: number;
};

export async function getVehicleStateSummary() {
  const { data, error } = await supabase
    .from('vehicle_state_segments_mv')
    .select('state,duration_sec');
  if (error) throw error;
  const summary = new Map<string, { count: number; total_duration_sec: number }>();
  for (const row of data || []) {
    const key = row.state ?? 'Unknown';
    const current = summary.get(key) ?? { count: 0, total_duration_sec: 0 };
    current.count += 1;
    current.total_duration_sec += Number(row.duration_sec);
    summary.set(key, current);
  }
  return Array.from(summary.entries())
    .map(([state, agg]) => ({ state, ...agg }))
    .sort((a, b) => b.total_duration_sec - a.total_duration_sec);
}

export type DwellHotspot = {
  district: string | null;
  dwell_minutes: number;
  events: number;
};

export async function getDwellHotspots(limit = 10) {
  const { data, error } = await supabase
    .from('vehicle_dwell_districts_mv')
    .select('district,duration_sec');
  if (error) throw error;
  const byDistrict = new Map<string, { dwell_minutes: number; events: number }>();
  for (const row of data || []) {
    const district = row.district ?? 'Unknown';
    const agg = byDistrict.get(district) ?? { dwell_minutes: 0, events: 0 };
    agg.dwell_minutes += Number(row.duration_sec) / 60;
    agg.events += 1;
    byDistrict.set(district, agg);
  }
  return Array.from(byDistrict.entries())
    .map(([district, agg]) => ({ district, ...agg }))
    .sort((a, b) => b.dwell_minutes - a.dwell_minutes)
    .slice(0, limit);
}

export type RecentDwell = {
  vin: string;
  district: string | null;
  start_ts: string;
  end_ts: string;
  duration_sec: number;
  radius_m: number | null;
  dist_m: number | null;
};

export type HourlyActivity = {
  vin: string;
  hour: number; // 0-23 HK time
  duration_min: number;
};

export async function getRecentDwells(limit = 30) {
  const { data, error } = await supabase
    .from('vehicle_dwell_districts_mv')
    .select('vin,district,start_ts,end_ts,duration_sec,radius_m,dist_m')
    .order('start_ts', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map((row) => ({
    vin: row.vin,
    district: row.district,
    start_ts: row.start_ts,
    end_ts: row.end_ts,
    duration_sec: Number(row.duration_sec),
    radius_m: row.radius_m !== null ? Number(row.radius_m) : null,
    dist_m: row.dist_m !== null ? Number(row.dist_m) : null
  })) as RecentDwell[];
}

export async function getHourlyActivity24h() {
  const sinceIso = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data, error } = await supabase
    .from('vehicle_state_segments_mv')
    .select('vin,start_ts,duration_sec')
    .gte('start_ts', sinceIso);
  if (error) throw error;

  const buckets = new Map<string, number>(); // key vin-hour
  for (const row of data || []) {
    const ts = new Date(row.start_ts);
    const hkHour = (ts.getUTCHours() + 8) % 24;
    const key = `${row.vin}|${hkHour}`;
    const current = buckets.get(key) ?? 0;
    buckets.set(key, current + Number(row.duration_sec) / 60);
  }

  const result: HourlyActivity[] = [];
  for (const [key, duration_min] of buckets.entries()) {
    const [vin, hourStr] = key.split('|');
    result.push({ vin, hour: Number(hourStr), duration_min });
  }
  return result;
}

// Map heat layers
export type CarparkVolatilityPoint = {
  park_id: string;
  park_name: string;
  district: string | null;
  lat: number;
  lon: number;
  stddev_vacancy: number;
  avg_vacancy: number;
  min_vacancy: number;
  max_vacancy: number;
};

export async function getCarparkVolatilityPoints(limit = 200) {
  const { data, error } = await supabase
    .rpc('get_carpark_volatility_points', { p_limit: limit });
  if (error) throw error;
  return (data || []) as CarparkVolatilityPoint[];
}

export type CarparkHourlyPoint = {
  park_id: string;
  park_name: string;
  district: string | null;
  carpark_type: string | null;
  lat: number;
  lon: number;
  hour: number; // 0-23 HK time
  avg_vacancy: number;
  stddev_vacancy: number;
  min_vacancy: number;
  max_vacancy: number;
  sample_count: number;
  overall_max_vacancy: number;
  avg_hourly_stddev: number;
  occupancy_rate: number; // 0-1, calculated as (max_vacancy - avg_vacancy) / max_vacancy
};

export async function getCarparkHourlyData(topCarparks = 40) {
  const { data, error } = await supabase
    .rpc('get_carpark_hourly_data', { p_top_carparks: topCarparks });
  if (error) throw error;
  return (data || []).map((row: any) => ({
    park_id: row.park_id,
    park_name: row.park_name,
    district: row.district,
    carpark_type: row.carpark_type,
    lat: Number(row.lat),
    lon: Number(row.lon),
    hour: Number(row.hour),
    avg_vacancy: Number(row.avg_vacancy),
    stddev_vacancy: Number(row.stddev_vacancy),
    min_vacancy: Number(row.min_vacancy),
    max_vacancy: Number(row.max_vacancy),
    sample_count: Number(row.sample_count),
    overall_max_vacancy: Number(row.overall_max_vacancy),
    avg_hourly_stddev: Number(row.avg_hourly_stddev),
    occupancy_rate: Number(row.occupancy_rate)
  })) as CarparkHourlyPoint[];
}

export type MeteredCarparkHourlyPoint = {
  carpark_id: string;
  carpark_name: string;
  district: string | null;
  lat: number;
  lon: number;
  hour: number; // 0-23 HK time
  avg_vacancy_rate: number; // percentage 0-100
  stddev_vacancy_rate: number;
  min_vacancy_rate: number;
  max_vacancy_rate: number;
  sample_count: number;
  overall_max_vacancy_rate: number;
  avg_hourly_stddev: number;
  occupancy_rate: number; // 0-1, calculated as (100 - avg_vacancy_rate) / 100
};

export async function getMeteredCarparkHourlyData(topCarparks = 40) {
  const { data, error } = await supabase
    .rpc('get_metered_carpark_hourly_data', { p_top_carparks: topCarparks });
  if (error) throw error;
  return (data || []).map((row: any) => ({
    carpark_id: row.carpark_id,
    carpark_name: row.carpark_name,
    district: row.district,
    lat: Number(row.lat),
    lon: Number(row.lon),
    hour: Number(row.hour),
    avg_vacancy_rate: Number(row.avg_vacancy_rate),
    stddev_vacancy_rate: Number(row.stddev_vacancy_rate),
    min_vacancy_rate: Number(row.min_vacancy_rate),
    max_vacancy_rate: Number(row.max_vacancy_rate),
    sample_count: Number(row.sample_count),
    overall_max_vacancy_rate: Number(row.overall_max_vacancy_rate),
    avg_hourly_stddev: Number(row.avg_hourly_stddev),
    occupancy_rate: Number(row.occupancy_rate)
  })) as MeteredCarparkHourlyPoint[];
}

export type DwellHeatPoint = {
  vin: string;
  district: string | null;
  lat: number;
  lon: number;
  start_ts: string;
  end_ts: string;
  duration_sec: number;
};

export async function getDwellHeatPoints(days = 7) {
  const sinceIso = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
  const { data, error } = await supabase
    .from('vehicle_dwell_districts_mv')
    .select('vin,district,start_ts,end_ts,duration_sec,center')
    .gte('start_ts', sinceIso);
  if (error) throw error;
  return (data || []).map((row: any) => ({
    vin: row.vin,
    district: row.district,
    start_ts: row.start_ts,
    end_ts: row.end_ts,
    duration_sec: Number(row.duration_sec),
    lat: row.center?.coordinates?.[1] ?? null,
    lon: row.center?.coordinates?.[0] ?? null
  })) as DwellHeatPoint[];
}

export type MovementPoint = {
  vin: string;
  ts: string;
  lat: number;
  lon: number;
  speed: number | null;
};

// Latest 24h movement points; sampled at 1-minute intervals per vehicle
export async function getRecentMovements24h() {
  const { data, error } = await supabase.rpc('get_vehicle_movements_24h');
  if (error) throw error;
  return (data || []).map((row: any) => ({
    vin: row.vin,
    ts: row.ts,
    lat: Number(row.lat),
    lon: Number(row.lon),
    speed: row.speed !== null ? Number(row.speed) : null
  })) as MovementPoint[];
}
