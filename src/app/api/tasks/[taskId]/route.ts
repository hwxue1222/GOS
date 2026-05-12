import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { findJobById, findTaskById, updateTaskStatus } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';
import type { TaskStatus } from '@/lib/types';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!hasPermission(user, 'tasks', 'complete')) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const { taskId } = await params;
  const task = await findTaskById(taskId);
  if (!task) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
  const job = await findJobById(task.jobId);
  if (!job) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

  const canViewAll = hasPermission(user, 'tasks', 'viewAll') || hasPermission(user, 'jobs', 'viewAll');
  const canViewAssigned = hasPermission(user, 'tasks', 'viewAssigned') || hasPermission(user, 'jobs', 'viewAssigned');
  const assigned =
    task.assigneeUserId === user.id || job.staffUserId === user.id || job.managerUserId === user.id;
  if (!canViewAll && !(canViewAssigned && assigned)) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { status?: TaskStatus } | null;
  const status = body?.status;
  if (status !== 'Todo' && status !== 'Done') {
    return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
  }

  const updated = await updateTaskStatus(taskId, status);
  if (!updated) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
  return NextResponse.json({ ok: true, task: updated });
}
