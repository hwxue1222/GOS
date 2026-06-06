import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { findIncorporationApplicationFileById, getIncorporationApplicationDetail, readDb } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';

function sanitizeFilename(input: string) {
  const s = input.trim();
  if (!s) return 'file';
  return s.replaceAll(/[^a-zA-Z0-9._-]+/g, '_');
}

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

export async function GET(_req: Request, ctx: { params: Promise<{ fileId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const { fileId } = await ctx.params;

  const f = await findIncorporationApplicationFileById(fileId);
  if (!f) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
  const detail = await getIncorporationApplicationDetail(f.applicationId);
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

  const bytes = Buffer.from(f.dataBase64, 'base64');
  const filename = sanitizeFilename(f.fileName);
  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': f.mimeType || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

