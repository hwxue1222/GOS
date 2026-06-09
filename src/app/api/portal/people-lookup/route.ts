import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { listPersons } from '@/lib/db';

function normalizeIdNo(input: string) {
  return String(input ?? '')
    .trim()
    .replace(/\s+/g, '')
    .toLowerCase();
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const url = new URL(req.url);
  const idNo = normalizeIdNo(url.searchParams.get('idNo') ?? '');
  if (!idNo) return NextResponse.json({ ok: true, person: null });

  const people = await listPersons();
  const person =
    people.find((p) => {
      const pIdNo = normalizeIdNo(String((p as { idNo?: unknown }).idNo ?? ''));
      return pIdNo && pIdNo === idNo;
    }) ?? null;

  if (!person) return NextResponse.json({ ok: true, person: null });

  return NextResponse.json({
    ok: true,
    person: {
      fullName: person.fullName,
      email: person.email ?? '',
      phone: person.phone ?? '',
      nationality: person.nationality ?? '',
      dob: person.dob ?? '',
      address: person.address ?? '',
      idNo: (person as { idNo?: unknown }).idNo ?? '',
    },
  });
}

