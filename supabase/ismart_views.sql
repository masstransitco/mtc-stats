-- iSmart / MG telemetry helper views
-- Thresholds chosen for HK urban context:
--   - Idle dwell duration >= 5 minutes (300s)
--   - Idle dwell radius <= 60m to filter pass-throughs and GPS jitter
--   - District snap radius <= 300m using existing carpark points

-- Vehicle state segments (moving / idle / charging) with durations
create materialized view if not exists vehicle_state_segments_mv as
with base as (
  select
    vin,
    ts,
    lat,
    lon,
    case
      when charging_state in ('Charging', 'Complete') or charge_power_kw > 0.5 then 'charging'
      when speed > 1 then 'moving'
      when coalesce(hv_battery_active, false) then 'ignition_on_idle'
      else 'ignition_off_idle'
    end as state
  from vehicle_telemetry
  where lat between -90 and 90
    and lon between -180 and 180
),
seg_pre as (
  select
    *,
    lag(state) over (partition by vin order by ts) as prev_state
  from base
),
seg as (
  select
    *,
    sum(case when state = prev_state then 0 else 1 end)
      over (partition by vin order by ts) as grp
  from seg_pre
)
select
  vin,
  state,
  min(ts) as start_ts,
  max(ts) as end_ts,
  extract(epoch from max(ts) - min(ts)) as duration_sec,
  avg(lat) as avg_lat,
  avg(lon) as avg_lon
from seg
group by vin, state, grp;

create index if not exists vehicle_state_segments_mv_vin_start_idx
  on vehicle_state_segments_mv (vin, start_ts);

-- Idle dwell events (stationary periods) with radius filter
create materialized view if not exists vehicle_dwell_events_mv as
with pts as (
  select
    vin,
    ts,
    speed,
    st_setsrid(st_makepoint(lon, lat), 4326) as g_geom
  from vehicle_telemetry
  where lat between -90 and 90
    and lon between -180 and 180
),
runs as (
  select
    *,
    sum(case when speed <= 1 then 0 else 1 end) over (partition by vin order by ts) as grp
  from pts
),
agg as (
  select
    vin,
    grp,
    min(ts) as start_ts,
    max(ts) as end_ts,
    extract(epoch from max(ts) - min(ts)) as duration_sec,
    st_centroid(st_collect(g_geom)) as center_geom
  from runs
  where speed <= 1
  group by vin, grp
),
dwells as (
  select
    a.vin,
    a.start_ts,
    a.end_ts,
    a.duration_sec,
    a.center_geom,
    a.center_geom::geography as center,
    (
      select max(st_distance(r.g_geom::geography, a.center_geom::geography))
      from runs r
      where r.vin = a.vin and r.grp = a.grp and r.speed <= 1
    ) as radius_m
  from agg a
)
select *
from dwells
where duration_sec >= 300
  and radius_m <= 60;

create index if not exists vehicle_dwell_events_mv_vin_start_idx
  on vehicle_dwell_events_mv (vin, start_ts);

-- Map dwells to nearest known parking/district points (consistent with /parking)
create materialized view if not exists vehicle_dwell_districts_mv as
with poi as (
  select district, latitude, longitude from carpark_info
  union all
  select district, latitude, longitude from metered_carpark_info
),
dw as (
  select *
  from vehicle_dwell_events_mv
)
select
  dw.vin,
  dw.start_ts,
  dw.end_ts,
  dw.duration_sec,
  dw.center,
  dw.radius_m,
  p.district,
  st_distance(
    dw.center,
    st_setsrid(st_makepoint(p.longitude, p.latitude), 4326)::geography
  ) as dist_m
from dw
cross join lateral (
  select *
  from poi
  where latitude is not null and longitude is not null
  order by st_distance(
    dw.center,
    st_setsrid(st_makepoint(poi.longitude, poi.latitude), 4326)::geography
  )
  limit 1
) as p
where st_distance(
    dw.center,
    st_setsrid(st_makepoint(p.longitude, p.latitude), 4326)::geography
  ) <= 300;

create index if not exists vehicle_dwell_districts_mv_vin_start_idx
  on vehicle_dwell_districts_mv (vin, start_ts);

