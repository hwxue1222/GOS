import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { listJobs, listTasksByJob, listUsers } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ ok: false }, { status: 401 });
  if (!hasPermission(me, 'staffs', 'viewAll')) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const [users, jobs] = await Promise.all([listUsers(), listJobs()]);
  const tasksByJob = await Promise.all(jobs.map(async (j) => [j.id, await listTasksByJob(j.id)] as const));
  const jobById = new Map(jobs.map((j) => [j.id, j]));

  const nowTime = Date.now();
  const overdueByUserId = new Map<string, number>();
  for (const [jobId, tasks] of tasksByJob) {
    const job = jobById.get(jobId);
    if (!job) continue;
    for (const t of tasks) {
      if (t.status !== 'Todo') continue;
      const assigneeId = t.assigneeUserId ?? job.staffUserId;
      if (!assigneeId) continue;
      const due = t.dueDate ?? job.dueDate;
      if (!due) continue;
      const dueTime = new Date(due).getTime();
      if (Number.isNaN(dueTime)) continue;
      if (dueTime >= nowTime) continue;
      overdueByUserId.set(assigneeId, (overdueByUserId.get(assigneeId) ?? 0) + 1);
    }
  }

  const staffRows = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    position: u.position,
    role: u.role,
    permissions: u.permissions,
    tasksOverdue: overdueByUserId.get(u.id) ?? 0,
  }));

  return NextResponse.json({ ok: true, users: staffRows });
}
