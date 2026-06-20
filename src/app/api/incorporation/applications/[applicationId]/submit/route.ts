import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getIncorporationApplicationDetail, transitionIncorporationApplicationStatus } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { buildIncorporationSubmittedEmail } from '@/lib/incorporationSubmitEmail';

export async function POST(req: Request, ctx: { params: Promise<{ applicationId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const { applicationId } = await ctx.params;

  const detail = await getIncorporationApplicationDetail(applicationId);
  if (!detail) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
  const app = detail.application;

  if (user.role !== 'client') return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  if (app.createdByUserId !== user.id) return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  if (app.status !== 'DRAFT' && app.status !== 'NEED_MORE_INFO') return NextResponse.json({ ok: false, error: 'INVALID_STATUS' }, { status: 400 });

  const next = await transitionIncorporationApplicationStatus({
    applicationId,
    toStatus: 'SUBMITTED',
    actor: { id: user.id, name: user.name, role: user.role },
  });

  let emailOk = true;
  const baseOrigin = new URL(req.url).origin;
  if (user.email) {
    try {
      const { subject, html } = buildIncorporationSubmittedEmail({
        application: next ?? app,
        applicantName: user.name,
        applicantEmail: user.email,
        origin: baseOrigin,
      });
      await sendEmail({ to: [user.email], subject, html });
    } catch {
      emailOk = false;
    }
  }

  return NextResponse.json({ ok: true, application: next, emailOk });
}
