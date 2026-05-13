import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { readDb, writeDb } from '@/lib/db';
import { newId } from '@/lib/id';

export async function POST() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ ok: false }, { status: 401 });
  if (me.role !== 'owner') return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });

  const db = await readDb();
  const nowIso = new Date().toISOString();

  const userById = new Map(db.users.map((u) => [u.id, u]));

  const targetName = 'Accounting_yearly closing and FS compilation';
  const templates = [
    'collect accounting documents (bank statement, i',
    'yearly closing',
    'send to client for signing',
    'receive the signed report',
  ];

  const jobIds = db.jobs.filter((j) => (j.name ?? '').trim() === targetName && !j.deletedAt).map((j) => j.id);
  if (!jobIds.length) return NextResponse.json({ ok: true, updatedJobs: 0, insertedTasks: 0, replacedTasks: 0 });

  const oldTaskCountByJobId = new Map<string, number>();
  for (const t of db.tasks) {
    if (!jobIds.includes(t.jobId)) continue;
    oldTaskCountByJobId.set(t.jobId, (oldTaskCountByJobId.get(t.jobId) ?? 0) + 1);
  }

  const jobIdSet = new Set(jobIds);
  db.tasks = db.tasks.filter((t) => !jobIdSet.has(t.jobId));

  let insertedTasks = 0;
  let replacedTasks = 0;
  let updatedJobs = 0;

  for (let i = 0; i < db.jobs.length; i++) {
    const job = db.jobs[i]!;
    if (!jobIdSet.has(job.id)) continue;

    const createdAt = job.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(job.dueDate) ? `${job.dueDate}T00:00:00.000Z` : nowIso;
    const assignee =
      job.managerUserId && userById.get(job.managerUserId) && userById.get(job.managerUserId)!.role !== 'owner'
        ? job.managerUserId
        : undefined;

    for (let k = 0; k < templates.length; k++) {
      const seq = k + 1;
      db.tasks.push({
        id: newId('tsk'),
        jobId: job.id,
        seq,
        sortOrder: seq,
        title: templates[k]!,
        status: 'Todo',
        assigneeUserId: assignee,
        createdByUserId: me.id,
        createdAt,
      });
      insertedTasks++;
    }

    replacedTasks += oldTaskCountByJobId.get(job.id) ?? 0;
    db.jobs[i] = { ...job, updatedAt: nowIso };
    updatedJobs++;
  }

  await writeDb(db);
  return NextResponse.json({ ok: true, updatedJobs, insertedTasks, replacedTasks });
}

