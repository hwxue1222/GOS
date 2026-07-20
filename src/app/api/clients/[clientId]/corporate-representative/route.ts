import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  createDocument,
  createRepresentativeDesignationRequest,
  createSignaturePacket,
  createSignatureRequestsForPacket,
  findClientById,
  getActiveCompanyRepresentative,
  getOrCreateCompanyPartyForClient,
  listClientDirectors,
  listRepresentativeDesignationRequests,
  listSignatureRequestsByPacket,
  findPersonById,
  readDb,
} from '@/lib/db';
import { hasPermission } from '@/lib/permissions';
import { newId } from '@/lib/id';
import { renderRdrAuthorizationHtml } from '@/lib/docTemplates';
import { sendSigningInvite } from '@/lib/email';

export async function GET(_: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const { clientId } = await params;
  const client = await findClientById(clientId);
  if (!client || client.deletedAt) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

  const canViewAllClients = hasPermission(user, 'clients', 'viewAll');
  const canViewAssignedClients = hasPermission(user, 'clients', 'viewAssigned');
  const canProxyAll = hasPermission(user, 'proxy', 'viewAll');
  const canProxyAssigned = hasPermission(user, 'proxy', 'viewAssigned');
  const canView = canViewAllClients || canViewAssignedClients || canProxyAll || canProxyAssigned;
  if (!canView) return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });

  if (!canViewAllClients && !canProxyAll) {
    const db = await readDb();
    const assignedJobId = new Set(
      db.tasks
        .filter((t: any) => (t as any).assigneeUserId === user.id)
        .map((t: any) => String((t as any).jobId ?? ''))
        .filter(Boolean),
    );

    const visibleClientIds = new Set<string>();
    for (const j of db.jobs) {
      if (!j.clientId) continue;
      const assigned =
        j.managerUserId === user.id ||
        (j as any).staffUserId === user.id ||
        (j as any).createdByUserId === user.id ||
        assignedJobId.has(j.id);
      if (assigned) visibleClientIds.add(j.clientId);
    }

    if ((canViewAssignedClients || canProxyAssigned) && !visibleClientIds.has(clientId)) {
      return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
    }
  }

  const companyParty = await getOrCreateCompanyPartyForClient(clientId);
  if (!companyParty) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

  const current = await getActiveCompanyRepresentative(companyParty.id);
  const rdrs = await listRepresentativeDesignationRequests(companyParty.id);
  const latestRdr = rdrs[0] ?? null;
  const latestRequests = latestRdr ? await listSignatureRequestsByPacket(latestRdr.packetId) : [];

  return NextResponse.json({
    ok: true,
    companyPartyId: companyParty.id,
    current,
    latestRdr,
    latestRequests: latestRequests.map((r) => ({ email: r.email, status: r.status, signedAt: r.signedAt })),
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!hasPermission(user, 'clients', 'update')) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const { clientId } = await params;
  const client = await findClientById(clientId);
  if (!client || client.deletedAt) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

  const body = (await req.json().catch(() => null)) as
    | { representativePersonId?: string; matter?: string; appointmentDateYmd?: string }
    | null;
  const representativePersonId = typeof body?.representativePersonId === 'string' ? body.representativePersonId : '';
  if (!representativePersonId) return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });

  const matter = String(body?.matter ?? '').trim();
  if (!matter) return NextResponse.json({ ok: false, error: 'MISSING_MATTER' }, { status: 400 });
  if (matter.length > 200) return NextResponse.json({ ok: false, error: 'INVALID_MATTER' }, { status: 400 });

  const appointmentDateYmd = String(body?.appointmentDateYmd ?? '').trim();
  const isValidYmd = (v: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    const d = new Date(`${v}T00:00:00.000Z`);
    if (Number.isNaN(d.getTime())) return false;
    return d.toISOString().slice(0, 10) === v;
  };
  if (!appointmentDateYmd) return NextResponse.json({ ok: false, error: 'MISSING_APPOINTMENT_DATE' }, { status: 400 });
  if (!isValidYmd(appointmentDateYmd)) return NextResponse.json({ ok: false, error: 'INVALID_APPOINTMENT_DATE' }, { status: 400 });

  const person = await findPersonById(representativePersonId);
  if (!person) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
  if (!person.email) return NextResponse.json({ ok: false, error: 'MISSING_REPRESENTATIVE_EMAIL' }, { status: 400 });

  const companyParty = await getOrCreateCompanyPartyForClient(clientId);
  if (!companyParty) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

  const directors = await listClientDirectors(clientId);
  const emails = directors.map((d) => d.person.email).filter((e): e is string => !!e && !!e.trim());
  if (emails.length !== directors.length) return NextResponse.json({ ok: false, error: 'MISSING_SIGNER_EMAIL' }, { status: 400 });

  const directorSigners = directors.map((d) => ({ fullName: d.person.fullName, email: d.person.email }));

  const html = renderRdrAuthorizationHtml({
    companyName: client.name,
    companyRegistrationNo: client.companyRegistrationNo,
    companyAddress: String((client as any).registeredOfficeAddress ?? (client as any).address ?? '').trim(),
    representativeName: person.fullName,
    representativeEmail: person.email,
    representativeAddress: String((person as any).address ?? '').trim(),
    matter,
    directorSigners,
    dateYmd: appointmentDateYmd,
  });
  const doc = await createDocument({ type: 'RDR_AUTH', title: `Corporate Representative - ${client.name}`, html });

  const rdrId = newId('rdr');
  const packet = await createSignaturePacket({
    kind: 'RDR',
    relatedType: 'RDR',
    relatedId: rdrId,
    documentId: doc.id,
    status: 'SIGNING',
  });
  await createRepresentativeDesignationRequest({
    id: rdrId,
    triggerType: 'MANUAL_MAINTENANCE',
    companyPartyId: companyParty.id,
    representativePersonId: person.id,
    representativeName: person.fullName,
    representativeEmail: person.email,
    matter,
    appointmentDateYmd,
    packetId: packet.id,
  });

  const allEmails = Array.from(
    new Set([...emails, String(person.email ?? '').trim()].map((e) => e.trim().toLowerCase()).filter(Boolean)),
  );
  const signLinks = await createSignatureRequestsForPacket({ packetId: packet.id, emails: allEmails });

  const origin = req.headers.get('origin')?.trim();
  const host = (req.headers.get('x-forwarded-host') ?? req.headers.get('host'))?.trim();
  const proto = req.headers.get('x-forwarded-proto')?.trim() || 'https';
  const baseUrl = origin || (host ? `${proto}://${host}` : '');
  await Promise.all(
    signLinks.map((l) =>
      baseUrl
        ? sendSigningInvite({
            to: l.email,
            url: `${baseUrl}${l.url}`,
            companyName: client.name,
            applicationName: 'Corporate representative designation',
            documentTitle: `Corporate Representative - ${client.name}`,
            signerRole:
              l.email.trim().toLowerCase() === String(person.email ?? '').trim().toLowerCase()
                ? `Corporate Representative of ${client.name}`
                : `Director of ${client.name}`,
          })
        : Promise.resolve({ ok: false as const, error: 'EMAIL_NOT_CONFIGURED' as const }),
    ),
  );

  return NextResponse.json({ ok: true, rdrId, packetId: packet.id, signLinks });
}
