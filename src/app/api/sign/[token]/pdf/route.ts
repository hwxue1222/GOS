import { NextResponse } from 'next/server';
import { getSignatureContextByToken, findContractById } from '@/lib/db';

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await getSignatureContextByToken(token);
  if (!ctx) return NextResponse.json({ ok: false, error: 'INVALID_LINK' }, { status: 404 });

  if (ctx.packet.kind !== 'CONTRACT' || ctx.packet.relatedType !== 'CONTRACT') {
    return NextResponse.json({ ok: false, error: 'UNSUPPORTED' }, { status: 400 });
  }

  const contract = await findContractById(ctx.packet.relatedId);
  if (!contract) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

  if (contract.documentId) {
    const disposition = new URL(req.url).searchParams.get('disposition');
    const q = disposition ? `?disposition=${encodeURIComponent(disposition)}` : '';
    return NextResponse.redirect(`/api/documents/${encodeURIComponent(contract.documentId)}/pdf${q}`, 302);
  }

  return NextResponse.json({ ok: false, error: 'DOCUMENT_REQUIRED' }, { status: 400 });
}
