import fs from 'node:fs';
import type { Browser } from 'puppeteer-core';
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

async function getBrowser() {
  const g = globalThis as unknown as { __gosNameAvailabilityBrowserPromise?: Promise<Browser> };
  if (!g.__gosNameAvailabilityBrowserPromise) {
    g.__gosNameAvailabilityBrowserPromise = (async () => {
      const chromiumMod = await import('@sparticuz/chromium');
      const puppeteerMod = await import('puppeteer-core');
      const chromium = chromiumMod.default ?? chromiumMod;
      const puppeteer = puppeteerMod.default ?? puppeteerMod;

      const envPath = process.env.PUPPETEER_EXECUTABLE_PATH?.trim() || process.env.CHROME_EXECUTABLE_PATH?.trim();
      const chromiumPath = await chromium.executablePath();
      const macCandidates = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium'];

      const isRunnableFile = (p: string | null | undefined) => {
        if (!p) return false;
        try {
          const st = fs.statSync(p);
          return st.isFile();
        } catch {
          return false;
        }
      };

      const platform = process.platform;
      const candidate =
        (isRunnableFile(envPath) ? envPath! : null) ||
        (platform === 'darwin' ? macCandidates.find((p) => isRunnableFile(p)) ?? null : null) ||
        (platform !== 'darwin' && isRunnableFile(chromiumPath) ? chromiumPath : null) ||
        (platform === 'darwin' && isRunnableFile(chromiumPath) ? chromiumPath : null) ||
        null;
      if (!candidate) throw new Error('CHROME_NOT_FOUND');

      return puppeteer.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: candidate,
        headless: chromium.headless,
      });
    })();
  }
  return g.__gosNameAvailabilityBrowserPromise;
}

function parseMatchesFromText(text: string) {
  const lines = String(text ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const out: Array<{ name: string; operatingStatus: string }> = [];

  const extractNameFromLiveLine = (line: string) => {
    const m = line.match(/^(.*)\bLive Company\b/i);
    if (!m) return '';
    let left = m[1].trim();
    if (!left) return '';
    left = left.replace(/\bUEN\b.*$/i, '').trim();
    const tokens = left.split(/\s+/).filter(Boolean);
    if (tokens.length >= 2 && /^[A-Z]{1,3}$/.test(tokens[0])) tokens.shift();
    return tokens.join(' ').trim();
  };

  const isNoise = (s: string) => {
    const low = s.toLowerCase();
    return (
      low.includes('search results') ||
      low.includes('disclaimer') ||
      low.includes('singapore business directory') ||
      low.includes('filter to only show') ||
      low.startsWith('uen') ||
      low.startsWith('address')
    );
  };

  const pickNameBefore = (i: number) => {
    for (let j = i - 1; j >= Math.max(0, i - 12); j -= 1) {
      const cand = lines[j];
      if (cand.length < 3 || cand.length > 140) continue;
      if (isNoise(cand)) continue;
      if (/\b(live company|operating status)\b/i.test(cand)) continue;
      if (/^\w+:\s*/.test(cand) && !/\b(pte|ltd|llp|lp)\b/i.test(cand)) continue;
      return cand;
    }
    return '';
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const low = line.toLowerCase();
    if (!low.includes('operating status')) continue;

    const status = lines[i + 1] ?? line;
    if (!/\blive company\b/i.test(status)) continue;

    const name = pickNameBefore(i);
    if (name) out.push({ name, operatingStatus: status });
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!/\blive company\b/i.test(line)) continue;
    const fromSameLine = extractNameFromLiveLine(line);
    const name = fromSameLine || pickNameBefore(i);
    if (name) out.push({ name, operatingStatus: line });
  }

  return out;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const name = (url.searchParams.get('name') ?? '').trim();
  const debug = url.searchParams.get('debug') === '1';
  if (name.length < 2 || name.length > 120) return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });

  const searchUrl = `https://www.sgpbusiness.com/search/${encodeURIComponent(name)}`;

  try {
    const pre = await fetch(searchUrl, {
      redirect: 'follow',
      headers: {
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      cache: 'no-store',
    }).catch(() => null);

    if (pre && (pre.status === 403 || pre.status === 429)) {
      const t = await pre.text().catch(() => '');
      const low = t.toLowerCase();
      if (
        low.includes('just a moment') ||
        low.includes('checking your browser') ||
        low.includes('challenges.cloudflare.com') ||
        low.includes('cloudflare')
      ) {
        return NextResponse.json({ ok: true, available: null, reason: 'BLOCKED', searchUrl });
      }
    }
  } catch {}

  let page: Awaited<ReturnType<Browser['newPage']>> | null = null;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    page.setDefaultNavigationTimeout(25_000);

    await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
    await new Promise((r) => setTimeout(r, 2500));
    const bodyText = await page.evaluate(() => document.body?.innerText ?? '');
    const low = bodyText.toLowerCase();
    if (
      /just a moment/i.test(bodyText) ||
      /checking your browser/i.test(bodyText) ||
      low.includes('cloudflare') ||
      low.includes('challenges.cloudflare.com')
    ) {
      return NextResponse.json({ ok: true, available: null, reason: 'BLOCKED', searchUrl });
    }

    const matchesRaw = parseMatchesFromText(bodyText);
    const matches = matchesRaw
      .map((m) => ({ ...m, key: normalizeName(m.name) }))
      .filter((m) => {
        if (!m.key) return false;
        if (m.key.includes('search results')) return false;
        return true;
      });

    if (matches.length === 0) {
      return NextResponse.json({ ok: true, available: null, reason: 'UNPARSABLE', searchUrl });
    }
    const targetKey = normalizeName(name);
    const conflict = matches.find((m) => m.key === targetKey) ?? null;

    return NextResponse.json({
      ok: true,
      available: conflict ? false : true,
      conflict: conflict ? { name: conflict.name, operatingStatus: conflict.operatingStatus } : null,
      searchUrl,
      debug: debug
        ? {
            targetKey,
            parsedCount: matches.length,
            sample: matches.slice(0, 5).map((m) => ({ name: m.name, operatingStatus: m.operatingStatus, key: m.key })),
          }
        : undefined,
    });
  } catch (e) {
    const msg = (e as Error).message || 'ERROR';
    const mapped =
      msg.includes('ENOEXEC') || msg.includes('EACCES') || msg.includes('CHROME_NOT_FOUND')
        ? 'BROWSER_UNAVAILABLE'
        : msg;
    return NextResponse.json({ ok: true, available: null, reason: mapped, searchUrl });
  } finally {
    await page?.close().catch(() => null);
  }
}
