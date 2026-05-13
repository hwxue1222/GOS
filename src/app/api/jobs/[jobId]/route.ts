import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  createJobWithTasks,
  completeAllTasksForJob,
  deleteJob,
  findJobById,
  listClients,
  listJobs,
  listTasksByJob,
  listUsers,
  updateJob,
} from '@/lib/db';
import { addMonthsYmd } from '@/lib/date';
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
    if (!u || u.role !== 'manager') {
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

  const justCompleted = wantsCompleted && body?.completed === true && !job.completed;
  const effectiveRepeat = typeof body?.repeat === 'string' ? repeat : job.repeat;
  const effectiveDueDate = typeof body?.dueDate === 'string' ? dueDate : job.dueDate;
  const monthDelta =
    effectiveRepeat === 'monthly'
      ? 1
      : effectiveRepeat === 'quarterly'
        ? 3
        : effectiveRepeat === 'yearly'
          ? 12
          : effectiveRepeat === '2-yearly'
            ? 24
            : 0;

  if (justCompleted && effectiveRepeat !== 'none' && monthDelta && effectiveDueDate) {
    const nextDueDate = addMonthsYmd(effectiveDueDate, monthDelta);
    if (nextDueDate) {
      const jobs = await listJobs();
      const hasNext = jobs.some((j) => j.recurringFromJobId === jobId && !j.deletedAt);
      if (!hasNext) {
        const tasks = await listTasksByJob(jobId);
        const recurringTasks = tasks.map((t, idx) => ({
          title: t.title,
          dueDate: t.dueDate ? addMonthsYmd(t.dueDate, monthDelta) ?? t.dueDate : undefined,
          status: 'Todo' as const,
          assigneeUserId: t.assigneeUserId,
          seq: idx + 1,
          sortOrder: idx + 1,
          createdByUserId: user.id,
        }));
        await createJobWithTasks(
          {
            clientId: job.clientId,
            name: updated.name,
            label: updated.label,
            dueDate: nextDueDate,
            repeat: effectiveRepeat,
            status: 'Pending',
            completed: false,
            managerUserId: updated.managerUserId,
            staffUserId: updated.staffUserId,
            createdByUserId: user.id,
            recurringFromJobId: jobId,
          },
          recurringTasks,
        );
      }
    }
  }

  return NextResponse.json({ ok: true, job: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (user.role !== 'owner') {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const { jobId } = await params;
  const deleted = await deleteJob(jobId);
  if (!deleted) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
