import { NextResponse } from 'next/server';
import { findContractByPublicToken } from '@/lib/db';

export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const contract = await findContractByPublicToken(token);
  if (!contract) {
    return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
  }

  const url = new URL(req.url);
  const disposition = (url.searchParams.get('disposition') ?? '').toLowerCase() === 'inline' ? 'inline' : 'attachment';
  const qs = new URLSearchParams({
    publicToken: token,
    disposition,
  });
  return NextResponse.redirect(`/api/contracts/${encodeURIComponent(contract.id)}/pdf?${qs.toString()}`, 302);
}
