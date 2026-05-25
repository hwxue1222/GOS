import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { addClientDirector, findClientById, listClientDirectors, listJobs, listTasksByJob } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';

export async function GET(req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const { clientId } = await params;
  const client = await findClientById(clientId);
  if (!client) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
  if (client.deletedAt) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

  const canViewAllClients = hasPermission(user, 'clients', 'viewAll');
  const canViewAssignedClients = hasPermission(user, 'clients', 'viewAssigned');
  if (!canViewAllClients && !canViewAssignedClients) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  if (!canViewAllClients) {
    const jobs = await listJobs();
    const visible = (
      await Promise.all(
        jobs
          .filter((j) => j.clientId === clientId)
          .map(async (j) => {
            const tasks = await listTasksByJob(j.id);
            const assigned =
              j.managerUserId === user.id ||
              j.staffUserId === user.id ||
              j.createdByUserId === user.id ||
              tasks.some((t) => t.assigneeUserId === user.id);
            return assigned ? j : null;
          }),
      )
    ).some(Boolean);
    if (!visible) return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const url = new URL(req.url);
  const includeResigned = url.searchParams.get('includeResigned') === '1';
  const directors = await listClientDirectors(clientId, { includeResigned });
  return NextResponse.json({ ok: true, directors });
}

export async function POST(req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!hasPermission(user, 'clients', 'update')) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const { clientId } = await params;
  const client = await findClientById(clientId);
  if (!client) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
  if (client.deletedAt) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

  const body = (await req.json().catch(() => null)) as
    | { fullName?: string; email?: string; phone?: string; appointmentDate?: string }
    | null;
  const fullName = typeof body?.fullName === 'string' ? body.fullName.trim() : '';
  if (!fullName) return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
  const email = typeof body?.email === 'string' ? body.email.trim() || undefined : undefined;
  const phone = typeof body?.phone === 'string' ? body.phone.trim() || undefined : undefined;
  const appointmentDate =
    typeof body?.appointmentDate === 'string' ? body.appointmentDate.trim() || undefined : undefined;

  const created = await addClientDirector({ clientId, fullName, email, phone, appointmentDate });
  return NextResponse.json({ ok: true, director: created });
}

