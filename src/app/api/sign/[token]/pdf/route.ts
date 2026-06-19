import { NextResponse } from 'next/server';
import { getSignatureContextByToken, findContractById, listContractTemplates } from '@/lib/db';
import { renderCorpServiceAgreementPdf } from '@/lib/contractsDocx';

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await getSignatureContextByToken(token);
  if (!ctx) return NextResponse.json({ ok: false, error: 'INVALID_LINK' }, { status: 404 });

  if (ctx.packet.kind !== 'CONTRACT' || ctx.packet.relatedType !== 'CONTRACT') {
    return NextResponse.json({ ok: false, error: 'UNSUPPORTED' }, { status: 400 });
  }

  const contract = await findContractById(ctx.packet.relatedId);
  if (!contract) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

  const templates = await listContractTemplates();
  const tpl = templates.find((t) => t.id === contract.templateId) ?? null;
  if (!tpl) return NextResponse.json({ ok: false, error: 'TEMPLATE_NOT_FOUND' }, { status: 404 });

  if (tpl.engine === 'DOCX' && tpl.docxTemplateKey === 'corp_service_agreement') {
    const dateYmd = String(contract.fields?.date ?? contract.createdAt?.slice(0, 10) ?? '').slice(0, 10);
    const pdf = await renderCorpServiceAgreementPdf({
      contractNo: contract.contractNo,
      dateYmd,
      fields: {
        partyAName: String(contract.fields?.partyA_name ?? contract.clientName ?? '').trim(),
        partyAUen: String(contract.fields?.partyA_uen ?? '').trim(),
        partyAAddress: String(contract.fields?.partyA_address ?? '').trim(),
        partyAContact: String(contract.fields?.partyA_contact ?? '').trim(),
        partyAEmail: String(contract.fields?.partyA_email ?? contract.clientEmail ?? '').trim(),
      },
    });
    const disposition = new URL(req.url).searchParams.get('disposition') === 'attachment' ? 'attachment' : 'inline';
    return new NextResponse(pdf, {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `${disposition}; filename="${contract.contractNo}.pdf"`,
        'cache-control': 'no-store',
      },
    });
  }

  if (contract.documentId) {
    const disposition = new URL(req.url).searchParams.get('disposition');
    const q = disposition ? `?disposition=${encodeURIComponent(disposition)}` : '';
    return NextResponse.redirect(`/api/documents/${encodeURIComponent(contract.documentId)}/pdf${q}`, 302);
  }

  return NextResponse.json({ ok: false, error: 'DOCUMENT_REQUIRED' }, { status: 400 });
}
