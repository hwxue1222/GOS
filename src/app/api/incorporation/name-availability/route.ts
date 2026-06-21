import fs from 'node:fs';
import type { Browser } from 'puppeteer-core';
import { NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 30;

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
      const candidate =
        (envPath && fs.existsSync(envPath) ? envPath : null) ||
        (chromiumPath && fs.existsSync(chromiumPath) ? chromiumPath : null) ||
        macCandidates.find((p) => fs.existsSync(p)) ||
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
    const name = pickNameBefore(i);
    if (name) out.push({ name, operatingStatus: line });
  }

  return out;
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const url = new URL(req.url);
  const name = (url.searchParams.get('name') ?? '').trim();
  const debug = url.searchParams.get('debug') === '1';
  if (name.length < 2 || name.length > 120) return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });

  const searchUrl = `https://www.sgpbusiness.com/search/${encodeURIComponent(name)}`;

  const browser = await getBrowser();
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(25_000);
  try {
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
    await new Promise((r) => setTimeout(r, 2500));
    const bodyText = await page.evaluate(() => document.body?.innerText ?? '');
    if (/just a moment/i.test(bodyText) || /checking your browser/i.test(bodyText)) {
      return NextResponse.json({ ok: true, available: null, reason: 'BLOCKED', searchUrl });
    }

    const matches = parseMatchesFromText(bodyText);
    const targetKey = normalizeName(name);
    const conflict = matches.find((m) => normalizeName(m.name) === targetKey) ?? null;

    return NextResponse.json({
      ok: true,
      available: conflict ? false : true,
      conflict: conflict ? { name: conflict.name, operatingStatus: conflict.operatingStatus } : null,
      searchUrl,
      debug: debug
        ? {
            targetKey,
            parsedCount: matches.length,
            sample: matches.slice(0, 5),
          }
        : undefined,
    });
  } catch (e) {
    return NextResponse.json({ ok: true, available: null, reason: (e as Error).message || 'ERROR', searchUrl });
  } finally {
    await page.close().catch(() => null);
  }
}
