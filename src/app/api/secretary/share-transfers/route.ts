import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { appendAuditLog, createShareTransferRequest, findClientById, listClients, listShareTransfers, readDb } from '@/lib/db';
import { sendSigningInvite } from '@/lib/email';
import { hasPermission } from '@/lib/permissions';

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const proxyCompanyId = (req.headers.get('x-gos-proxy-company-id') ?? '').trim();
  const canProxy = hasPermission(user, 'proxy', 'viewAll') || hasPermission(user, 'proxy', 'viewAssigned');
  if (user.role === 'staff' && !(canProxy && proxyCompanyId)) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const [clients, transfers] = await Promise.all([listClients(), listShareTransfers()]);
  if (user.role === 'client') {
    const db = await readDb();
    const emailKey = user.email.trim().toLowerCase();
    const partyById = new Map(db.parties.map((p) => [p.id, p]));
    const personById = new Map(db.persons.map((p) => [p.id, p]));
    const allowed = new Set<string>();
    for (const r of db.clientPartyRoles) {
      if (r.role !== 'DIRECTOR' || r.resignationDate) continue;
      const party = partyById.get(r.partyId);
      if (!party || party.type !== 'PERSON' || !party.personId) continue;
      const person = personById.get(party.personId);
      if (!person) continue;
      if ((person.email ?? '').trim().toLowerCase() !== emailKey) continue;
      allowed.add(r.clientId);
    }
    return NextResponse.json({
      ok: true,
      clients: clients.filter((c) => allowed.has(c.id) && !c.deletedAt).map((c) => ({ id: c.id, code: c.code, name: c.name })),
      transfers: transfers.filter((t) => allowed.has(t.clientId)),
    });
  }
  if (user.role === 'staff') {
    const c = clients.find((x) => x.id === proxyCompanyId && !x.deletedAt) ?? null;
    if (!c) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
    return NextResponse.json({
      ok: true,
      clients: [{ id: c.id, code: c.code, name: c.name }],
      transfers: transfers.filter((t) => t.clientId === proxyCompanyId),
    });
  }

  return NextResponse.json({
    ok: true,
    clients: clients.filter((c) => !c.deletedAt).map((c) => ({ id: c.id, code: c.code, name: c.name })),
    transfers: transfers,
  });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const proxyCompanyId = (req.headers.get('x-gos-proxy-company-id') ?? '').trim();
  const canProxy = hasPermission(user, 'proxy', 'viewAll') || hasPermission(user, 'proxy', 'viewAssigned');
  if (user.role === 'staff' && !(canProxy && proxyCompanyId)) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as
    | {
        clientId?: string;
        shares?: number;
        valueSgd?: number;
        shareClass?: string;
        effectiveDate?: string;
        transferor?: {
          kind?: 'PERSON' | 'COMPANY_CLIENT' | 'EXISTING_PARTY';
          fullName?: string;
          email?: string;
          clientId?: string;
          partyId?: string;
          representativePersonId?: string;
        };
        transferee?: {
          kind?: 'PERSON' | 'COMPANY_CLIENT' | 'EXISTING_PARTY' | 'NEW_PERSON' | 'NEW_COMPANY';
          fullName?: string;
          email?: string;
          clientId?: string;
          representativePersonId?: string;
          partyId?: string;
          idType?: string;
          idNo?: string;
          dob?: string;
          phone?: string;
          nationality?: string;
          address?: string;
          companyName?: string;
          registrationNo?: string;
          corporateRepresentativeName?: string;
          corporateRepresentativeEmail?: string;
          directorSignerName?: string;
          directorSignerEmail?: string;
          countryOfIncorporation?: string;
        };
      }
    | null;

  const clientId = typeof body?.clientId === 'string' ? body.clientId : '';
  if (user.role === 'staff' && proxyCompanyId !== clientId) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  if (user.role === 'client') {
    const db = await readDb();
    const emailKey = user.email.trim().toLowerCase();
    const partyById = new Map(db.parties.map((p) => [p.id, p]));
    const personById = new Map(db.persons.map((p) => [p.id, p]));
    const ok = db.clientPartyRoles.some((r) => {
      if (r.clientId !== clientId) return false;
      if (r.role !== 'DIRECTOR' || r.resignationDate) return false;
      const party = partyById.get(r.partyId);
      if (!party || party.type !== 'PERSON' || !party.personId) return false;
      const person = personById.get(party.personId);
      if (!person) return false;
      return (person.email ?? '').trim().toLowerCase() === emailKey;
    });
    if (!ok) return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }
  const effectiveDate = typeof body?.effectiveDate === 'string' ? body.effectiveDate : '';
  const shareClass = typeof body?.shareClass === 'string' ? body.shareClass : undefined;
  const shares = typeof body?.shares === 'number' ? body.shares : Number(body?.shares);
  const valueSgd = typeof body?.valueSgd === 'number' ? body.valueSgd : Number((body as any)?.valueSgd);

  const transferor =
    body?.transferor?.kind === 'EXISTING_PARTY'
      ? ({
          kind: 'EXISTING_PARTY',
          partyId: (body.transferor as any)?.partyId ?? '',
          representativePersonId: (body.transferor as any)?.representativePersonId ?? '',
        } as const)
      : body?.transferor?.kind === 'COMPANY_CLIENT'
        ? ({ kind: 'COMPANY_CLIENT', clientId: body.transferor.clientId ?? '' } as const)
        : ({ kind: 'PERSON', fullName: body?.transferor?.fullName ?? '', email: body?.transferor?.email ?? '' } as const);
  const transferee =
    body?.transferee?.kind === 'EXISTING_PARTY'
      ? ({ kind: 'EXISTING_PARTY', partyId: (body.transferee as any)?.partyId ?? '' } as const)
      : body?.transferee?.kind === 'NEW_PERSON'
        ? ({
            kind: 'NEW_PERSON',
            fullName: (body.transferee as any)?.fullName ?? '',
            email: (body.transferee as any)?.email ?? '',
            phone: (body.transferee as any)?.phone ?? '',
            nationality: (body.transferee as any)?.nationality ?? '',
            dob: (body.transferee as any)?.dob ?? '',
            address: (body.transferee as any)?.address ?? '',
            idType: (body.transferee as any)?.idType ?? '',
            idNo: (body.transferee as any)?.idNo ?? '',
          } as const)
        : body?.transferee?.kind === 'NEW_COMPANY'
          ? ({
              kind: 'NEW_COMPANY',
              companyName: (body.transferee as any)?.companyName ?? '',
              registrationNo: (body.transferee as any)?.registrationNo ?? '',
              countryOfIncorporation: (body.transferee as any)?.countryOfIncorporation ?? (body.transferee as any)?.registrationCountry ?? '',
              address: (body.transferee as any)?.address ?? '',
              email: (body.transferee as any)?.email ?? '',
              phone: (body.transferee as any)?.phone ?? '',
              corporateRepresentativeName: (body.transferee as any)?.corporateRepresentativeName ?? '',
              corporateRepresentativeEmail: (body.transferee as any)?.corporateRepresentativeEmail ?? '',
              directorSignerName: (body.transferee as any)?.directorSignerName ?? '',
              directorSignerEmail: (body.transferee as any)?.directorSignerEmail ?? '',
            } as const)
      : body?.transferee?.kind === 'COMPANY_CLIENT'
        ? ({
            kind: 'COMPANY_CLIENT',
            clientId: body.transferee.clientId ?? '',
            representativePersonId: (body.transferee as any)?.representativePersonId ?? '',
          } as const)
        : ({ kind: 'PERSON', fullName: body?.transferee?.fullName ?? '', email: body?.transferee?.email ?? '' } as const);

  const r = await createShareTransferRequest({ clientId, transferor, transferee, shares, valueSgd, shareClass, effectiveDate });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
  await appendAuditLog({
    actorUserId: user.id,
    actorName: user.name,
    actorRole: user.role,
    area: 'secretary',
    action: 'create_share_transfer',
    entityType: 'share_transfer',
    entityId: r.transfer.id,
    summary: `Create share transfer: ${r.transfer.id}`,
  });
  const origin = req.headers.get('origin')?.trim();
  const host = (req.headers.get('x-forwarded-host') ?? req.headers.get('host'))?.trim();
  const proto = req.headers.get('x-forwarded-proto')?.trim() || 'https';
  const baseUrl = origin || (host ? `${proto}://${host}` : '');
  const client = await findClientById(clientId);
  const companyName = client?.name ?? clientId;
  const signLinks = r.signLinks as {
    br: Array<{ email: string; url: string; signerRole?: string; documentTitle?: string }>;
    sta: Array<{ email: string; url: string; signerRole?: string; documentTitle?: string }>;
    rdr?: Array<{ email: string; url: string; signerRole?: string; documentTitle?: string }>;
    cs?: Array<{ email: string; url: string; signerRole?: string; documentTitle?: string }>;
  };

  const jobs: Array<Promise<{ ok: boolean }>> = [];
  const appName = 'Transfer of Shares';

  for (const l of signLinks.br) {
    jobs.push(
      baseUrl
        ? sendSigningInvite({
            to: l.email,
            url: `${baseUrl}${l.url}`,
            companyName,
            applicationName: appName,
            documentTitle: l.documentTitle ?? "Director Resolution",
            signerRole: l.signerRole ?? 'Director',
          })
        : Promise.resolve({ ok: false }),
    );
  }
  for (const l of signLinks.sta) {
    jobs.push(
      baseUrl
        ? sendSigningInvite({
            to: l.email,
            url: `${baseUrl}${l.url}`,
            companyName,
            applicationName: appName,
            documentTitle: l.documentTitle ?? 'Share Transfer Form',
            signerRole: l.signerRole ?? 'Signatory',
          })
        : Promise.resolve({ ok: false }),
    );
  }
  for (const l of signLinks.rdr ?? []) {
    jobs.push(
      baseUrl
        ? sendSigningInvite({
            to: l.email,
            url: `${baseUrl}${l.url}`,
            companyName,
            applicationName: appName,
            documentTitle: l.documentTitle ?? 'Corporate Representative Authorization',
            signerRole: l.signerRole ?? 'Director',
          })
        : Promise.resolve({ ok: false }),
    );
  }
  for (const l of signLinks.cs ?? []) {
    jobs.push(
      baseUrl
        ? sendSigningInvite({
            to: l.email,
            url: `${baseUrl}${l.url}`,
            companyName,
            applicationName: appName,
            documentTitle: l.documentTitle ?? 'Certificate of Appointment of Corporate Secretary',
            signerRole: l.signerRole ?? 'Signatory',
          })
        : Promise.resolve({ ok: false }),
    );
  }
  for (const l of (signLinks as any).cr ?? []) {
    jobs.push(
      baseUrl
        ? sendSigningInvite({
            to: l.email,
            url: `${baseUrl}${l.url}`,
            companyName,
            applicationName: appName,
            documentTitle: l.documentTitle ?? 'Certificate of Appointment of Corporate Representative',
            signerRole: l.signerRole ?? 'Signatory',
          })
        : Promise.resolve({ ok: false }),
    );
  }
  await Promise.all(jobs);

  return NextResponse.json({ ok: true, transfer: r.transfer, documents: (r as any).documents, signLinks: r.signLinks });
}
