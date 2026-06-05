import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { importPersons } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!hasPermission(user, 'people', 'import')) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as
    | {
        items?: Array<{
          fullName?: string;
          email?: string;
          phone?: string;
          idType?: 'NRIC' | 'PASSPORT' | 'OTHER';
          idNo?: string;
          nationality?: string;
          dob?: string;
          address?: string;
          memberSince?: string;
          lastLoginDate?: string;
        }>;
      }
    | null;

  const items = Array.isArray(body?.items) ? body!.items : [];
  if (items.length === 0) return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });

  const r = await importPersons({
    items: items.map((x) => ({
      fullName: x.fullName ?? '',
      email: x.email,
      phone: x.phone,
      idType: x.idType,
      idNo: x.idNo,
      nationality: x.nationality,
      dob: x.dob,
      address: x.address,
      memberSince: x.memberSince,
      lastLoginDate: x.lastLoginDate,
    })),
  });
  return NextResponse.json(r);
}
