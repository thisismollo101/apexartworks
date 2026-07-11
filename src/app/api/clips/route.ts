import { NextRequest, NextResponse } from 'next/server';
import { listClips, searchClips } from '@/lib/clips';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
    const limit = Math.min(Number(req.nextUrl.searchParams.get('limit')) || 60, 100);
    const offset = Math.max(Number(req.nextUrl.searchParams.get('offset')) || 0, 0);
    const clips = q ? await searchClips(q, limit) : await listClips(limit, offset);
    return NextResponse.json({ clips, count: clips.length });
  } catch (err) {
    console.error('GET /api/clips', err);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
