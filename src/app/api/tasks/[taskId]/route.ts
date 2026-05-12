import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { updateTaskStatus } from '@/lib/db';
import type { TaskStatus } from '@/lib/types';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const { taskId } = await params;
  const body = (await req.json().catch(() => null)) as { status?: TaskStatus } | null;
  const status = body?.status;
  if (status !== 'Todo' && status !== 'Done') {
    return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
  }

  const updated = await updateTaskStatus(taskId, status);
  if (!updated) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
  return NextResponse.json({ ok: true, task: updated });
}

