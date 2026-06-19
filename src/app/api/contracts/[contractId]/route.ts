import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { deleteContract, findContractById, updateContract } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';

function canAccess(user: { id: string }, contract: { createdByUserId: string }) {
  if (hasPermission(user as any, 'contracts', 'viewAll')) return true;
  if (hasPermission(user as any, 'contracts', 'viewAssigned')) return contract.createdByUserId === user.id;
  return false;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ contractId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!hasPermission(user, 'contracts', 'update')) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const { contractId } = await params;
  const current = await findContractById(contractId);
  if (!current) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
  if (!canAccess(user, current)) return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });

  const body = (await req.json().catch(() => null)) as
    | { clientName?: string; clientEmail?: string; fields?: Record<string, string>; status?: string }
    | null;
  const patch: any = {};
  if (typeof body?.clientName === 'string') patch.clientName = body.clientName.trim();
  if (typeof body?.clientEmail === 'string') patch.clientEmail = body.clientEmail.trim();
  if (body?.fields && typeof body.fields === 'object') patch.fields = body.fields as Record<string, string>;
  if (typeof body?.status === 'string') patch.status = body.status;

  const next = await updateContract(contractId, patch);
  if (!next) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
  return NextResponse.json({ ok: true, contract: next });
}

export async function GET(_: Request, { params }: { params: Promise<{ contractId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const canViewAll = hasPermission(user, 'contracts', 'viewAll');
  const canViewAssigned = hasPermission(user, 'contracts', 'viewAssigned');
  if (!canViewAll && !canViewAssigned) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const { contractId } = await params;
  const current = await findContractById(contractId);
  if (!current) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
  if (!canAccess(user, current)) return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  return NextResponse.json({ ok: true, contract: current });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ contractId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!hasPermission(user, 'contracts', 'update')) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const { contractId } = await params;
  const current = await findContractById(contractId);
  if (!current) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
  if (!canAccess(user, current)) return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  if (current.status !== 'DRAFT' || String(current.contractNo ?? '').trim()) {
    return NextResponse.json({ ok: false, error: 'CANNOT_DELETE' }, { status: 409 });
  }

  const deleted = await deleteContract(contractId);
  return NextResponse.json({ ok: true, contract: deleted });
}
