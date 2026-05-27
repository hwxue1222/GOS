import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { Client, Invoice } from '@/lib/types';
import { computeInvoiceFxTotals, getInvoiceIssuerConfig } from '@/lib/invoice';

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function safeText(s: string | undefined | null) {
  return (s ?? '').toString();
}

function safeYmd(ymd: string | undefined | null) {
  const v = safeText(ymd).trim();
  return v || '';
}

function formatDateDmy(ymd: string) {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return ymd;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function wrapText(text: string, maxWidth: number, measure: (s: string) => number) {
  const words = text.replaceAll(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (!words.length) return [''];
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const candidate = line ? `${line} ${w}` : w;
    if (measure(candidate) <= maxWidth) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

export async function buildInvoicePdf(params: {
  invoice: Invoice;
  client: Client | null;
  templateRelPath?: string;
}) {
  const invoice = params.invoice;
  const client = params.client;
  const templateRelPath = params.templateRelPath ?? 'public/templates/bby-invoice-template.pdf';
  const templatePath = path.join(process.cwd(), templateRelPath);

  const templateBytes = await readFile(templatePath).catch(() => null);
  const pdf = await PDFDocument.create();

  if (templateBytes) {
    const tpl = await PDFDocument.load(templateBytes);
    const [tplPage] = await pdf.copyPages(tpl, [0]);
    pdf.addPage(tplPage);
  } else {
    pdf.addPage([595.28, 841.89]);
  }

  const page = pdf.getPage(0);
  const { width, height } = page.getSize();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const billTo = invoice.billTo;
  const billToName = billTo.companyName || (billTo.type === 'CLIENT' ? client?.name ?? '' : '');
  const billToAddress = billTo.address ?? client?.address ?? '';
  const billToContact = billTo.contactNo ?? client?.phone ?? '';
  const billToEmail = billTo.email ?? client?.email ?? '';

  const issuerCfg = getInvoiceIssuerConfig(invoice.issuer);
  const fx = computeInvoiceFxTotals(invoice);

  const black = rgb(0, 0, 0);
  const gray = rgb(0.35, 0.35, 0.35);
  const white = rgb(1, 1, 1);

  const clearBox = (x: number, y: number, w: number, h: number) => {
    page.drawRectangle({ x, y, width: w, height: h, color: white });
  };

  const drawLabelValue = (x: number, y: number, label: string, value: string) => {
    page.drawText(label, { x, y, size: 9, font: fontBold, color: black });
    page.drawText(value, { x: x + 95, y, size: 9, font, color: black });
  };

  const top = height - 160;

  const leftX = 68;
  const rightX = width / 2 + 10;

  clearBox(leftX + 88, top - 86, width / 2 - (leftX + 88) - 28, 104);
  clearBox(rightX + 88, top - 86, width - (rightX + 88) - 54, 104);

  drawLabelValue(leftX, top, 'Bill To', safeText(billToName));
  const addrLines = wrapText(safeText(billToAddress), width / 2 - 120, (s) => font.widthOfTextAtSize(s, 9));
  page.drawText('Address', { x: leftX, y: top - 18, size: 9, font: fontBold, color: black });
  addrLines.slice(0, 3).forEach((ln, i) => {
    page.drawText(ln, { x: leftX + 95, y: top - 18 - i * 12, size: 9, font, color: black });
  });
  drawLabelValue(leftX, top - 54, 'Contact No.', safeText(billToContact));
  drawLabelValue(leftX, top - 72, 'Email', safeText(billToEmail));

  drawLabelValue(rightX, top, 'Invoice No.', safeText(invoice.invoiceNo));
  drawLabelValue(rightX, top - 18, 'Invoice Date', formatDateDmy(safeYmd(invoice.issueDate)));
  drawLabelValue(rightX, top - 36, 'D/O No.', safeText(invoice.doNo ?? '-'));
  drawLabelValue(rightX, top - 54, 'Payment', safeText(invoice.paymentMethod ?? 'As below'));
  drawLabelValue(rightX, top - 72, 'Credit Term', safeText(invoice.creditTerm ?? 'Net 15'));

  const tableTopY = height - 390;
  const rowH = 18;
  const colSvcX = 70;
  const colDescX = 120;
  const colQtyX = width - 190;
  const colAmtX = width - 92;

  for (let i = 0; i < 4; i++) {
    const y = tableTopY - i * rowH - 2;
    clearBox(colSvcX - 2, y, 36, 14);
    clearBox(colDescX - 2, y, colQtyX - colDescX - 6, 14);
    clearBox(colQtyX - 2, y, 50, 14);
    clearBox(colAmtX - 58, y, 60, 14);
    clearBox(colDescX - 2, y - 11, colQtyX - colDescX - 6, 12);
  }

  invoice.items.slice(0, 14).forEach((it, idx) => {
    const y = tableTopY - idx * rowH;
    page.drawText(String(idx + 1), { x: colSvcX, y, size: 9, font, color: black });
    const descLines = wrapText(it.description, colQtyX - colDescX - 10, (s) => font.widthOfTextAtSize(s, 9));
    page.drawText(descLines[0] ?? '', { x: colDescX, y, size: 9, font, color: black });
    if (descLines[1]) {
      page.drawText(descLines[1], { x: colDescX, y: y - 11, size: 9, font, color: black });
    }
    page.drawText(String(it.qty), { x: colQtyX, y, size: 9, font, color: black });
    const amt = round2(it.qty * it.unitPrice);
    const amtText = amt.toFixed(2);
    page.drawText(amtText, { x: colAmtX - font.widthOfTextAtSize(amtText, 9), y, size: 9, font, color: black });
  });

  const totalsX = width - 290;
  const totalsY = 230;
  clearBox(totalsX - 8, totalsY - 36, width - (totalsX - 8) - 70, 96);
  if (invoice.discount) {
    page.drawText(`Discount in ${invoice.currency}`, { x: totalsX, y: totalsY + 40, size: 10, font: fontBold, color: black });
    const v = `(${Math.abs(invoice.discount).toFixed(2)})`;
    page.drawText(v, { x: width - 88 - font.widthOfTextAtSize(v, 10), y: totalsY + 40, size: 10, font, color: black });
  }
  page.drawText(`Total Amount in ${invoice.currency}`, { x: totalsX, y: totalsY + 14, size: 10, font: fontBold, color: black });
  const totalText = invoice.total.toFixed(2);
  page.drawText(totalText, { x: width - 88 - font.widthOfTextAtSize(totalText, 10), y: totalsY + 14, size: 10, font, color: black });

  if (fx.usd !== null) {
    const label = 'Total Amount in USD';
    const v = fx.usd.toFixed(2);
    page.drawText(label, { x: totalsX, y: totalsY - 6, size: 9, font, color: gray });
    page.drawText(v, { x: width - 88 - font.widthOfTextAtSize(v, 9), y: totalsY - 6, size: 9, font, color: gray });
  }
  if (fx.cny !== null) {
    const label = 'Total Amount in CNY';
    const v = fx.cny.toFixed(2);
    page.drawText(label, { x: totalsX, y: totalsY - 20, size: 9, font, color: gray });
    page.drawText(v, { x: width - 88 - font.widthOfTextAtSize(v, 9), y: totalsY - 20, size: 9, font, color: gray });
  }

  const footerTop = 74;
  page.drawRectangle({ x: 0, y: 0, width, height: footerTop, color: white });
  const footerAddress = issuerCfg.addressLine ? `Address: ${issuerCfg.addressLine}` : '';
  const footerParts = [issuerCfg.tel ? `Tel: ${issuerCfg.tel}` : '', issuerCfg.email ? `Email: ${issuerCfg.email}` : '', issuerCfg.website ? `Website: ${issuerCfg.website}` : ''].filter(Boolean);
  const footerLine2 = footerParts.join('  ');
  if (footerAddress) {
    const w1 = font.widthOfTextAtSize(footerAddress, 9);
    page.drawText(footerAddress, { x: Math.max(20, (width - w1) / 2), y: 48, size: 9, font, color: gray });
  }
  if (footerLine2) {
    const w2 = font.widthOfTextAtSize(footerLine2, 9);
    page.drawText(footerLine2, { x: Math.max(20, (width - w2) / 2), y: 34, size: 9, font, color: gray });
  }

  const pdfBytes = await pdf.save();
  return Buffer.from(pdfBytes);
}
