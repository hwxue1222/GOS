import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { findClientById, updateClientDirector } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';

export async function PATCH(req: Request, { params }: { params: Promise<{ clientId: string; roleId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!hasPermission(user, 'clients', 'update')) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const { clientId, roleId } = await params;
  const client = await findClientById(clientId);
  if (!client) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
  if (client.deletedAt) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

  const body = (await req.json().catch(() => null)) as
    | { fullName?: string; email?: string; phone?: string; appointmentDate?: string; resignationDate?: string }
    | null;

  const personPatch: Partial<{ fullName: string; email?: string; phone?: string }> = {};
  if (typeof body?.fullName === 'string') personPatch.fullName = body.fullName.trim();
  if (typeof body?.email === 'string') personPatch.email = body.email.trim() || undefined;
  if (typeof body?.phone === 'string') personPatch.phone = body.phone.trim() || undefined;

  const rolePatch: Partial<{ appointmentDate?: string; resignationDate?: string }> = {};
  if (typeof body?.appointmentDate === 'string') rolePatch.appointmentDate = body.appointmentDate.trim() || undefined;
  if (typeof body?.resignationDate === 'string') rolePatch.resignationDate = body.resignationDate.trim() || undefined;

  if ('fullName' in (body ?? {}) && !(personPatch.fullName as string)) {
    return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
  }

  const updated = await updateClientDirector({
    clientId,
    roleId,
    personPatch: Object.keys(personPatch).length ? personPatch : undefined,
    rolePatch: Object.keys(rolePatch).length ? rolePatch : undefined,
  });
  if (!updated) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
  return NextResponse.json({ ok: true, director: updated });
}
