import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createClient, listClients, listJobs } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const canViewAll = hasPermission(user, 'clients', 'viewAll');
  const canViewAssigned = hasPermission(user, 'clients', 'viewAssigned');
  if (!canViewAll && !canViewAssigned) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const clientsAll = await listClients();
  const clients = clientsAll.filter((c) => !c.deletedAt);
  if (canViewAll) return NextResponse.json({ ok: true, clients });

  const jobs = await listJobs();
  const assignedClientIds = new Set(
    jobs
      .filter((j) => j.managerUserId === user.id || j.staffUserId === user.id)
      .map((j) => j.clientId),
  );
  const filtered = clients.filter((c) => assignedClientIds.has(c.id));

  return NextResponse.json({ ok: true, clients: filtered });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!hasPermission(user, 'clients', 'create')) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as
    | {
        code?: string;
        name?: string;
        companyRegistrationNo?: string;
        fye?: string;
        contactPerson?: string;
        address?: string;
        phone?: string;
        email?: string;
        tags?: string[];
      }
    | null;
  const code = body?.code?.trim() ?? '';
  const name = body?.name?.trim() ?? '';
  const companyRegistrationNo = body?.companyRegistrationNo?.trim() || undefined;
  const fye = body?.fye?.trim() || undefined;
  const contactPerson = body?.contactPerson?.trim() || undefined;
  const address = body?.address?.trim() || undefined;
  const phone = body?.phone?.trim() || undefined;
  const email = body?.email?.trim() || undefined;
  const tags = Array.isArray(body?.tags) ? body?.tags.filter(Boolean) : [];

  if (!code || !name) {
    return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
  }

  const existing = (await listClients()).filter((c) => !c.deletedAt);
  const codeKey = code.toLowerCase();
  const nameKey = name.toLowerCase();
  if (existing.some((c) => (c.code || '').trim().toLowerCase() === codeKey)) {
    return NextResponse.json({ ok: false, error: 'DUPLICATE_CODE' }, { status: 409 });
  }
  if (existing.some((c) => (c.name || '').trim().toLowerCase() === nameKey)) {
    return NextResponse.json({ ok: false, error: 'DUPLICATE_NAME' }, { status: 409 });
  }

  const client = await createClient({ code, name, companyRegistrationNo, fye, contactPerson, address, phone, email, tags });
  return NextResponse.json({ ok: true, client });
}
