import { NextResponse } from 'next/server';
import { getMetered5MinTrend } from '@/lib/db';

export const runtime = 'nodejs';
export const revalidate = 0;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const district = searchParams.get('district');
  const vehicleType = searchParams.get('vehicle_type');

  try {
    const rows = await getMetered5MinTrend();
    const filtered = rows.filter((row) => {
      if (district && row.district !== district) return false;
      if (vehicleType && row.vehicle_type !== vehicleType) return false;
      return true;
    });

    return NextResponse.json({
      generated_at: new Date().toISOString(),
      window: 'last_24h',
      data: filtered.map((row) => ({
        time_bucket: row.time_bucket,
        hour_of_day: row.hour_of_day,
        district: row.district,
        vehicle_type: row.vehicle_type,
        total_spaces: row.total_spaces,
        vacant_spaces: row.vacant_count,
        vacancy_rate: row.vacancy_rate
      }))
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
