import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { listUsers, migrateJobsManagerUserId } from '@/lib/db';

function keyOfName(name: string) {
  return name.trim().toLowerCase();
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ ok: false }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { dryRun?: boolean } | null;
  const users = await listUsers();
  const myKey = keyOfName(me.name);
  const fromUserIds = users.filter((u) => keyOfName(u.name) === myKey && u.id !== me.id).map((u) => u.id);

  const result = await migrateJobsManagerUserId({ fromUserIds, toUserId: me.id, dryRun: body?.dryRun });
  return NextResponse.json({ ok: true, migratedJobIds: result.migratedJobIds, fromUserIds, toUserId: me.id });
}

