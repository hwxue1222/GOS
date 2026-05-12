import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { completeAllTasksForJob, findJobById, listClients, listTasksByJob, listUsers, updateJob } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';
import type { JobRepeat } from '@/lib/types';

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
  const tasks = await listTasksByJob(jobId);
  const assigned =
    job.managerUserId === user.id ||
    job.staffUserId === user.id ||
    job.createdByUserId === user.id ||
    tasks.some((t) => t.assigneeUserId === user.id);
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

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!hasPermission(user, 'jobs', 'update')) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const { jobId } = await params;
  const job = await findJobById(jobId);
  if (!job) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

  const canModify = user.role === 'owner' || (user.role === 'manager' && job.managerUserId === user.id);
  if (!canModify) return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });

  const body = (await req.json().catch(() => null)) as
    | {
        name?: string;
        label?: string;
        dueDate?: string;
        repeat?: JobRepeat;
        managerUserId?: string;
        staffUserId?: string;
        completed?: boolean;
      }
    | null;
  const hasJobFields =
    typeof body?.name === 'string' ||
    typeof body?.label === 'string' ||
    typeof body?.dueDate === 'string' ||
    typeof body?.repeat === 'string' ||
    typeof body?.managerUserId === 'string';
  const wantsCompleted = typeof body?.completed === 'boolean';
  if (!hasJobFields && !wantsCompleted) {
    return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
  }

  const name = typeof body?.name === 'string' ? body.name.trim() : undefined;
  if (typeof body?.name === 'string' && !name) return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
  const label = typeof body?.label === 'string' ? body.label.trim() || undefined : undefined;
  const dueDate = body?.dueDate?.trim() || undefined;
  const repeat = body?.repeat ?? 'none';
  const managerUserId = body?.managerUserId || undefined;

  const users = await listUsers();
  if (managerUserId) {
    const u = users.find((x) => x.id === managerUserId);
    if (!u || (u.role !== 'manager' && u.role !== 'owner')) {
      return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
    }
  }

  const patch: Parameters<typeof updateJob>[1] = {};
  if (typeof name === 'string') patch.name = name;
  if (typeof body?.label === 'string') patch.label = label;
  if (typeof body?.dueDate === 'string') patch.dueDate = dueDate;
  if (typeof body?.repeat === 'string') patch.repeat = repeat;
  if (typeof body?.managerUserId === 'string') patch.managerUserId = managerUserId;
  if (typeof body?.completed === 'boolean') {
    patch.completed = body.completed;
    if (body.completed) {
      await completeAllTasksForJob(jobId);
    }
  }

  const updated = await updateJob(jobId, patch);
  if (!updated) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
  return NextResponse.json({ ok: true, job: updated });
}
