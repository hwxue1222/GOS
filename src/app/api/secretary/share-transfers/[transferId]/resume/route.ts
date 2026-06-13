import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { appendAuditLog, readDb, resumeShareTransfer } from '@/lib/db';
import { sendSigningInvite } from '@/lib/email';

export async function POST(req: Request, { params }: { params: Promise<{ transferId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (user.role === 'staff') return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });

  const { transferId } = await params;
  const r = await resumeShareTransfer(transferId);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });

  await appendAuditLog({
    actorUserId: user.id,
    actorName: user.name,
    actorRole: user.role,
    area: 'secretary',
    action: 'resume_share_transfer',
    entityType: 'share_transfer',
    entityId: transferId,
    summary: `Resume share transfer: ${transferId}`,
  });

  const origin = req.headers.get('origin')?.trim();
  const host = (req.headers.get('x-forwarded-host') ?? req.headers.get('host'))?.trim();
  const proto = req.headers.get('x-forwarded-proto')?.trim() || 'https';
  const baseUrl = origin || (host ? `${proto}://${host}` : '');
  const db = await readDb();
  const transfer = db.shareTransfers.find((t) => t.id === transferId) ?? null;
  const client = transfer ? db.clients.find((c) => c.id === transfer.clientId) ?? null : null;
  const companyName = client?.name ?? (transfer?.clientId ?? transferId);

  const resolveEmail = (partyId: string) => {
    const party = db.parties.find((p) => p.id === partyId) ?? null;
    if (!party) return null;
    if (party.type === 'PERSON' && party.personId) {
      const person = db.persons.find((p) => p.id === party.personId) ?? null;
      return person?.email ?? null;
    }
    if (party.type === 'COMPANY') {
      const rep = db.companyRepresentatives
        .filter((r) => r.companyPartyId === party.id && r.scope === 'GLOBAL')
        .find((r) => !r.effectiveTo);
      if (!rep) return null;
      const person = db.persons.find((p) => p.id === rep.representativePersonId) ?? null;
      return person?.email ?? null;
    }
    return null;
  };

  const transferorEmail = transfer ? resolveEmail(transfer.transferorPartyId) : null;
  const transfereeEmail = transfer ? resolveEmail(transfer.transfereePartyId) : null;
  await Promise.all(
    r.signLinks.map((l) =>
      baseUrl
        ? sendSigningInvite({
            to: l.email,
            url: `${baseUrl}${l.url}`,
            companyName,
            applicationName: 'Transfer of Shares',
            documentTitle: 'Share Transfer Form',
            signerRole:
              transferorEmail && transfereeEmail && l.email === transferorEmail && l.email === transfereeEmail
                ? 'Transferor & Transferee'
                : transferorEmail && l.email === transferorEmail
                  ? 'Transferor'
                  : transfereeEmail && l.email === transfereeEmail
                    ? 'Transferee'
                    : 'Signatory',
          })
        : Promise.resolve({ ok: false as const, error: 'EMAIL_NOT_CONFIGURED' as const }),
    ),
  );

  return NextResponse.json({ ok: true, signLinks: r.signLinks });
}
