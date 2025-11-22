-- Core extensions
create extension if not exists "pgcrypto";

-- Enums
create type control_point_type as enum ('AIRPORT','RAIL','LAND_ROAD','BRIDGE','FERRY','OTHER');
create type control_point_status as enum ('ACTIVE','CLOSED');
create type direction as enum ('ARRIVAL','DEPARTURE');
create type residency_group as enum ('HK_RESIDENT','MAINLAND_VISITOR','OTHER_VISITOR','ALL');

-- Dimension: control points
create table if not exists dim_control_point (
  control_point_id uuid primary key default gen_random_uuid(),
  name_en text not null unique,
  name_zh text,
  type control_point_type not null,
  corridor text not null,
  district text,
  opened_date date,
  status control_point_status not null default 'ACTIVE',
  status_effective_from date default current_date,
  status_effective_to date
);
create index if not exists idx_dim_control_point_corridor on dim_control_point (corridor);
create index if not exists idx_dim_control_point_type on dim_control_point (type);

-- Dimension: dates
create table if not exists dim_date (
  date date primary key,
  year int not null,
  month int not null,
  day int not null,
  year_month int not null, -- YYYYMM
  day_of_week int not null, -- 1=Mon
  is_weekend boolean not null,
  is_public_holiday boolean not null default false,
  holiday_period text not null default 'NONE',
  pandemic_phase text not null default 'FULL'
);

-- Fact: daily passengers
create table if not exists fact_daily_passengers (
  id bigserial primary key,
  date date not null references dim_date(date),
  control_point_id uuid not null references dim_control_point(control_point_id),
  direction direction not null,
  residency_group residency_group not null,
  passengers integer not null default 0,
  unique (date, control_point_id, direction, residency_group)
);
create index if not exists idx_fact_date on fact_daily_passengers (date);
create index if not exists idx_fact_cp_date on fact_daily_passengers (control_point_id, date);
create index if not exists idx_fact_dir_date on fact_daily_passengers (direction, date);
create index if not exists idx_fact_res_date on fact_daily_passengers (residency_group, date);
create index if not exists idx_fact_cp_dir_res_date on fact_daily_passengers (control_point_id, direction, residency_group, date);

-- Staging: mirrors raw CSV
create table if not exists staging_raw_passengers (
  id bigserial primary key,
  source_file text,
  raw_row_hash text,
  date date not null,
  control_point_name text not null,
  arrivals_total integer,
  departures_total integer,
  arrivals_hk_resident integer,
  arrivals_mainland_visitor integer,
  arrivals_other_visitor integer,
  departures_hk_resident integer,
  departures_mainland_visitor integer,
  departures_other_visitor integer,
  inserted_at timestamptz default now(),
  unique (date, control_point_name, raw_row_hash)
);

-- Materialized view: monthly by corridor
create materialized view if not exists agg_monthly_corridor as
with base as (
  select
    dd.year_month,
    cp.corridor,
    sum(fd.passengers) filter (where fd.residency_group = 'ALL') as total_passengers,
    sum(fd.passengers) filter (where fd.direction = 'ARRIVAL' and fd.residency_group = 'ALL') as total_arrivals,
    sum(fd.passengers) filter (where fd.direction = 'DEPARTURE' and fd.residency_group = 'ALL') as total_departures,
    sum(fd.passengers) filter (where fd.residency_group = 'HK_RESIDENT') as hk_residents,
    sum(fd.passengers) filter (where fd.residency_group = 'MAINLAND_VISITOR') as mainland_visitors,
    sum(fd.passengers) filter (where fd.residency_group = 'OTHER_VISITOR') as other_visitors
  from fact_daily_passengers fd
  join dim_date dd on dd.date = fd.date
  join dim_control_point cp on cp.control_point_id = fd.control_point_id
  where fd.direction in ('ARRIVAL','DEPARTURE')
  group by 1,2
)
select
  year_month,
  corridor,
  total_passengers,
  total_arrivals,
  total_departures,
  hk_residents,
  mainland_visitors,
  other_visitors,
  hk_residents::numeric / nullif(total_passengers, 0) as hk_share,
  mainland_visitors::numeric / nullif(total_passengers, 0) as mainland_share,
  other_visitors::numeric / nullif(total_passengers, 0) as visitor_share,
  (total_passengers - lag(total_passengers, 12) over (partition by corridor order by year_month))
    / nullif(lag(total_passengers, 12) over (partition by corridor order by year_month), 0)::numeric as yoy_growth
from base;
create index if not exists idx_agg_monthly_corridor on agg_monthly_corridor (year_month, corridor);

