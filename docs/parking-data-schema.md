# Parking Data Schema Documentation

This document provides comprehensive documentation for the parking data collection and processing system used in the MTC Stats project.

## Table of Contents

1. [Overview](#overview)
2. [Data Sources](#data-sources)
3. [Raw Data Tables](#raw-data-tables)
4. [Aggregation Views](#aggregation-views)
5. [Helper Functions](#helper-functions)
6. [Data Pipeline](#data-pipeline)
7. [Frontend Integration](#frontend-integration)
8. [Maintenance](#maintenance)

---

## Overview

The parking data system tracks two distinct types of parking facilities in Hong Kong:

1. **Regular Carparks** - Traditional parking lots and buildings that report aggregate vacancy counts
2. **Metered Parking Spaces** - Individual on-street parking spaces with real-time occupancy tracking

### Current Scale

| Entity | Count |
|--------|-------|
| Regular Carparks | 509 facilities across 21 districts |
| Metered Parking Spaces | 17,229 spaces across 649 carparks in 18 districts |
| Daily Snapshot Volume | ~185K regular carpark snapshots, ~5.9M metered space snapshots |

---

## Data Sources

Data is collected from Hong Kong government open data APIs:

- **Regular Carparks**: Real-time vacancy information updated every few minutes
- **Metered Parking**: Individual space occupancy status updated in real-time

All data is timestamped with `ingested_at` to track when snapshots were captured.

---

## Raw Data Tables

### 1. `carpark_info`

Static information about regular carparks.

| Column | Type | Description |
|--------|------|-------------|
| `park_id` | VARCHAR | Unique carpark identifier (Primary Key) |
| `name` | TEXT | Carpark name |
| `display_address` | TEXT | Full address |
| `latitude` | NUMERIC | Geographic latitude |
| `longitude` | NUMERIC | Geographic longitude |
| `district` | TEXT | Hong Kong district (e.g., "Central and Western", "Wan Chai") |
| `nature` | VARCHAR | Ownership type (e.g., "Government", "Private") |
| `carpark_type` | VARCHAR | Type classification |
| `opening_status` | VARCHAR | Current operational status |
| `contact_no` | TEXT | Contact telephone number |
| `website` | TEXT | Website URL |
| `created_at` | TIMESTAMPTZ | Record creation timestamp |
| `updated_at` | TIMESTAMPTZ | Record last update timestamp |

**Purpose**: Provides static metadata for joining with vacancy snapshots.

---

### 2. `parking_vacancy_snapshots`

Real-time vacancy snapshots for regular carparks.

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGINT | Auto-incrementing primary key |
| `park_id` | VARCHAR | Foreign key to `carpark_info` |
| `vehicle_type` | VARCHAR | Vehicle type (e.g., "privateCar", "LGV", "HGV", "coach", "motorCycle") |
| `vacancy_type` | CHAR | Vacancy type indicator |
| `vacancy` | INTEGER | Number of vacant spaces |
| `vacancy_dis` | INTEGER | Vacant spaces for disabled |
| `vacancy_ev` | INTEGER | Vacant EV charging spaces |
| `vacancy_unl` | INTEGER | Unlabeled vacant spaces |
| `category` | VARCHAR | Carpark category |
| `lastupdate` | TIMESTAMP | Source data timestamp |
| `ingested_at` | TIMESTAMPTZ | When this snapshot was captured |
| `created_at` | TIMESTAMPTZ | Record creation timestamp |
| `is_valid` | BOOLEAN | Data quality flag |

**Purpose**: Time-series data for analyzing parking availability patterns.

**Typical Volume**: ~185,000 rows per 24-hour period.

---

### 3. `metered_carpark_info`

Static information about metered parking locations.

| Column | Type | Description |
|--------|------|-------------|
| `carpark_id` | VARCHAR | Unique carpark identifier (Primary Key) |
| `name` | VARCHAR | Carpark name (English) |
| `name_tc` | VARCHAR | Carpark name (Traditional Chinese) |
| `name_sc` | VARCHAR | Carpark name (Simplified Chinese) |
| `region` | VARCHAR | Geographic region (English) |
| `region_tc` | VARCHAR | Geographic region (Traditional Chinese) |
| `region_sc` | VARCHAR | Geographic region (Simplified Chinese) |
| `district` | VARCHAR | District name (English) |
| `district_tc` | VARCHAR | District name (Traditional Chinese) |
| `district_sc` | VARCHAR | District name (Simplified Chinese) |
| `sub_district` | VARCHAR | Sub-district (English) |
| `sub_district_tc` | VARCHAR | Sub-district (Traditional Chinese) |
| `sub_district_sc` | VARCHAR | Sub-district (Simplified Chinese) |
| `street` | VARCHAR | Street name (English) |
| `street_tc` | VARCHAR | Street name (Traditional Chinese) |
| `street_sc` | VARCHAR | Street name (Simplified Chinese) |
| `section_of_street` | VARCHAR | Street section (English) |
| `section_of_street_tc` | VARCHAR | Street section (Traditional Chinese) |
| `section_of_street_sc` | VARCHAR | Street section (Simplified Chinese) |
| `latitude` | NUMERIC | Geographic latitude |
| `longitude` | NUMERIC | Geographic longitude |
| `total_spaces` | INTEGER | Total parking spaces |
| `created_at` | TIMESTAMP | Record creation timestamp |
| `updated_at` | TIMESTAMP | Record last update timestamp |

**Purpose**: Metadata for metered parking carparks with multi-language support.

---

### 4. `metered_space_info`

Static information about individual metered parking spaces.

| Column | Type | Description |
|--------|------|-------------|
| `parking_space_id` | VARCHAR | Unique space identifier (Primary Key) |
| `carpark_id` | VARCHAR | Foreign key to `metered_carpark_info` |
| `pole_id` | INTEGER | Physical meter pole identifier |
| `latitude` | NUMERIC | Geographic latitude |
| `longitude` | NUMERIC | Geographic longitude |
| `vehicle_type` | CHAR | Vehicle type code |
| `longest_parking_period` | INTEGER | Maximum parking duration (minutes) |
| `operating_period` | VARCHAR | Operating hours |
| `time_unit` | INTEGER | Billing time unit |
| `payment_unit` | NUMERIC | Payment amount per time unit |
| `has_real_time_tracking` | BOOLEAN | Whether space has real-time tracking |
| `created_at` | TIMESTAMP | Record creation timestamp |

**Purpose**: Individual space metadata for granular occupancy analysis.

---

### 5. `metered_space_occupancy_snapshots`

Real-time occupancy snapshots for individual metered spaces.

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGINT | Auto-incrementing primary key |
| `parking_space_id` | VARCHAR | Foreign key to `metered_space_info` |
| `meter_status` | VARCHAR | Meter operational status |
| `occupancy_status` | VARCHAR | Raw occupancy status from source |
| `occupancy_date_changed` | TIMESTAMP | When occupancy last changed |
| `ingested_at` | TIMESTAMP | When this snapshot was captured |
| `is_valid` | BOOLEAN | Data quality flag |
| `is_vacant` | BOOLEAN | Computed boolean: true if space is vacant |

**Purpose**: High-frequency time-series data for detailed occupancy analysis.

**Typical Volume**: ~5.9 million rows per 24-hour period.

---

## Aggregation Views

To enable efficient querying and pattern analysis, the system uses materialized views that pre-aggregate raw snapshot data.

### Regular Carpark Views

#### `agg_parking_5min_trend`

5-minute interval aggregations for the last 24 hours.

**Created by**: `getParking5MinTrend()` in `lib/db.ts`

| Column | Type | Description |
|--------|------|-------------|
| `time_bucket` | TIMESTAMP | 5-minute interval start time |
| `hour_of_day` | INTEGER | Hour (0-23) |
| `district` | TEXT | Hong Kong district |
| `carpark_type` | VARCHAR | Carpark type |
| `vehicle_type` | VARCHAR | Vehicle type |
| `parks_count` | BIGINT | Number of unique carparks |
| `min_vacancy` | INTEGER | Minimum vacancy in interval |
| `avg_vacancy` | NUMERIC(10,2) | Average vacancy in interval |
| `max_vacancy` | INTEGER | Maximum vacancy in interval |
| `median_vacancy` | NUMERIC | Median vacancy in interval |

**Purpose**: Displays recent trends with 5-minute granularity on the `/parking` page.

**Refresh**: Covers last 24 hours, should be refreshed every 5-15 minutes.

---

#### `agg_parking_hourly_pattern`

Hourly patterns aggregated over the last 7 days.

**Created by**: Multiple background processes (see schema files)

| Column | Type | Description |
|--------|------|-------------|
| `hour_of_day` | INTEGER | Hour (0-23) |
| `day_of_week` | INTEGER | Day of week (0=Sunday, 6=Saturday) |
| `district` | TEXT | Hong Kong district |
| `carpark_type` | VARCHAR | Carpark type |
| `vehicle_type` | VARCHAR | Vehicle type |
| `sample_count` | BIGINT | Number of snapshots aggregated |
| `parks_count` | BIGINT | Number of unique carparks |
| `days_count` | BIGINT | Number of days aggregated |
| `min_vacancy` | INTEGER | Minimum vacancy observed |
| `avg_vacancy` | NUMERIC(10,2) | Average vacancy |
| `max_vacancy` | INTEGER | Maximum vacancy observed |
| `stddev_vacancy` | NUMERIC(10,2) | Standard deviation of vacancy |

**Purpose**: Reveals time-of-day patterns for identifying peak/off-peak hours.

**Key Insight**: Groups by `hour_of_day`, `day_of_week`, `district`, `carpark_type`, and `vehicle_type`, creating thousands of rows. This is why we use the RPC function (see below) to aggregate further before returning to the client.

**Indexes**:
- `idx_agg_parking_hourly_hour` on `hour_of_day`
- `idx_agg_parking_hourly_dow` on `day_of_week`
- `idx_agg_parking_hourly_district` on `district`

---

### Metered Parking Views

#### `agg_metered_5min_trend`

5-minute occupancy patterns for the last 24 hours.

**Created by**: `getMetered5MinTrend()` in `lib/db.ts`

| Column | Type | Description |
|--------|------|-------------|
| `time_bucket` | TIMESTAMP | 5-minute interval start time |
| `hour_of_day` | INTEGER | Hour (0-23) |
| `district` | TEXT | District (or 'UNKNOWN') |
| `vehicle_type` | VARCHAR | Vehicle type |
| `total_spaces` | BIGINT | Number of unique spaces |
| `vacant_count` | BIGINT | Number of vacant spaces |
| `vacancy_rate` | NUMERIC(5,2) | Percentage of spaces vacant |

**Purpose**: Short-term occupancy trends for metered spaces.

**Index**: `idx_metered_5min_time` on `time_bucket DESC`

---

#### `agg_metered_hourly_pattern`

Hourly occupancy patterns over the last 7 days.

**Created by**: `getMeteredHourlyPattern()` in `lib/db.ts`

| Column | Type | Description |
|--------|------|-------------|
| `hour_of_day` | INTEGER | Hour (0-23) |
| `district` | TEXT | District (or 'UNKNOWN') |
| `vehicle_type` | VARCHAR | Vehicle type |
| `total_spaces` | BIGINT | Number of unique spaces |
| `avg_vacancy_rate` | NUMERIC(5,2) | Average vacancy rate (%) |
| `min_vacancy_rate` | NUMERIC(5,2) | Minimum vacancy rate (%) |
| `max_vacancy_rate` | NUMERIC(5,2) | Maximum vacancy rate (%) |

**Purpose**: Long-term hourly patterns for metered parking.

**Index**: `idx_metered_hourly_hour` on `hour_of_day`

---

### Busiest Locations Views

#### `agg_busiest_districts_parking`

Districts ranked by parking activity (regular carparks).

**Created by**: `getBusiestDistrictsParking()` in `lib/db.ts`

| Column | Description |
|--------|-------------|
| `district` | District name |
| `stddev_vacancy` | Standard deviation of vacancy (higher = more activity) |

**Purpose**: Identifies districts with highest parking demand variability.

**Default Sort**: `stddev_vacancy DESC`

---

#### `agg_busiest_districts_metered`

Districts ranked by metered parking activity.

**Created by**: `getBusiestDistrictsMetered()` in `lib/db.ts`

| Column | Description |
|--------|-------------|
| `district` | District name |
| `stddev_vacancy_rate` | Standard deviation of vacancy rate |

**Purpose**: Identifies districts with highest metered parking activity.

**Default Sort**: `stddev_vacancy_rate DESC`

---

#### `agg_busiest_carparks`

Individual carparks ranked by activity.

**Created by**: `getBusiestCarparks(limit)` in `lib/db.ts`

| Column | Description |
|--------|-------------|
| `park_id` | Carpark identifier |
| `name` | Carpark name |
| `district` | District |
| `stddev_vacancy` | Standard deviation of vacancy |

**Purpose**: Highlights specific high-demand carparks.

**Default Limit**: 20 carparks

---

## Helper Functions

### `get_parking_hourly_aggregated()`

PostgreSQL RPC function that aggregates `agg_parking_hourly_pattern` data.

**Purpose**: Bypasses Supabase's 1000-row limit by performing server-side aggregation.

**SQL**:
```sql
CREATE OR REPLACE FUNCTION get_parking_hourly_aggregated()
RETURNS TABLE (
  hour_of_day integer,
  district text,
  total_avg_vacancy numeric
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.hour_of_day,
    p.district,
    SUM(p.avg_vacancy)::numeric(10,2) as total_avg_vacancy
  FROM agg_parking_hourly_pattern p
  GROUP BY p.hour_of_day, p.district
  ORDER BY p.district, p.hour_of_day;
END;
$$ LANGUAGE plpgsql STABLE;
```

**Returns**: ~24 rows × number of districts (~500-600 total rows)

**Used by**: `getParkingHourlyPattern()` in `lib/db.ts:212-217`

**Why This Exists**:
- `agg_parking_hourly_pattern` has thousands of rows due to grouping by `hour_of_day`, `day_of_week`, `district`, `carpark_type`, and `vehicle_type`
- Supabase limits direct table queries to 1000 rows
- This RPC aggregates across `day_of_week`, `carpark_type`, and `vehicle_type` dimensions
- Result is well under the 1000-row limit

---

### `refresh_latest_parking_vacancy()`

Refreshes the `latest_parking_vacancy` materialized view.

**Purpose**: Updates cached latest vacancy data for fast lookups.

**Performance**: View queries take 0.36ms vs 6.8 seconds for raw queries (19,000x faster).

---

### `refresh_latest_metered_carpark_occupancy()`

Refreshes the latest metered carpark occupancy view.

**Purpose**: Updates cached latest occupancy data for metered spaces.

---

### `cleanup_old_metered_snapshots()`

Deletes old snapshot data to manage storage.

**Purpose**: Prevents database from growing indefinitely with historical snapshots.

---

## Data Pipeline

### 1. Data Ingestion

- External scripts poll Hong Kong government APIs
- Raw data inserted into `parking_vacancy_snapshots` and `metered_space_occupancy_snapshots`
- Timestamps recorded in `ingested_at` field
- `is_valid` flag set based on data quality checks

### 2. Aggregation

Materialized views are refreshed periodically:

```bash
# Refresh parking views
npm run refresh:parking

# Or via SQL
psql $POSTGRES_URL_NON_POOLING -f supabase/refresh_parking_views.sql
```

### 3. Query Optimization

- **Direct table queries**: Used for small, targeted lookups
- **Materialized views**: Pre-aggregated for pattern analysis
- **RPC functions**: Further aggregation to bypass row limits
- **Indexes**: Speed up common filtering and sorting operations

### 4. Data Flow

```
Government APIs
     ↓
Raw Snapshots Tables
     ↓
Materialized Views (refreshed periodically)
     ↓
RPC Functions (optional aggregation)
     ↓
API Routes (lib/db.ts)
     ↓
React Components (app/parking/_components/)
     ↓
Charts & Visualizations
```

---

## Frontend Integration

### Database Functions (`lib/db.ts`)

| Function | View/Table | Purpose |
|----------|------------|---------|
| `getParking5MinTrend()` | `agg_parking_5min_trend` | 5-minute trends (24h) |
| `getParkingHourlyPattern()` | RPC: `get_parking_hourly_aggregated()` | Hourly patterns (7d) |
| `getMetered5MinTrend()` | `agg_metered_5min_trend` | Metered 5-min trends (24h) |
| `getMeteredHourlyPattern()` | `agg_metered_hourly_pattern` | Metered hourly patterns (7d) |
| `getBusiestDistrictsParking()` | `agg_busiest_districts_parking` | District rankings (regular) |
| `getBusiestDistrictsMetered()` | `agg_busiest_districts_metered` | District rankings (metered) |
| `getBusiestCarparks(limit)` | `agg_busiest_carparks` | Top N carparks by activity |

### Page Components

- **`app/parking/page.tsx`**: Server component that fetches all data in parallel
- **`app/parking/_components/ParkingPatternCharts.tsx`**: Client component with interactive charts

### Chart Rendering

The hourly pattern chart aggregates data by district:

```typescript
function aggregateByHourDistrict(data: any[], selectedDistricts: string[]) {
  const grouped = new Map<number, any>();

  // Initialize all 24 hours (0-23)
  for (let hour = 0; hour < 24; hour++) {
    grouped.set(hour, { hour });
  }

  data.forEach((row) => {
    if (!selectedDistricts.includes(row.district)) return;

    const hour = Number(row.hour_of_day);
    const existing = grouped.get(hour)!;

    // RPC function already returns aggregated data
    existing[row.district] = Number(row.total_avg_vacancy || 0);
  });

  return Array.from(grouped.values()).sort((a, b) => a.hour - b.hour);
}
```

---

## Maintenance

### Materialized View Refresh

**Recommended Schedule**:
- High-frequency views (5-minute trends): Every 5-15 minutes
- Pattern views (hourly patterns): Every 1-4 hours
- Statistical views (busiest districts): Daily

**Automated Refresh** (using cron):
```bash
# Refresh every 10 minutes
*/10 * * * * cd /path/to/mtc-stats && npm run refresh:parking >> /tmp/parking-refresh.log 2>&1
```

**Manual Refresh**:
```bash
npm run refresh:parking
```

### Data Retention

Old snapshots should be cleaned up to prevent unbounded growth:

```sql
-- Delete snapshots older than 30 days
DELETE FROM parking_vacancy_snapshots
WHERE ingested_at < NOW() - INTERVAL '30 days';

DELETE FROM metered_space_occupancy_snapshots
WHERE ingested_at < NOW() - INTERVAL '30 days';
```

Consider using the `cleanup_old_metered_snapshots()` function for automated cleanup.

### Monitoring

Key metrics to monitor:

1. **Table sizes**: Monitor row counts and disk usage
2. **View refresh times**: Ensure refreshes complete within acceptable windows
3. **Query performance**: Track slow queries
4. **Data freshness**: Verify `ingested_at` timestamps are recent

**Check table sizes**:
```sql
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE tablename LIKE '%parking%' OR tablename LIKE '%metered%'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

---

## Performance Considerations

### Row Limit Challenges

**Problem**: Supabase imposes a default 1000-row limit on queries.

**Impact**:
- `agg_parking_hourly_pattern` contains ~(24 hours × 7 days × 21 districts × 3 vehicle types × 2 carpark types) = thousands of rows
- Direct queries would be truncated, causing missing data in charts

**Solution**: Use RPC functions like `get_parking_hourly_aggregated()` to aggregate server-side before returning results.

### Aggregation Strategy

```
Raw Snapshots (millions of rows)
    ↓
Materialized Views (thousands of rows, multiple dimensions)
    ↓
RPC Aggregation (hundreds of rows, fewer dimensions)
    ↓
Client-side Display (24 data points per district)
```

This multi-stage aggregation ensures:
1. Fast queries (pre-computed aggregations)
2. Manageable result sets (under row limits)
3. Flexible analysis (multiple aggregation levels)

---

## Related Files

- **Database Schema**: `supabase/schema.sql`
- **Refresh Scripts**: `supabase/refresh_parking_views.sql`, `scripts/refresh_parking_views.sh`
- **Database Functions**: `lib/db.ts` (lines 202-264)
- **Frontend Components**: `app/parking/page.tsx`, `app/parking/_components/ParkingPatternCharts.tsx`
- **Previous Documentation**: `PARKING_VIEWS.md` (legacy performance notes)

---

## Summary

The parking data system collects high-frequency snapshots of parking availability across Hong Kong, processes them through materialized views for efficient querying, and presents patterns through interactive visualizations. The architecture balances real-time data freshness with query performance through strategic use of aggregation layers and PostgreSQL RPC functions.
