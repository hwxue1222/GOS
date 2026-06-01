import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { findInvoiceById } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';

export const runtime = 'nodejs';
export const maxDuration = 60;

type CacheClient = {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<void>;
};

async function getCacheClient(): Promise<CacheClient | null> {
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    const mod = (await import('@vercel/kv')) as unknown as {
      kv: {
        get: (key: string) => Promise<unknown>;
        set: (key: string, value: unknown) => Promise<unknown>;
      };
    };
    return {
      get: async (key) => {
        const v = await mod.kv.get(key);
        return typeof v === 'string' ? v : v ? JSON.stringify(v) : null;
      },
      set: async (key, value) => {
        await mod.kv.set(key, value);
      },
    };
  }

  if (process.env.REDIS_URL) {
    const g = globalThis as unknown as { __gosPdfRedisPromise?: Promise<any> };
    if (!g.__gosPdfRedisPromise) {
      g.__gosPdfRedisPromise = (async () => {
        const mod = (await import('redis')) as any;
        const client = mod.createClient({ url: process.env.REDIS_URL });
        await client.connect();
        return client;
      })();
    }
    const client = await g.__gosPdfRedisPromise;
    return {
      get: async (key) => {
        const v = await client.get(key);
        return typeof v === 'string' ? v : null;
      },
      set: async (key, value) => {
        await client.set(key, value, { EX: 60 * 60 * 24 * 30 });
      },
    };
  }

  return null;
}

function sanitizeFilenameBase(input: string) {
  const s = input.trim();
  if (!s) return 'invoice';
  return s.replaceAll(/[^a-zA-Z0-9._-]+/g, '_');
}

async function getBrowser() {
  const g = globalThis as unknown as { __gosPdfBrowserPromise?: Promise<any> };
  if (!g.__gosPdfBrowserPromise) {
    g.__gosPdfBrowserPromise = (async () => {
      const chromiumMod = await import('@sparticuz/chromium');
      const puppeteerMod = await import('puppeteer-core');
      const chromium = chromiumMod.default ?? chromiumMod;
      const puppeteer = puppeteerMod.default ?? puppeteerMod;

      const executablePath = await chromium.executablePath();
      return puppeteer.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath,
        headless: chromium.headless,
      });
    })();
  }
  return g.__gosPdfBrowserPromise;
}

export async function GET(req: Request, ctx: { params: Promise<{ invoiceId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!hasPermission(user, 'invoices', 'viewAll')) return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });

  const { invoiceId } = await ctx.params;
  const invoice = await findInvoiceById(invoiceId);
  if (!invoice || invoice.deletedAt) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

  const cacheKey = `gos:invoicePdf:${invoiceId}:${invoice.updatedAt}`;
  const cache = await getCacheClient();
  if (cache) {
    const cached = await cache.get(cacheKey);
    if (cached) {
      const bytes = Buffer.from(cached, 'base64');
      const filenameBase = sanitizeFilenameBase(invoice.invoiceNo || invoice.id);
      return new NextResponse(bytes, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${filenameBase}.pdf"`,
          'Cache-Control': 'no-store',
        },
      });
    }
  }

  const origin = new URL(req.url).origin;
  const printUrl = `${origin}/invoices/${encodeURIComponent(invoiceId)}/print`;
  const cookie = req.headers.get('cookie') ?? '';

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    if (cookie) await page.setExtraHTTPHeaders({ cookie });
    await page.emulateMediaType('print');
    await page.goto(printUrl, { waitUntil: ['domcontentloaded', 'networkidle0'], timeout: 45_000 });
    await page.waitForSelector('#invoice-print-root', { timeout: 20_000 });
    await page.evaluate(async () => {
      const fonts = (document as any).fonts;
      if (fonts?.ready) await fonts.ready;
    });

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
    });

    if (cache) {
      await cache.set(cacheKey, Buffer.from(pdf).toString('base64'));
    }

    const filenameBase = sanitizeFilenameBase(invoice.invoiceNo || invoice.id);
    return new NextResponse(Buffer.from(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filenameBase}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } finally {
    await page.close();
  }
}
