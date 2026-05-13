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
  const jobsByKeyNoDue = new Map<string, Job[]>();
  const jobsByKeyWithDue = new Map<string, Job[]>();
  for (const j of db.jobs) {
    const client = db.clients.find((c) => c.id === j.clientId);
    const code = client?.code?.trim().toLowerCase();
    if (!code) continue;
    const nameKey = j.name.trim().toLowerCase();
    const noDueKey = `${code}::${nameKey}`;
    const dueYmd = parseYmd(j.dueDate);
    if (!jobsByKeyNoDue.has(noDueKey)) jobsByKeyNoDue.set(noDueKey, []);
    jobsByKeyNoDue.get(noDueKey)!.push(j);
    if (dueYmd) {
      const withDueKey = `${code}::${nameKey}::${dueYmd}`;
      if (!jobsByKeyWithDue.has(withDueKey)) jobsByKeyWithDue.set(withDueKey, []);
      jobsByKeyWithDue.get(withDueKey)!.push(j);
    }
  }

  const assigneesByName = new Map(
    db.users
      .filter((u) => u.role === 'manager' || u.role === 'staff')
      .map((u) => [normalizeName(u.name).toLowerCase(), u]),
  );

  const oldTaskCountByJobId = new Map<string, number>();
  for (const t of db.tasks) {
    oldTaskCountByJobId.set(t.jobId, (oldTaskCountByJobId.get(t.jobId) ?? 0) + 1);
  }

  let inserted = 0;
  let replaced = 0;
  let updatedJobs = 0;
  const errors: Array<{ row: number; message: string }> = [];
  const touchedJobs = new Set<string>();
  const jobIdsToReplace = new Set<string>();
  const createdTasks: JobTask[] = [];

  let lastClientCode = '';
  let lastClientName = '';
  let lastJobName = '';
  let lastDueYmd = '';

  type StagedTask = {
    row: number;
    title: string;
    dueYmd: string | null;
    status: TaskStatus;
    assigneeUserId?: string;
    createdAtYmd: string | null;
  };
  type Group = {
    rowStart: number;
    clientCode: string;
    clientName: string;
    jobName: string;
    dueYmd: string | null;
    tasks: StagedTask[];
  };

  const groups: Group[] = [];
  let current: Group | null = null;
  let currentKey = '';

  for (let i = 0; i < rows.length; i++) {
    const rowNo = i + 2;
    const m = rowMap(rows[i] ?? {});

    const title = rowStr(m, ['title', 'task', 'tasktitle', 'task title', 'task name', 'name']);
    if (!title) {
      errors.push({ row: rowNo, message: 'Missing title' });
      continue;
    }

    const rawClientCode = rowStr(m, ['clientcode', 'client code', 'code']);
    const rawClientName = rowStr(m, ['clientname', 'client name', 'client']);
    const rawJobName = rowStr(m, ['jobname', 'job name']);

    const clientCode = rawClientCode || lastClientCode;
    const clientName = rawClientName || lastClientName;
    const jobName = rawJobName || lastJobName;

    if (rawClientCode) lastClientCode = rawClientCode;
    if (rawClientName) lastClientName = rawClientName;
    if (rawJobName) lastJobName = rawJobName;

    const dueDateRaw = m.get(k('duedate')) ?? m.get(k('due date')) ?? rowStr(m, ['due date', 'duedate']);
    const parsedRowDueYmd = parseYmd(dueDateRaw);
    const dueYmd = parsedRowDueYmd ?? (lastDueYmd || null);
    if (parsedRowDueYmd) lastDueYmd = parsedRowDueYmd;

    if ((!clientCode && !clientName) || !jobName) {
      errors.push({ row: rowNo, message: 'Missing client code/name or job name' });
      continue;
    }

    const key = `${clientCode.trim().toLowerCase()}::${jobName.trim().toLowerCase()}::${dueYmd ?? ''}`;
    if (!current || key !== currentKey) {
      if (current) groups.push(current);
      current = {
        rowStart: rowNo,
        clientCode,
        clientName,
        jobName,
        dueYmd,
        tasks: [],
      };
      currentKey = key;
    }

    const assigneeRaw = rowStr(m, ['assignee', 'assignedto', 'assigned to', 'assignedto']);
    const assigneeName = normalizeName(assigneeRaw);
    const assignee = assigneeName ? assigneesByName.get(assigneeName.toLowerCase()) ?? null : null;
    if (assigneeName && !assignee) {
      errors.push({ row: rowNo, message: `Unknown assignee: ${assigneeRaw}` });
      continue;
    }

    const status = parseDone(m.get(k('done')) ?? rowStr(m, ['done', 'status']));
    const creationRaw =
      m.get(k('creationdate')) ??
      m.get(k('creation date')) ??
      m.get(k('createdat')) ??
      rowStr(m, ['creation date', 'created at', 'createdat']);
    const createdAtYmd = parseYmd(creationRaw) ?? dueYmd;

    current.tasks.push({
      row: rowNo,
      title,
      dueYmd,
      status,
      assigneeUserId: assignee?.id ?? undefined,
      createdAtYmd,
    });
  }

  if (current) groups.push(current);

  const jobNameKeyToClientCode = new Map<string, string>();
  for (const g of groups) {
    const client =
      (g.clientCode ? clientsByCode.get(g.clientCode.trim().toLowerCase()) : undefined) ??
      (g.clientName ? clientsByName.get(g.clientName.trim().toLowerCase()) : undefined);
    if (!client) {
      errors.push({ row: g.rowStart, message: `Unknown client: ${g.clientCode || g.clientName}` });
      continue;
    }
    const codeKey = client.code.trim().toLowerCase();
    const nameKey = g.jobName.trim().toLowerCase();
    jobNameKeyToClientCode.set(`${g.rowStart}`, codeKey);

    let job: Job | undefined = undefined;
    if (g.dueYmd) {
      const withDueKey = `${codeKey}::${nameKey}::${g.dueYmd}`;
      const hits = jobsByKeyWithDue.get(withDueKey) ?? [];
      if (hits.length === 1) job = hits[0];
      if (hits.length > 1) {
        errors.push({ row: g.rowStart, message: `Ambiguous job match for ${client.code} ${g.jobName} due ${g.dueYmd}` });
        continue;
      }
    }
    if (!job) {
      const noDueKey = `${codeKey}::${nameKey}`;
      const hits = jobsByKeyNoDue.get(noDueKey) ?? [];
      if (hits.length === 1) {
        const hit = hits[0];
        if (g.dueYmd) {
          const jobDue = parseYmd(hit.dueDate);
          if (jobDue && jobDue !== g.dueYmd) {
            errors.push({
              row: g.rowStart,
              message: `Due date mismatch for ${client.code} ${g.jobName}: sheet ${g.dueYmd}, job ${jobDue}`,
            });
            continue;
          }
        }
        job = hit;
      }
      if (hits.length > 1) {
        errors.push({ row: g.rowStart, message: `Ambiguous job match for ${client.code} ${g.jobName}` });
        continue;
      }
    }

    if (!job) {
      errors.push({ row: g.rowStart, message: `Job not found for ${client.code} ${g.jobName}` });
      continue;
    }

    jobIdsToReplace.add(job.id);
    touchedJobs.add(job.id);

    let seq = 0;
    for (const t of g.tasks) {
      seq++;
      const dueDate = t.dueYmd ?? (job.dueDate ? parseYmd(job.dueDate) : null);
      const createdAtYmd = t.createdAtYmd ?? dueDate;
      createdTasks.push({
        id: newId('tsk'),
        jobId: job.id,
        seq,
        sortOrder: seq,
        title: t.title,
        dueDate: dueDate ?? undefined,
        status: t.status,
        assigneeUserId: t.assigneeUserId,
        createdByUserId: me.id,
        createdAt: createdAtYmd ? `${createdAtYmd}T00:00:00.000Z` : nowIso,
      });
    }
  }

  if (jobIdsToReplace.size) {
    for (const jobId of jobIdsToReplace) {
      replaced += oldTaskCountByJobId.get(jobId) ?? 0;
    }
    db.tasks = db.tasks.filter((t) => !jobIdsToReplace.has(t.jobId));
    db.tasks.push(...createdTasks);
    inserted = createdTasks.length;
    updatedJobs = jobIdsToReplace.size;
  }

  if (touchedJobs.size) {
    for (const jobId of touchedJobs) {
      const idx = db.jobs.findIndex((j) => j.id === jobId);
      if (idx >= 0) db.jobs[idx] = { ...db.jobs[idx], updatedAt: nowIso };
    }
  }

  await writeDb(db);
  return NextResponse.json({ ok: true, inserted, updated: updatedJobs, replaced, updatedJobs, errors });
}
