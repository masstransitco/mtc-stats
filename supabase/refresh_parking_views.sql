-- Refresh parking materialized views
-- Run this script periodically (e.g., every 5-15 minutes) to keep parking data current
-- Usage: psql $POSTGRES_URL_NON_POOLING -f refresh_parking_views.sql

REFRESH MATERIALIZED VIEW CONCURRENTLY latest_parking_vacancy;
REFRESH MATERIALIZED VIEW agg_parking_5min_trend;
REFRESH MATERIALIZED VIEW agg_parking_hourly_pattern;
REFRESH MATERIALIZED VIEW agg_metered_5min_trend;
REFRESH MATERIALIZED VIEW agg_metered_hourly_pattern;

-- Refresh busiest analysis views
REFRESH MATERIALIZED VIEW agg_busiest_districts_parking;
REFRESH MATERIALIZED VIEW agg_busiest_districts_metered;
REFRESH MATERIALIZED VIEW agg_busiest_carparks;

-- Show refresh stats
SELECT 'All parking views refreshed at ' || NOW()::text as status;
