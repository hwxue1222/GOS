import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createDocument, findContractById, listContractTemplates, updateContract } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';
import { renderContractHtml } from '@/lib/docTemplates';

function canAccess(user: { id: string }, contract: { createdByUserId: string }) {
  if (hasPermission(user as any, 'contracts', 'viewAll')) return true;
  if (hasPermission(user as any, 'contracts', 'viewAssigned')) return contract.createdByUserId === user.id;
  return false;
}

export async function GET(req: Request, { params }: { params: Promise<{ contractId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!hasPermission(user, 'contracts', 'viewAssigned') && !hasPermission(user, 'contracts', 'viewAll')) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const { contractId } = await params;
  const contract = await findContractById(contractId);
  if (!contract) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
  if (!canAccess(user, contract)) return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });

  const templates = await listContractTemplates();
  const tpl = templates.find((t) => t.id === contract.templateId) ?? null;
  if (!tpl) return NextResponse.json({ ok: false, error: 'TEMPLATE_NOT_FOUND' }, { status: 404 });

  let documentId = contract.documentId;
  if (!documentId) {
    const html = renderContractHtml({
      templateHtml: tpl.templateHtml,
      contractNo: contract.contractNo,
      clientName: contract.clientName,
      clientEmail: contract.clientEmail,
      fields: contract.fields ?? {},
    });
    const title = `Contract ${contract.contractNo} - ${contract.clientName}`;
    const doc = await createDocument({ type: 'CONTRACT', title, html });
    documentId = doc.id;
    await updateContract(contractId, { documentId, status: 'READY' });
  }

  const disposition = new URL(req.url).searchParams.get('disposition');
  const q = disposition ? `?disposition=${encodeURIComponent(disposition)}` : '';
  return NextResponse.redirect(`/api/documents/${encodeURIComponent(documentId)}/pdf${q}`, 302);
}
