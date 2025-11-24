import { NextResponse, type NextRequest } from 'next/server';
import { getRouteDetail } from '@/lib/gtfs';

export const dynamic = 'force-dynamic';

export async function GET(_: NextRequest, { params }: { params: Promise<{ routeId: string }> }) {
  const { routeId } = await params;
  const detail = await getRouteDetail(routeId);
  return NextResponse.json(detail);
}
