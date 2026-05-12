import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { findJobById, reorderTasks } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';

export async function PATCH(
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

  const canViewAllJob = hasPermission(user, 'jobs', 'viewAll');
  const canViewAssignedJob = hasPermission(user, 'jobs', 'viewAssigned');
  const assigned = job.managerUserId === user.id || job.staffUserId === user.id;
  if (!canViewAllJob && !(canViewAssignedJob && assigned)) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { orderedIds?: string[] } | null;
  const orderedIds = Array.isArray(body?.orderedIds) ? body!.orderedIds : [];
  if (orderedIds.length === 0) {
    return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
  }

  const tasks = await reorderTasks(jobId, orderedIds);
  if (!tasks) return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
  return NextResponse.json({ ok: true, tasks });
}

