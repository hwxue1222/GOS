import { NextResponse } from 'next/server';
import { checkCompanyNameAvailability } from '@/lib/nameAvailability';

export const runtime = 'nodejs';
export const maxDuration = 30;
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const name = (url.searchParams.get('name') ?? '').trim();
  const debug = url.searchParams.get('debug') === '1';
  if (name.length < 2 || name.length > 120) return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });

  const result = await checkCompanyNameAvailability({ name, debug });
  if (result.reason === 'INVALID_INPUT') return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
  return NextResponse.json(result, { headers: { 'cache-control': 'no-store' } });
}
