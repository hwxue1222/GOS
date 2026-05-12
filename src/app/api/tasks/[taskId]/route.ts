import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { findJobById, findTaskById, findUserById, listUsers, updateTask, updateTaskStatus } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';
import type { TaskStatus } from '@/lib/types';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const { taskId } = await params;
  const task = await findTaskById(taskId);
  if (!task) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
  const job = await findJobById(task.jobId);
  if (!job) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

  const canViewAll = hasPermission(user, 'tasks', 'viewAll') || hasPermission(user, 'jobs', 'viewAll');
  const canViewAssigned = hasPermission(user, 'tasks', 'viewAssigned') || hasPermission(user, 'jobs', 'viewAssigned');
  const assignedByTask = task.assigneeUserId === user.id;
  const assigned = assignedByTask || job.managerUserId === user.id || job.createdByUserId === user.id;
  if (!canViewAll && !(canViewAssigned && assigned)) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as
    | { status?: TaskStatus; title?: string; dueDate?: string; assigneeUserId?: string }
    | null;

  const wantsStatus = body?.status === 'Todo' || body?.status === 'Done';
  const wantsUpdate =
    typeof body?.title === 'string' ||
    typeof body?.dueDate === 'string' ||
    typeof body?.assigneeUserId === 'string';

  const canModifyJob = user.role === 'owner' || (user.role === 'manager' && job.managerUserId === user.id);

  if (wantsStatus) {
    if (!hasPermission(user, 'tasks', 'complete')) {
      return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
    }
    if (!canModifyJob && !assignedByTask) {
      return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
    }
    const updated = await updateTaskStatus(taskId, body!.status!);
    if (!updated) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
    const users = await listUsers();
    const nameById = new Map(users.map((u) => [u.id, u.name]));
    return NextResponse.json({
      ok: true,
      task: {
        ...updated,
        createdByName: updated.createdByUserId ? nameById.get(updated.createdByUserId) ?? null : null,
        assigneeName: updated.assigneeUserId ? nameById.get(updated.assigneeUserId) ?? null : null,
      },
    });
  }

  if (wantsUpdate) {
    if (!hasPermission(user, 'tasks', 'update')) {
      return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
    }
    if (!canModifyJob) return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
    const title = typeof body?.title === 'string' ? body.title.trim() : undefined;
    const dueDate = typeof body?.dueDate === 'string' ? body.dueDate.trim() || undefined : undefined;
    const assigneeUserId =
      typeof body?.assigneeUserId === 'string' ? body.assigneeUserId.trim() || undefined : undefined;
    if (assigneeUserId) {
      const u = await findUserById(assigneeUserId);
      if (!u) {
        return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
      }
      if (u.role === 'owner') {
        return NextResponse.json({ ok: false, error: 'ASSIGNEE_FORBIDDEN' }, { status: 400 });
      }
      if (user.role === 'manager' && u.id !== user.id && u.role !== 'staff') {
        return NextResponse.json({ ok: false, error: 'ASSIGNEE_FORBIDDEN' }, { status: 400 });
      }
    }
    const patch: Partial<{ title: string; dueDate?: string; assigneeUserId?: string }> = {};
    if (typeof title === 'string') patch.title = title;
    if (typeof body?.dueDate === 'string') patch.dueDate = dueDate;
    if (typeof body?.assigneeUserId === 'string') patch.assigneeUserId = assigneeUserId;
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
    }
    const updated = await updateTask(taskId, patch);
    if (!updated) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
    const users = await listUsers();
    const nameById = new Map(users.map((u) => [u.id, u.name]));
    return NextResponse.json({
      ok: true,
      task: {
        ...updated,
        createdByName: updated.createdByUserId ? nameById.get(updated.createdByUserId) ?? null : null,
        assigneeName: updated.assigneeUserId ? nameById.get(updated.assigneeUserId) ?? null : null,
      },
    });
  }

  return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
}
