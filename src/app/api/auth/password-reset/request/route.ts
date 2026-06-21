import { NextResponse } from 'next/server';

import { findPortalUserByEmail, readDb, writeDb } from '@/lib/db';
import { newId } from '@/lib/id';
import { hashPassword } from '@/lib/password';
import { sendEmail } from '@/lib/email';

function nowIso() {
  return new Date().toISOString();
}

function isEmail(s: string) {
  const v = s.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { email?: unknown; mode?: unknown } | null;
  const email = String(body?.email ?? '').trim().toLowerCase();
  const mode = String(body?.mode ?? '').trim();

  if (!email || !isEmail(email)) return NextResponse.json({ ok: false, error: 'INVALID_EMAIL' }, { status: 400 });
  if (mode && mode !== 'portal') return NextResponse.json({ ok: false, error: 'INVALID_MODE' }, { status: 400 });

  const db = await readDb();
  const user = await findPortalUserByEmail(email);
  if (!user) {
    return NextResponse.json({ ok: true });
  }

  const resets = Array.isArray((db as any).passwordResets) ? ((db as any).passwordResets as any[]) : [];
  const now = Date.now();
  const latest = resets
    .filter((r) => String(r.email ?? '').trim().toLowerCase() === email)
    .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))[0];

  if (latest) {
    const createdAtMs = Date.parse(String(latest.createdAt ?? ''));
    const usedAt = String(latest.usedAt ?? '').trim();
    if (!usedAt && Number.isFinite(createdAtMs) && now - createdAtMs < 60_000) {
      return NextResponse.json({ ok: true });
    }
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const otpHash = await hashPassword(code);
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  const emailRes = await sendEmail({
    to: email,
    subject: 'BBY Portal password reset code',
    html: `
      <div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto;line-height:1.5">
        <h2 style="margin:0 0 12px 0">Password reset / 重设密码</h2>
        <p style="margin:0 0 8px 0">Your verification code is:</p>
        <div style="font-size:24px;font-weight:700;letter-spacing:2px;margin:8px 0 16px 0">${code}</div>
        <p style="margin:0">This code expires in 10 minutes. / 验证码10分钟内有效。</p>
      </div>
    `.trim(),
  });

  if (!emailRes.ok) return NextResponse.json({ ok: false, error: emailRes.error }, { status: 400 });

  const nextResets = resets
    .filter((r) => String(r.email ?? '').trim().toLowerCase() !== email)
    .concat({ id: newId('prst'), email, otpHash, createdAt, expiresAt, usedAt: '' });

  await writeDb({ ...(db as any), passwordResets: nextResets } as any);
  return NextResponse.json({ ok: true });
}
