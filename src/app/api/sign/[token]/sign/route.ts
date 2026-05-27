import { NextResponse } from 'next/server';
import { signByToken } from '@/lib/db';

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = (await req.json().catch(() => null)) as
    | { otp?: string; rdrRepresentativeName?: string; rdrRepresentativeEmail?: string }
    | null;
  const otp = typeof body?.otp === 'string' ? body.otp.trim() : '';
  if (!otp) return NextResponse.json({ ok: false, error: 'OTP_REQUIRED' }, { status: 400 });

  const ip = req.headers.get('x-forwarded-for') ?? undefined;
  const userAgent = req.headers.get('user-agent') ?? undefined;

  const result = await signByToken({
    token,
    otp,
    ip,
    userAgent,
    rdrRepresentativeName: typeof body?.rdrRepresentativeName === 'string' ? body.rdrRepresentativeName : undefined,
    rdrRepresentativeEmail: typeof body?.rdrRepresentativeEmail === 'string' ? body.rdrRepresentativeEmail : undefined,
  });
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}

