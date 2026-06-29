import { NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { sendEmail } from '@/lib/email';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!hasPermission(user, 'contracts', 'viewAssigned') && !hasPermission(user, 'contracts', 'viewAll')) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { to?: unknown; subject?: unknown; html?: unknown } | null;
  const to = String(body?.to ?? '').trim();
  if (!to) return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });

  const subject = String(body?.subject ?? '').trim() || 'GOS Email Test';
  const html =
    String(body?.html ?? '').trim() ||
    `<div style="font-family:ui-sans-serif,system-ui; font-size:14px; line-height:1.6; color:#111;">Test email sent at ${new Date().toISOString()}</div>`;

  const res = await sendEmail({ to, subject, html });
  const emailFrom = (process.env.EMAIL_FROM ?? '').trim() || null;
  const usingResend = !!process.env.RESEND_API_KEY?.trim();
  const usingSmtp = !!process.env.SMTP_HOST?.trim();
  const smtpReady = !!process.env.SMTP_HOST?.trim() && !!process.env.SMTP_PORT?.trim() && !!process.env.SMTP_USER?.trim() && !!process.env.SMTP_PASS?.trim();

  if (!res.ok) {
    return NextResponse.json(
      { ok: false, error: res.error, debug: { usingResend, usingSmtp, smtpReady, emailFrom } },
      { status: 400, headers: { 'cache-control': 'no-store' } },
    );
  }

  return NextResponse.json({ ok: true, debug: { usingResend, usingSmtp, smtpReady, emailFrom } }, { headers: { 'cache-control': 'no-store' } });
}
