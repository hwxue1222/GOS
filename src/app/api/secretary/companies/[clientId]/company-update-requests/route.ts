import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { appendAuditLog, createCompanyUpdateRequest, listCompanyUpdateRequestsByClient, readDb } from '@/lib/db';
import { sendSigningInvite } from '@/lib/email';
import { hasPermission } from '@/lib/permissions';
import type { CompanyUpdateRequestType } from '@/lib/types';

function isActiveRole(r: { role: string; resignationDate?: string; toDate?: string }) {
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

const ALLOWED_TYPES: CompanyUpdateRequestType[] = [
  'CHANGE_COMPANY_NAME',
  'CHANGE_FINANCIAL_YEAR_END',
  'CHANGE_REGISTERED_OFFICE_ADDRESS',
  'CHANGE_BUSINESS_ACTIVITIES',
  'CHANGE_SECRETARY',
  'TRANSFER_COMPANY_SECRETARY',
];

function resolveBaseUrl(req: Request) {
  const env = process.env.APP_BASE_URL?.trim();
  if (env) return env.replace(/\/+$/, '');

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) return `https://${vercelUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '')}`;

  const h = req.headers;
  const host = h.get('x-forwarded-host') || h.get('host');
  const proto = (h.get('x-forwarded-proto') || 'https').split(',')[0]!.trim();
  if (host) return `${proto}://${host}`;

  return new URL(req.url).origin;
}

export async function GET(_req: Request, ctx: { params: Promise<{ clientId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const { clientId } = await ctx.params;
  if (user.role !== 'client') {
    if (!hasPermission(user, 'secretary', 'viewAll') && !hasPermission(user, 'secretary', 'viewAssigned')) {
      return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
    }
  }
  if (!(await canAccessClient(user, clientId))) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const list = await listCompanyUpdateRequestsByClient(clientId);
  return NextResponse.json({ ok: true, items: list });
}

export async function POST(req: Request, ctx: { params: Promise<{ clientId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const { clientId } = await ctx.params;
  if (user.role !== 'client') {
    if (!hasPermission(user, 'secretary', 'viewAll') && !hasPermission(user, 'secretary', 'viewAssigned')) {
      return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
    }
  }
  if (!(await canAccessClient(user, clientId))) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }
  if (user.role !== 'client') {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { type?: unknown; payload?: unknown } | null;
  const type = (typeof body?.type === 'string' ? body.type.trim() : '') as CompanyUpdateRequestType;
  if (!ALLOWED_TYPES.includes(type)) return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
  const payload = (body?.payload && typeof body.payload === 'object' ? (body.payload as Record<string, unknown>) : {}) as Record<string, unknown>;

  const r = await createCompanyUpdateRequest({ clientId, type, payload, createdByUserId: user.id });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });

  await appendAuditLog({
    actorUserId: user.id,
    actorName: user.name,
    actorRole: user.role,
    area: 'secretary',
    action: 'create_company_update_request',
    entityType: 'company_update_request',
    entityId: r.request.id,
    summary: `Create company update request: ${r.request.id}`,
  });

  const baseUrl = resolveBaseUrl(req);
  const signLinks = (r as unknown as { signLinks?: Array<{ email: string; url: string }> }).signLinks ?? [];
  const db = await readDb();
  const client = db.clients.find((c) => c.id === clientId) ?? null;
  const companyName = client?.name ?? clientId;
  const applicationName =
    type === 'CHANGE_COMPANY_NAME'
      ? 'change of company name'
      : type === 'CHANGE_FINANCIAL_YEAR_END'
        ? 'change of financial year end (FYE)'
        : type === 'CHANGE_REGISTERED_OFFICE_ADDRESS'
          ? 'change of registered office address'
          : type === 'CHANGE_BUSINESS_ACTIVITIES'
            ? 'change of business activities'
            : type === 'CHANGE_SECRETARY'
              ? 'change of secretary'
              : type === 'TRANSFER_COMPANY_SECRETARY'
                ? 'transfer of company secretary'
                : String(type).toLowerCase();
  await Promise.all(
    signLinks.map((l) =>
      sendSigningInvite({
        to: l.email,
        title: (l as { title?: string }).title ?? `${applicationName} - ${companyName}`,
        url: `${baseUrl}${l.url}`,
      }),
    ),
  );

  return NextResponse.json({ ok: true, request: r.request, signLinks });
}
