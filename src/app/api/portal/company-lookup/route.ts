import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { readDb } from '@/lib/db';

function normalizeRegNo(input: string) {
  return String(input ?? '')
    .trim()
    .replace(/\s+/g, '')
    .toLowerCase();
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const url = new URL(req.url);
  const registrationNo = normalizeRegNo(url.searchParams.get('registrationNo') ?? '');
  if (!registrationNo) return NextResponse.json({ ok: true, company: null });

  const db = await readDb();
  const client =
    db.clients.find((c) => normalizeRegNo(c.companyRegistrationNo ?? '') === registrationNo && !c.deletedAt) ?? null;
  if (!client) return NextResponse.json({ ok: true, company: null });

  return NextResponse.json({
    ok: true,
    company: {
      clientId: client.id,
      code: client.code,
      name: client.name,
      companyRegistrationNo: client.companyRegistrationNo ?? '',
      countryOfIncorporation: client.countryOfIncorporation ?? '',
      address: client.address ?? '',
      registeredOfficeAddress: client.registeredOfficeAddress ?? '',
      email: client.email ?? '',
      phone: client.phone ?? '',
    },
  });
}
