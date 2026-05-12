import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createJobWithRecurringCopy, createJobWithTasks, listClients, listJobs, listTasksByJob, listUsers } from '@/lib/db';
import { computeJobStatus } from '@/lib/jobStatus';
import type { JobRepeat, TaskStatus } from '@/lib/types';
import { hasPermission } from '@/lib/permissions';
import { addMonthsYmd } from '@/lib/date';

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const [clients, jobs, users] = await Promise.all([listClients(), listJobs(), listUsers()]);
  const overdueUserId = new URL(req.url).searchParams.get('overdueUserId') ?? '';
  const at = new URL(req.url).searchParams.get('at') ?? '';

  const canViewAll = hasPermission(user, 'jobs', 'viewAll');
  const canViewAssigned = hasPermission(user, 'jobs', 'viewAssigned');
  if (!canViewAll && !canViewAssigned) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const taskByJobId = new Map<string, Awaited<ReturnType<typeof listTasksByJob>>>();
  const visibleJobs = canViewAll
    ? jobs
    : (
        await Promise.all(
          jobs.map(async (job) => {
            const tasks = await listTasksByJob(job.id);
            taskByJobId.set(job.id, tasks);
            const assigned =
              job.managerUserId === user.id ||
              job.staffUserId === user.id ||
              job.createdByUserId === user.id ||
              tasks.some((t) => t.assigneeUserId === user.id);
            return assigned ? job : null;
          }),
        )
      ).filter(Boolean);

  const nowTime = at ? Number(at) : Date.now();
  const items = (
    await Promise.all(
      (visibleJobs as typeof jobs).map(async (job) => {
      const client = clients.find((c) => c.id === job.clientId) ?? null;
      const manager = job.managerUserId ? users.find((u) => u.id === job.managerUserId) ?? null : null;
      const staff = job.staffUserId ? users.find((u) => u.id === job.staffUserId) ?? null : null;
      const tasks = taskByJobId.get(job.id) ?? (await listTasksByJob(job.id));

      if (overdueUserId) {
        if (job.deletedAt) return null;
        if (job.completed) return null;
        const hit = tasks.some((t) => {
          if (t.status !== 'Todo') return false;
          const assigneeId = t.assigneeUserId ?? job.staffUserId;
          if (!assigneeId || assigneeId !== overdueUserId) return false;
          const due = t.dueDate ?? job.dueDate;
          if (!due) return false;
          const dueTime = new Date(due).getTime();
          if (Number.isNaN(dueTime)) return false;
          return nowTime ? dueTime < nowTime : false;
        });
        if (!hit) return null;
      }

      const done = tasks.filter((t) => t.status === 'Done').length;
      const status = job.completed ? 'Complete' : computeJobStatus(tasks);
      return {
        job: { ...job, status },
        client,
        tasks: { done, total: tasks.length },
        manager: manager ? { id: manager.id, name: manager.name } : null,
        staff: staff ? { id: staff.id, name: staff.name } : null,
      };
      }),
    )
  ).filter(Boolean);

  return NextResponse.json({ ok: true, items });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!hasPermission(user, 'jobs', 'create')) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const today = new Date().toISOString().slice(0, 10);

  const body = (await req.json().catch(() => null)) as
    | {
        clientId?: string;
        name?: string;
        label?: string;
        dueDate?: string;
        repeat?: JobRepeat;
        managerUserId?: string;
        staffUserId?: string;
        tasks?: Array<{
          title?: string;
          dueDate?: string;
          assigneeUserId?: string;
          status?: TaskStatus;
          seq?: number;
          sortOrder?: number;
        }>;
      }
    | null;

  const clientId = body?.clientId ?? '';
  const name = body?.name?.trim() ?? '';
  const label = body?.label?.trim() || undefined;
  const dueDate = body?.dueDate?.trim() || undefined;
  const repeat = body?.repeat ?? 'none';
  const managerUserId = body?.managerUserId || undefined;
  const staffUserId = body?.staffUserId || undefined;
  const tasks = Array.isArray(body?.tasks) ? body!.tasks : [];

  if (!clientId || !name) {
    return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
  }

  const hasTasks = tasks.some((t) => (t.title?.trim() ?? '') !== '');
  if (hasTasks && !hasPermission(user, 'tasks', 'create')) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }
  const hasDoneTasks = tasks.some((t) => t.status === 'Done');
  if (hasDoneTasks && !hasPermission(user, 'tasks', 'complete')) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }
  const hasUnassignedTask = tasks.some((t) => (t.title?.trim() ?? '') !== '' && !(t.assigneeUserId?.trim() ?? ''));
  if (hasUnassignedTask) {
    return NextResponse.json({ ok: false, error: 'TASK_UNASSIGNED' }, { status: 400 });
  }
  if (repeat !== 'none' && !dueDate) {
    return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
  }

  const users = hasTasks || managerUserId ? await listUsers() : [];
  const userIdSet = new Set(users.map((u) => u.id));
  const userById = new Map(users.map((u) => [u.id, u]));

  if (managerUserId) {
    const u = userById.get(managerUserId);
    if (!u || u.role !== 'manager') {
      return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
    }
  }

  if (hasTasks) {
    const requestedAssignees = tasks
      .map((t) => ({ title: t.title?.trim() ?? '', assigneeUserId: t.assigneeUserId?.trim() ?? '' }))
      .filter((t) => t.title)
      .map((t) => t.assigneeUserId)
      .filter(Boolean);
    for (const id of requestedAssignees) {
      if (!userIdSet.has(id)) return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
      const a = userById.get(id);
      if (!a || a.role === 'owner') return NextResponse.json({ ok: false, error: 'ASSIGNEE_FORBIDDEN' }, { status: 400 });
      if (user.role === 'manager' && a.id !== user.id && a.role !== 'staff') {
        return NextResponse.json({ ok: false, error: 'ASSIGNEE_FORBIDDEN' }, { status: 400 });
      }
    }
  }

  const normalizedTasks = hasTasks
    ? tasks
        .map((t, idx) => ({
          title: t.title?.trim() ?? '',
          dueDate: t.dueDate?.trim() || today,
          assigneeUserId:
            t.assigneeUserId?.trim() && userIdSet.has(t.assigneeUserId.trim()) ? t.assigneeUserId.trim() : undefined,
          status: (t.status === 'Done' ? 'Done' : 'Todo') as TaskStatus,
          seq: typeof t.seq === 'number' ? t.seq : idx + 1,
          sortOrder: typeof t.sortOrder === 'number' ? t.sortOrder : idx + 1,
          createdByUserId: user.id,
        }))
        .filter((t) => !!t.title)
    : [];

  const baseJob = {
    clientId,
    name,
    label,
    dueDate,
    repeat,
    status: 'Pending' as const,
    completed: false,
    managerUserId,
    staffUserId,
    createdByUserId: user.id,
  };
  const baseTasks = normalizedTasks.map((t) => ({
    title: t.title,
    dueDate: t.dueDate,
    assigneeUserId: t.assigneeUserId,
    status: t.status,
    seq: t.seq,
    sortOrder: t.sortOrder,
    createdByUserId: t.createdByUserId,
  }));

  const monthDelta =
    repeat === 'monthly' ? 1 : repeat === 'quarterly' ? 3 : repeat === 'yearly' ? 12 : repeat === '2-yearly' ? 24 : 0;
  const recurringDueDate = monthDelta && dueDate ? addMonthsYmd(dueDate, monthDelta) : null;

  if (repeat !== 'none' && recurringDueDate) {
    const recurringTasks = baseTasks.map((t) => ({
      ...t,
      status: 'Todo' as const,
      dueDate: t.dueDate ? addMonthsYmd(t.dueDate, monthDelta) ?? t.dueDate : t.dueDate,
    }));
    const created = await createJobWithRecurringCopy({
      job: baseJob,
      tasks: baseTasks,
      recurringJob: { ...baseJob, dueDate: recurringDueDate },
      recurringTasks,
    });
    return NextResponse.json({ ok: true, job: created.job });
  }

  const created = await createJobWithTasks(baseJob, baseTasks);
  return NextResponse.json({ ok: true, job: created.job });
}
