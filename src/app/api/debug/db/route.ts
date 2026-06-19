import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { readDb } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!hasPermission(user, 'contracts', 'viewAssigned') && !hasPermission(user, 'contracts', 'viewAll')) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const db = await readDb();
  const contracts = (db.contracts ?? []) as any[];
  const documents = (db.documents ?? []) as any[];
  const packets = (db.signaturePackets ?? []) as any[];
  const reqs = (db.signatureRequests ?? []) as any[];

  const recentContracts = contracts
    .slice(0, 10)
    .map((c) => ({
      id: String(c.id ?? ''),
      contractNo: String(c.contractNo ?? ''),
      clientName: String(c.clientName ?? ''),
      clientEmail: String(c.clientEmail ?? ''),
      templateId: String(c.templateId ?? ''),
      createdByUserId: String(c.createdByUserId ?? ''),
      createdAt: String(c.createdAt ?? ''),
      updatedAt: String(c.updatedAt ?? ''),
      status: String(c.status ?? ''),
    }))
    .filter((c) => !!c.id);

  return NextResponse.json(
    {
      ok: true,
      now: new Date().toISOString(),
      vercel: !!process.env.VERCEL,
      env: {
        hasKv: !!process.env.KV_REST_API_URL && !!process.env.KV_REST_API_TOKEN,
        hasRedis: !!process.env.REDIS_URL,
        kvKey: process.env.GOS_KV_DB_KEY?.trim() || 'gos:db',
      },
      counts: {
        contracts: contracts.length,
        documents: documents.length,
        signaturePackets: packets.length,
        signatureRequests: reqs.length,
      },
      recentContracts,
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}

