import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';

export const runtime = 'nodejs';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!hasPermission(user, 'contracts', 'viewAssigned') && !hasPermission(user, 'contracts', 'viewAll')) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const vercel = !!process.env.VERCEL;
  const hasKv = !!process.env.KV_REST_API_URL && !!process.env.KV_REST_API_TOKEN;
  const hasRedis = !!process.env.REDIS_URL;

  return NextResponse.json(
    {
      ok: true,
      now: new Date().toISOString(),
      vercel,
      commitSha: (process.env.VERCEL_GIT_COMMIT_SHA ?? '').trim() || null,
      deploymentId: (process.env.VERCEL_DEPLOYMENT_ID ?? '').trim() || null,
      env: {
        hasKv,
        hasRedis,
        kvKey: process.env.GOS_KV_DB_KEY?.trim() || 'gos:db',
      },
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}

