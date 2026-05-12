import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createManyJobsWithTasks, findJobById, listTasksByJob, listUsers } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';
import { addMonthsYmd } from '@/lib/date';
import type { JobRepeat } from '@/lib/types';

function toYmd(input: string) {
  const trimmed = input.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export async function POST(req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  if (user.role !== 'owner' && user.role !== 'manager') {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }
  if (!hasPermission(user, 'jobs', 'create') || !hasPermission(user, 'jobs', 'duplicate')) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const { jobId } = await params;
  const source = await findJobById(jobId);
  if (!source) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

  const canViewAll = hasPermission(user, 'jobs', 'viewAll');
  const canViewAssigned = hasPermission(user, 'jobs', 'viewAssigned');
  if (!canViewAll && !canViewAssigned) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const sourceTasks = await listTasksByJob(jobId);
  const assigned =
    source.managerUserId === user.id ||
    source.staffUserId === user.id ||
    source.createdByUserId === user.id ||
    sourceTasks.some((t) => t.assigneeUserId === user.id);
  if (!canViewAll && !(canViewAssigned && assigned)) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as
    | {
        clientIds?: string[];
        name?: string;
        label?: string;
        dueDate?: string;
        repeat?: JobRepeat;
        managerUserId?: string;
        tasks?: Array<{
          title?: string;
          createdAt?: string;
          assigneeUserId?: string;
        }>;
      }
    | null;

  const clientIds = Array.isArray(body?.clientIds) ? body!.clientIds.filter(Boolean) : [];
  const name = body?.name?.trim() ?? '';
  const label = body?.label?.trim() || undefined;
  const dueDate = body?.dueDate?.trim() || undefined;
  const repeat = body?.repeat ?? 'none';
  const managerUserId = body?.managerUserId || undefined;
  const tasks = Array.isArray(body?.tasks) ? body!.tasks : [];

  if (!clientIds.length || !name) {
    return NextResponse.json({ ok: false, error: 'INVALID_INPUT', field: !clientIds.length ? 'clientIds' : 'name' }, { status: 400 });
  }
  if (repeat !== 'none' && !dueDate) {
    return NextResponse.json({ ok: false, error: 'INVALID_INPUT', field: 'dueDate' }, { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10);

  const hasTasks = tasks.some((t) => (t.title?.trim() ?? '') !== '');
  if (hasTasks && !hasPermission(user, 'tasks', 'create')) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }
  const hasUnassignedTask = tasks.some((t) => (t.title?.trim() ?? '') !== '' && !(t.assigneeUserId?.trim() ?? ''));
  if (hasUnassignedTask) {
    return NextResponse.json({ ok: false, error: 'TASK_UNASSIGNED', field: 'tasks' }, { status: 400 });
  }

  const users = (hasTasks || managerUserId) ? await listUsers() : [];
  const userIdSet = new Set(users.map((u) => u.id));
  const userById = new Map(users.map((u) => [u.id, u]));
  if (managerUserId) {
    const u = userById.get(managerUserId);
    if (!u || u.role !== 'manager') {
      return NextResponse.json({ ok: false, error: 'INVALID_INPUT', field: 'managerUserId' }, { status: 400 });
    }
  }

  if (hasTasks) {
    const requestedAssignees = tasks
      .map((t) => ({ title: t.title?.trim() ?? '', assigneeUserId: t.assigneeUserId?.trim() ?? '' }))
      .filter((t) => t.title)
      .map((t) => t.assigneeUserId)
      .filter(Boolean);
    for (const id of requestedAssignees) {
      if (!userIdSet.has(id)) {
        return NextResponse.json({ ok: false, error: 'INVALID_INPUT', field: 'tasks' }, { status: 400 });
      }
      const a = userById.get(id);
      if (!a || a.role === 'owner') {
        return NextResponse.json({ ok: false, error: 'ASSIGNEE_FORBIDDEN', field: 'tasks' }, { status: 400 });
      }
      if (user.role === 'manager' && a.id !== user.id && a.role !== 'staff') {
        return NextResponse.json({ ok: false, error: 'ASSIGNEE_FORBIDDEN', field: 'tasks' }, { status: 400 });
      }
    }
  }

  const normalizedTasks = hasTasks
    ? tasks
        .map((t, idx) => ({
          title: t.title?.trim() ?? '',
          createdAt: typeof t.createdAt === 'string' ? toYmd(t.createdAt) ?? today : today,
          assigneeUserId:
            t.assigneeUserId?.trim() && userIdSet.has(t.assigneeUserId.trim()) ? t.assigneeUserId.trim() : undefined,
          status: 'Todo' as const,
          seq: idx + 1,
          sortOrder: idx + 1,
          createdByUserId: user.id,
        }))
        .filter((t) => !!t.title)
    : [];
  const normalizedTasksWithDueDate = normalizedTasks.map((t) => ({ ...t, dueDate: t.createdAt }));

  const monthDelta =
    repeat === 'monthly' ? 1 : repeat === 'quarterly' ? 3 : repeat === 'yearly' ? 12 : repeat === '2-yearly' ? 24 : 0;
  const recurringDueDate = monthDelta && dueDate ? addMonthsYmd(dueDate, monthDelta) : null;

  const jobsToCreate = clientIds.map((clientId) => {
    const baseJob = {
      clientId,
      name,
      label,
      dueDate,
      repeat,
      status: 'Pending' as const,
      completed: false,
      managerUserId,
      staffUserId: undefined,
      createdByUserId: user.id,
    };

    if (repeat !== 'none' && recurringDueDate) {
      const recurringTasks = normalizedTasksWithDueDate;
      return {
        job: baseJob,
        tasks: normalizedTasksWithDueDate,
        recurringJob: { ...baseJob, dueDate: recurringDueDate },
        recurringTasks,
      };
    }

    return { job: baseJob, tasks: normalizedTasksWithDueDate };
  });

  await createManyJobsWithTasks(jobsToCreate);
  return NextResponse.json({ ok: true });
}
