import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { findClientById, listJobs, listTasksByJob, updateClient } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';

export async function GET(_: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const { clientId } = await params;

  const canViewAllClients = hasPermission(user, 'clients', 'viewAll');
  const canViewAssignedClients = hasPermission(user, 'clients', 'viewAssigned');
  if (!canViewAllClients && !canViewAssignedClients) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const client = await findClientById(clientId);
  if (!client) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

  if (!canViewAllClients) {
    const jobs = await listJobs();
    const visible = (
      await Promise.all(
        jobs
          .filter((j) => j.clientId === clientId)
          .map(async (j) => {
            const tasks = await listTasksByJob(j.id);
            const assigned =
              j.managerUserId === user.id ||
              j.staffUserId === user.id ||
              j.createdByUserId === user.id ||
              tasks.some((t) => t.assigneeUserId === user.id);
            return assigned ? j : null;
          }),
      )
    ).some(Boolean);
    if (!visible) return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  return NextResponse.json({ ok: true, client });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!hasPermission(user, 'clients', 'update')) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const { clientId } = await params;

  const client = await findClientById(clientId);
  if (!client) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

  const body = (await req.json().catch(() => null)) as
    | { code?: string; name?: string; phone?: string; email?: string; tags?: string[] }
    | null;

  const code = typeof body?.code === 'string' ? body.code.trim() : undefined;
  const name = typeof body?.name === 'string' ? body.name.trim() : undefined;
  const phone = typeof body?.phone === 'string' ? body.phone.trim() || undefined : undefined;
  const email = typeof body?.email === 'string' ? body.email.trim() || undefined : undefined;
  const tags = Array.isArray(body?.tags) ? body?.tags.filter(Boolean) : undefined;

  if (typeof body?.code === 'string' && !code) return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
  if (typeof body?.name === 'string' && !name) return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });

  const updated = await updateClient(clientId, { ...(code !== undefined ? { code } : {}), ...(name !== undefined ? { name } : {}), phone, email, ...(tags ? { tags } : {}) });
  if (!updated) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
  return NextResponse.json({ ok: true, client: updated });
}

