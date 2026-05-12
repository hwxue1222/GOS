import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { newId } from '@/lib/id';
import { readDb, writeDb } from '@/lib/db';
import type { Job, JobRepeat } from '@/lib/types';

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

function parseRepeat(input: string): JobRepeat | null {
  const s = input.trim().toLowerCase();
  if (!s) return 'none';
  if (s === 'none') return 'none';
  if (s === 'monthly') return 'monthly';
  if (s === 'quarterly') return 'quarterly';
  if (s === 'yearly' || s === 'annual' || s === 'annually') return 'yearly';
  if (s === '2-yearly' || s === '2yearly' || s === 'biyearly') return '2-yearly';
  return null;
}

function parseYmd(input: unknown): string | null {
  if (input == null) return null;
  if (typeof input === 'string') {
    const s = input.trim();
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m2 = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (m2) {
      const dd = String(Number(m2[1])).padStart(2, '0');
      const mm = String(Number(m2[2])).padStart(2, '0');
      const yyyy = m2[3];
      return `${yyyy}-${mm}-${dd}`;
    }
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
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

function parseStatus(raw: string) {
  const s = raw.trim().toLowerCase();
  if (!s) return { status: 'Pending' as const, completed: false };
  if (s === 'pending') return { status: 'Pending' as const, completed: false };
  if (s === 'processing' || s === 'inprogress' || s === 'in progress' || s === 'progress' || s === 'inprogress.')
    return { status: 'Processing' as const, completed: false };
  if (s === 'complete' || s === 'completed' || s === 'done') return { status: 'Complete' as const, completed: true };
  return null;
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
  const managersByName = new Map(
    db.users
      .filter((u) => u.role === 'manager')
      .map((u) => [normalizeName(u.name).toLowerCase(), u]),
  );
  const ownersByName = new Map(
    db.users
      .filter((u) => u.role === 'owner')
      .map((u) => [normalizeName(u.name).toLowerCase(), u]),
  );

  let inserted = 0;
  let updated = 0;
  const errors: Array<{ row: number; message: string }> = [];

  const existingByKey = new Map<string, Job>();
  for (const j of db.jobs) {
    const client = db.clients.find((c) => c.id === j.clientId);
    const code = client?.code?.trim().toLowerCase();
    if (!code) continue;
    existingByKey.set(`${code}::${j.name.trim().toLowerCase()}`, j);
  }

  for (let i = 0; i < rows.length; i++) {
    const m = rowMap(rows[i] ?? {});
    const clientCode = rowStr(m, ['clientcode', 'client code', 'code']);
    const clientName = rowStr(m, ['clientname', 'client name', 'client']);
    const jobName = rowStr(m, ['jobname', 'job name', 'name']);
    if ((!clientCode && !clientName) || !jobName) {
      errors.push({ row: i + 2, message: 'Missing client code/name or job name' });
      continue;
    }

    const client =
      (clientCode ? clientsByCode.get(clientCode.trim().toLowerCase()) : undefined) ??
      (clientName ? clientsByName.get(clientName.trim().toLowerCase()) : undefined);
    if (!client) {
      errors.push({ row: i + 2, message: `Unknown client: ${clientCode || clientName}` });
      continue;
    }

    const repeatRaw = rowStr(m, ['repeat']);
    const repeat = parseRepeat(repeatRaw);
    if (!repeat) {
      errors.push({ row: i + 2, message: `Invalid repeat: ${repeatRaw}` });
      continue;
    }

    const dueDate = parseYmd(m.get(k('due date')) ?? m.get(k('duedate')) ?? rowStr(m, ['due date', 'duedate']) ?? null);
    if (repeat !== 'none' && !dueDate) {
      errors.push({ row: i + 2, message: 'Repeat requires due date' });
      continue;
    }

    const managerRaw = rowStr(m, ['managerincharge', 'manager in charge', 'manager']);
    let managerUserId: string | undefined = undefined;
    if (managerRaw.trim()) {
      const u = managersByName.get(normalizeName(managerRaw).toLowerCase());
      if (!u) {
        const ownerHit = ownersByName.get(normalizeName(managerRaw).toLowerCase());
        if (ownerHit) {
          errors.push({
            row: i + 2,
            message: `Manager in charge must be manager (got owner: ${managerRaw}), set to (none)`,
          });
        } else {
          errors.push({ row: i + 2, message: `Unknown manager in charge: ${managerRaw}` });
          continue;
        }
      } else {
        managerUserId = u.id;
      }
    }

    const label = rowStr(m, ['remark', 'label']) || undefined;
    const statusRaw = rowStr(m, ['status']);
    const statusParsed = statusRaw ? parseStatus(statusRaw) : { status: 'Pending' as const, completed: false };
    if (!statusParsed) {
      errors.push({ row: i + 2, message: `Invalid status: ${statusRaw}` });
      continue;
    }
    const key = `${client.code.trim().toLowerCase()}::${jobName.trim().toLowerCase()}`;
    const hit = existingByKey.get(key);

    if (!hit) {
      const job: Job = {
        id: newId('job'),
        clientId: client.id,
        name: jobName,
        label,
        dueDate: dueDate ?? undefined,
        repeat,
        status: statusParsed.status,
        completed: statusParsed.completed,
        managerUserId,
        createdByUserId: me.id,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      db.jobs.unshift(job);
      existingByKey.set(key, job);
      inserted++;
      continue;
    }

    const next: Job = {
      ...hit,
      clientId: client.id,
      name: jobName,
      label,
      dueDate: dueDate ?? undefined,
      repeat,
      status: statusParsed.status,
      completed: statusParsed.completed,
      managerUserId,
      updatedAt: nowIso,
    };
    const idx = db.jobs.findIndex((j) => j.id === hit.id);
    if (idx >= 0) db.jobs[idx] = next;
    existingByKey.set(key, next);
    updated++;
  }

  await writeDb(db);
  return NextResponse.json({ ok: true, inserted, updated, errors });
}
