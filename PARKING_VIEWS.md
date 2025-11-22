# Parking Data Views - Performance Fix

## Problem
The `/parking` page was timing out (error code 57014) because the `latest_parking_vacancy` view was scanning 1.27M rows on every query, taking 6.8 seconds.

## Solution
Converted `latest_parking_vacancy` from a regular view to a **materialized view** with indexes.

### Performance Improvement
- **Before**: 6.8 seconds
- **After**: 0.36 milliseconds
- **Improvement**: 19,000x faster

## Database Changes

### Materialized View
The `latest_parking_vacancy` materialized view caches the latest parking vacancy snapshot for each park/vehicle type combination.

**Location**: See `supabase/schema.sql` lines 292-316

### Indexes
- `idx_latest_parking_vacancy_park` on `park_id`
- `idx_latest_parking_vacancy_lastupdate` on `lastupdate DESC`

## Maintenance Required

**IMPORTANT**: Since this is a materialized view, it needs to be refreshed periodically to show current data.

### Manual Refresh
```bash
# Using npm script
npm run refresh:parking

# Using shell script directly
bash scripts/refresh_parking_views.sh

# Using SQL directly
psql $POSTGRES_URL_NON_POOLING -f supabase/refresh_parking_views.sql
```

### Automated Refresh (Recommended)
Set up a cron job to refresh every 5-15 minutes:

```bash
# Edit crontab
crontab -e

# Add this line to refresh every 10 minutes
*/10 * * * * cd /path/to/mtc-stats && npm run refresh:parking >> /tmp/parking-refresh.log 2>&1
```

Alternatively, use Supabase Edge Functions or a scheduled task in your hosting environment.

## Files Changed
- `supabase/schema.sql` - Added materialized view definition
- `supabase/refresh_parking_views.sql` - Refresh script
- `scripts/refresh_parking_views.sh` - Shell script wrapper
- `package.json` - Added `refresh:parking` npm script

## Related Files
- `/app/parking/page.tsx` - Parking page component
- `/lib/db.ts` - Database query functions (`getParkingAvailability`, `getMeteredAvailability`, `getParkingLatest`)
