import chromium from '@sparticuz/chromium';
import { chromium as playwrightChromium } from 'playwright-core';
 
export async function renderUrlToPdf(input: { url: string; cookieHeader?: string | null }) {
  const executablePath = await chromium.executablePath();
  const browser = await playwrightChromium.launch({
    args: chromium.args,
    executablePath,
    headless: chromium.headless === 'shell' ? true : chromium.headless,
  });
 
  try {
    const context = await browser.newContext({
      viewport: chromium.defaultViewport,
      ignoreHTTPSErrors: true,
    });
 
    const cookieHeader = input.cookieHeader?.trim();
    if (cookieHeader) {
      await context.setExtraHTTPHeaders({ cookie: cookieHeader });
    }
 
    const page = await context.newPage();
    await page.goto(input.url, { waitUntil: 'networkidle' });
    const pdfBytes = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
    });
    return Buffer.from(pdfBytes);
  } finally {
    await browser.close();
  }
}
