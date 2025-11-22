-- Load CSV into staging (use psql or Supabase import)
-- Example:
-- copy staging_raw_passengers (
--   date,
--   control_point_name,
--   arrivals_total,
--   departures_total,
--   arrivals_hk_resident,
--   arrivals_mainland_visitor,
--   arrivals_other_visitor,
--   departures_hk_resident,
--   departures_mainland_visitor,
--   departures_other_visitor
-- ) from '/path/to/statistics_on_daily_passenger_traffic.csv' csv header;

-- Ensure control points exist (default type/corridor can be refined with a mapping table)
insert into dim_control_point (name_en, type, corridor)
select distinct srp.control_point_name, 'OTHER', srp.control_point_name
from staging_raw_passengers srp
on conflict (name_en) do nothing;

-- Upsert fact rows (unpivot arrivals/departures x residency)
with mapped as (
  select
    srp.date,
    cp.control_point_id,
    v.direction::direction,
    v.residency_group::residency_group,
    coalesce(v.passengers, 0) as passengers
  from staging_raw_passengers srp
  join dim_control_point cp on cp.name_en = srp.control_point_name
  cross join lateral (values
    ('ARRIVAL','HK_RESIDENT', srp.arrivals_hk_resident),
    ('ARRIVAL','MAINLAND_VISITOR', srp.arrivals_mainland_visitor),
    ('ARRIVAL','OTHER_VISITOR', srp.arrivals_other_visitor),
    ('ARRIVAL','ALL', srp.arrivals_total),
    ('DEPARTURE','HK_RESIDENT', srp.departures_hk_resident),
    ('DEPARTURE','MAINLAND_VISITOR', srp.departures_mainland_visitor),
    ('DEPARTURE','OTHER_VISITOR', srp.departures_other_visitor),
    ('DEPARTURE','ALL', srp.departures_total)
  ) as v(direction, residency_group, passengers)
)
insert into fact_daily_passengers (date, control_point_id, direction, residency_group, passengers)
select date, control_point_id, direction, residency_group, passengers
from mapped
on conflict (date, control_point_id, direction, residency_group)
do update set passengers = excluded.passengers;

-- Refresh materialized views
refresh materialized view concurrently agg_monthly_corridor;
refresh materialized view concurrently agg_daily_headline;
refresh materialized view concurrently agg_pattern_corridor;
