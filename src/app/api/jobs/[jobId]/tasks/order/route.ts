import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { findJobById, reorderTasks, updateTasksInJob } from '@/lib/db';
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

  const canModify = user.role === 'owner' || (user.role === 'manager' && job.managerUserId === user.id);
  if (!canModify) return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });

  const body = (await req.json().catch(() => null)) as
    | { orderedIds?: string[]; titlesById?: Record<string, string> }
    | null;
  const orderedIds = Array.isArray(body?.orderedIds) ? body!.orderedIds : [];
  const titlesById = body?.titlesById && typeof body.titlesById === 'object' ? body.titlesById : undefined;

  const hasOrder = orderedIds.length > 0;
  const hasTitles = titlesById && Object.keys(titlesById).length > 0;
  if (!hasOrder && !hasTitles) {
    return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
  }

  const tasks = hasTitles ? await updateTasksInJob({ jobId, orderedIds: hasOrder ? orderedIds : undefined, titlesById }) : await reorderTasks(jobId, orderedIds);
  if (!tasks) return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
  return NextResponse.json({ ok: true, tasks });
}
