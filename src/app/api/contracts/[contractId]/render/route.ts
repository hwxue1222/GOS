import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createDocument, findContractById, listContractTemplates, nextContractNo, readDb, updateContract } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';
import { renderContractHtml } from '@/lib/docTemplates';

function canAccess(user: { id: string }, contract: { createdByUserId: string }) {
  if (hasPermission(user as any, 'contracts', 'viewAll')) return true;
  if (hasPermission(user as any, 'contracts', 'viewAssigned')) return contract.createdByUserId === user.id;
  return false;
}

export async function POST(_: Request, { params }: { params: Promise<{ contractId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!hasPermission(user, 'contracts', 'update')) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const { contractId } = await params;
  let contract = await findContractById(contractId);
  if (!contract) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
  if (!canAccess(user, contract)) return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });

  const templates = await listContractTemplates();
  const templateId = contract.templateId;
  const tpl = templates.find((t) => t.id === templateId) ?? null;
  if (!tpl) return NextResponse.json({ ok: false, error: 'TEMPLATE_NOT_FOUND' }, { status: 404 });

  let contractNo = String(contract.contractNo ?? '').trim();
  if (!contractNo) {
    const db = await readDb();
    contractNo = nextContractNo(db, contract.createdAt ? new Date(contract.createdAt) : new Date());
    const updated = await updateContract(contractId, { contractNo });
    if (updated) contract = updated;
  }

  const generatedDate = new Date().toISOString().slice(0, 10);

  const html = renderContractHtml({
    templateHtml: tpl.templateHtml,
    contractNo: String(contractNo || contract.contractNo || ''),
    clientName: contract.clientName,
    clientEmail: contract.clientEmail,
    fields: { ...(contract.fields ?? {}), generated_date: generatedDate },
  });

  const title = `Contract ${String(contractNo || contract.contractNo || '-') } - ${contract.clientName}`;
  const doc = await createDocument({ type: 'CONTRACT', title, html });
  const next = await updateContract(contractId, { contractNo, documentId: doc.id, status: 'READY' });

  return NextResponse.json({ ok: true, documentId: doc.id, documentSha256: doc.sha256, contract: next });
}
