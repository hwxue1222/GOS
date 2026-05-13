import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createTask, findJobById, listTasksByJob, listUsers, readDb, writeDb } from '@/lib/db';
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
  const userById = new Map(users.map((u) => [u.id, u]));
  const requestedAssignee = body?.assigneeUserId?.trim() || undefined;
  const assigneeUserId =
    requestedAssignee && userIdSet.has(requestedAssignee) ? requestedAssignee : undefined;

  if (!title) return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
  if (!assigneeUserId) return NextResponse.json({ ok: false, error: 'TASK_UNASSIGNED' }, { status: 400 });
  const assignee = userById.get(assigneeUserId);
  if (!assignee || assignee.role === 'owner') {
    return NextResponse.json({ ok: false, error: 'ASSIGNEE_FORBIDDEN' }, { status: 400 });
  }
  if (user.role === 'manager' && assignee.id !== user.id && assignee.role !== 'staff') {
    return NextResponse.json({ ok: false, error: 'ASSIGNEE_FORBIDDEN' }, { status: 400 });
  }

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

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!hasPermission(user, 'tasks', 'update')) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const { jobId } = await params;
  const job = await findJobById(jobId);
  if (!job) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
  const canModify = user.role === 'owner' || (user.role === 'manager' && job.managerUserId === user.id);
  if (!canModify) return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { taskIds?: string[] } | null;
  const taskIds = Array.isArray(body?.taskIds) ? body!.taskIds.filter((x) => typeof x === 'string' && x.trim()) : [];
  if (!taskIds.length) return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });

  const deleteIdSet = new Set(taskIds.map((x) => x.trim()));
  const db = await readDb();
  const before = db.tasks.filter((t) => t.jobId === jobId);
  const after = before.filter((t) => !deleteIdSet.has(t.id));
  const deleted = before.length - after.length;

  const ordered = after
    .sort((a, b) => a.sortOrder - b.sortOrder || a.seq - b.seq)
    .map((t, idx) => ({ ...t, sortOrder: idx + 1, seq: idx + 1 }));

  db.tasks = [...db.tasks.filter((t) => t.jobId !== jobId), ...ordered];

  const nowIso = new Date().toISOString();
  const jobIdx = db.jobs.findIndex((j) => j.id === jobId);
  if (jobIdx >= 0) db.jobs[jobIdx] = { ...db.jobs[jobIdx], updatedAt: nowIso };

  await writeDb(db);

  const nameById = new Map(db.users.map((u) => [u.id, u.name]));
  const enriched = ordered.map((t) => ({
    ...t,
    createdByName: t.createdByUserId ? nameById.get(t.createdByUserId) ?? null : null,
    assigneeName: t.assigneeUserId ? nameById.get(t.assigneeUserId) ?? null : null,
  }));

  return NextResponse.json({ ok: true, deleted, tasks: enriched });
}
