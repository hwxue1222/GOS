import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createClientLoginForPerson } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!hasPermission(user, 'secretary', 'update') || user.role === 'client') {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { personId?: string } | null;
  const personId = body?.personId?.trim() ?? '';
  if (!personId) return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
  const r = await createClientLoginForPerson({ personId });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true, user: r.user, tempPassword: r.tempPassword });
}

