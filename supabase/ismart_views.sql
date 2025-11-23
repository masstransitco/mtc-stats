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
