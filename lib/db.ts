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
    .from('agg_parking_hourly_pattern')
    .select('*')
    .order('hour_of_day', { ascending: true });
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
