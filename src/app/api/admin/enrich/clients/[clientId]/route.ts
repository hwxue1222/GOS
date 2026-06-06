import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { enrichClientFromCompaniesSgById } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';

export async function POST(_: Request, ctx: { params: Promise<{ clientId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!hasPermission(user, 'clients', 'update')) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const { clientId } = await ctx.params;
  const result = await enrichClientFromCompaniesSgById(clientId);
  return NextResponse.json({ ok: true, ...result });
}

