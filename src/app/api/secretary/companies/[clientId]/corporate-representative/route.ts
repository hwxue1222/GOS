import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  createDocument,
  createRepresentativeDesignationRequest,
  createSignaturePacket,
  createSignatureRequestsForPacket,
  findClientById,
  findPersonById,
  getActiveCompanyRepresentative,
  getOrCreateCompanyPartyForClient,
  listClientDirectors,
  listRepresentativeDesignationRequests,
  listSignatureRequestsByPacket,
  readDb,
} from '@/lib/db';
import { hasPermission } from '@/lib/permissions';
import { newId } from '@/lib/id';
import { renderRdrAuthorizationHtml } from '@/lib/docTemplates';
import { sendSigningInvite } from '@/lib/email';

function isActiveDirectorRole(r: { role: string; resignationDate?: string }) {
  return r.role === 'DIRECTOR' && !r.resignationDate;
}

async function canAccessClientAsDirector(user: { role: string; email: string }, clientId: string) {
  if (user.role !== 'client') return true;
  const db = await readDb();
  const emailKey = user.email.trim().toLowerCase();
  const partyById = new Map(db.parties.map((p) => [p.id, p]));
  const personById = new Map(db.persons.map((p) => [p.id, p]));
  for (const r of db.clientPartyRoles) {
    if (r.clientId !== clientId) continue;
    if (!isActiveDirectorRole(r as any)) continue;
    const party = partyById.get((r as any).partyId);
    if (!party || party.type !== 'PERSON' || !party.personId) continue;
    const person = personById.get(party.personId);
    if (!person) continue;
    if ((person.email ?? '').trim().toLowerCase() !== emailKey) continue;
    return true;
  }
  return false;
}

export async function GET(req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const { clientId } = await params;
  const client = await findClientById(clientId);
  if (!client || client.deletedAt) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

  if (user.role !== 'client') {
    const canViewSecretary = hasPermission(user, 'secretary', 'viewAll') || hasPermission(user, 'secretary', 'viewAssigned');
    if (!canViewSecretary) return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }
  if (!(await canAccessClientAsDirector(user, clientId))) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const companyParty = await getOrCreateCompanyPartyForClient(clientId);
  if (!companyParty) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

  const current = await getActiveCompanyRepresentative(companyParty.id);
  const rdrs = await listRepresentativeDesignationRequests(companyParty.id);
  const latestRdr = rdrs[0] ?? null;
  const latestRequests = latestRdr ? await listSignatureRequestsByPacket(latestRdr.packetId) : [];

  return NextResponse.json(
    {
      ok: true,
      companyPartyId: companyParty.id,
      current,
      latestRdr,
      latestRequests: latestRequests.map((r) => ({ email: r.email, status: r.status, signedAt: r.signedAt })),
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}

export async function POST(req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!hasPermission(user, 'secretary', 'update')) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const { clientId } = await params;
  const client = await findClientById(clientId);
  if (!client || client.deletedAt) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

  if (!(await canAccessClientAsDirector(user, clientId))) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

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
    createdByUserId: user.id,
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
