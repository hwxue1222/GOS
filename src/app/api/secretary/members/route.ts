import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { listPeopleWithRoleTags } from '@/lib/db';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (user.role === 'client') {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }
  if (!hasPermission(user, 'secretary', 'viewAll') && !hasPermission(user, 'secretary', 'viewAssigned')) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const rows = await listPeopleWithRoleTags();
  return NextResponse.json({
    ok: true,
    items: rows.map((r) => ({
      ...r.person,
      roleTags: r.roleTags,
      companyCount: r.companyCount,
      companyNames: (r as unknown as { companyNames?: string[] }).companyNames,
      companyRoles: (r as unknown as { companyRoles?: unknown }).companyRoles,
    })),
  });
}
