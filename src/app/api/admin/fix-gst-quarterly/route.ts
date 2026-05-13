import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { readDb, writeDb } from '@/lib/db';

export async function POST() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ ok: false }, { status: 401 });
  if (me.role !== 'owner') return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });

  const db = await readDb();
  const nowIso = new Date().toISOString();

  let updated = 0;
  const updatedJobIds: string[] = [];
  for (let i = 0; i < db.jobs.length; i++) {
    const j = db.jobs[i]!;
    const name = (j.name ?? '').trim();
    if (name !== 'Tax Service_GST') continue;
    if (j.repeat === 'quarterly') continue;
    db.jobs[i] = { ...j, repeat: 'quarterly', updatedAt: nowIso };
    updated++;
    updatedJobIds.push(j.id);
  }

  await writeDb(db);
  return NextResponse.json({ ok: true, updated, updatedJobIds });
}

