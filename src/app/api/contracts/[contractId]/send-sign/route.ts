import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  createSignaturePacket,
  createSignatureRequestsForPacket,
  findContractById,
  listContractTemplates,
  createDocument,
  updateContract,
} from '@/lib/db';
import { hasPermission } from '@/lib/permissions';
import { renderContractHtml } from '@/lib/docTemplates';
import { sendSigningInvite } from '@/lib/email';

function canAccess(user: { id: string }, contract: { createdByUserId: string }) {
  if (hasPermission(user as any, 'contracts', 'viewAll')) return true;
  if (hasPermission(user as any, 'contracts', 'viewAssigned')) return contract.createdByUserId === user.id;
  return false;
}

export async function POST(req: Request, { params }: { params: Promise<{ contractId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!hasPermission(user, 'contracts', 'update')) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const { contractId } = await params;
  const contract = await findContractById(contractId);
  if (!contract) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
  if (!canAccess(user, contract)) return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { subject?: string; message?: string } | null;
  const subject = typeof body?.subject === 'string' ? body.subject : undefined;
  const message = typeof body?.message === 'string' ? body.message : undefined;

  let documentId = contract.documentId;
  if (!documentId) {
    const templates = await listContractTemplates();
    const tpl = templates.find((t) => t.id === contract.templateId) ?? null;
    if (!tpl) return NextResponse.json({ ok: false, error: 'TEMPLATE_NOT_FOUND' }, { status: 404 });
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

  const packet = await createSignaturePacket({
    kind: 'CONTRACT',
    relatedType: 'CONTRACT',
    relatedId: contract.id,
    documentId,
    status: 'SIGNING',
  });
  const links = await createSignatureRequestsForPacket({ packetId: packet.id, emails: [contract.clientEmail] });

  const origin = req.headers.get('origin')?.trim();
  const host = (req.headers.get('x-forwarded-host') ?? req.headers.get('host'))?.trim();
  const proto = req.headers.get('x-forwarded-proto')?.trim() || 'https';
  const baseUrl = origin || (host ? `${proto}://${host}` : '');
  await Promise.all(
    links.map((l) =>
      baseUrl
        ? sendSigningInvite({
            to: l.email,
            url: `${baseUrl}${l.url}`,
            companyName: contract.clientName,
            applicationName: 'Contract',
            documentTitle: `Contract ${contract.contractNo}`,
            signerRole: 'Client',
            subject,
            message,
          })
        : Promise.resolve({ ok: false as const, error: 'EMAIL_NOT_CONFIGURED' as const }),
    ),
  );

  const next = await updateContract(contractId, { packetId: packet.id, status: 'SIGNING', sentAt: new Date().toISOString() });
  return NextResponse.json({ ok: true, packetId: packet.id, signLinks: links, contract: next });
}

