import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createIncorporationApplication, listIncorporationApplications, readDb } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';
import { sendEmail } from '@/lib/email';
import { buildIncorporationSubmittedEmail } from '@/lib/incorporationSubmitEmail';

function isActiveRole(r: { role: string; resignationDate?: string; toDate?: string }) {
  if (r.role === 'DIRECTOR' || r.role === 'SECRETARY') return !r.resignationDate;
  if (r.role === 'SHAREHOLDER' || r.role === 'RORC') return !r.toDate;
  return true;
}

async function getAllowedClientIdsForClientEmail(email: string) {
  const db = await readDb();
  const emailKey = email.trim().toLowerCase();
  const partyById = new Map(db.parties.map((p) => [p.id, p]));
  const personById = new Map(db.persons.map((p) => [p.id, p]));
  const allowed = new Set<string>();
  for (const r of db.clientPartyRoles) {
    if (!isActiveRole(r)) continue;
    const party = partyById.get(r.partyId);
    if (!party || party.type !== 'PERSON' || !party.personId) continue;
    const person = personById.get(party.personId);
    if (!person) continue;
    if ((person.email ?? '').trim().toLowerCase() !== emailKey) continue;
    allowed.add(r.clientId);
  }
  return allowed;
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const url = new URL(req.url);
  const type = (url.searchParams.get('type') ?? '').trim();
  const status = (url.searchParams.get('status') ?? '').trim();

  const all = await listIncorporationApplications();
  let rows = all;

  if (user.role === 'client') {
    const allowed = await getAllowedClientIdsForClientEmail(user.email);
    rows = rows.filter((a) => a.createdByUserId === user.id || (!!a.companyId && allowed.has(a.companyId)));
  } else {
    const canViewAll = hasPermission(user, 'secretary', 'viewAll') || hasPermission(user, 'secretary', 'viewAssigned');
    if (!canViewAll) return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  if (type) rows = rows.filter((a) => a.type === type);
  if (status) rows = rows.filter((a) => a.status === status);

  rows = [...rows].sort((a, b) => {
    const ea = (a.updatedAt ?? a.createdAt) || '';
    const eb = (b.updatedAt ?? b.createdAt) || '';
    if (ea !== eb) return eb.localeCompare(ea);
    return (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
  });

  return NextResponse.json({ ok: true, applications: rows });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const body = (await req.json().catch(() => null)) as
    | {
        type?: string;
        companyId?: string;
        companyName?: string;
        payload?: Record<string, unknown>;
        submit?: boolean;
      }
    | null;

  const type = typeof body?.type === 'string' ? body.type.trim() : '';
  const companyId = typeof body?.companyId === 'string' ? body.companyId.trim() : '';
  const companyName = typeof body?.companyName === 'string' ? body.companyName.trim() : '';
  const payload = body?.payload && typeof body.payload === 'object' ? body.payload : {};
  const submit = body?.submit === true;

  if (type !== 'REGISTER_COMPANY' && type !== 'TRANSFER_COMPANY_SECRETARY') {
    return NextResponse.json({ ok: false, error: 'INVALID_TYPE' }, { status: 400 });
  }

  let normalizedCompanyId: string | undefined;
  let normalizedCompanyName: string | undefined;
  if (type === 'TRANSFER_COMPANY_SECRETARY') {
    if (!companyId) return NextResponse.json({ ok: false, error: 'MISSING_COMPANY' }, { status: 400 });
    const db = await readDb();
    const client = db.clients.find((c) => c.id === companyId) ?? null;
    if (!client || client.deletedAt) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
    if (user.role === 'client') {
      const allowed = await getAllowedClientIdsForClientEmail(user.email);
      if (!allowed.has(companyId)) return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
    }
    normalizedCompanyId = companyId;
    normalizedCompanyName = client.name;
  } else {
    normalizedCompanyName = companyName || (typeof payload.companyName === 'string' ? payload.companyName : undefined);
  }

  const title =
    type === 'REGISTER_COMPANY'
      ? `Register Company${normalizedCompanyName ? ` - ${normalizedCompanyName}` : ''}`
      : `Transfer of Company Secretary${normalizedCompanyName ? ` - ${normalizedCompanyName}` : ''}`;

  const app = await createIncorporationApplication({
    type,
    status: submit ? 'SUBMITTED' : 'DRAFT',
    title,
    companyId: normalizedCompanyId,
    companyName: normalizedCompanyName,
    payload,
    createdByUserId: user.id,
    actor: { id: user.id, name: user.name, role: user.role },
  });

  let emailOk = true;
  if (submit && user.role === 'client' && user.email) {
    try {
      const { subject, html } = buildIncorporationSubmittedEmail({
        application: app,
        applicantName: user.name,
        applicantEmail: user.email,
        origin: new URL(req.url).origin,
      });
      await sendEmail({ to: [user.email], subject, html });
    } catch {
      emailOk = false;
    }
  }

  return NextResponse.json({ ok: true, application: app, emailOk });
}
