import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createContract, listContracts, listContractTemplates } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const canViewAll = hasPermission(user, 'contracts', 'viewAll');
  const canViewAssigned = hasPermission(user, 'contracts', 'viewAssigned');
  if (!canViewAll && !canViewAssigned) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const [contractsAll, templates] = await Promise.all([listContracts(), listContractTemplates()]);
  const contracts = canViewAll ? contractsAll : contractsAll.filter((c) => c.createdByUserId === user.id);
  return NextResponse.json({ ok: true, contracts, templates });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!hasPermission(user, 'contracts', 'create')) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as
    | { templateId?: string; clientName?: string; clientEmail?: string; fields?: Record<string, string> }
    | null;
  const templateId = String(body?.templateId ?? '').trim();
  const clientName = String(body?.clientName ?? '').trim();
  const clientEmail = String(body?.clientEmail ?? '').trim();
  const fields = (body?.fields ?? {}) as Record<string, string>;

  if (!templateId || !clientName || !clientEmail) {
    return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
  }

  try {
    const contract = await createContract({ templateId, clientName, clientEmail, fields, createdByUserId: user.id });
    return NextResponse.json({ ok: true, contract });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'NOT_FOUND') return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
    return NextResponse.json({ ok: false, error: 'FAILED', message: msg }, { status: 500 });
  }
}

