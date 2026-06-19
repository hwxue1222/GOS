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
  const key = `gos:health:${Date.now()}`;
  const value = `ok_${Math.random().toString(16).slice(2)}`;

  const result: any = {
    ok: true,
    vercel,
    env: {
      hasKv,
      hasRedis,
      kvKey: process.env.GOS_KV_DB_KEY?.trim() || 'gos:db',
    },
    kv: { ok: false as boolean, message: '' as string },
    redis: { ok: false as boolean, message: '' as string },
  };

  if (hasKv) {
    try {
      const mod = (await import('@vercel/kv')) as unknown as { kv: { set: (k: string, v: unknown) => Promise<unknown>; get: (k: string) => Promise<unknown> } };
      await mod.kv.set(key, value);
      const got = await mod.kv.get(key);
      result.kv.ok = String(got ?? '') === value;
      result.kv.message = result.kv.ok ? 'KV_READ_WRITE_OK' : `KV_MISMATCH got=${String(got ?? '')}`;
    } catch (e) {
      result.kv.ok = false;
      result.kv.message = e instanceof Error ? e.message : String(e);
    }
  } else {
    result.kv.message = 'KV_NOT_CONFIGURED';
  }

  if (hasRedis) {
    try {
      const redisMod = await import('redis');
      const createClient = (redisMod as any).createClient as (opts: { url: string }) => any;
      const client = createClient({ url: process.env.REDIS_URL as string });
      client.on('error', () => void 0);
      await client.connect();
      await client.set(key, value);
      const got = await client.get(key);
      await client.quit();
      result.redis.ok = String(got ?? '') === value;
      result.redis.message = result.redis.ok ? 'REDIS_READ_WRITE_OK' : `REDIS_MISMATCH got=${String(got ?? '')}`;
    } catch (e) {
      result.redis.ok = false;
      result.redis.message = e instanceof Error ? e.message : String(e);
    }
  } else {
    result.redis.message = 'REDIS_NOT_CONFIGURED';
  }

  return NextResponse.json(result);
}

