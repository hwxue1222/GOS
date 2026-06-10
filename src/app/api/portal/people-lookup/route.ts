import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { listPersons } from '@/lib/db';

function normalizeIdNo(input: string) {
  return String(input ?? '')
    .trim()
    .replace(/\s+/g, '')
    .toLowerCase();
}

function normalizeLabel(input: string) {
  return String(input ?? '')
    .trim()
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\s+/g, ' ');
}

function inferIdTypeLabelFromPerson(person: Record<string, unknown>) {
  const idType = String(person.idType ?? '').trim().toUpperCase();
  if (idType === 'PASSPORT') return 'passport no';
  if (idType === 'NRIC') return 'nric no';
  if (idType === 'FIN') return 'fin no';
  if (idType === 'IC') return 'ic no';
  const idNo = String(person.idNo ?? '').trim();
  const first = idNo ? idNo[0]?.toUpperCase() : '';
  if (first === 'F' || first === 'G') return 'fin no';
  if (first === 'S' || first === 'T') return 'nric no';
  return 'id no';
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const url = new URL(req.url);
  const idNo = normalizeIdNo(url.searchParams.get('idNo') ?? '');
  const idTypeLabel = normalizeLabel(url.searchParams.get('idTypeLabel') ?? '');
  if (!idNo) return NextResponse.json({ ok: true, person: null });

  const people = await listPersons();
  const person =
    people.find((p) => {
      const pIdNo = normalizeIdNo(String((p as { idNo?: unknown }).idNo ?? ''));
      return pIdNo && pIdNo === idNo;
    }) ?? null;

  if (!person) return NextResponse.json({ ok: true, person: null });

  if (idTypeLabel) {
    const inferred = inferIdTypeLabelFromPerson(person as unknown as Record<string, unknown>);
    if (inferred !== idTypeLabel) return NextResponse.json({ ok: true, person: null });
  }

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
