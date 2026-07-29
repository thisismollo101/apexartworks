import { NextRequest, NextResponse } from 'next/server';
import { asCategory, clipsByIds, countClips, listClips, searchClips } from '@/lib/clips';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    // ?ids=A,B,C — used by the liked list, whose ids live in the browser.
    const ids = req.nextUrl.searchParams.get('ids');
    if (ids !== null) {
      const clips = await clipsByIds(ids.split(',').map((s) => s.trim()).filter(Boolean));
      return NextResponse.json({ clips, count: clips.length });
    }

    const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
    const cat = asCategory(req.nextUrl.searchParams.get('cat') ?? undefined);
    const limit = Math.min(Number(req.nextUrl.searchParams.get('limit')) || 60, 100);
    const offset = Math.max(Number(req.nextUrl.searchParams.get('offset')) || 0, 0);
    if (q) {
      const clips = await searchClips(q, limit);
      return NextResponse.json({ clips, count: clips.length });
    }
    const [clips, total] = await Promise.all([listClips(limit, offset, cat), countClips(cat)]);
    return NextResponse.json({ clips, count: clips.length, total, offset, limit });
  } catch (err) {
    console.error('GET /api/clips', err);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
