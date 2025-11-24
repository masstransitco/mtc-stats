import { NextResponse } from 'next/server';
import { getBusiestDistrictsMetered } from '@/lib/db';

export const runtime = 'nodejs';
export const revalidate = 0;

export async function GET() {
  try {
    const rows = await getBusiestDistrictsMetered();
    return NextResponse.json({
      generated_at: new Date().toISOString(),
      data: rows
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
