import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { bulkUpdateClientsByUen } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!hasPermission(user, 'clients', 'update')) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as
    | {
        updates?: Array<{
          uen?: string;
          registeredOfficeAddress?: string;
          incorporationDate?: string;
          businessActivities?: string;
        }>;
      }
    | null;

  const updates = Array.isArray(body?.updates) ? body!.updates : [];
  const normalized = updates
    .map((u) => ({
      uen: (u.uen ?? '').trim(),
      registeredOfficeAddress: typeof u.registeredOfficeAddress === 'string' ? u.registeredOfficeAddress : undefined,
      incorporationDate: typeof u.incorporationDate === 'string' ? u.incorporationDate : undefined,
      businessActivities: typeof u.businessActivities === 'string' ? u.businessActivities : undefined,
    }))
    .filter((u) => u.uen);

  if (normalized.length === 0) {
    return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
  }

  const result = await bulkUpdateClientsByUen(normalized);
  return NextResponse.json({ ok: true, ...result });
}

