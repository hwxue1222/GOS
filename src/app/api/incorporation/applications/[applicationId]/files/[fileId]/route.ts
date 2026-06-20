import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  deleteIncorporationApplicationFile,
  findIncorporationApplicationFileById,
  getIncorporationApplicationDetail,
  readDb,
} from '@/lib/db';
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

export async function DELETE(_req: Request, ctx: { params: Promise<{ applicationId: string; fileId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const { applicationId, fileId } = await ctx.params;

  const f = await findIncorporationApplicationFileById(fileId);
  if (!f) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
  if (f.applicationId !== applicationId) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

  const detail = await getIncorporationApplicationDetail(applicationId);
  if (!detail) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
  const app = detail.application;

  if (user.role === 'client') {
    if (app.createdByUserId !== user.id) {
      const ok = app.companyId ? await canClientAccessCompany(user.email, app.companyId) : false;
      if (!ok) return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
    }
  } else {
    if (!hasPermission(user, 'secretary', 'update')) return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const removed = await deleteIncorporationApplicationFile(fileId);
  if (!removed) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

