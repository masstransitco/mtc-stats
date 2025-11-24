# Metered Carpark API (Draft)

Endpoints are exposed under `/api/metered/*` and return JSON. They rely on the processed metered parking datasets documented in `docs/parking-data-schema.md`.

## Freshness & Limits
- Backed by materialized views refreshed by the parking cron (`app/api/cron/refresh-parking/route.ts`).
- Supabase row limits apply; endpoints cap `limit` to stay below thresholds. Include pagination where offered.
- Timestamps are ISO-8601 (UTC). Treat results as stale if `lastupdate` is older than a few minutes once live snapshots are exposed.

## Endpoints

### List Carparks
`GET /api/metered/carparks`

Query params:
- `district` (optional): exact match.
- `limit` (optional): default 50, max 200.
- `offset` (optional): default 0.

Response fields:
- `carpark_id`, `name`, `district`, `latitude`, `longitude`, `total_spaces`.

Notes: `vehicle_type` filtering is not supported yet at carpark level.

---

### Availability Recommendations (hour-of-day pattern)
`GET /api/metered/recommendations`

Query params:
- `district` (optional): filter to a district.
- `limit` (optional): default 20, max 100.

Logic: ranks carparks by hourly pattern for the current HK hour using `get_metered_carpark_hourly_data`. Fields include:
- `carpark_id`, `carpark_name`, `district`, `lat`, `lon`
- `hour`, `vacancy_rate`, `occupancy_rate`
- `stddev_vacancy_rate`, `min_vacancy_rate`, `max_vacancy_rate`, `sample_count`
- `availability_score` (currently = `vacancy_rate`)

Notes: Upgrade path is to blend live snapshots + recent trend + baseline once a live per-carpark RPC/view is available.

---

### 5-Minute Trends (last 24h)
`GET /api/metered/trends`

Query params:
- `district` (optional)
- `vehicle_type` (optional)

Response: rows from `agg_metered_5min_trend` mapped to:
- `time_bucket`, `hour_of_day`, `district`, `vehicle_type`
- `total_spaces`, `vacant_spaces`, `vacancy_rate`

---

### Busiest Districts (volatility)
`GET /api/metered/districts/busiest`

Response: rows from `agg_busiest_districts_metered` (stddev vacancy rate over last 24h), ordered descending.

---

## Future Enhancements
- Live per-carpark availability RPC (joins `latest_metered_space_occupancy` + `metered_space_info`) with `is_stale` and `sample_count`.
- Scoring function that blends live rate + last 30–60 min trend + historical baseline.
- Vehicle-type filtering on carpark listings once the schema exposes it at carpark level.

