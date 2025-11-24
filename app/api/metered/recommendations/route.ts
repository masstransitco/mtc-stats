import { NextResponse } from 'next/server';
import { getMeteredCarparkHourlyData } from '@/lib/db';

export const runtime = 'nodejs';
export const revalidate = 0;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const district = searchParams.get('district');
  const limit = Math.min(Number(searchParams.get('limit')) || 20, 100);

  // Use HK time to pick the most relevant hourly bucket
  const now = new Date();
  const hkHour = (now.getUTCHours() + 8) % 24;

  try {
    // Pull a generous set so we can filter and sort on the app side
    const hourly = await getMeteredCarparkHourlyData(Math.max(limit * 3, 60));

    const matches = hourly.filter((row) => {
      if (district && row.district !== district) return false;
      return row.hour === hkHour;
    });

    const ranked = matches
      .map((row) => {
        const availabilityScore = Math.max(0, Math.min(100, row.avg_vacancy_rate));
        return {
          carpark_id: row.carpark_id,
          carpark_name: row.carpark_name,
          district: row.district,
          lat: row.lat,
          lon: row.lon,
          hour: row.hour,
          vacancy_rate: row.avg_vacancy_rate,
          occupancy_rate: row.occupancy_rate,
          stddev_vacancy_rate: row.stddev_vacancy_rate,
          min_vacancy_rate: row.min_vacancy_rate,
          max_vacancy_rate: row.max_vacancy_rate,
          sample_count: row.sample_count,
          availability_score: availabilityScore,
          basis: {
            type: 'historical-hourly',
            hour_of_day_hk: hkHour
          }
        };
      })
      .sort((a, b) => b.availability_score - a.availability_score)
      .slice(0, limit);

    return NextResponse.json({
      generated_at: now.toISOString(),
      hour_of_day_hk: hkHour,
      data: ranked
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
