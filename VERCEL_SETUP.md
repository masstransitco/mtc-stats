# Vercel Deployment Setup

This document describes how to set up automated cron jobs for parking data refresh on Vercel.

## Overview

The application uses Vercel Cron Jobs to automatically refresh parking materialized views every 10 minutes. This ensures the parking data displayed on the `/parking` page stays current.

## Required Environment Variables

You need to configure the following environment variables in your Vercel project:

### 1. `POSTGRES_URL_NON_POOLING` (Required)

The direct PostgreSQL connection URL (non-pooled) for running DDL operations like `REFRESH MATERIALIZED VIEW`.

**Format**: `postgres://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require`

**Example**:
```
postgres://postgres.xxx:password@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require
```

**Where to find it**:
- Supabase Dashboard → Project Settings → Database → Connection String → Direct Connection
- Make sure to use the "Direct Connection" URL, not the pooled connection

### 2. `CRON_SECRET` (Recommended but optional)

A secret token to secure your cron endpoint from unauthorized access.

**How to generate**:
```bash
# Generate a random secret
openssl rand -base64 32
```

**Example**:
```
abc123xyz789secrettoken456
```

**Note**: If you don't set this, the cron endpoint will be publicly accessible. This is acceptable for non-sensitive operations but recommended for security.

### 3. `NEXT_PUBLIC_SUPABASE_URL` (Already configured)

Your Supabase project URL. Should already be set.

### 4. `SUPABASE_SERVICE_ROLE_KEY` (Already configured)

Your Supabase service role key. Should already be set.

## How to Configure Environment Variables in Vercel

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add each variable:
   - **Key**: Variable name (e.g., `POSTGRES_URL_NON_POOLING`)
   - **Value**: The actual value
   - **Environments**: Select Production, Preview, and Development as needed
4. Click **Save**

## How Vercel Cron Jobs Work

### Configuration (`vercel.json`)

The `vercel.json` file defines the cron schedule:

```json
{
  "crons": [
    {
      "path": "/api/cron/refresh-parking",
      "schedule": "*/10 * * * *"
    }
  ]
}
```

**Schedule explained**:
- `*/10 * * * *` = Every 10 minutes
- Format: `minute hour day month weekday`

### Cron Endpoint (`app/api/cron/refresh-parking/route.ts`)

The cron job hits this API endpoint which:
1. Verifies the request is authorized (using `CRON_SECRET`)
2. Connects to PostgreSQL using `POSTGRES_URL_NON_POOLING`
3. Refreshes all 8 parking materialized views sequentially
4. Returns success/failure status with timing information

### Materialized Views Refreshed

1. `latest_parking_vacancy` - Latest vacancy snapshot per carpark
2. `agg_parking_5min_trend` - 5-minute trends for regular carparks (24h)
3. `agg_parking_hourly_pattern` - Hourly patterns for regular carparks (7-day avg)
4. `agg_metered_5min_trend` - 5-minute trends for metered carparks (24h)
5. `agg_metered_hourly_pattern` - Hourly patterns for metered carparks (7-day avg)
6. `agg_busiest_districts_parking` - Busiest districts for regular carparks
7. `agg_busiest_districts_metered` - Busiest districts for metered carparks
8. `agg_busiest_carparks` - Top 100 busiest individual carparks

## Vercel Plan Requirements

- **Hobby Plan**: Free, supports cron jobs (max 60s execution time)
- **Pro Plan**: Supports cron jobs (max 300s execution time)
- **Enterprise Plan**: Supports cron jobs (custom execution time)

The refresh operation typically completes in 10-30 seconds, so the Hobby plan should be sufficient.

## Monitoring Cron Jobs

### View Cron Execution Logs

1. Go to your Vercel project dashboard
2. Navigate to **Deployments** → Select your deployment
3. Click on **Functions** tab
4. Find `/api/cron/refresh-parking` in the list
5. Click to view execution logs

### Manual Trigger (Testing)

You can manually trigger the cron job by visiting the endpoint:

```bash
# Without CRON_SECRET (if not configured)
curl https://your-app.vercel.app/api/cron/refresh-parking

# With CRON_SECRET
curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
     https://your-app.vercel.app/api/cron/refresh-parking
```

**Expected response** (success):
```json
{
  "success": true,
  "message": "All parking views refreshed successfully",
  "duration": "12543ms",
  "timestamp": "2025-11-22T14:30:00.000Z",
  "views": [
    "latest_parking_vacancy",
    "agg_parking_5min_trend",
    "agg_parking_hourly_pattern",
    "agg_metered_5min_trend",
    "agg_metered_hourly_pattern",
    "agg_busiest_districts_parking",
    "agg_busiest_districts_metered",
    "agg_busiest_carparks"
  ]
}
```

## Troubleshooting

### Cron Job Not Running

1. **Verify `vercel.json` is at project root**: Vercel reads cron config from `vercel.json` in the root directory
2. **Redeploy**: Cron jobs only activate after deployment
3. **Check plan limits**: Ensure your Vercel plan supports cron jobs

### Timeout Errors

If refreshes timeout:
1. **Increase `maxDuration`** in `route.ts` (max 60s for Hobby, 300s for Pro)
2. **Optimize views**: Consider reducing the time window or simplifying aggregations
3. **Upgrade plan**: Move to Pro plan for longer execution time

### Unauthorized Errors

If getting 401 errors:
1. **Verify `CRON_SECRET`** matches in both Vercel env vars and your test requests
2. **Check Authorization header format**: Must be `Bearer <secret>`

### Database Connection Errors

If cron can't connect to database:
1. **Verify `POSTGRES_URL_NON_POOLING`** is correctly set in Vercel
2. **Check SSL mode**: URL should include `?sslmode=require`
3. **Test connection** from local environment first

## Alternative: Local Development

For local development, you can manually refresh views using:

```bash
# Using npm script
npm run refresh:parking

# Using shell script directly
bash scripts/refresh_parking_views.sh

# Using SQL directly
psql $POSTGRES_URL_NON_POOLING -f supabase/refresh_parking_views.sql
```

## Schedule Customization

To change the refresh frequency, edit `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/refresh-parking",
      "schedule": "*/15 * * * *"  // Every 15 minutes
    }
  ]
}
```

**Common schedules**:
- Every 5 minutes: `*/5 * * * *`
- Every 10 minutes: `*/10 * * * *`
- Every 15 minutes: `*/15 * * * *`
- Every 30 minutes: `*/30 * * * *`
- Every hour: `0 * * * *`

## Security Best Practices

1. **Always set `CRON_SECRET`** in production
2. **Never commit secrets** to version control
3. **Use environment variables** for all sensitive data
4. **Monitor execution logs** for unauthorized access attempts
5. **Limit cron frequency** to what's necessary to reduce load

## Next Steps

After configuring the environment variables:

1. Deploy your application to Vercel
2. Verify the cron job runs successfully by checking logs
3. Visit `/parking` page to see the updated data
4. Monitor performance and adjust schedule if needed
