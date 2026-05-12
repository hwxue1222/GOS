import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createTask, findJobById, listTasksByJob } from '@/lib/db';
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
  const assigned = job.managerUserId === user.id || job.staffUserId === user.id;
  if (!canViewAll && !(canViewAssigned && assigned)) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }
  const tasks = await listTasksByJob(jobId);
  return NextResponse.json({ ok: true, tasks });
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
  const canViewAllJob = hasPermission(user, 'jobs', 'viewAll');
  const canViewAssignedJob = hasPermission(user, 'jobs', 'viewAssigned');
  const assigned = job.managerUserId === user.id || job.staffUserId === user.id;
  if (!canViewAllJob && !(canViewAssignedJob && assigned)) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as
    | { title?: string; dueDate?: string; assigneeUserId?: string }
    | null;
  const title = body?.title?.trim() ?? '';
  const dueDate = body?.dueDate?.trim() || undefined;
  const assigneeUserId = body?.assigneeUserId || job.staffUserId || undefined;

  if (!title) return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });

  const task = await createTask({ jobId, title, dueDate, assigneeUserId, status: 'Todo' });
  return NextResponse.json({ ok: true, task });
}