-- Helper RPC: carpark volatility points with coordinates for mapping
create or replace function get_carpark_volatility_points(p_limit int default 200)
returns table (
  park_id text,
  park_name text,
  district text,
  carpark_type text,
  lat numeric,
  lon numeric,
  stddev_vacancy numeric,
  avg_vacancy numeric,
  min_vacancy numeric,
  max_vacancy numeric
) language sql stable as $$
  select
    a.park_id,
    a.park_name,
    a.district,
    a.carpark_type,
    c.latitude as lat,
    c.longitude as lon,
    a.stddev_vacancy,
    a.avg_vacancy,
    a.min_vacancy,
    a.max_vacancy
  from agg_busiest_carparks a
  join carpark_info c on a.park_id = c.park_id
  where c.latitude is not null and c.longitude is not null
  order by a.stddev_vacancy desc
  limit p_limit;
$$;

-- Metered carpark volatility points (if agg_busiest_metered exists)
do $$
begin
  if exists (select 1 from information_schema.tables where table_name = 'agg_busiest_metered') then
    execute '
      create or replace function get_metered_volatility_points(p_limit int default 300)
      returns table (
        carpark_id text,
        name text,
        district text,
        lat numeric,
        lon numeric,
        stddev_vacancy_rate numeric,
        avg_vacancy_rate numeric,
        min_vacancy_rate numeric,
        max_vacancy_rate numeric
      ) language sql stable as $func$
        select
          a.carpark_id,
          a.name,
          a.district,
          m.latitude as lat,
          m.longitude as lon,
          a.stddev_vacancy_rate,
          a.avg_vacancy_rate,
          a.min_vacancy_rate,
          a.max_vacancy_rate
        from agg_busiest_metered a
        join metered_carpark_info m on a.carpark_id = m.carpark_id
        where m.latitude is not null and m.longitude is not null
        order by a.stddev_vacancy_rate desc
        limit p_limit;
      $func$;
    ';
  end if;
end $$;

-- District-level carpark volatility (regular + metered if present)
do $$
begin
  perform 1 from information_schema.tables where table_name = 'agg_busiest_metered';
  if found then
    execute '
      create or replace function get_district_parking_heat()
      returns table (
        district text,
        lat numeric,
        lon numeric,
        weight numeric,
        sample_count int
      ) language sql stable as $func$
      with regs as (
        select c.district, c.latitude, c.longitude, b.stddev_vacancy as weight
        from agg_busiest_carparks b
        join carpark_info c on b.park_id = c.park_id
        where c.latitude is not null and c.longitude is not null
      ),
      metered as (
        select m.district, m.latitude, m.longitude, a.stddev_vacancy_rate as weight
        from agg_busiest_metered a
        join metered_carpark_info m on a.carpark_id = m.carpark_id
        where m.latitude is not null and m.longitude is not null
      ),
      all_pts as (
        select * from regs
        union all
        select * from metered
      ),
      agg as (
        select
          district,
          avg(latitude) as lat,
          avg(longitude) as lon,
          sum(weight) as weight,
          count(*) as sample_count
        from all_pts
        group by district
      )
      select * from agg;
      $func$;
    ';
  else
    execute '
      create or replace function get_district_parking_heat()
      returns table (
        district text,
        lat numeric,
        lon numeric,
        weight numeric,
        sample_count int
      ) language sql stable as $func$
      with regs as (
        select c.district, c.latitude, c.longitude, b.stddev_vacancy as weight
        from agg_busiest_carparks b
        join carpark_info c on b.park_id = c.park_id
        where c.latitude is not null and c.longitude is not null
      ),
      agg as (
        select
          district,
          avg(latitude) as lat,
          avg(longitude) as lon,
          sum(weight) as weight,
          count(*) as sample_count
        from regs
        group by district
      )
      select * from agg;
      $func$;
    ';
  end if;
end $$;

-- Fleet movement hex binning (last N days, hex size in meters)
create or replace function get_fleet_hex_heat(p_days int default 1, p_hex_size float default 150.0)
returns table (
  hex geometry,
  weight numeric
) language plpgsql stable as $$
declare
  gsize float := p_hex_size;
begin
  return query
  with pts as (
    select
      st_transform(st_setsrid(st_makepoint(lon, lat), 4326), 3857) as g
    from vehicle_telemetry
    where ts >= now() - (p_days || ' days')::interval
      and lat between -90 and 90
      and lon between -180 and 180
  ),
  hexes as (
    select st_hexagon(g, gsize) as hex
    from pts
  ),
  agg as (
    select hex, count(*)::numeric as weight
    from hexes
    group by hex
  )
  select st_transform(hex, 4326) as hex, weight from agg;
end;
$$;
