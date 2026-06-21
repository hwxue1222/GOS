import { NextResponse } from 'next/server';

import { findPortalUserByEmail, readDb, writeDb } from '@/lib/db';
import { hashPassword, verifyPassword } from '@/lib/password';

function isEmail(s: string) {
  const v = s.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { email?: unknown; code?: unknown; password?: unknown; mode?: unknown } | null;
  const email = String(body?.email ?? '').trim().toLowerCase();
  const code = String(body?.code ?? '').trim();
  const password = String(body?.password ?? '').trim();
  const mode = String(body?.mode ?? '').trim();

  if (!email || !isEmail(email)) return NextResponse.json({ ok: false, error: 'INVALID_EMAIL' }, { status: 400 });
  if (!code) return NextResponse.json({ ok: false, error: 'INVALID_CODE' }, { status: 400 });
  if (password.length < 6) return NextResponse.json({ ok: false, error: 'PASSWORD_TOO_SHORT' }, { status: 400 });
  if (mode && mode !== 'portal') return NextResponse.json({ ok: false, error: 'INVALID_MODE' }, { status: 400 });

  const db = await readDb();
  const user = await findPortalUserByEmail(email);
  if (!user) return NextResponse.json({ ok: false, error: 'INVALID_ACCOUNT' }, { status: 400 });

  const resets = Array.isArray((db as any).passwordResets) ? ((db as any).passwordResets as any[]) : [];
  const candidates = resets
    .filter((r) => String(r.email ?? '').trim().toLowerCase() === email)
    .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));

  const token = candidates[0];
  if (!token) return NextResponse.json({ ok: false, error: 'INVALID_CODE' }, { status: 400 });
  if (String(token.usedAt ?? '').trim()) return NextResponse.json({ ok: false, error: 'CODE_USED' }, { status: 400 });
  const expMs = Date.parse(String(token.expiresAt ?? ''));
  if (!Number.isFinite(expMs) || Date.now() > expMs) return NextResponse.json({ ok: false, error: 'CODE_EXPIRED' }, { status: 400 });

  const ok = await verifyPassword(code, String(token.otpHash ?? ''));
  if (!ok) return NextResponse.json({ ok: false, error: 'INVALID_CODE' }, { status: 400 });

  const portalUsers = (db as any).portalUsers ?? [];
  const nextHash = await hashPassword(password);
  const nextPortalUsers = (portalUsers as any[]).map((u) => {
    if (String(u.id) !== String(user.id)) return u;
    return { ...u, passwordHash: nextHash };
  });

  const nextResets = resets.map((r) => {
    if (String(r.id ?? '') !== String(token.id ?? '')) return r;
    return { ...r, usedAt: new Date().toISOString() };
  });

  await writeDb({ ...(db as any), portalUsers: nextPortalUsers, passwordResets: nextResets } as any);
  return NextResponse.json({ ok: true });
}
