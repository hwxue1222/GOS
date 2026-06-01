import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';

export const runtime = 'nodejs';

export async function GET(req: Request, ctx: { params: Promise<{ invoiceId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!hasPermission(user, 'invoices', 'viewAll')) return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });

  const { invoiceId } = await ctx.params;
  const origin = new URL(req.url).origin;
  return NextResponse.redirect(`${origin}/invoices/${encodeURIComponent(invoiceId)}/print?auto=1`, { status: 302 });
}

