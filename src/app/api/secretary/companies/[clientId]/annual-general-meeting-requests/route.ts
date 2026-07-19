import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { appendAuditLog, createAnnualGeneralMeetingRequest, readDb } from '@/lib/db';
import { sendSigningInvite } from '@/lib/email';
import { hasPermission } from '@/lib/permissions';

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

export async function POST(req: Request, ctx: { params: Promise<{ clientId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const { clientId } = await ctx.params;

  const proxyCompanyId = (req.headers.get('x-gos-proxy-company-id') ?? '').trim();
  const canProxy = hasPermission(user, 'proxy', 'viewAll') || hasPermission(user, 'proxy', 'viewAssigned');
  const isProxyingThisCompany = !!proxyCompanyId && proxyCompanyId === clientId;

  if (user.role !== 'client') {
    const canViewSecretary = hasPermission(user, 'secretary', 'viewAll') || hasPermission(user, 'secretary', 'viewAssigned');
    if (!canViewSecretary && !(user.role === 'staff' && canProxy && isProxyingThisCompany)) {
      return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
    }
  }
  if (!(await canAccessClient(user, clientId))) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const allowCreate = user.role === 'client' || (user.role === 'staff' && canProxy && isProxyingThisCompany);
  if (!allowCreate) return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });

  const body = (await req.json().catch(() => null)) as
    | {
        meetingDate?: string;
        meetingTime?: string;
        meetingVenue?: string;
        chairman?: string;
        directorSendingNotice?: string;
        companyCategory?: string;
        fiscalYearReport?: string;
        useByBridgeRegisteredOfficeAddress?: boolean;
      }
    | null;

  const meetingDate = typeof body?.meetingDate === 'string' ? body.meetingDate.trim() : '';
  const meetingTime = typeof body?.meetingTime === 'string' ? body.meetingTime.trim() : '';
  const meetingVenue = typeof body?.meetingVenue === 'string' ? body.meetingVenue.trim() : '';
  const chairman = typeof body?.chairman === 'string' ? body.chairman.trim() : '';
  const noticeDirector = typeof body?.directorSendingNotice === 'string' ? body.directorSendingNotice.trim() : '';
  const companyCategory = typeof body?.companyCategory === 'string' ? body.companyCategory.trim() : undefined;
  const fiscalYearReport = typeof body?.fiscalYearReport === 'string' ? body.fiscalYearReport.trim() : '';
  const useByBridgeRegisteredOfficeAddress = !!body?.useByBridgeRegisteredOfficeAddress;

  const r = await createAnnualGeneralMeetingRequest({
    clientId,
    createdByUserId: user.id,
    meetingDate,
    meetingTime,
    meetingVenue,
    chairman,
    noticeDirector,
    companyCategory,
    fiscalYearReport,
    useByBridgeRegisteredOfficeAddress,
  });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });

  await appendAuditLog({
    actorUserId: user.id,
    actorName: user.name,
    actorRole: user.role,
    area: 'secretary',
    action: 'create_agm_request',
    entityType: 'annual_general_meeting_request',
    entityId: r.request.id,
    summary: `Create AGM request: ${r.request.id}`,
  });

  const baseUrl = resolveBaseUrl(req);
  const db = await readDb();
  const client = db.clients.find((c) => c.id === clientId) ?? null;
  const companyName = client?.name ?? clientId;
  await Promise.all(
    r.signLinks.map((l) =>
      sendSigningInvite({
        to: l.email,
        url: `${baseUrl}${l.url}`,
        companyName,
        applicationName: 'Annual General Meeting',
        documentTitle: l.documentTitle,
        signerRole: `Director of ${companyName}`,
      }),
    ),
  );

  await appendAuditLog({
    actorUserId: user.id,
    actorName: user.name,
    actorRole: user.role,
    area: 'secretary',
    action: 'send_agm_invites',
    entityType: 'annual_general_meeting_request',
    entityId: r.request.id,
    summary: `Send AGM signature invites: ${r.request.id}`,
  });

  return NextResponse.json({ ok: true, request: r.request, signLinks: r.signLinks });
}
