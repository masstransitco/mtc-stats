-- ===========================================
-- BUSIEST DISTRICTS AND CARPARKS ANALYSIS
-- ===========================================

-- Busiest districts for regular carparks (based on variance in occupancy)
CREATE MATERIALIZED VIEW IF NOT EXISTS agg_busiest_districts_parking AS
SELECT
  ci.district,
  COUNT(DISTINCT pvs.park_id) as parks_count,
  AVG(pvs.vacancy)::numeric(10,2) as avg_vacancy,
  STDDEV(pvs.vacancy)::numeric(10,2) as stddev_vacancy,
  MIN(pvs.vacancy) as min_vacancy,
  MAX(pvs.vacancy) as max_vacancy,
  (MAX(pvs.vacancy) - MIN(pvs.vacancy)) as vacancy_range
FROM parking_vacancy_snapshots pvs
JOIN carpark_info ci ON ci.park_id = pvs.park_id
WHERE pvs.ingested_at >= NOW() - INTERVAL '24 hours'
  AND pvs.is_valid = true
GROUP BY ci.district
ORDER BY stddev_vacancy DESC NULLS LAST;

CREATE INDEX IF NOT EXISTS idx_busiest_districts_parking ON agg_busiest_districts_parking(stddev_vacancy DESC);

-- Busiest districts for metered carparks (based on vacancy rate variance)
CREATE MATERIALIZED VIEW IF NOT EXISTS agg_busiest_districts_metered AS
WITH metered_agg AS (
  SELECT
    mci.district,
    msos.ingested_at,
    (COUNT(*) FILTER (WHERE msos.is_vacant)::numeric / NULLIF(COUNT(*), 0) * 100) as vacancy_rate
  FROM metered_space_occupancy_snapshots msos
  JOIN metered_space_info msi ON msi.parking_space_id = msos.parking_space_id
  LEFT JOIN metered_carpark_info mci ON mci.carpark_id = msi.carpark_id
  WHERE msos.ingested_at >= NOW() - INTERVAL '24 hours'
    AND msos.is_valid = true
  GROUP BY mci.district, msos.ingested_at
)
SELECT
  district,
  COUNT(DISTINCT ingested_at) as sample_count,
  AVG(vacancy_rate)::numeric(5,2) as avg_vacancy_rate,
  STDDEV(vacancy_rate)::numeric(5,2) as stddev_vacancy_rate,
  MIN(vacancy_rate)::numeric(5,2) as min_vacancy_rate,
  MAX(vacancy_rate)::numeric(5,2) as max_vacancy_rate,
  (MAX(vacancy_rate) - MIN(vacancy_rate))::numeric(5,2) as vacancy_rate_range
FROM metered_agg
GROUP BY district
ORDER BY stddev_vacancy_rate DESC NULLS LAST;

CREATE INDEX IF NOT EXISTS idx_busiest_districts_metered ON agg_busiest_districts_metered(stddev_vacancy_rate DESC);

-- Individual carpark rankings by occupancy variance
CREATE MATERIALIZED VIEW IF NOT EXISTS agg_busiest_carparks AS
SELECT
  pvs.park_id,
  ci.name as park_name,
  ci.district,
  ci.carpark_type,
  COUNT(*) as sample_count,
  AVG(pvs.vacancy)::numeric(10,2) as avg_vacancy,
  STDDEV(pvs.vacancy)::numeric(10,2) as stddev_vacancy,
  MIN(pvs.vacancy) as min_vacancy,
  MAX(pvs.vacancy) as max_vacancy,
  (MAX(pvs.vacancy) - MIN(pvs.vacancy)) as vacancy_range
FROM parking_vacancy_snapshots pvs
JOIN carpark_info ci ON ci.park_id = pvs.park_id
WHERE pvs.ingested_at >= NOW() - INTERVAL '24 hours'
  AND pvs.is_valid = true
GROUP BY pvs.park_id, ci.name, ci.district, ci.carpark_type
ORDER BY stddev_vacancy DESC NULLS LAST
LIMIT 100;

CREATE INDEX IF NOT EXISTS idx_busiest_carparks ON agg_busiest_carparks(stddev_vacancy DESC);

-- Refresh all views
REFRESH MATERIALIZED VIEW agg_busiest_districts_parking;
REFRESH MATERIALIZED VIEW agg_busiest_districts_metered;
REFRESH MATERIALIZED VIEW agg_busiest_carparks;

SELECT 'Busiest districts and carparks views created successfully!' as status;
