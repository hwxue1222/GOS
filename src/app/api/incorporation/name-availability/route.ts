import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function normalizeName(input: string) {
  const tokens = String(input ?? '')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const endsWith = (suffix: string[]) => {
    if (tokens.length < suffix.length) return false;
    for (let i = 0; i < suffix.length; i += 1) {
      if (tokens[tokens.length - suffix.length + i] !== suffix[i]) return false;
    }
    return true;
  };

  const popN = (n: number) => {
    for (let i = 0; i < n; i += 1) tokens.pop();
  };

  while (true) {
    if (endsWith(['pte', 'ltd'])) {
      popN(2);
      continue;
    }
    if (endsWith(['ltd'])) {
      popN(1);
      continue;
    }
    if (endsWith(['llp'])) {
      popN(1);
      continue;
    }
    if (endsWith(['lp'])) {
      popN(1);
      continue;
    }
    break;
  }

  return tokens.join(' ');
}

type OsomeAcrCompany = {
  uen?: string;
  uenStatus?: string;
  entityName?: string;
  entityType?: string;
  issuanceAgency?: string;
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const name = (url.searchParams.get('name') ?? '').trim();
  const debug = url.searchParams.get('debug') === '1';
  if (name.length < 2 || name.length > 120) return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });

  const searchUrl = 'https://www.bizfile.gov.sg';
  const targetKey = normalizeName(name);
  if (targetKey.length < 2) return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
  if (!targetKey.includes(' ')) {
    return NextResponse.json({ ok: true, available: false, reason: 'TOO_GENERIC', searchUrl });
  }
  const apiUrl = `https://api.osome.com/api/v2/corpsec/acra_companies/sg?entity_name=${encodeURIComponent(targetKey)}`;

  try {
    const res = await fetch(apiUrl, {
      redirect: 'follow',
      headers: {
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        accept: 'application/json',
      },
      cache: 'no-store',
    });

    if (res.status === 403 || res.status === 429) {
      return NextResponse.json({ ok: true, available: null, reason: 'BLOCKED', searchUrl });
    }
    if (!res.ok) {
      return NextResponse.json({ ok: true, available: null, reason: `UPSTREAM_${res.status}`, searchUrl });
    }

    const json = (await res.json().catch(() => null)) as { companies?: OsomeAcrCompany[] } | null;
    const companies = Array.isArray(json?.companies) ? json!.companies! : [];

    const normalizedCompanies = companies
      .map((c) => ({
        uen: c.uen,
        uenStatus: c.uenStatus,
        entityName: c.entityName,
        key: normalizeName(String(c.entityName ?? '')),
      }))
      .filter((c) => c.key);

    const conflict = normalizedCompanies.find((c) => c.key === targetKey) ?? null;

    return NextResponse.json({
      ok: true,
      available: conflict ? false : true,
      conflict: conflict ? { name: conflict.entityName, uen: conflict.uen, uenStatus: conflict.uenStatus } : null,
      searchUrl,
      debug: debug ? { targetKey, apiUrl, parsedCount: normalizedCompanies.length, sample: normalizedCompanies.slice(0, 5) } : undefined,
    });
  } catch (e) {
    return NextResponse.json({ ok: true, available: null, reason: (e as Error).message || 'ERROR', searchUrl });
  }
}
