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
  const templateId = contract.templateId;

  const body = (await req.json().catch(() => null)) as
    | {
        subject?: string;
        message?: string;
        toEmail?: string;
        emails?: string[];
        signerFullName?: string;
        signerTitle?: string;
      }
    | null;
  const subject = typeof body?.subject === 'string' ? body.subject : undefined;
  const message = typeof body?.message === 'string' ? body.message : undefined;
  const toEmail = typeof body?.toEmail === 'string' ? body.toEmail.trim() : '';
  const emails = Array.isArray(body?.emails) ? body!.emails.map((x) => String(x ?? '').trim()).filter((x) => !!x) : [];
  const signerFullName = typeof body?.signerFullName === 'string' ? body.signerFullName.trim() : '';
  const signerTitle = typeof body?.signerTitle === 'string' ? body.signerTitle.trim() : '';

  const templates = await listContractTemplates();
  const tpl = templates.find((t) => t.id === templateId) ?? null;
  if (!tpl) return NextResponse.json({ ok: false, error: 'TEMPLATE_NOT_FOUND' }, { status: 404 });

  const contractNo = String(contract.contractNo ?? '').trim();
  if (!contractNo) {
    return NextResponse.json({ ok: false, error: 'CONTRACT_NOT_GENERATED' }, { status: 409 });
  }

  let documentId = contract.documentId;
  if (!documentId) {
    const html = renderContractHtml({
      templateHtml: tpl.templateHtml,
      contractNo: contractNo || contract.contractNo,
      clientName: contract.clientName,
      clientEmail: contract.clientEmail,
      fields: contract.fields ?? {},
    });
    const title = `Contract ${contractNo || contract.contractNo || '-'} - ${contract.clientName}`;
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
  const isNominee = String(tpl.name ?? '') === 'Nominee Services Indemnity Agreement';

  let links: Array<{ email: string; url: string }> = [];
  if (isNominee) {
    const f = (contract.fields ?? {}) as Record<string, string>;
    const companyEmail = String(f.company_signatory_email ?? '').trim();
    const principalEmail = String(f.principal_signatory_email ?? '').trim();
    if (!companyEmail || !principalEmail) return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
    const l1 = await createSignatureRequestsForPacket({
      packetId: packet.id,
      emails: [companyEmail],
      defaults: {
        signerFullName: String(f.company_auth_name ?? '').trim() || undefined,
        signerTitle: String(f.company_auth_designation ?? '').trim() || undefined,
      },
    });
    const l2 = await createSignatureRequestsForPacket({
      packetId: packet.id,
      emails: [principalEmail],
      defaults: {
        signerFullName: String(f.principal_auth_name ?? '').trim() || undefined,
        signerTitle: String(f.principal_auth_designation ?? '').trim() || undefined,
      },
    });
    links = links.concat(l1, l2);
  } else {
    const signerEmail =
      (emails[0] ?? '').trim() ||
      toEmail ||
      String((contract as any)?.fields?.signer_email ?? '').trim() ||
      contract.clientEmail;
    if (!signerEmail) return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
    links = await createSignatureRequestsForPacket({
      packetId: packet.id,
      emails: [signerEmail],
      defaults: {
        signerFullName: signerFullName || String((contract as any)?.fields?.signer_full_name ?? '').trim() || undefined,
        signerTitle: signerTitle || String((contract as any)?.fields?.signer_title ?? '').trim() || undefined,
      },
    });
  }

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
            documentTitle: `Contract ${contractNo || contract.contractNo || '-'}`,
            signerRole: 'Client',
            subject,
            message,
          })
        : Promise.resolve({ ok: false as const, error: 'EMAIL_NOT_CONFIGURED' as const }),
    ),
  );

  const nextFields: Record<string, string> = isNominee
    ? { ...(contract.fields ?? {}) }
    : {
        ...(contract.fields ?? {}),
        ...(toEmail || (emails[0] ?? '').trim() ? { signer_email: ((emails[0] ?? '').trim() || toEmail).trim() } : null),
        ...(signerFullName ? { signer_full_name: signerFullName } : null),
        ...(signerTitle ? { signer_title: signerTitle } : null),
      };
  const next = await updateContract(contractId, {
    packetId: packet.id,
    status: 'SIGNING',
    sentAt: new Date().toISOString(),
    fields: nextFields,
  });
  return NextResponse.json({ ok: true, packetId: packet.id, signLinks: links, contract: next });
}
