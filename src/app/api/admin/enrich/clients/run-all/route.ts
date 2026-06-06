import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { enrichClientsFromCompaniesSgBatch } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!hasPermission(user, 'clients', 'update')) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { cursor?: string | null; limit?: number } | null;
  const cursor = typeof body?.cursor === 'string' ? body?.cursor : null;
  const limitRaw = Number(body?.limit ?? 10);
  const limit = Math.min(30, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 10));

  const result = await enrichClientsFromCompaniesSgBatch({ cursor, limit });
  return NextResponse.json({ ok: true, ...result });
}

