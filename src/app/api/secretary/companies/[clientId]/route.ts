import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { readDb, updateClient } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';

function isActiveRole(r: { role: string; resignationDate?: string; toDate?: string }) {
  if (r.role === 'DIRECTOR' || r.role === 'SECRETARY') return !r.resignationDate;
  if (r.role === 'SHAREHOLDER' || r.role === 'RORC') return !r.toDate;
  return true;
}

function isActiveDirector(r: { role: string; resignationDate?: string }) {
  return r.role === 'DIRECTOR' && !r.resignationDate;
}

async function canAccessClient(user: { role: string; email: string }, clientId: string) {
  if (user.role !== 'client') return true;
  const db = await readDb();
  const emailKey = user.email.trim().toLowerCase();
  const partyById = new Map(db.parties.map((p) => [p.id, p]));
  const personById = new Map(db.persons.map((p) => [p.id, p]));
  for (const r of db.clientPartyRoles) {
    if (r.clientId !== clientId) continue;
    if (!isActiveDirector(r)) continue;
    const party = partyById.get(r.partyId);
    if (!party || party.type !== 'PERSON' || !party.personId) continue;
    const person = personById.get(party.personId);
    if (!person) continue;
    if ((person.email ?? '').trim().toLowerCase() !== emailKey) continue;
    return true;
  }
  return false;
}

export async function GET(_req: Request, ctx: { params: Promise<{ clientId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!hasPermission(user, 'secretary', 'viewAll') && !hasPermission(user, 'secretary', 'viewAssigned')) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const { clientId } = await ctx.params;
  if (!(await canAccessClient(user, clientId))) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const db = await readDb();
  const client = db.clients.find((c) => c.id === clientId && !c.deletedAt) ?? null;
  if (!client) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

  const partyById = new Map(db.parties.map((p) => [p.id, p]));
  const personById = new Map(db.persons.map((p) => [p.id, p]));
  const clientById = new Map(db.clients.map((c) => [c.id, c]));
  const userByEmail = new Map(db.users.map((u) => [u.email.trim().toLowerCase(), u]));

  const rows = db.clientPartyRoles
    .filter((r) => r.clientId === clientId)
    .filter((r) => isActiveRole(r))
    .map((r) => {
      const party = partyById.get(r.partyId);
      if (!party) return null;
      if (party.type === 'PERSON' && party.personId) {
        const person = personById.get(party.personId);
        if (!person) return null;
        const emailKey = (person.email ?? '').trim().toLowerCase();
        const loginUser = emailKey ? userByEmail.get(emailKey) ?? null : null;
        return { role: r, entity: { type: 'PERSON', person: { ...person, hasLogin: !!loginUser } } };
      }
      if (party.type === 'COMPANY' && party.clientId) {
        const c = clientById.get(party.clientId);
        if (!c || c.deletedAt) return null;
        return { role: r, entity: { type: 'COMPANY', company: { id: c.id, code: c.code, name: c.name } } };
      }
      return null;
    })
    .filter(Boolean) as Array<any>;

  const byRole = (role: string) => rows.filter((x) => x.role.role === role);

  return NextResponse.json({
    ok: true,
    client,
    roles: {
      directors: byRole('DIRECTOR'),
      shareholders: byRole('SHAREHOLDER'),
      rorc: byRole('RORC'),
      secretaries: byRole('SECRETARY'),
    },
  });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ clientId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!hasPermission(user, 'secretary', 'update')) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const { clientId } = await ctx.params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const currencyRaw = typeof body?.paidUpCapitalCurrency === 'string' ? body.paidUpCapitalCurrency.trim().toUpperCase() : '';
  const paidUpCapitalCurrency =
    currencyRaw === 'SGD' || currencyRaw === 'USD' || currencyRaw === 'CNY' || currencyRaw === 'MYR'
      ? (currencyRaw as 'SGD' | 'USD' | 'CNY' | 'MYR')
      : undefined;
  const patch = {
    name: typeof body?.name === 'string' ? body.name.trim() : undefined,
    code: typeof body?.code === 'string' ? body.code.trim() : undefined,
    companyRegistrationNo: typeof body?.companyRegistrationNo === 'string' ? body.companyRegistrationNo.trim() || undefined : undefined,
    fye: typeof body?.fye === 'string' ? body.fye.trim() || undefined : undefined,
    contactPerson: typeof body?.contactPerson === 'string' ? body.contactPerson.trim() || undefined : undefined,
    address: typeof body?.address === 'string' ? body.address.trim() || undefined : undefined,
    phone: typeof body?.phone === 'string' ? body.phone.trim() || undefined : undefined,
    email: typeof body?.email === 'string' ? body.email.trim() || undefined : undefined,
    businessActivities:
      typeof body?.businessActivities === 'string' ? body.businessActivities.trim() || undefined : undefined,
    ssicPrimaryCode: typeof body?.ssicPrimaryCode === 'string' ? body.ssicPrimaryCode.trim() || undefined : undefined,
    ssicSecondaryCode: typeof body?.ssicSecondaryCode === 'string' ? body.ssicSecondaryCode.trim() || undefined : undefined,
    paidUpCapitalCurrency,
    paidUpCapitalAmount:
      typeof body?.paidUpCapitalAmount === 'number'
        ? body.paidUpCapitalAmount
        : typeof body?.paidUpCapitalAmount === 'string' && body.paidUpCapitalAmount.trim()
          ? Number(body.paidUpCapitalAmount)
          : undefined,
    totalShares:
      typeof body?.totalShares === 'number'
        ? body.totalShares
        : typeof body?.totalShares === 'string' && body.totalShares.trim()
          ? Number(body.totalShares)
          : undefined,
    incorporationDate: typeof body?.incorporationDate === 'string' ? body.incorporationDate.trim() || undefined : undefined,
    registeredOfficeAddress:
      typeof body?.registeredOfficeAddress === 'string' ? body.registeredOfficeAddress.trim() || undefined : undefined,
  };

  if (typeof patch.totalShares === 'number' && Number.isFinite(patch.totalShares)) {
    const db = await readDb();
    const shareSum = db.clientPartyRoles
      .filter((r) => r.clientId === clientId && r.role === 'SHAREHOLDER')
      .filter((r) => !r.toDate)
      .reduce((sum, r) => sum + (typeof r.shares === 'number' && Number.isFinite(r.shares) ? r.shares : 0), 0);
    if (shareSum > patch.totalShares) {
      return NextResponse.json({ ok: false, error: 'SHARE_SUM_EXCEEDS_TOTAL' }, { status: 400 });
    }
  }

  const updated = await updateClient(clientId, patch);
  if (!updated) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
  return NextResponse.json({ ok: true, client: updated });
}
