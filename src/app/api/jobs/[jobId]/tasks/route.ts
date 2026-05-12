import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createTask, findJobById, listTasksByJob } from '@/lib/db';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const { jobId } = await params;
  const tasks = await listTasksByJob(jobId);
  return NextResponse.json({ ok: true, tasks });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (user.role === 'staff') {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const { jobId } = await params;
  const job = await findJobById(jobId);
  if (!job) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
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
