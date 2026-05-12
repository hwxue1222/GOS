import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { findJobById, listClients, listUsers } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const { jobId } = await params;
  const job = await findJobById(jobId);
  if (!job) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

  const canViewAll = hasPermission(user, 'jobs', 'viewAll');
  const canViewAssigned = hasPermission(user, 'jobs', 'viewAssigned');
  const assigned = job.managerUserId === user.id || job.staffUserId === user.id;
  if (!canViewAll && !(canViewAssigned && assigned)) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const [clients, users] = await Promise.all([listClients(), listUsers()]);
  const client = clients.find((c) => c.id === job.clientId) ?? null;
  const manager = job.managerUserId ? users.find((u) => u.id === job.managerUserId) ?? null : null;
  const staff = job.staffUserId ? users.find((u) => u.id === job.staffUserId) ?? null : null;

  return NextResponse.json({
    ok: true,
    job,
    client,
    manager: manager ? { id: manager.id, name: manager.name } : null,
    staff: staff ? { id: staff.id, name: staff.name } : null,
  });
}
