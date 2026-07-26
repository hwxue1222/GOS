import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { createContractTemplateDraft, deleteContractTemplateDraft, listContractTemplateDrafts } from '@/lib/db';

export async function GET(_req: Request, ctx: { params: Promise<{ templateId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!hasPermission(user, 'contracts', 'viewAssigned') && !hasPermission(user, 'contracts', 'viewAll')) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const params = await ctx.params;
  const templateId = String(params?.templateId ?? '').trim();
  if (!templateId) return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });

  const drafts = await listContractTemplateDrafts(templateId, user.id);
  return NextResponse.json({ ok: true, drafts });
}

export async function POST(req: Request, ctx: { params: Promise<{ templateId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!hasPermission(user, 'contracts', 'update')) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const params = await ctx.params;
  const templateId = String(params?.templateId ?? '').trim();
  if (!templateId) return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });

  const body = (await req.json().catch(() => null)) as { name?: string; fields?: Record<string, string> } | null;
  const name = String(body?.name ?? '').trim();
  const fields = (body?.fields ?? {}) as Record<string, string>;
  if (!name) return NextResponse.json({ ok: false, error: 'INVALID_NAME' }, { status: 400 });

  try {
    const draft = await createContractTemplateDraft({ templateId, userId: user.id, name, fields });
    return NextResponse.json({ ok: true, draft });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'NOT_FOUND') return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
    return NextResponse.json({ ok: false, error: 'FAILED', message: msg }, { status: 500 });
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ templateId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!hasPermission(user, 'contracts', 'update')) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const params = await ctx.params;
  const templateId = String(params?.templateId ?? '').trim();
  if (!templateId) return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });

  const body = (await req.json().catch(() => null)) as { draftId?: string } | null;
  const draftId = String(body?.draftId ?? '').trim();
  if (!draftId) return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });

  try {
    const result = await deleteContractTemplateDraft({ templateId, userId: user.id, draftId });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'INVALID_INPUT') return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
    return NextResponse.json({ ok: false, error: 'FAILED', message: msg }, { status: 500 });
  }
}
