import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { newId } from '@/lib/id';
import { readDb, writeDb } from '@/lib/db';
import type { Client } from '@/lib/types';

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

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ ok: false }, { status: 401 });
  if (me.role !== 'owner') return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { rows?: Array<Record<string, unknown>> } | null;
  const rows = Array.isArray(body?.rows) ? body!.rows : [];
  if (!rows.length) return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });

  const db = await readDb();
  const nowIso = new Date().toISOString();
  const byCode = new Map(db.clients.map((c) => [c.code.trim().toLowerCase(), c]));

  let inserted = 0;
  let updated = 0;
  const errors: Array<{ row: number; message: string }> = [];

  for (let i = 0; i < rows.length; i++) {
    const m = rowMap(rows[i] ?? {});
    const code = rowStr(m, ['code', 'clientcode', 'client code']);
    const name = rowStr(m, ['name', 'clientname', 'client name']);
    if (!code || !name) {
      errors.push({ row: i + 2, message: 'Missing code or name' });
      continue;
    }

    const patch: Partial<Client> = {
      code,
      name,
      companyRegistrationNo: rowStr(m, ['companyregno', 'company registration no', 'company registration no.', 'companyregistrationno']) || undefined,
      contactPerson: rowStr(m, ['contactperson', 'contact person']) || undefined,
      address: rowStr(m, ['address']) || undefined,
      phone: rowStr(m, ['phone', 'telephone', 'tel']) || undefined,
      email: rowStr(m, ['email']) || undefined,
    };

    const hit = byCode.get(code.trim().toLowerCase());
    if (!hit) {
      const created: Client = {
        id: newId('cli'),
        code: patch.code!,
        name: patch.name!,
        companyRegistrationNo: patch.companyRegistrationNo,
        contactPerson: patch.contactPerson,
        address: patch.address,
        phone: patch.phone,
        email: patch.email,
        tags: [],
        createdAt: nowIso,
      };
      db.clients.unshift(created);
      byCode.set(created.code.trim().toLowerCase(), created);
      inserted++;
      continue;
    }

    const next: Client = {
      ...hit,
      code: patch.code!,
      name: patch.name!,
      companyRegistrationNo: patch.companyRegistrationNo,
      contactPerson: patch.contactPerson,
      address: patch.address,
      phone: patch.phone,
      email: patch.email,
    };
    const idx = db.clients.findIndex((c) => c.id === hit.id);
    if (idx >= 0) db.clients[idx] = next;
    byCode.set(next.code.trim().toLowerCase(), next);
    updated++;
  }

  await writeDb(db);
  return NextResponse.json({ ok: true, inserted, updated, errors });
}

