import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { appendAuditLog, decideShareTransfer, readDb } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';

async function canAccessTransfer(user: { role: string; email: string }, transferId: string) {
  if (user.role === 'client') return false;
  const db = await readDb();
  const t = db.shareTransfers.find((x) => x.id === transferId) ?? null;
  if (!t) return false;
  return true;
}

export async function POST(req: Request, ctx: { params: Promise<{ transferId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (user.role === 'client' || !hasPermission(user, 'secretary', 'update')) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const { transferId } = await ctx.params;
  if (!(await canAccessTransfer(user, transferId))) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as
    | {
        decision?: 'APPROVE' | 'REJECT' | 'NEED_MORE_INFO';
        note?: string;
      }
    | null;
  const decision = body?.decision;
  if (decision !== 'APPROVE' && decision !== 'REJECT' && decision !== 'NEED_MORE_INFO') {
    return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
  }

  const r = await decideShareTransfer({
    transferId,
    decidedByUserId: user.id,
    decision,
    note: body?.note,
  });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });

  await appendAuditLog({
    actorUserId: user.id,
    actorName: user.name,
    actorRole: user.role,
    area: 'secretary',
    action: `share_transfer_${decision.toLowerCase()}`,
    entityType: 'share_transfer',
    entityId: transferId,
    summary: `Share transfer ${decision}: ${transferId}`,
  });

  return NextResponse.json({ ok: true, transfer: r.transfer });
}

