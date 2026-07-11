import { NextRequest, NextResponse } from 'next/server';
import { saveSelection } from '@/lib/clips';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (typeof body?.clip_id !== 'string' || !Array.isArray(body?.shot_indexes)) {
      return NextResponse.json({ error: 'clip_id and shot_indexes are required' }, { status: 400 });
    }
    const { id } = await saveSelection({
      clip_id: body.clip_id,
      shot_indexes: body.shot_indexes.map(Number),
      client_name: typeof body.name === 'string' ? body.name : undefined,
      client_email: typeof body.email === 'string' ? body.email : undefined,
      note: typeof body.note === 'string' ? body.note : undefined,
    });
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal error';
    const status = message === 'unknown clip' || message === 'no valid shots selected' ? 400 : 500;
    if (status === 500) console.error('POST /api/selections', err);
    return NextResponse.json({ error: status === 500 ? 'internal error' : message }, { status });
  }
}
