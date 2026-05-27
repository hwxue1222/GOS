import { NextResponse } from 'next/server';
import { getSignatureContextByToken, issueSignatureOtp } from '@/lib/db';
import { sendEmail } from '@/lib/email';

export async function POST(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await getSignatureContextByToken(token);
  if (!ctx) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

  const r = await issueSignatureOtp(token);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });

  const subject = `OTP for signing: ${ctx.document.title}`;
  const html = `<div style="font-family: ui-sans-serif,system-ui; line-height:1.5;"><div>Your OTP code:</div><div style="font-size:24px;font-weight:700;margin-top:8px;">${r.otp}</div><div style="color:#555;font-size:12px;margin-top:8px;">This code expires in 10 minutes.</div></div>`;
  const sent = await sendEmail({ to: r.email, subject, html });

  if (!sent.ok) {
    if (process.env.NODE_ENV !== 'production') {
      return NextResponse.json({ ok: true, devOtp: r.otp });
    }
    return NextResponse.json({ ok: false, error: sent.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

