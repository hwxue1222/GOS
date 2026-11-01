import fs from 'node:fs';
import path from 'node:path';
import type { Browser } from 'puppeteer-core';
import { PDFDocument } from 'pdf-lib';
import { computeInvoiceFxTotals, formatMoney, getInvoiceIssuerConfig } from '@/lib/invoice';
import type { Client, Invoice, InvoiceBillTo } from '@/lib/types';

type ClientLike = Pick<Client, 'name' | 'address' | 'phone' | 'email'> | null;

function escHtml(input: string) {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function nl2br(input: string) {
  return escHtml(input).replaceAll('\n', '<br />');
}

function formatDateDmy(ymd: string) {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return ymd;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function n2(v: number) {
  return (Math.round(v * 100) / 100).toFixed(2);
}

function billToLabel(billTo: InvoiceBillTo) {
  return billTo.companyName || (billTo.type === 'CLIENT' ? 'Client' : 'Company');
}

function readPublicAssetAsDataUri(relPath: string) {
  const g = globalThis as unknown as { __gosInvoicePdfAssetCache?: Map<string, string> };
  if (!g.__gosInvoicePdfAssetCache) g.__gosInvoicePdfAssetCache = new Map();
  const cache = g.__gosInvoicePdfAssetCache;
  const cached = cache.get(relPath);
  if (cached) return cached;

  const filePath = path.join(process.cwd(), 'public', relPath.replace(/^\/+/, ''));
  if (!fs.existsSync(filePath)) return '';

  const lower = filePath.toLowerCase();
  const mime = lower.endsWith('.png')
    ? 'image/png'
    : lower.endsWith('.jpg') || lower.endsWith('.jpeg')
      ? 'image/jpeg'
      : lower.endsWith('.svg')
        ? 'image/svg+xml'
        : lower.endsWith('.webp')
          ? 'image/webp'
          : lower.endsWith('.gif')
            ? 'image/gif'
            : 'application/octet-stream';
  const dataUri = `data:${mime};base64,${fs.readFileSync(filePath).toString('base64')}`;
  cache.set(relPath, dataUri);
  return dataUri;
}

function getInlineFontFaceCss() {
  const g = globalThis as unknown as { __gosInvoicePdfFontCss?: string };
  if (!g.__gosInvoicePdfFontCss) {
    try {
      const regularPath = path.join(process.cwd(), 'public', 'fonts', 'NotoSansSC-Regular.otf');
      const boldPath = path.join(process.cwd(), 'public', 'fonts', 'NotoSansSC-Bold.otf');
      const regular = fs.existsSync(regularPath) ? fs.readFileSync(regularPath).toString('base64') : '';
      const bold = fs.existsSync(boldPath) ? fs.readFileSync(boldPath).toString('base64') : '';
      const faces = [
        regular
          ? `@font-face{font-family:'InvoicePdfSans';src:url('data:font/otf;base64,${regular}') format('opentype');font-weight:400;font-style:normal;}`
          : '',
        bold
          ? `@font-face{font-family:'InvoicePdfSans';src:url('data:font/otf;base64,${bold}') format('opentype');font-weight:700;font-style:normal;}`
          : '',
      ]
        .filter(Boolean)
        .join('');
      g.__gosInvoicePdfFontCss = faces;
    } catch {
      g.__gosInvoicePdfFontCss = '';
    }
  }
  return g.__gosInvoicePdfFontCss || '';
}

function renderInvoicePdfHtml(params: { invoice: Invoice; client: ClientLike }) {
  const { invoice, client } = params;
  const cfg = getInvoiceIssuerConfig(invoice.issuer);
  const fx = computeInvoiceFxTotals(invoice);
  const billTo = invoice.billTo;
  const billToAddress = billTo.address ?? client?.address ?? '';
  const billToContact = billTo.contactNo ?? client?.phone ?? '';
  const billToEmail = billTo.email ?? client?.email ?? '';
  const paynowQr = cfg.issuer === 'BBY_SG' ? readPublicAssetAsDataUri('/paynow-qr.png') : '';
  const bybridgeLogo = readPublicAssetAsDataUri('/templates/bybridge-tax-invoice/image1.jpg');

  const rows = [
    ['Bill To', billToLabel(billTo), 'Invoice No.', invoice.invoiceNo],
    ['Address', billToAddress, 'Invoice Date', formatDateDmy(invoice.issueDate)],
    ['D/O No.', invoice.doNo ?? '-', 'Contact No.', billToContact],
    ['Payment Method', invoice.paymentMethod ?? 'As below', 'Email', billToEmail],
    ['Credit Term', invoice.creditTerm ?? 'Net 15', '', ''],
  ] as const;

  const infoRows = rows
    .map(
      ([l1, v1, l2, v2]) => `
        <tr>
          <td class="label">${escHtml(l1)}</td>
          <td class="value">${nl2br(String(v1 ?? ''))}</td>
          <td class="label">${escHtml(l2)}</td>
          <td class="value">${nl2br(String(v2 ?? ''))}</td>
        </tr>
      `,
    )
    .join('');

  const itemRows = invoice.items
    .map((it, idx) => {
      const amount = Math.round(it.qty * it.unitPrice * 100) / 100;
      return `
        <tr>
          <td class="svc">${idx + 1}</td>
          <td class="desc">${nl2br(it.description)}</td>
          <td class="qty">${escHtml(String(it.qty))}</td>
          <td class="amt">${amount.toFixed(2)}</td>
        </tr>
      `;
    })
    .join('');

  const totalsRows = [
    invoice.discount
      ? `<div class="total-row"><span>${escHtml(`Discount${invoice.currency ? ` in ${invoice.currency}` : ''}`)}</span><strong>(${Math.abs(invoice.discount).toFixed(2)})</strong></div>`
      : '',
    invoice.tax
      ? `<div class="total-row"><span>GST Amount</span><strong>${n2(Math.max(0, invoice.tax || 0))}</strong></div>`
      : '',
    `<div class="total-row grand"><span>${escHtml(`Total Amount in ${invoice.currency}`)}</span><strong>${invoice.total.toFixed(2)}</strong></div>`,
    fx.usd !== null ? `<div class="total-row minor"><span>Total Amount in USD</span><span>${escHtml(formatMoney('USD', fx.usd))}</span></div>` : '',
    fx.cny !== null ? `<div class="total-row minor"><span>Total Amount in CNY</span><span>${escHtml(formatMoney('CNY', fx.cny))}</span></div>` : '',
  ]
    .filter(Boolean)
    .join('');

  const paymentRows = cfg.paymentMethods
    .map(
      (line, idx) => `
        <div class="payment-row">
          <div class="payment-idx">${idx + 1}</div>
          <div class="payment-line">${nl2br(line)}</div>
        </div>
      `,
    )
    .join('');

  const footerTop = cfg.addressLine
    ? `${escHtml(`Address: ${cfg.addressLine}`)}${cfg.tel ? `  Tel: ${escHtml(cfg.tel)}` : ''}${cfg.customerService ? `  Customer Service: ${escHtml(cfg.customerService)}` : ''}`
    : '';
  const footerBottom = `${cfg.email ? `Email: ${escHtml(cfg.email)}` : ''}${cfg.website ? `${cfg.email ? '  ' : ''}Website: ${escHtml(cfg.website)}` : ''}`;

  const brandHtml =
    invoice.issuer === 'BYBRIDGE' && bybridgeLogo
      ? `<img class="brand-logo" src="${bybridgeLogo}" alt="Bybridge" />`
      : `<div class="brand-badge">B</div>`;

  const remittancePage = cfg.remittancePage
    ? `
      <section class="page remittance-page">
        <div class="remit-title">${escHtml(cfg.remittancePage.title)}</div>
        <div class="remit-subtitle">${escHtml(cfg.remittancePage.subtitle)}</div>
        <table class="remit-table">
          <tbody>
            ${cfg.remittancePage.rows
              .map(
                (r) => `
                  <tr>
                    <td class="label">${escHtml(r.label)}</td>
                    <td class="value">${nl2br(r.value)}</td>
                  </tr>
                `,
              )
              .join('')}
          </tbody>
        </table>
      </section>
    `
    : '';

  const notesHtml = invoice.notes?.trim()
    ? `<div class="notes"><div class="notes-title">Notes</div><div>${nl2br(invoice.notes)}</div></div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    ${getInlineFontFaceCss()}
    @page { size: A4; margin: 0; }
    html, body { margin: 0; padding: 0; background: #fff; color: #111; }
    body {
      font-family: 'InvoicePdfSans', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif;
      -webkit-font-smoothing: antialiased;
      font-size: 13px;
      line-height: 1.5;
    }
    * { box-sizing: border-box; }
    .doc { width: 100%; }
    .page {
      width: 210mm;
      min-height: 297mm;
      padding: 14mm 14mm 12mm;
      page-break-after: always;
      background: #fff;
      display: flex;
      flex-direction: column;
    }
    .page:last-child { page-break-after: auto; }
    .header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
    }
    .brand-wrap {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }
    .brand-logo {
      height: 48px;
      width: auto;
      object-fit: contain;
      display: block;
    }
    .brand-badge {
      width: 44px;
      height: 44px;
      border-radius: 10px;
      background: #dc2626;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 28px;
      font-weight: 700;
      flex: 0 0 auto;
    }
    .company-lines { min-width: 0; }
    .company-zh { font-size: 20px; font-weight: 700; line-height: 1.2; }
    .company-en { margin-top: 2px; font-size: 13px; font-weight: 700; }
    .company-uen { color: #555; font-size: 11px; margin-top: 2px; }
    .top-meta { text-align: right; color: #555; font-size: 12px; white-space: nowrap; }
    .divider { height: 1px; background: rgba(17,17,17,0.55); margin-top: 12px; }
    .title { margin: 18px 0 14px; text-align: center; font-size: 17px; font-weight: 700; letter-spacing: 0.04em; }
    table { width: 100%; border-collapse: collapse; }
    .info-table td {
      border: 1px solid rgba(17,17,17,0.18);
      padding: 8px 10px;
      vertical-align: top;
    }
    .info-table .label { width: 16%; font-weight: 600; }
    .info-table .value { width: 34%; white-space: pre-wrap; }
    .items { margin-top: 14px; }
    .items th, .items td {
      border: 1px solid rgba(17,17,17,0.18);
      padding: 8px 10px;
      vertical-align: top;
    }
    .items th {
      background: rgba(17,17,17,0.03);
      text-align: left;
      font-weight: 700;
    }
    .items .svc { width: 8%; }
    .items .desc { width: 62%; white-space: pre-wrap; }
    .items .qty { width: 12%; text-align: right; }
    .items .amt { width: 18%; text-align: right; }
    .totals {
      margin-top: 14px;
      margin-left: auto;
      width: 330px;
      max-width: 100%;
    }
    .total-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-top: 6px;
    }
    .total-row.grand {
      margin-top: 10px;
      padding-top: 8px;
      border-top: 1px solid rgba(17,17,17,0.25);
      font-size: 16px;
      font-weight: 700;
    }
    .total-row.minor { color: rgba(17,17,17,0.7); font-size: 12px; font-style: italic; }
    .notes {
      margin-top: 14px;
      border: 1px solid rgba(17,17,17,0.12);
      padding: 10px 12px;
      white-space: pre-wrap;
    }
    .notes-title { font-weight: 700; margin-bottom: 6px; }
    .bottom {
      margin-top: auto;
      padding-top: 18px;
    }
    .payment-wrap {
      display: flex;
      align-items: stretch;
      gap: 18px;
    }
    .payment-box {
      flex: 1 1 auto;
      border: 1px solid rgba(17,17,17,0.18);
    }
    .payment-title {
      padding: 9px 12px;
      border-bottom: 1px solid rgba(17,17,17,0.18);
      background: rgba(17,17,17,0.03);
      font-weight: 700;
      white-space: pre-line;
    }
    .payment-row {
      display: grid;
      grid-template-columns: 34px 1fr;
      border-top: 1px solid rgba(17,17,17,0.12);
    }
    .payment-row:first-child { border-top: 0; }
    .payment-idx {
      padding: 8px 10px;
      border-right: 1px solid rgba(17,17,17,0.12);
    }
    .payment-line {
      padding: 8px 12px;
      white-space: pre-wrap;
    }
    .qr-wrap {
      width: 190px;
      flex: 0 0 190px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .qr-wrap img {
      width: 180px;
      height: 180px;
      object-fit: contain;
      display: block;
    }
    .thanks, .generated {
      margin-top: 14px;
      text-align: center;
      color: rgba(17,17,17,0.7);
      font-size: 12px;
    }
    .thanks { font-style: italic; }
    .footer {
      margin-top: 16px;
      text-align: center;
      color: rgba(17,17,17,0.72);
      font-size: 11px;
      line-height: 1.6;
      white-space: pre-wrap;
    }
    .remittance-page { justify-content: flex-start; }
    .remit-title { font-size: 24px; font-weight: 700; }
    .remit-subtitle { margin-top: 28px; font-size: 16px; font-weight: 700; }
    .remit-table { margin-top: 14px; }
    .remit-table td {
      border: 1px solid rgba(17,17,17,0.18);
      padding: 10px 12px;
      vertical-align: top;
      white-space: pre-wrap;
    }
    .remit-table .label { width: 42%; font-weight: 700; }
  </style>
</head>
<body>
  <div id="invoice-pdf-root" class="doc">
    <section class="page">
      <div class="header">
        <div class="brand-wrap">
          ${brandHtml}
          <div class="company-lines">
            ${cfg.displayNameZh ? `<div class="company-zh">${escHtml(cfg.displayNameZh)}</div>` : ''}
            <div class="company-en">${escHtml(cfg.displayName)}</div>
            ${cfg.uen ? `<div class="company-uen">UEN: ${escHtml(cfg.uen)}</div>` : ''}
          </div>
        </div>
        <div class="top-meta">${cfg.uen ? `UEN: ${escHtml(cfg.uen)}` : ''}</div>
      </div>
      <div class="divider"></div>
      <div class="title">INVOICE</div>

      <table class="info-table">
        <tbody>${infoRows}</tbody>
      </table>

      <table class="items">
        <thead>
          <tr>
            <th class="svc">Svc</th>
            <th class="desc">Description</th>
            <th class="qty">Qty</th>
            <th class="amt">${escHtml(invoice.currency)}</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>

      <div class="totals">${totalsRows}</div>
      ${notesHtml}

      <div class="bottom">
        <div class="payment-wrap">
          <div class="payment-box">
            <div class="payment-title">${nl2br(cfg.paymentMethodsTitle ?? 'Payment Methods:')}</div>
            ${paymentRows}
          </div>
          ${paynowQr ? `<div class="qr-wrap"><img src="${paynowQr}" alt="PayNow QR" /></div>` : ''}
        </div>

        <div class="thanks">Thank you for your business. We do expect your payment on time, so please process the invoice within grant period. There will be 1.5% interest charge per month for late payment.</div>
        <div class="generated">This is computer generated and no signature is required.</div>
        <div class="footer">${footerTop ? `<div>${footerTop}</div>` : ''}${footerBottom ? `<div>${footerBottom}</div>` : ''}</div>
      </div>
    </section>
    ${remittancePage}
  </div>
</body>
</html>`;
}

async function getBrowser() {
  const g = globalThis as unknown as { __gosInvoicePdfRendererBrowserPromise?: Promise<Browser> };
  if (!g.__gosInvoicePdfRendererBrowserPromise) {
    g.__gosInvoicePdfRendererBrowserPromise = (async () => {
      const chromiumMod = await import('@sparticuz/chromium');
      const puppeteerMod = await import('puppeteer-core');
      const chromium = chromiumMod.default ?? chromiumMod;
      const puppeteer = puppeteerMod.default ?? puppeteerMod;

      const envPath = process.env.PUPPETEER_EXECUTABLE_PATH?.trim() || process.env.CHROME_EXECUTABLE_PATH?.trim();
      const macCandidates = [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
      ];
      const candidate = envPath || macCandidates.find((p) => fs.existsSync(p)) || null;
      const executablePath = candidate || (await chromium.executablePath());
      return puppeteer.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath,
        headless: chromium.headless,
      });
    })();
  }
  return g.__gosInvoicePdfRendererBrowserPromise;
}

