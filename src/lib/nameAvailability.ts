export type NameAvailabilityResult = {
  ok: true;
  available: boolean | null;
  reason?: string;
  searchUrl: string;
  conflict?: { name?: string; uen?: string; uenStatus?: string } | null;
  debug?: unknown;
};

type OsomeAcrCompany = {
  uen?: string;
  uenStatus?: string;
  entityName?: string;
  entityType?: string;
  issuanceAgency?: string;
};

export function normalizeCompanyNameKey(input: string) {
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

export async function checkCompanyNameAvailability(input: {
  name: string;
  debug?: boolean;
}): Promise<NameAvailabilityResult> {
  const name = (input.name ?? '').trim();
  const debug = !!input.debug;
  const searchUrl = 'https://www.bizfile.gov.sg';
  if (name.length < 2 || name.length > 120) return { ok: true, available: null, reason: 'INVALID_INPUT', searchUrl };

  const targetKey = normalizeCompanyNameKey(name);
  if (targetKey.length < 2) return { ok: true, available: null, reason: 'INVALID_INPUT', searchUrl };
  if (!targetKey.includes(' ')) return { ok: true, available: false, reason: 'TOO_GENERIC', searchUrl };

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
      return { ok: true, available: null, reason: 'BLOCKED', searchUrl };
    }
    if (!res.ok) {
      return { ok: true, available: null, reason: `UPSTREAM_${res.status}`, searchUrl };
    }

    const json = (await res.json().catch(() => null)) as { companies?: OsomeAcrCompany[] } | null;
    const companies = Array.isArray(json?.companies) ? json!.companies! : [];

    const normalizedCompanies = companies
      .map((c) => ({
        uen: c.uen,
        uenStatus: c.uenStatus,
        entityName: c.entityName,
        key: normalizeCompanyNameKey(String(c.entityName ?? '')),
      }))
      .filter((c) => c.key);

    const conflict = normalizedCompanies.find((c) => c.key === targetKey) ?? null;
    return {
      ok: true,
      available: conflict ? false : true,
      conflict: conflict ? { name: conflict.entityName, uen: conflict.uen, uenStatus: conflict.uenStatus } : null,
      searchUrl,
      debug: debug ? { targetKey, apiUrl, parsedCount: normalizedCompanies.length, sample: normalizedCompanies.slice(0, 5) } : undefined,
    };
  } catch (e) {
    return { ok: true, available: null, reason: (e as Error).message || 'ERROR', searchUrl };
  }
}

