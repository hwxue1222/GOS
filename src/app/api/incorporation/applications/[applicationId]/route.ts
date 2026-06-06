import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getIncorporationApplicationDetail, readDb, updateIncorporationApplication } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';

function isActiveRole(r: { role: string; resignationDate?: string; toDate?: string }) {
  if (r.role === 'DIRECTOR' || r.role === 'SECRETARY') return !r.resignationDate;
  if (r.role === 'SHAREHOLDER' || r.role === 'RORC') return !r.toDate;
  return true;
}

async function canClientAccessCompany(userEmail: string, clientId: string) {
  const db = await readDb();
  const emailKey = userEmail.trim().toLowerCase();
  const partyById = new Map(db.parties.map((p) => [p.id, p]));
  const personById = new Map(db.persons.map((p) => [p.id, p]));
  for (const r of db.clientPartyRoles) {
    if (r.clientId !== clientId) continue;
    if (!isActiveRole(r)) continue;
    const party = partyById.get(r.partyId);
    if (!party || party.type !== 'PERSON' || !party.personId) continue;
    const person = personById.get(party.personId);
    if (!person) continue;
    if ((person.email ?? '').trim().toLowerCase() !== emailKey) continue;
    return true;
  }
  return false;
}

export async function GET(_req: Request, ctx: { params: Promise<{ applicationId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const { applicationId } = await ctx.params;

  const detail = await getIncorporationApplicationDetail(applicationId);
  if (!detail) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

  const app = detail.application;
  if (user.role === 'client') {
    if (app.createdByUserId !== user.id) {
      const ok = app.companyId ? await canClientAccessCompany(user.email, app.companyId) : false;
      if (!ok) return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
    }
  } else {
    const canView = hasPermission(user, 'secretary', 'viewAll') || hasPermission(user, 'secretary', 'viewAssigned');
    if (!canView) return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  return NextResponse.json({ ok: true, ...detail });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ applicationId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const { applicationId } = await ctx.params;

  const detail = await getIncorporationApplicationDetail(applicationId);
  if (!detail) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
  const app = detail.application;

  if (user.role === 'client') {
    if (app.createdByUserId !== user.id) return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
    if (app.status !== 'DRAFT' && app.status !== 'NEED_MORE_INFO') return NextResponse.json({ ok: false, error: 'LOCKED' }, { status: 400 });
  } else {
    if (!hasPermission(user, 'secretary', 'update')) return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as
    | {
        companyName?: string;
        payload?: Record<string, unknown>;
      }
    | null;

  const payload = body?.payload && typeof body.payload === 'object' ? body.payload : undefined;
  const companyName = typeof body?.companyName === 'string' ? body.companyName.trim() || undefined : undefined;

  const next = await updateIncorporationApplication(applicationId, {
    companyName: companyName ?? app.companyName,
    payload: payload ?? app.payload,
    title: app.title,
  });

  return NextResponse.json({ ok: true, application: next });
}

