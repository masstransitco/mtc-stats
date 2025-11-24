import { NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

export const runtime = 'nodejs';
export const revalidate = 0;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const district = searchParams.get('district');
  const limit = Math.min(Number(searchParams.get('limit')) || 50, 200);
  const offset = Math.max(Number(searchParams.get('offset')) || 0, 0);

  if (searchParams.get('vehicle_type')) {
    return NextResponse.json(
      { error: 'vehicle_type filter is not supported at carpark level yet' },
      { status: 400 }
    );
  }

  let query = supabase
    .from('metered_carpark_info')
    .select('carpark_id,name,district,latitude,longitude,total_spaces')
    .order('carpark_id', { ascending: true })
    .range(offset, offset + limit - 1);

  if (district) {
    query = query.eq('district', district);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    data: data ?? [],
    pagination: { limit, offset, returned: data?.length ?? 0 }
  });
}
