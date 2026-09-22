import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { findContractById, voidContract } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';

function canAccess(user: { id: string }, contract: { createdByUserId: string }) {
  if (hasPermission(user as any, 'contracts', 'viewAll')) return true;
  if (hasPermission(user as any, 'contracts', 'viewAssigned')) return contract.createdByUserId === user.id;
  return false;
}

export async function POST(_: Request, { params }: { params: Promise<{ contractId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!hasPermission(user, 'contracts', 'update')) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const { contractId } = await params;
  const current = await findContractById(contractId);
  if (!current) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
  if (!canAccess(user, current)) return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });

  try {
    const next = await voidContract(contractId);
    if (!next) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
    return NextResponse.json({ ok: true, contract: next });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'CANNOT_VOID_SIGNED') return NextResponse.json({ ok: false, error: 'CANNOT_VOID_SIGNED' }, { status: 409 });
    return NextResponse.json({ ok: false, error: 'FAILED', message: msg }, { status: 500 });
  }
}

