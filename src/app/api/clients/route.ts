import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createClient, listClients } from '@/lib/db';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const clients = await listClients();
  return NextResponse.json({ ok: true, clients });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (user.role === 'staff') {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as
    | { code?: string; name?: string; phone?: string; email?: string; tags?: string[] }
    | null;
  const code = body?.code?.trim() ?? '';
  const name = body?.name?.trim() ?? '';
  const phone = body?.phone?.trim() || undefined;
  const email = body?.email?.trim() || undefined;
  const tags = Array.isArray(body?.tags) ? body?.tags.filter(Boolean) : [];

  if (!code || !name) {
    return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
  }

  const client = await createClient({ code, name, phone, email, tags });
  return NextResponse.json({ ok: true, client });
}

