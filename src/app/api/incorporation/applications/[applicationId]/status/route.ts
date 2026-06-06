import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getIncorporationApplicationDetail, transitionIncorporationApplicationStatus, updateIncorporationApplication } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';

export async function POST(req: Request, ctx: { params: Promise<{ applicationId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const { applicationId } = await ctx.params;

  if (user.role === 'client') return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  if (!hasPermission(user, 'secretary', 'update')) return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });

  const detail = await getIncorporationApplicationDetail(applicationId);
  if (!detail) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

  const body = (await req.json().catch(() => null)) as
    | {
        toStatus?: string;
        note?: string;
        assignToMe?: boolean;
      }
    | null;

  const toStatus = typeof body?.toStatus === 'string' ? body.toStatus.trim() : '';
  const note = typeof body?.note === 'string' ? body.note.trim() || undefined : undefined;

  if (!['PROCESSING', 'NEED_MORE_INFO', 'COMPLETED', 'REJECTED'].includes(toStatus)) {
    return NextResponse.json({ ok: false, error: 'INVALID_STATUS' }, { status: 400 });
  }

  if (body?.assignToMe) {
    await updateIncorporationApplication(applicationId, { assignedToUserId: user.id });
  }

  const decided = toStatus === 'COMPLETED' || toStatus === 'REJECTED';
  const next = await transitionIncorporationApplicationStatus({
    applicationId,
    toStatus: toStatus as 'PROCESSING' | 'NEED_MORE_INFO' | 'COMPLETED' | 'REJECTED',
    actor: { id: user.id, name: user.name, role: user.role },
    note,
    decided,
  });

  return NextResponse.json({ ok: true, application: next });
}

