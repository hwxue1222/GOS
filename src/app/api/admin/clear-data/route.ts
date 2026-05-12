import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { clearBusinessData } from '@/lib/db';

export async function POST() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ ok: false }, { status: 401 });
  if (me.role !== 'owner') return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });

  await clearBusinessData();
  return NextResponse.json({ ok: true });
}

