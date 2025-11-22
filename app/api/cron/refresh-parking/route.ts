import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 60 seconds max for Vercel Hobby/Pro

export async function GET(request: Request) {
  // Verify the request is from Vercel Cron
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const postgresUrl = process.env.POSTGRES_URL_NON_POOLING;

    if (!postgresUrl) {
      throw new Error('POSTGRES_URL_NON_POOLING environment variable not set');
    }

    // Import postgres client dynamically
    const { Client } = await import('pg');

    const client = new Client({
      connectionString: postgresUrl,
      ssl: { rejectUnauthorized: false }
    });

    await client.connect();

    console.log('[CRON] Starting parking views refresh...');
    const startTime = Date.now();

    // Refresh all parking materialized views
    await client.query('REFRESH MATERIALIZED VIEW CONCURRENTLY latest_parking_vacancy;');
    console.log('[CRON] Refreshed latest_parking_vacancy');

    await client.query('REFRESH MATERIALIZED VIEW agg_parking_5min_trend;');
    console.log('[CRON] Refreshed agg_parking_5min_trend');

    await client.query('REFRESH MATERIALIZED VIEW agg_parking_hourly_pattern;');
    console.log('[CRON] Refreshed agg_parking_hourly_pattern');

    await client.query('REFRESH MATERIALIZED VIEW agg_metered_5min_trend;');
    console.log('[CRON] Refreshed agg_metered_5min_trend');

    await client.query('REFRESH MATERIALIZED VIEW agg_metered_hourly_pattern;');
    console.log('[CRON] Refreshed agg_metered_hourly_pattern');

    await client.query('REFRESH MATERIALIZED VIEW agg_busiest_districts_parking;');
    console.log('[CRON] Refreshed agg_busiest_districts_parking');

    await client.query('REFRESH MATERIALIZED VIEW agg_busiest_districts_metered;');
    console.log('[CRON] Refreshed agg_busiest_districts_metered');

    await client.query('REFRESH MATERIALIZED VIEW agg_busiest_carparks;');
    console.log('[CRON] Refreshed agg_busiest_carparks');

    await client.end();

    const duration = Date.now() - startTime;
    console.log(`[CRON] All parking views refreshed in ${duration}ms`);

    return NextResponse.json({
      success: true,
      message: 'All parking views refreshed successfully',
      duration: `${duration}ms`,
      timestamp: new Date().toISOString(),
      views: [
        'latest_parking_vacancy',
        'agg_parking_5min_trend',
        'agg_parking_hourly_pattern',
        'agg_metered_5min_trend',
        'agg_metered_hourly_pattern',
        'agg_busiest_districts_parking',
        'agg_busiest_districts_metered',
        'agg_busiest_carparks'
      ]
    });

  } catch (error) {
    console.error('[CRON] Error refreshing parking views:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}
