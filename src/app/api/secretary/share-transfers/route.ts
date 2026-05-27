import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createShareTransferRequest, listClients, listShareTransfers } from '@/lib/db';
import { sendSigningInvite } from '@/lib/email';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (user.role === 'staff') return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });

  const [clients, transfers] = await Promise.all([listClients(), listShareTransfers()]);
  return NextResponse.json({
    ok: true,
    clients: clients.filter((c) => !c.deletedAt).map((c) => ({ id: c.id, code: c.code, name: c.name })),
    transfers: transfers,
  });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (user.role === 'staff') return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });

  const body = (await req.json().catch(() => null)) as
    | {
        clientId?: string;
        shares?: number;
        shareClass?: string;
        effectiveDate?: string;
        transferor?: { kind?: 'PERSON' | 'COMPANY_CLIENT'; fullName?: string; email?: string; clientId?: string };
        transferee?: { kind?: 'PERSON' | 'COMPANY_CLIENT'; fullName?: string; email?: string; clientId?: string };
      }
    | null;

  const clientId = typeof body?.clientId === 'string' ? body.clientId : '';
  const effectiveDate = typeof body?.effectiveDate === 'string' ? body.effectiveDate : '';
  const shareClass = typeof body?.shareClass === 'string' ? body.shareClass : undefined;
  const shares = typeof body?.shares === 'number' ? body.shares : Number(body?.shares);

  const transferor =
    body?.transferor?.kind === 'COMPANY_CLIENT'
      ? ({ kind: 'COMPANY_CLIENT', clientId: body.transferor.clientId ?? '' } as const)
      : ({ kind: 'PERSON', fullName: body?.transferor?.fullName ?? '', email: body?.transferor?.email ?? '' } as const);
  const transferee =
    body?.transferee?.kind === 'COMPANY_CLIENT'
      ? ({ kind: 'COMPANY_CLIENT', clientId: body.transferee.clientId ?? '' } as const)
      : ({ kind: 'PERSON', fullName: body?.transferee?.fullName ?? '', email: body?.transferee?.email ?? '' } as const);

  const r = await createShareTransferRequest({ clientId, transferor, transferee, shares, shareClass, effectiveDate });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
  const origin = req.headers.get('origin')?.trim();
  const host = (req.headers.get('x-forwarded-host') ?? req.headers.get('host'))?.trim();
  const proto = req.headers.get('x-forwarded-proto')?.trim() || 'https';
  const baseUrl = origin || (host ? `${proto}://${host}` : '');
  const signLinks = r.signLinks as {
    br: Array<{ email: string; url: string }>;
    sta: Array<{ email: string; url: string }>;
    rdr?: Array<{ email: string; url: string }>;
  };
  const allLinks = [...signLinks.br, ...signLinks.sta, ...(signLinks.rdr ?? [])];
  await Promise.all(
    allLinks.map((l) =>
      baseUrl
        ? sendSigningInvite({ to: l.email, title: `Share Transfer - ${r.transfer.id}`, url: `${baseUrl}${l.url}` })
        : Promise.resolve({ ok: false as const, error: 'EMAIL_NOT_CONFIGURED' as const }),
    ),
  );
  return NextResponse.json({ ok: true, transfer: r.transfer, signLinks: r.signLinks });
}