export async function buildInvoicePdfBuffer(params: { invoice: Invoice; client: ClientLike }) {
  const html = renderInvoicePdfHtml(params);
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1200, height: 1700, deviceScaleFactor: 2 });
    await page.emulateMediaType('print');
    await page.setContent(html, { waitUntil: ['domcontentloaded'] });
    await page.waitForSelector('#invoice-pdf-root', { timeout: 20_000 });
    await page.evaluate(async () => {
      if (document.fonts?.ready) await document.fonts.ready;
      await Promise.all(
        Array.from(document.images).map(
          (img) =>
            new Promise<void>((resolve) => {
              if (img.complete) return resolve();
              img.addEventListener('load', () => resolve(), { once: true });
              img.addEventListener('error', () => resolve(), { once: true });
            }),
        ),
      );
    });
    const sections = await page.$$('.page');
    if (!sections.length) throw new Error('PDF_PAGE_MISSING');

    const pdfDoc = await PDFDocument.create();
    for (const section of sections) {
      const png = await section.screenshot({ type: 'png', omitBackground: false, captureBeyondViewport: true });
      const image = await pdfDoc.embedPng(png);
      const pdfPage = pdfDoc.addPage([595.28, 841.89]);
      pdfPage.drawImage(image, { x: 0, y: 0, width: 595.28, height: 841.89 });
    }
    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  } finally {
    await page.close();
  }
}