-- Materialized view: daily headline
create materialized view if not exists agg_daily_headline as
with daily_totals as (
  select
    fd.date,
    sum(passengers) filter (where residency_group = 'ALL') as total_passengers,
    sum(passengers) filter (where direction = 'ARRIVAL' and residency_group = 'ALL') as total_arrivals,
    sum(passengers) filter (where direction = 'DEPARTURE' and residency_group = 'ALL') as total_departures,
    sum(passengers) filter (where residency_group = 'HK_RESIDENT') as hk_residents,
    sum(passengers) filter (where residency_group = 'MAINLAND_VISITOR') as mainland_visitors,
    sum(passengers) filter (where residency_group = 'OTHER_VISITOR') as other_visitors
  from fact_daily_passengers fd
  where fd.direction in ('ARRIVAL','DEPARTURE')
  group by fd.date
),
top_cp as (
  select date, control_point_id, pax
  from (
    select
      fd.date,
      fd.control_point_id,
      sum(fd.passengers) filter (where fd.residency_group = 'ALL') as pax,
      row_number() over (partition by fd.date order by sum(fd.passengers) filter (where fd.residency_group = 'ALL') desc) as rn
    from fact_daily_passengers fd
    where fd.direction in ('ARRIVAL','DEPARTURE')
    group by fd.date, fd.control_point_id
  ) ranked
  where rn = 1
),
joined as (
  select
    dt.date,
    dt.total_passengers,
    dt.total_arrivals,
    dt.total_departures,
    dt.hk_residents,
    dt.mainland_visitors,
    dt.other_visitors,
    tc.control_point_id as top_control_point_id,
    cp.name_en as top_control_point_name,
    tc.pax::numeric / nullif(dt.total_passengers, 0) as top_control_point_share,
    dd.is_public_holiday,
    dd.holiday_period
  from daily_totals dt
  left join top_cp tc on tc.date = dt.date
  left join dim_control_point cp on cp.control_point_id = tc.control_point_id
  join dim_date dd on dd.date = dt.date
)
select
  j.*,
  avg(j.total_passengers) over (order by j.date rows between 6 preceding and current row) as rolling_7d_avg,
  avg(j.total_passengers) over (order by j.date rows between 27 preceding and current row) as rolling_28d_avg,
  (j.total_passengers - avg(j.total_passengers) over (order by j.date rows between 27 preceding and current row))
    / nullif(stddev_pop(j.total_passengers) over (order by j.date rows between 27 preceding and current row), 0) as z_score_vs_28d
from joined j;
create index if not exists idx_agg_daily_headline_date on agg_daily_headline (date);

-- Materialized view: corridor patterns
create materialized view if not exists agg_pattern_corridor as
with daily as (
  select
    cp.corridor,
    dd.date,
    case
      when dd.is_public_holiday then dd.holiday_period
      when dd.is_weekend then 'WEEKEND'
      else 'WEEKDAY'
    end as pattern_type,
    sum(fd.passengers) filter (where fd.residency_group = 'ALL') as total_pax,
    sum(fd.passengers) filter (where fd.residency_group = 'HK_RESIDENT') as hk_pax,
    sum(fd.passengers) filter (where fd.residency_group = 'MAINLAND_VISITOR') as mainland_pax,
    sum(fd.passengers) filter (where fd.residency_group = 'OTHER_VISITOR') as other_pax
  from fact_daily_passengers fd
  join dim_control_point cp on cp.control_point_id = fd.control_point_id
  join dim_date dd on dd.date = fd.date
  where fd.direction in ('ARRIVAL','DEPARTURE')
  group by cp.corridor, dd.date, pattern_type
),
agg as (
  select
    corridor,
    pattern_type,
    avg(total_pax) as avg_passengers,
    stddev_pop(total_pax) as std_dev_passengers,
    avg(hk_pax)::numeric / nullif(avg(total_pax), 0) as hk_share,
    avg(mainland_pax)::numeric / nullif(avg(total_pax), 0) as mainland_share,
    avg(other_pax)::numeric / nullif(avg(total_pax), 0) as other_share
  from daily
  group by corridor, pattern_type
)
select
  a.*,
  case when a.pattern_type = 'WEEKEND' then a.avg_passengers / nullif(wd.avg_passengers, 0) end as weekend_index,
  case when a.pattern_type not in ('WEEKDAY','WEEKEND') then a.avg_passengers / nullif(wd.avg_passengers, 0) end as holiday_uplift
from agg a
left join agg wd on wd.corridor = a.corridor and wd.pattern_type = 'WEEKDAY';
create index if not exists idx_agg_pattern_corridor on agg_pattern_corridor (corridor, pattern_type);

-- Example dim_date population (adjust date range as needed)
-- insert into dim_date (date, year, month, day, year_month, day_of_week, is_weekend, is_public_holiday, holiday_period, pandemic_phase)
-- select
--   d::date,
--   extract(year from d)::int,
--   extract(month from d)::int,
--   extract(day from d)::int,
--   (extract(year from d)::int * 100 + extract(month from d)::int),
--   extract(isodow from d)::int,
--   extract(isodow from d)::int in (6,7),
--   false,
--   'NONE',
--   case when d < '2023-01-08' then 'PARTIAL' else 'FULL' end
-- from generate_series('2021-01-01', '2026-12-31', interval '1 day') d
-- on conflict (date) do nothing;

-- Transport datasets: monthly patronage and annual indicators
create table if not exists dim_transport_mode (
  mode text primary key,
  description text
);

