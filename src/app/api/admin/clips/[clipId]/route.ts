import { NextRequest, NextResponse } from 'next/server';
import { assertAdmin, getAdminClip } from '@/lib/admin';

export const dynamic = 'force-dynamic';

/** Identical body/status to an unknown clip — never confirm the route exists. */
const notFound = () => NextResponse.json({ error: 'not found' }, { status: 404 });

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ clipId: string }> },
) {
  try {
    if (!(await assertAdmin(req))) return notFound();
    const { clipId } = await params;
    const result = await getAdminClip(clipId);
    if (!result) return notFound();
    return NextResponse.json(result);
  } catch (err) {
    console.error('GET /api/admin/clips/[clipId]', err);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
