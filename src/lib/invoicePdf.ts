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
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
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
  const border = rgb(0.82, 0.82, 0.82);

  const lineH = (size: number) => Math.round(size * 1.25);
  const drawRight = (text: string, xRight: number, y: number, size: number, bold = false, color = black) => {
    const f = bold ? fontBold : font;
    const w = f.widthOfTextAtSize(text, size);
    page.drawText(text, { x: xRight - w, y, size, font: f, color });
  };
  const drawCentered = (text: string, y: number, size: number, bold = false, color = black) => {
    const f = bold ? fontBold : font;
    const w = f.widthOfTextAtSize(text, size);
    page.drawText(text, { x: Math.max(24, (width - w) / 2), y, size, font: f, color });
  };

  const cell = (x: number, y: number, w: number, h: number, fill = white) => {
    page.drawRectangle({ x, y, width: w, height: h, color: fill, borderColor: border, borderWidth: 1 });
  };
  const drawCellText = (
    x: number,
    y: number,
    w: number,
    h: number,
    text: string,
    opts?: { bold?: boolean; size?: number; align?: 'left' | 'right' },
  ) => {
    const size = opts?.size ?? 10;
    const f = opts?.bold ? fontBold : font;
    const padX = 10;
    const padY = 8;
    const lines = wrapText(text, w - padX * 2, (s) => f.widthOfTextAtSize(s, size));
    const maxLines = Math.max(1, Math.floor((h - padY * 2) / lineH(size)));
    const shown = lines.slice(0, maxLines);
    for (let i = 0; i < shown.length; i++) {
      const ln = shown[i] ?? '';
      const yLine = y + h - padY - size - i * lineH(size);
      if (opts?.align === 'right') {
        const wTxt = f.widthOfTextAtSize(ln, size);
        page.drawText(ln, { x: x + w - padX - wTxt, y: yLine, size, font: f, color: black });
      } else {
        page.drawText(ln, { x: x + padX, y: yLine, size, font: f, color: black });
      }
    }
  };

  page.drawRectangle({ x: 0, y: 0, width, height, color: white });

  const headerTop = height - 64;
  const logoX = 64;
  const logoY = headerTop - 44;
  const logoSize = 44;
  page.drawRectangle({ x: logoX, y: logoY, width: logoSize, height: logoSize, color: rgb(0.86, 0.1, 0.13) });
  page.drawText('B', { x: logoX + 13, y: logoY + 8, size: 30, font: fontBold, color: white });

  const nameX = logoX + logoSize + 14;
  const zh = issuerCfg.displayNameZh ? safeText(issuerCfg.displayNameZh) : '';
  if (zh) {
    page.drawText(zh, { x: nameX, y: headerTop - 14, size: 16, font: fontBold, color: black });
    page.drawText(safeText(issuerCfg.displayName), { x: nameX, y: headerTop - 34, size: 11, font: fontBold, color: black });
  } else {
    page.drawText(safeText(issuerCfg.displayName), { x: nameX, y: headerTop - 18, size: 14, font: fontBold, color: black });
  }
  if (issuerCfg.uen) {
    drawRight(`UEN: ${issuerCfg.uen}`, width - 64, headerTop - 18, 9, false, gray);
  }

  page.drawRectangle({ x: 64, y: headerTop - 58, width: width - 128, height: 1.2, color: rgb(0.2, 0.2, 0.2) });

  drawCentered('INVOICE', headerTop - 90, 16, true);

  const tableX = 64;
  const tableW = width - 128;
  const tableYTop = headerTop - 110;
  const colLabelW = 120;
  const colRightLabelW = 120;
  const colValueW = (tableW - colLabelW - colRightLabelW) / 2;
  const rowH = 26;

  const r1y = tableYTop - rowH;
  cell(tableX, r1y, colLabelW, rowH);
  cell(tableX + colLabelW, r1y, colValueW, rowH);
  cell(tableX + colLabelW + colValueW, r1y, colRightLabelW, rowH);
  cell(tableX + colLabelW + colValueW + colRightLabelW, r1y, colValueW, rowH);
  drawCellText(tableX, r1y, colLabelW, rowH, 'Bill To', { bold: true });
  drawCellText(tableX + colLabelW, r1y, colValueW, rowH, safeText(billToName));
  drawCellText(tableX + colLabelW + colValueW, r1y, colRightLabelW, rowH, 'Invoice No.', { bold: true });
  drawCellText(tableX + colLabelW + colValueW + colRightLabelW, r1y, colValueW, rowH, safeText(invoice.invoiceNo));

  const addressH = rowH * 2;
  const r2y = r1y - addressH;
  cell(tableX, r2y, colLabelW, addressH);
  cell(tableX + colLabelW, r2y, colValueW, addressH);
  cell(tableX + colLabelW + colValueW, r1y - rowH, colRightLabelW, rowH);
  cell(tableX + colLabelW + colValueW + colRightLabelW, r1y - rowH, colValueW, rowH);
  cell(tableX + colLabelW + colValueW, r2y, colRightLabelW, rowH);
  cell(tableX + colLabelW + colValueW + colRightLabelW, r2y, colValueW, rowH);
  drawCellText(tableX, r2y + rowH, colLabelW, addressH - rowH, 'Address', { bold: true });
  drawCellText(tableX + colLabelW, r2y, colValueW, addressH, safeText(billToAddress));
  drawCellText(tableX + colLabelW + colValueW, r1y - rowH, colRightLabelW, rowH, 'Invoice Date', { bold: true });
  drawCellText(tableX + colLabelW + colValueW + colRightLabelW, r1y - rowH, colValueW, rowH, formatDateDmy(safeYmd(invoice.issueDate)));
  drawCellText(tableX + colLabelW + colValueW, r2y, colRightLabelW, rowH, 'D/O No.', { bold: true });
  drawCellText(tableX + colLabelW + colValueW + colRightLabelW, r2y, colValueW, rowH, safeText(invoice.doNo ?? '-'));

  const r4y = r2y - rowH;
  cell(tableX, r4y, colLabelW, rowH);
  cell(tableX + colLabelW, r4y, colValueW, rowH);
  cell(tableX + colLabelW + colValueW, r4y, colRightLabelW, rowH);
  cell(tableX + colLabelW + colValueW + colRightLabelW, r4y, colValueW, rowH);
  drawCellText(tableX, r4y, colLabelW, rowH, 'Contact No.', { bold: true });
  drawCellText(tableX + colLabelW, r4y, colValueW, rowH, safeText(billToContact));
  drawCellText(tableX + colLabelW + colValueW, r4y, colRightLabelW, rowH, 'Payment Method', { bold: true });
  drawCellText(tableX + colLabelW + colValueW + colRightLabelW, r4y, colValueW, rowH, safeText(invoice.paymentMethod ?? 'As below'));

  const r5y = r4y - rowH;
  cell(tableX, r5y, colLabelW, rowH);
  cell(tableX + colLabelW, r5y, colValueW, rowH);
  cell(tableX + colLabelW + colValueW, r5y, colRightLabelW, rowH);
  cell(tableX + colLabelW + colValueW + colRightLabelW, r5y, colValueW, rowH);
  drawCellText(tableX, r5y, colLabelW, rowH, 'Email', { bold: true });
  drawCellText(tableX + colLabelW, r5y, colValueW, rowH, safeText(billToEmail));
  drawCellText(tableX + colLabelW + colValueW, r5y, colRightLabelW, rowH, 'Credit Term', { bold: true });
  drawCellText(tableX + colLabelW + colValueW + colRightLabelW, r5y, colValueW, rowH, safeText(invoice.creditTerm ?? 'Net 15'));

  const itemsX = 64;
  const itemsW = width - 128;
  const itemsTop = r5y - 18;
  const itemsHeaderH = 26;
  const svcW = 60;
  const qtyW = 90;
  const amtW = 110;
  const descW = itemsW - svcW - qtyW - amtW;

  page.drawRectangle({ x: itemsX, y: itemsTop - itemsHeaderH, width: itemsW, height: itemsHeaderH, color: rgb(0.97, 0.97, 0.97), borderColor: border, borderWidth: 1 });
  const headerY = itemsTop - itemsHeaderH + 8;
  page.drawText('Svc', { x: itemsX + 10, y: headerY, size: 10, font: fontBold, color: black });
  page.drawText('Description', { x: itemsX + svcW + 10, y: headerY, size: 10, font: fontBold, color: black });
  drawRight('Qty', itemsX + svcW + descW + qtyW - 10, headerY, 10, true);
  drawRight(invoice.currency, itemsX + itemsW - 10, headerY, 10, true);
  page.drawRectangle({ x: itemsX + svcW, y: itemsTop - itemsHeaderH, width: 1, height: itemsHeaderH, color: border });
  page.drawRectangle({ x: itemsX + svcW + descW, y: itemsTop - itemsHeaderH, width: 1, height: itemsHeaderH, color: border });
  page.drawRectangle({ x: itemsX + svcW + descW + qtyW, y: itemsTop - itemsHeaderH, width: 1, height: itemsHeaderH, color: border });

  const itemRowH = 22;
  let yCursor = itemsTop - itemsHeaderH;
  const maxItems = 14;
  const sizeItem = 10;
  for (let idx = 0; idx < Math.min(maxItems, invoice.items.length); idx++) {
    const it = invoice.items[idx];
    yCursor -= itemRowH;
    page.drawRectangle({ x: itemsX, y: yCursor, width: itemsW, height: itemRowH, color: white, borderColor: border, borderWidth: 1 });
    page.drawRectangle({ x: itemsX + svcW, y: yCursor, width: 1, height: itemRowH, color: border });
    page.drawRectangle({ x: itemsX + svcW + descW, y: yCursor, width: 1, height: itemRowH, color: border });
    page.drawRectangle({ x: itemsX + svcW + descW + qtyW, y: yCursor, width: 1, height: itemRowH, color: border });
    page.drawText(String(idx + 1), { x: itemsX + 10, y: yCursor + 6, size: sizeItem, font, color: black });
    const descLines = wrapText(it.description, descW - 20, (s) => font.widthOfTextAtSize(s, sizeItem));
    page.drawText(descLines[0] ?? '', { x: itemsX + svcW + 10, y: yCursor + 6, size: sizeItem, font, color: black });
    if (descLines[1]) {
      page.drawText(descLines[1], { x: itemsX + svcW + 10, y: yCursor + 6 - lineH(sizeItem) + 2, size: sizeItem, font, color: black });
    }
    drawRight(String(it.qty), itemsX + svcW + descW + qtyW - 10, yCursor + 6, sizeItem);
    const amt = round2(it.qty * it.unitPrice).toFixed(2);
    drawRight(amt, itemsX + itemsW - 10, yCursor + 6, sizeItem);
  }

  const totalsW = 320;
  const totalsX = width - 64 - totalsW;
  const totalsTop = yCursor - 22;
  const totalsSize = 10;
  if (invoice.discount) {
    page.drawText(`Discount in ${invoice.currency}`, { x: totalsX, y: totalsTop, size: totalsSize, font: fontBold, color: black });
    const v = `(${Math.abs(invoice.discount).toFixed(2)})`;
    drawRight(v, width - 64, totalsTop, totalsSize);
  }
  page.drawRectangle({ x: totalsX, y: totalsTop - 14, width: totalsW, height: 1, color: border });
  page.drawText(`Total Amount in ${invoice.currency}`, { x: totalsX, y: totalsTop - 30, size: totalsSize, font: fontBold, color: black });
  drawRight(invoice.total.toFixed(2), width - 64, totalsTop - 30, totalsSize);
  if (fx.usd !== null) {
    page.drawText('Total Amount in USD', { x: totalsX, y: totalsTop - 48, size: 9, font, color: gray });
    drawRight(fx.usd.toFixed(2), width - 64, totalsTop - 48, 9, false, gray);
  }
  if (fx.cny !== null) {
    page.drawText('Total Amount in CNY', { x: totalsX, y: totalsTop - 62, size: 9, font, color: gray });
    drawRight(fx.cny.toFixed(2), width - 64, totalsTop - 62, 9, false, gray);
  }

  const pmTop = totalsTop - 110;
  const pmTitleH = 26;
  page.drawRectangle({ x: 64, y: pmTop - pmTitleH, width: width - 128, height: pmTitleH, color: rgb(0.97, 0.97, 0.97), borderColor: border, borderWidth: 1 });
  page.drawText(issuerCfg.paymentMethodsTitle ?? 'Payment Methods:', { x: 74, y: pmTop - pmTitleH + 8, size: 10, font: fontBold, color: black });

  let pmY = pmTop - pmTitleH;
  for (let i = 0; i < issuerCfg.paymentMethods.length; i++) {
    const line = issuerCfg.paymentMethods[i] ?? '';
    const boxW = width - 128;
    const idxW = 30;
    const textW = boxW - idxW;
    const lines = wrapText(line, textW - 20, (s) => font.widthOfTextAtSize(s, 10));
    const h = Math.max(26, 12 + lines.length * lineH(10));
    pmY -= h;
    page.drawRectangle({ x: 64, y: pmY, width: boxW, height: h, color: white, borderColor: border, borderWidth: 1 });
    page.drawRectangle({ x: 64 + idxW, y: pmY, width: 1, height: h, color: border });
    page.drawText(String(i + 1), { x: 74, y: pmY + h - 18, size: 10, font, color: black });
    for (let j = 0; j < lines.length; j++) {
      const yLine = pmY + h - 18 - j * lineH(10);
      page.drawText(lines[j] ?? '', { x: 64 + idxW + 10, y: yLine, size: 10, font, color: black });
    }
  }

  const thanks =
    'Thank you for your business. We do expect your payment on time, so please process the invoice within grant period.\nThere will be 1.5% interest charge per month for late payment.';
  const thanksLines = thanks.split('\n');
  const thanksY = 150;
  for (let i = 0; i < thanksLines.length; i++) {
    page.drawText(thanksLines[i] ?? '', { x: 64, y: thanksY - i * lineH(9), size: 9, font, color: gray });
  }
  drawCentered('This is computer generated and no signature is required.', 118, 9, false, gray);

  if (issuerCfg.addressLine) {
    drawCentered(`Address: ${issuerCfg.addressLine}`, 78, 9, false, gray);
  }
  const footerParts = [issuerCfg.tel ? `Tel: ${issuerCfg.tel}` : '', issuerCfg.email ? `Email: ${issuerCfg.email}` : '', issuerCfg.website ? `Website: ${issuerCfg.website}` : ''].filter(Boolean);
  if (footerParts.length) {
    drawCentered(footerParts.join('   '), 62, 9, false, gray);
  }

  const pdfBytes = await pdf.save();
  return Buffer.from(pdfBytes);
}
