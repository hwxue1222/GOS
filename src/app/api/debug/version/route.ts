import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';

export const runtime = 'nodejs';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const vercel = !!process.env.VERCEL;

  return NextResponse.json(
    {
      ok: true,
      now: new Date().toISOString(),
      vercel,
      commitSha: (process.env.VERCEL_GIT_COMMIT_SHA ?? '').trim() || null,
      deploymentId: (process.env.VERCEL_DEPLOYMENT_ID ?? '').trim() || null,
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
