import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Vercel limit

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const postgresUrl = process.env.POSTGRES_URL_NON_POOLING;
    if (!postgresUrl) throw new Error('POSTGRES_URL_NON_POOLING environment variable not set');

    const { Client } = await import('pg');
    const client = new Client({ connectionString: postgresUrl, ssl: { rejectUnauthorized: false } });

    await client.connect();
    console.log('[CRON] Starting iSmart views refresh...');
    const startTime = Date.now();

    await client.query('REFRESH MATERIALIZED VIEW CONCURRENTLY vehicle_state_segments_mv;');
    console.log('[CRON] Refreshed vehicle_state_segments_mv');

    await client.query('REFRESH MATERIALIZED VIEW CONCURRENTLY vehicle_dwell_events_mv;');
    console.log('[CRON] Refreshed vehicle_dwell_events_mv');

    await client.query('REFRESH MATERIALIZED VIEW CONCURRENTLY vehicle_dwell_districts_mv;');
    console.log('[CRON] Refreshed vehicle_dwell_districts_mv');

    await client.end();

    const duration = Date.now() - startTime;
    console.log(`[CRON] iSmart views refreshed in ${duration}ms`);

    return NextResponse.json({
      success: true,
      message: 'iSmart views refreshed successfully',
      duration: `${duration}ms`,
      timestamp: new Date().toISOString(),
      views: [
        'vehicle_state_segments_mv',
        'vehicle_dwell_events_mv',
        'vehicle_dwell_districts_mv'
      ]
    });
  } catch (error) {
    console.error('[CRON] Error refreshing iSmart views:', error);
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
