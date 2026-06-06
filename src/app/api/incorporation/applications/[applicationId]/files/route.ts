import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { addIncorporationApplicationFile, getIncorporationApplicationDetail, readDb } from '@/lib/db';
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

function base64SizeBytes(b64: string) {
  const clean = b64.replaceAll(/\s+/g, '');
  const pad = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  return Math.floor((clean.length * 3) / 4) - pad;
}

export async function POST(req: Request, ctx: { params: Promise<{ applicationId: string }> }) {
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

  const body = (await req.json().catch(() => null)) as
    | {
        fileName?: string;
        mimeType?: string;
        dataBase64?: string;
      }
    | null;
  const fileName = typeof body?.fileName === 'string' ? body.fileName.trim() : '';
  const mimeType = typeof body?.mimeType === 'string' ? body.mimeType.trim() : '';
  const dataBase64 = typeof body?.dataBase64 === 'string' ? body.dataBase64.trim() : '';
  if (!fileName || !mimeType || !dataBase64) return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });

  const size = base64SizeBytes(dataBase64);
  const max = 2 * 1024 * 1024;
  if (!Number.isFinite(size) || size <= 0 || size > max) return NextResponse.json({ ok: false, error: 'FILE_TOO_LARGE' }, { status: 400 });

  const file = await addIncorporationApplicationFile({
    applicationId,
    fileName,
    mimeType,
    size,
    dataBase64,
    uploadedBy: { id: user.id, name: user.name },
  });

  return NextResponse.json({ ok: true, file: { ...file, dataBase64: undefined } });
}