create table if not exists fact_monthly_transport (
  id bigserial primary key,
  year_month int not null, -- YYYYMM
  mode text not null references dim_transport_mode(mode),
  operator_code text,
  rail_line text,
  avg_daily_pax numeric,
  avg_daily_pax_index numeric,
  unique (year_month, mode, operator_code, rail_line)
);
create index if not exists idx_fact_monthly_transport_ym on fact_monthly_transport (year_month);
create index if not exists idx_fact_monthly_transport_mode on fact_monthly_transport (mode, year_month);

create table if not exists fact_annual_transport_indicators (
  year int primary key,
  avg_daily_ptp numeric,
  avg_daily_ptp_index numeric,
  total_public_road_len numeric,
  total_public_road_len_index numeric,
  public_road_len_per_pop numeric,
  public_road_len_per_pop_index numeric,
  mv_per_pop numeric,
  mv_per_pop_index numeric,
  private_car_per_pop numeric,
  private_car_per_pop_index numeric,
  no_killed_csu_per_pop numeric,
  no_killed_csu_per_pop_index numeric,
  no_injured_csu_per_pop numeric,
  no_injured_csu_per_pop_index numeric,
  no_killed_csu_per_mv numeric,
  no_killed_csu_per_mv_index numeric,
  no_injured_csu_per_mv numeric,
  no_injured_csu_per_mv_index numeric
);

create materialized view if not exists agg_monthly_transport_mode as
select
  year_month,
  mode,
  sum(avg_daily_pax) as avg_daily_pax
from fact_monthly_transport
group by year_month, mode;
create index if not exists idx_agg_monthly_transport_mode on agg_monthly_transport_mode (year_month, mode);

create materialized view if not exists agg_latest_transport_mode as
with latest as (
  select max(year_month) as max_ym from fact_monthly_transport
)
select fmt.*
from fact_monthly_transport fmt
join latest l on fmt.year_month = l.max_ym;
create index if not exists idx_agg_latest_transport_mode on agg_latest_transport_mode (mode, operator_code);

create materialized view if not exists agg_annual_ptp as
select
  year,
  avg_daily_ptp,
  lag(avg_daily_ptp) over (order by year) as prev_year_ptp,
  (avg_daily_ptp - lag(avg_daily_ptp) over (order by year)) / nullif(lag(avg_daily_ptp) over (order by year), 0) as yoy_growth
from fact_annual_transport_indicators;
create index if not exists idx_agg_annual_ptp on agg_annual_ptp (year);

-- Parking materialized views
-- This materialized view caches the latest parking vacancy snapshot for each park/vehicle type
-- IMPORTANT: Must be refreshed periodically to stay current (e.g., every 5-15 minutes via cron)
create materialized view if not exists latest_parking_vacancy as
select distinct on (park_id, vehicle_type)
  id,
  park_id,
  vehicle_type,
  vacancy_type,
  vacancy,
  vacancy_dis,
  vacancy_ev,
  vacancy_unl,
  category,
  lastupdate,
  ingested_at,
  is_valid,
  lastupdate < (now() - '02:00:00'::interval) as is_stale,
  created_at
from parking_vacancy_snapshots
order by park_id, vehicle_type, ingested_at desc;

-- Indexes on materialized view for fast querying
create index if not exists idx_latest_parking_vacancy_park on latest_parking_vacancy(park_id);
create index if not exists idx_latest_parking_vacancy_lastupdate on latest_parking_vacancy(lastupdate desc);
create index if not exists idx_latest_metered_space_occupancy_space on latest_metered_space_occupancy(parking_space_id);
create index if not exists idx_metered_space_info_space on metered_space_info(parking_space_id);
create or replace view vw_parking_availability as
select
  coalesce(ci.district, 'UNKNOWN') as district,
  lpv.vehicle_type,
  count(distinct lpv.park_id) as parks,
  sum(coalesce(lpv.vacancy, 0)) as vacant_spaces,
  sum(coalesce(lpv.vacancy_dis, 0)) as vacant_disabled,
  sum(coalesce(lpv.vacancy_ev, 0)) as vacant_ev,
  sum(coalesce(lpv.vacancy_unl, 0)) as vacant_unloading
from latest_parking_vacancy lpv
left join carpark_info ci on ci.park_id = lpv.park_id
group by district, lpv.vehicle_type;

create or replace view vw_parking_latest as
select
  lpv.park_id,
  ci.name,
  ci.district,
  lpv.vehicle_type,
  lpv.vacancy,
  lpv.vacancy_dis,
  lpv.vacancy_ev,
  lpv.vacancy_unl,
  lpv.lastupdate
from latest_parking_vacancy lpv
left join carpark_info ci on ci.park_id = lpv.park_id;

create or replace view vw_metered_availability as
select
  coalesce(mci.district, 'UNKNOWN') as district,
  msi.vehicle_type,
  count(*) as tracked_spaces,
  count(*) filter (where lmo.is_vacant) as vacant_spaces,
  count(*) filter (where not lmo.is_vacant) as occupied_spaces
from latest_metered_space_occupancy lmo
join metered_space_info msi on msi.parking_space_id = lmo.parking_space_id
left join metered_carpark_info mci on mci.carpark_id = msi.carpark_id
group by district, msi.vehicle_type;
