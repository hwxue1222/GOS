import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { newId } from '@/lib/id';
import { readDb, writeDb } from '@/lib/db';
import type { Job, JobTask, TaskStatus } from '@/lib/types';

function k(s: string) {
  return s.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function rowMap(row: Record<string, unknown>) {
  const m = new Map<string, unknown>();
  for (const [key, val] of Object.entries(row)) {
    const kk = k(key);
    if (!kk) continue;
    if (!m.has(kk)) m.set(kk, val);
  }
  return m;
}

function rowStr(m: Map<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const v = m.get(k(key));
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number') return String(v);
  }
  return '';
}

function parseYmd(input: unknown): string | null {
  if (input == null) return null;
  if (typeof input === 'string') {
    const s0 = input.trim();
    const s = s0.replace(/\s+/g, ' ');
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const head = s.split(' ')[0] ?? s;
    const m2 = head.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (m2) {
      const dd = String(Number(m2[1])).padStart(2, '0');
      const mm = String(Number(m2[2])).padStart(2, '0');
      const yyyy = m2[3];
      return `${yyyy}-${mm}-${dd}`;
    }
    const m = head.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) {
      const dd = String(Number(m[1])).padStart(2, '0');
      const mm = String(Number(m[2])).padStart(2, '0');
      const yyyy = m[3];
      return `${yyyy}-${mm}-${dd}`;
    }
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }
  if (typeof input === 'number') {
    const d = new Date(input);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }
  return null;
}

function normalizeName(s: string) {
  return s.trim().replace(/\s+/g, ' ').replace(/\s*\(.*\)\s*$/, '');
}

