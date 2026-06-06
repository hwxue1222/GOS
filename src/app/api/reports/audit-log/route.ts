import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { readDb } from '@/lib/db';
import type { AuditLog } from '@/lib/types';

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (user.role !== 'owner') return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });

  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1);
  const pageSize = Math.max(10, Math.min(200, Number(url.searchParams.get('pageSize') ?? '50') || 50));
  const area = (url.searchParams.get('area') ?? '').trim();
  const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();

  const db = await readDb();
  const logs = (db.auditLogs ?? []) as AuditLog[];
  const filtered = logs
    .filter((l) => {
      if (area && l.area !== area) return false;
      if (q) {
        const hay = `${l.actorName ?? ''} ${l.area} ${l.action} ${l.summary} ${l.entityType ?? ''} ${l.entityId ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (a.createdAt !== b.createdAt) return b.createdAt.localeCompare(a.createdAt);
      return b.id.localeCompare(a.id);
    });

  const total = filtered.length;
  const start = (page - 1) * pageSize;
  const end = Math.min(total, start + pageSize);
  const items = filtered.slice(start, end);

  return NextResponse.json({ ok: true, items, total, page, pageSize });
}

