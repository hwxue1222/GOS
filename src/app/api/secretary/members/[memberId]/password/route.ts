import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { setClientPasswordForPerson } from '@/lib/db';

export async function POST(req: Request, ctx: { params: Promise<{ memberId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (user.role === 'client') return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  if (!hasPermission(user, 'secretary', 'viewAll') && !hasPermission(user, 'secretary', 'viewAssigned')) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }
  if (!hasPermission(user, 'secretary', 'update')) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const { memberId } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { newPassword?: string } | null;
  const newPassword = (body?.newPassword ?? '').trim();
  if (newPassword.length < 6) return NextResponse.json({ ok: false, error: 'INVALID_PASSWORD' }, { status: 400 });

  const r = await setClientPasswordForPerson({ personId: memberId, newPassword });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}

