import { NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth';
import { addIncorporationApplicationFile, getIncorporationApplicationDetail, readDb, updateIncorporationApplicationFile } from '@/lib/db';
import { sendEmail } from '@/lib/email';
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

function escapeHtml(s: string) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
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
    if (!hasPermission(user, 'secretary', 'update')) return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as
    | {
        files?: Array<{ fileName?: string; mimeType?: string; dataBase64?: string }>;
      }
    | null;

  const incoming = Array.isArray(body?.files) ? body!.files : [];
  if (!incoming.length) return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });

  const maxEach = 2 * 1024 * 1024;
  const maxTotal = 15 * 1024 * 1024;
  let total = 0;

  const normalized = incoming
    .map((f) => ({
      fileName: typeof f.fileName === 'string' ? f.fileName.trim() : '',
      mimeType: typeof f.mimeType === 'string' ? f.mimeType.trim() : 'application/octet-stream',
      dataBase64: typeof f.dataBase64 === 'string' ? f.dataBase64.trim() : '',
    }))
    .filter((f) => f.fileName && f.dataBase64);

  if (!normalized.length) return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });

  for (const f of normalized) {
    const size = base64SizeBytes(f.dataBase64);
    if (!Number.isFinite(size) || size <= 0 || size > maxEach) return NextResponse.json({ ok: false, error: 'FILE_TOO_LARGE' }, { status: 400 });
    total += size;
    if (total > maxTotal) return NextResponse.json({ ok: false, error: 'FILES_TOO_LARGE' }, { status: 400 });
  }

  const created = [] as Array<{ id: string; fileName: string; mimeType: string; size: number; uploadedByName: string; uploadedAt: string }>;
  for (const f of normalized) {
    const size = base64SizeBytes(f.dataBase64);
    const createdFile = await addIncorporationApplicationFile({
      applicationId,
      fileName: f.fileName,
      mimeType: f.mimeType,
      size,
      dataBase64: '',
      uploadedBy: { id: user.id, name: user.name },
    });
    created.push({
      id: createdFile.id,
      fileName: createdFile.fileName,
      mimeType: createdFile.mimeType,
      size: createdFile.size,
      uploadedByName: createdFile.uploadedByName,
      uploadedAt: createdFile.uploadedAt,
    });
  }

  const to = 'Luke@bby.sg';
  const origin = new URL(req.url).origin;
  const serviceTitle = app.type === 'REGISTER_COMPANY' ? 'Register Company' : 'Transfer of Company Secretary';
  const company = (app.companyName ?? '').trim() || '-';
  const subject = `Materials_${serviceTitle}_${company}_${app.status}`;
  const detailsUrl = `${origin}/incorporation/applications/${encodeURIComponent(app.id)}`;

  const html = `
    <div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial; line-height:1.55; color:#111;">
      <div style="font-size:16px; font-weight:700;">Materials / 资料</div>
      <div style="margin-top:10px; font-size:13px;">
        <div><b>Service:</b> ${escapeHtml(serviceTitle)}</div>
        <div><b>Company:</b> ${escapeHtml(company)}</div>
        <div><b>Status:</b> ${escapeHtml(app.status)}</div>
        <div><b>Application ID:</b> ${escapeHtml(app.id)}</div>
        <div><b>Uploaded by:</b> ${escapeHtml(user.name)} (${escapeHtml(user.email || '-')})</div>
        <div><b>Details:</b> <a href="${escapeHtml(detailsUrl)}" target="_blank" rel="noreferrer">${escapeHtml(detailsUrl)}</a></div>
      </div>
      <div style="margin-top:12px; font-size:13px;">
        <div style="font-weight:600;">Files</div>
        <ul style="margin:8px 0 0 18px; padding:0;">${created.map((f) => `<li>${escapeHtml(f.fileName)}</li>`).join('')}</ul>
      </div>
    </div>
  `;

  const emailRes = await sendEmail({
    to,
    subject,
    html,
    attachments: normalized.map((f) => ({ filename: f.fileName, contentBase64: f.dataBase64, contentType: f.mimeType })),
  });

  const emailedAt = new Date().toISOString();
  if (emailRes.ok) {
    await Promise.all(
      created.map((f) => updateIncorporationApplicationFile(f.id, { emailStatus: 'SENT', emailedTo: to, emailedAt, emailError: undefined })),
    );
  } else {
    await Promise.all(
      created.map((f) => updateIncorporationApplicationFile(f.id, { emailStatus: 'FAILED', emailedTo: to, emailedAt, emailError: emailRes.error })),
    );
  }

  return NextResponse.json({ ok: true, emailOk: emailRes.ok, error: emailRes.ok ? undefined : emailRes.error });
}
