import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createTask, findJobById, listTasksByJob, listUsers } from '@/lib/db';
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

  const canViewAll = hasPermission(user, 'tasks', 'viewAll') || hasPermission(user, 'jobs', 'viewAll');
  const canViewAssigned = hasPermission(user, 'tasks', 'viewAssigned') || hasPermission(user, 'jobs', 'viewAssigned');
  const tasks = await listTasksByJob(jobId);
  const assigned =
    job.managerUserId === user.id ||
    job.staffUserId === user.id ||
    job.createdByUserId === user.id ||
    tasks.some((t) => t.assigneeUserId === user.id);
  if (!canViewAll && !(canViewAssigned && assigned)) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }
  const users = await listUsers();
  const nameById = new Map(users.map((u) => [u.id, u.name]));
  const enriched = tasks.map((t) => ({
    ...t,
    createdByName: t.createdByUserId ? nameById.get(t.createdByUserId) ?? null : null,
    assigneeName: t.assigneeUserId ? nameById.get(t.assigneeUserId) ?? null : null,
  }));
  return NextResponse.json({ ok: true, tasks: enriched });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!hasPermission(user, 'tasks', 'create')) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const { jobId } = await params;
  const job = await findJobById(jobId);
  if (!job) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
  const canModify = user.role === 'owner' || (user.role === 'manager' && job.managerUserId === user.id);
  if (!canModify) return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });

  const body = (await req.json().catch(() => null)) as
    | { title?: string; dueDate?: string; assigneeUserId?: string }
    | null;
  const title = body?.title?.trim() ?? '';
  const dueDate = body?.dueDate?.trim() || new Date().toISOString().slice(0, 10);
  const users = await listUsers();
  const userIdSet = new Set(users.map((u) => u.id));
  const requestedAssignee = body?.assigneeUserId?.trim() || undefined;
  const assigneeUserId =
    requestedAssignee && userIdSet.has(requestedAssignee) ? requestedAssignee : undefined;

  if (!title) return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
  if (!assigneeUserId) return NextResponse.json({ ok: false, error: 'TASK_UNASSIGNED' }, { status: 400 });

  const task = await createTask({
    jobId,
    title,
    dueDate,
    assigneeUserId,
    status: 'Todo',
    createdByUserId: user.id,
  });
  const createdByName = users.find((u) => u.id === user.id)?.name ?? null;
  const assigneeName = assigneeUserId ? users.find((u) => u.id === assigneeUserId)?.name ?? null : null;
  return NextResponse.json({ ok: true, task: { ...task, createdByName, assigneeName } });
}
