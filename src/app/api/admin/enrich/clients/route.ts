import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { enrichClientsFromCompaniesSg } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!hasPermission(user, 'clients', 'update')) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { limit?: number } | null;
  const limitRaw = Number(body?.limit ?? 20);
  const limit = Math.min(100, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 20));

  const result = await enrichClientsFromCompaniesSg({ limit });
  return NextResponse.json({ ok: true, ...result });
}

