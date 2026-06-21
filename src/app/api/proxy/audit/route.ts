import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { appendAuditLog, readDb } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (user.role === 'client') return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  if (!hasPermission(user, 'proxy', 'viewAll') && !hasPermission(user, 'proxy', 'viewAssigned')) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as
    | { action?: unknown; companyId?: unknown; proxyMeta?: unknown }
    | null;
  const actionRaw = String(body?.action ?? '').trim();
  const companyId = String(body?.companyId ?? '').trim();
  if (!companyId) return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
  if (actionRaw !== 'enter' && actionRaw !== 'exit' && actionRaw !== 'switch') {
    return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
  }

  const db = await readDb();
  const company = db.clients.find((c) => c.id === companyId) ?? null;
  if (!company || company.deletedAt) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

  const canViewAll = hasPermission(user, 'proxy', 'viewAll');
  if (!canViewAll) {
    const assignedJobId = new Set(
      db.tasks
        .filter((t) => (t as any).assigneeUserId === user.id)
        .map((t) => String((t as any).jobId ?? ''))
        .filter(Boolean),
    );
    const visible = db.jobs.some((j) => {
      if (j.clientId !== companyId) return false;
      return (
        j.managerUserId === user.id ||
        (j as any).staffUserId === user.id ||
        (j as any).createdByUserId === user.id ||
        assignedJobId.has(j.id)
      );
    });
    if (!visible) return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const proxyMeta = typeof body?.proxyMeta === 'object' && body?.proxyMeta ? (body?.proxyMeta as Record<string, unknown>) : undefined;
  const action = `proxy_${actionRaw}`;
  await appendAuditLog({
    actorUserId: user.id,
    actorName: user.name,
    actorRole: user.role,
    area: 'proxy',
    action,
    entityType: 'client',
    entityId: companyId,
    summary: `${actionRaw.toUpperCase()} Proxy: ${company.code} ${company.name}`,
    meta: { companyId, companyCode: company.code, companyName: company.name, ...proxyMeta },
  });

  return NextResponse.json({ ok: true });
}