function parseDone(raw: unknown): TaskStatus {
  if (raw === true) return 'Done';
  if (raw === false) return 'Todo';
  if (typeof raw === 'number') return raw ? 'Done' : 'Todo';
  if (typeof raw === 'string') {
    const s = raw.trim().toLowerCase();
    if (!s) return 'Todo';
    if (s === '1' || s === 'true' || s === 'yes' || s === 'done' || s === 'complete' || s === 'completed')
      return 'Done';
    return 'Todo';
  }
  return 'Todo';
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ ok: false }, { status: 401 });
  if (me.role !== 'owner') return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { rows?: Array<Record<string, unknown>> } | null;
  const rows = Array.isArray(body?.rows) ? body!.rows : [];
  if (!rows.length) return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });

  const db = await readDb();
  const nowIso = new Date().toISOString();

  const clientsByCode = new Map(db.clients.map((c) => [c.code.trim().toLowerCase(), c]));
  const clientsByName = new Map(db.clients.map((c) => [c.name.trim().toLowerCase(), c]));
  const jobsById = new Map(db.jobs.map((j) => [j.id, j]));
  const jobsByKey = new Map<string, Job>();
  for (const j of db.jobs) {
    const client = db.clients.find((c) => c.id === j.clientId);
    const code = client?.code?.trim().toLowerCase();
    if (!code) continue;
    jobsByKey.set(`${code}::${j.name.trim().toLowerCase()}`, j);
  }

  const assigneesByName = new Map(
    db.users
      .filter((u) => u.role === 'manager' || u.role === 'staff')
      .map((u) => [normalizeName(u.name).toLowerCase(), u]),
  );

  const nextSeqByJobId = new Map<string, number>();
  const nextSortByJobId = new Map<string, number>();
  for (const t of db.tasks) {
    nextSeqByJobId.set(t.jobId, Math.max(nextSeqByJobId.get(t.jobId) ?? 0, t.seq));
    nextSortByJobId.set(t.jobId, Math.max(nextSortByJobId.get(t.jobId) ?? 0, t.sortOrder));
  }

  let inserted = 0;
  const errors: Array<{ row: number; message: string }> = [];
  const touchedJobs = new Set<string>();

  let lastClientCode = '';
  let lastClientName = '';
  let lastJobName = '';

  for (let i = 0; i < rows.length; i++) {
    const m = rowMap(rows[i] ?? {});
    const title = rowStr(m, ['title', 'task', 'tasktitle', 'task title', 'task name', 'name']);
    if (!title) {
      errors.push({ row: i + 2, message: 'Missing title' });
      continue;
    }

    const jobId = rowStr(m, ['jobid', 'job id']);
    let job: Job | undefined = jobId ? jobsById.get(jobId) : undefined;
    if (!job) {
      const rawClientCode = rowStr(m, ['clientcode', 'client code', 'code']);
      const rawClientName = rowStr(m, ['clientname', 'client name', 'client']);
      const rawJobName = rowStr(m, ['jobname', 'job name']);

      const clientCode = rawClientCode || lastClientCode;
      const clientName = rawClientName || lastClientName;
      const jobName = rawJobName || lastJobName;

      if (rawClientCode) lastClientCode = rawClientCode;
      if (rawClientName) lastClientName = rawClientName;
      if (rawJobName) lastJobName = rawJobName;

      if ((!clientCode && !clientName) || !jobName) {
        errors.push({ row: i + 2, message: 'Missing job id or (client code/name + job name)' });
        continue;
      }
      const client =
        (clientCode ? clientsByCode.get(clientCode.trim().toLowerCase()) : undefined) ??
        (clientName ? clientsByName.get(clientName.trim().toLowerCase()) : undefined);
      if (!client) {
        errors.push({ row: i + 2, message: `Unknown client: ${clientCode || clientName}` });
        continue;
      }
      job = jobsByKey.get(`${client.code.trim().toLowerCase()}::${jobName.trim().toLowerCase()}`);
    }

    if (!job) {
      errors.push({ row: i + 2, message: 'Job not found' });
      continue;
    }

    const assigneeRaw = rowStr(m, ['assignee', 'assignedto', 'assigned to']);
    const assigneeName = normalizeName(assigneeRaw);
    const assignee = assigneeName ? assigneesByName.get(assigneeName.toLowerCase()) ?? null : null;
    if (assigneeName && !assignee) {
      errors.push({ row: i + 2, message: `Unknown assignee: ${assigneeRaw}` });
      continue;
    }

    const status = parseDone(m.get(k('done')) ?? rowStr(m, ['done', 'status']));

    const dueDateRaw = m.get(k('duedate')) ?? m.get(k('due date')) ?? rowStr(m, ['due date', 'duedate']);
    const creationRaw =
      m.get(k('creationdate')) ?? m.get(k('creation date')) ?? m.get(k('createdat')) ?? rowStr(m, ['creation date', 'created at', 'createdat']);

    const dueDate = parseYmd(dueDateRaw) ?? (job.dueDate ? parseYmd(job.dueDate) : null);
    const createdAtYmd = parseYmd(creationRaw) ?? dueDate;

    const nextSeq = (nextSeqByJobId.get(job.id) ?? 0) + 1;
    const nextSort = (nextSortByJobId.get(job.id) ?? 0) + 1;
    nextSeqByJobId.set(job.id, nextSeq);
    nextSortByJobId.set(job.id, nextSort);

    const task: JobTask = {
      id: newId('tsk'),
      jobId: job.id,
      seq: nextSeq,
      sortOrder: nextSort,
      title,
      dueDate: dueDate ?? undefined,
      status,
      assigneeUserId: assignee?.id ?? undefined,
      createdByUserId: me.id,
      createdAt: createdAtYmd ? `${createdAtYmd}T00:00:00.000Z` : nowIso,
    };
    db.tasks.push(task);
    inserted++;
    touchedJobs.add(job.id);
  }

  if (touchedJobs.size) {
    for (const jobId of touchedJobs) {
      const idx = db.jobs.findIndex((j) => j.id === jobId);
      if (idx >= 0) db.jobs[idx] = { ...db.jobs[idx], updatedAt: nowIso };
    }
  }

  await writeDb(db);
  return NextResponse.json({ ok: true, inserted, updated: 0, errors });
}
