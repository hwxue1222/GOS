import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createJob, createTask, listClients, listJobs, listTasksByJob, listUsers } from '@/lib/db';
import { computeJobStatus } from '@/lib/jobStatus';
import type { JobRepeat, TaskStatus } from '@/lib/types';
import { hasPermission } from '@/lib/permissions';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const [clients, jobs, users] = await Promise.all([listClients(), listJobs(), listUsers()]);

  const canViewAll = hasPermission(user, 'jobs', 'viewAll');
  const canViewAssigned = hasPermission(user, 'jobs', 'viewAssigned');
  if (!canViewAll && !canViewAssigned) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const visibleJobs = canViewAll
    ? jobs
    : jobs.filter((j) => j.managerUserId === user.id || j.staffUserId === user.id);

  const items = await Promise.all(
    visibleJobs.map(async (job) => {
      const client = clients.find((c) => c.id === job.clientId) ?? null;
      const manager = job.managerUserId ? users.find((u) => u.id === job.managerUserId) ?? null : null;
      const staff = job.staffUserId ? users.find((u) => u.id === job.staffUserId) ?? null : null;
      const tasks = await listTasksByJob(job.id);
      const done = tasks.filter((t) => t.status === 'Done').length;
      const status = computeJobStatus(tasks);
      return {
        job: { ...job, status },
        client,
        tasks: { done, total: tasks.length },
        manager: manager ? { id: manager.id, name: manager.name } : null,
        staff: staff ? { id: staff.id, name: staff.name } : null,
      };
    }),
  );

  return NextResponse.json({ ok: true, items });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!hasPermission(user, 'jobs', 'create')) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as
    | {
        clientId?: string;
        name?: string;
        label?: string;
        dueDate?: string;
        repeat?: JobRepeat;
        managerUserId?: string;
        staffUserId?: string;
        tasks?: Array<{ title?: string; dueDate?: string; assigneeUserId?: string; status?: TaskStatus }>;
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

  const job = await createJob({
    clientId,
    name,
    label,
    dueDate,
    repeat,
    status: 'Pending',
    managerUserId,
    staffUserId,
  });

  const createdTasks = hasTasks
    ? await Promise.all(
        tasks
          .map((t) => ({
            title: t.title?.trim() ?? '',
            dueDate: t.dueDate?.trim() || undefined,
            assigneeUserId: t.assigneeUserId?.trim() || staffUserId,
            status: (t.status === 'Done' ? 'Done' : 'Todo') as TaskStatus,
          }))
          .filter((t) => !!t.title)
          .map((t) =>
            createTask({
              jobId: job.id,
              title: t.title,
              dueDate: t.dueDate,
              assigneeUserId: t.assigneeUserId,
              status: t.status,
            }),
          ),
      )
    : [];

  return NextResponse.json({ ok: true, job, tasks: createdTasks });
}
