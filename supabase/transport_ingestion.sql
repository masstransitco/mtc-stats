-- Staging tables for transport datasets
create table if not exists staging_monthly_transport (
  yr_mth text,
  mode text,
  ttd_pto_code text,
  rail_line text,
  avg_daily_pax numeric,
  avg_daily_pax_indi numeric
);

create table if not exists staging_annual_transport (
  yr int,
  avg_daily_ptp numeric,
  avg_daily_ptp_indi numeric,
  total_public_road_len numeric,
  total_public_road_len_indi numeric,
  public_road_len_per_pop numeric,
  public_road_len_per_pop_indi numeric,
  mv_per_pop numeric,
  mv_per_pop_indi numeric,
  private_car_per_pop numeric,
  private_car_per_pop_indi numeric,
  no_killed_csu_per_pop numeric,
  no_killed_csu_per_pop_indi numeric,
  no_injured_csu_per_pop numeric,
  no_injured_csu_per_pop_indi numeric,
  no_killed_csu_per_mv numeric,
  no_killed_csu_per_mv_indi numeric,
  no_injured_csu_per_mv numeric,
  no_injured_csu_per_mv_indi numeric
);

-- Copy examples (run in psql with correct paths):
-- \\copy staging_monthly_transport(yr_mth,mode,ttd_pto_code,rail_line,avg_daily_pax,avg_daily_pax_indi) from 'monthly_transport_digest_eng.csv' csv header;
-- \\copy staging_annual_transport from 'passenger_journey_by_operator.csv' csv header;

-- Upsert modes
insert into dim_transport_mode (mode)
select distinct mode from staging_monthly_transport
on conflict (mode) do nothing;

-- Load monthly fact
insert into fact_monthly_transport (year_month, mode, operator_code, rail_line, avg_daily_pax, avg_daily_pax_index)
select
  yr_mth::int,
  mode,
  nullif(ttd_pto_code, ''),
  nullif(rail_line, ''),
  nullif(avg_daily_pax, '')::numeric,
  nullif(nullif(avg_daily_pax_indi, ''), '#')::numeric
from staging_monthly_transport
on conflict (year_month, mode, operator_code, rail_line)
do update set
  avg_daily_pax = excluded.avg_daily_pax,
  avg_daily_pax_index = excluded.avg_daily_pax_index;

-- Load annual indicators
insert into fact_annual_transport_indicators (
  year,
  avg_daily_ptp,
  avg_daily_ptp_index,
  total_public_road_len,
  total_public_road_len_index,
  public_road_len_per_pop,
  public_road_len_per_pop_index,
  mv_per_pop,
  mv_per_pop_index,
  private_car_per_pop,
  private_car_per_pop_index,
  no_killed_csu_per_pop,
  no_killed_csu_per_pop_index,
  no_injured_csu_per_pop,
  no_injured_csu_per_pop_index,
  no_killed_csu_per_mv,
  no_killed_csu_per_mv_index,
  no_injured_csu_per_mv,
  no_injured_csu_per_mv_index
)
select
  yr,
  nullif(avg_daily_ptp, '')::numeric,
  nullif(avg_daily_ptp_indi, '')::numeric,
  nullif(total_public_road_len, '')::numeric,
  nullif(total_public_road_len_indi, '')::numeric,
  nullif(public_road_len_per_pop, '')::numeric,
  nullif(public_road_len_per_pop_indi, '')::numeric,
  nullif(mv_per_pop, '')::numeric,
  nullif(mv_per_pop_indi, '')::numeric,
  nullif(private_car_per_pop, '')::numeric,
  nullif(private_car_per_pop_indi, '')::numeric,
  nullif(no_killed_csu_per_pop, '')::numeric,
  nullif(no_killed_csu_per_pop_indi, '')::numeric,
  nullif(no_injured_csu_per_pop, '')::numeric,
  nullif(no_injured_csu_per_pop_indi, '')::numeric,
  nullif(no_killed_csu_per_mv, '')::numeric,
  nullif(no_killed_csu_per_mv_indi, '')::numeric,
  nullif(no_injured_csu_per_mv, '')::numeric,
  nullif(no_injured_csu_per_mv_indi, '')::numeric
from staging_annual_transport
on conflict (year) do update set
  avg_daily_ptp = excluded.avg_daily_ptp,
  avg_daily_ptp_index = excluded.avg_daily_ptp_index,
  total_public_road_len = excluded.total_public_road_len,
  total_public_road_len_index = excluded.total_public_road_len_index,
  public_road_len_per_pop = excluded.public_road_len_per_pop,
  public_road_len_per_pop_index = excluded.public_road_len_per_pop_index,
  mv_per_pop = excluded.mv_per_pop,
  mv_per_pop_index = excluded.mv_per_pop_index,
  private_car_per_pop = excluded.private_car_per_pop,
  private_car_per_pop_index = excluded.private_car_per_pop_index,
  no_killed_csu_per_pop = excluded.no_killed_csu_per_pop,
  no_killed_csu_per_pop_index = excluded.no_killed_csu_per_pop_index,
  no_injured_csu_per_pop = excluded.no_injured_csu_per_pop,
  no_injured_csu_per_pop_index = excluded.no_injured_csu_per_pop_index,
  no_killed_csu_per_mv = excluded.no_killed_csu_per_mv,
  no_killed_csu_per_mv_index = excluded.no_killed_csu_per_mv_index,
  no_injured_csu_per_mv = excluded.no_injured_csu_per_mv,
  no_injured_csu_per_mv_index = excluded.no_injured_csu_per_mv_index;

-- Refresh aggregates
refresh materialized view agg_monthly_transport_mode;
refresh materialized view agg_latest_transport_mode;
refresh materialized view agg_annual_ptp;
