import { NextResponse } from 'next/server';
import ssic from '@/data/ssic.json';

type Row = { code: string; description: string };

function normalize(s: string) {
  return s.trim().toLowerCase();
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = normalize(url.searchParams.get('q') ?? '');
  const code = normalize(url.searchParams.get('code') ?? '');

  const rows = (Array.isArray(ssic) ? ssic : []) as unknown as Row[];

  if (code) {
    const hit = rows.find((r) => normalize(r.code) === code) ?? null;
    return NextResponse.json({ ok: true, item: hit });
  }

  if (!q) return NextResponse.json({ ok: true, items: [] });

  const items = rows
    .filter((r) => {
      const hay = `${r.code} ${r.description}`.toLowerCase();
      return hay.includes(q);
    })
    .slice(0, 30);

  return NextResponse.json({ ok: true, items });
}

