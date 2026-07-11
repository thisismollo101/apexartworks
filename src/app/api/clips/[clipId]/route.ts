import { NextRequest, NextResponse } from 'next/server';
import { getClip } from '@/lib/clips';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ clipId: string }> },
) {
  try {
    const { clipId } = await params;
    const result = await getClip(clipId);
    if (!result) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json(result);
  } catch (err) {
    console.error('GET /api/clips/[clipId]', err);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
