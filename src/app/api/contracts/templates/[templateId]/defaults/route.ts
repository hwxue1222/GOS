import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { updateContractTemplateDefaultFields } from '@/lib/db';

export async function POST(req: Request, ctx: { params: Promise<{ templateId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!hasPermission(user, 'contracts', 'update')) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const params = await ctx.params;
  const templateId = String(params?.templateId ?? '').trim();
  const body = (await req.json().catch(() => null)) as { defaultFields?: Record<string, string> } | null;
  const defaultFields = (body?.defaultFields ?? {}) as Record<string, string>;

  if (!templateId) return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });

  try {
    const tpl = await updateContractTemplateDefaultFields(templateId, defaultFields);
    return NextResponse.json({ ok: true, template: tpl });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'NOT_FOUND') return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
    return NextResponse.json({ ok: false, error: 'FAILED', message: msg }, { status: 500 });
  }
}

