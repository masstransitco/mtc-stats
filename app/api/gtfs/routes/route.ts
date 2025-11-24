import { NextResponse } from 'next/server';
import { getRouteSummaries } from '@/lib/gtfs';

export const dynamic = 'force-dynamic';

export async function GET() {
  const routes = await getRouteSummaries();
  return NextResponse.json({ routes });
}
