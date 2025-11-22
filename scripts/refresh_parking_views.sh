#!/bin/bash
# Refresh parking materialized views
# Run this script periodically (e.g., via cron every 5-15 minutes) to keep parking data current

set -e

# Load environment variables
if [ -f .env.local ]; then
  export $(grep POSTGRES_URL_NON_POOLING .env.local | xargs)
fi

# Run the refresh
echo "Refreshing parking materialized views..."
psql "$POSTGRES_URL_NON_POOLING" -f supabase/refresh_parking_views.sql

echo "Parking views refreshed successfully!"
