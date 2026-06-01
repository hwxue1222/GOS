import { NextResponse } from 'next/server';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { getCurrentUser } from '@/lib/auth';
import { findInvoiceById } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';
import type { Currency, InvoiceItem } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

function safeNumber(v: unknown) {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function formatMoney(currency: Currency, amount: number) {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function computeSubtotal(items: InvoiceItem[]) {
  return round2(items.reduce((sum, it) => sum + safeNumber(it.qty) * safeNumber(it.unitPrice), 0));
}

function ymd(input?: string | null) {
  if (!input) return '';
  return String(input).trim().slice(0, 10);
}

export async function GET(_req: Request, ctx: { params: Promise<{ invoiceId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!hasPermission(user, 'invoices', 'viewAll')) return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });

  const { invoiceId } = await ctx.params;
  const invoice = await findInvoiceById(invoiceId);
  if (!invoice || invoice.deletedAt) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 595.28;
  const pageHeight = 841.89;

  const marginX = 40;
  const marginTop = 48;
  const marginBottom = 48;

  const titleSize = 18;
  const textSize = 10;
  const smallSize = 9;
  const lineHeight = 14;

  const items = Array.isArray(invoice.items) ? invoice.items : [];
  const subtotal = computeSubtotal(items);
  const discount = round2(Math.max(0, safeNumber(invoice.discount)));
  const tax = round2(Math.max(0, safeNumber(invoice.tax)));
  const total = round2(Math.max(0, subtotal - discount + tax));

  let page = doc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - marginTop;

  const drawText = (text: string, x: number, yPos: number, size: number, bold = false, color = rgb(0.1, 0.1, 0.1)) => {
    page.drawText(text, { x, y: yPos, size, font: bold ? fontBold : font, color });
  };

  const drawHr = (yPos: number) => {
    page.drawLine({ start: { x: marginX, y: yPos }, end: { x: pageWidth - marginX, y: yPos }, thickness: 1, color: rgb(0.88, 0.88, 0.9) });
  };

  const wrapText = (text: string, maxWidth: number, size: number) => {
    const words = text.split(/\s+/g);
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      const width = font.widthOfTextAtSize(next, size);
      if (width <= maxWidth) {
        cur = next;
        continue;
      }
      if (cur) lines.push(cur);
      cur = w;
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [''];
  };

  const ensureSpace = (need: number) => {
    if (y - need >= marginBottom) return;
    page = doc.addPage([pageWidth, pageHeight]);
    y = pageHeight - marginTop;
  };

  drawText('INVOICE', marginX, y, titleSize, true);
  drawText(invoice.invoiceNo || invoice.id, pageWidth - marginX - fontBold.widthOfTextAtSize(invoice.invoiceNo || invoice.id, textSize), y + 2, textSize, true);
  y -= 18;
  drawText(`Issuer: ${invoice.issuer}`, marginX, y, smallSize);
  drawText(`Currency: ${invoice.currency}`, marginX + 220, y, smallSize);
  drawText(`Issue Date: ${ymd(invoice.issueDate)}`, marginX + 360, y, smallSize);
  y -= 14;
  drawText(`Bill To: ${invoice.billTo.companyName || ''}`, marginX, y, textSize, true);
  if (invoice.billTo.address) drawText(invoice.billTo.address, marginX, y - 14, smallSize);
  if (invoice.billTo.contactNo) drawText(`Contact: ${invoice.billTo.contactNo}`, marginX + 360, y, smallSize);
  if (invoice.billTo.email) drawText(`Email: ${invoice.billTo.email}`, marginX + 360, y - 14, smallSize);
  y -= invoice.billTo.address ? 32 : 18;
  drawHr(y);
  y -= 18;

  const colDescX = marginX;
  const colQtyX = pageWidth - marginX - 160;
  const colUnitX = pageWidth - marginX - 110;
  const colAmtX = pageWidth - marginX - 40;

  drawText('Description', colDescX, y, textSize, true);
  drawText('Qty', colQtyX, y, textSize, true);
  drawText('Unit', colUnitX, y, textSize, true);
  drawText('Amount', colAmtX, y, textSize, true);
  y -= 10;
  drawHr(y);
  y -= 16;

  for (const it of items) {
    const qty = round2(Math.max(0, safeNumber(it.qty)));
    const unitPrice = round2(Math.max(0, safeNumber(it.unitPrice)));
    const amount = round2(qty * unitPrice);

    const desc = String(it.description ?? '').trim() || '-';
    const descLines = wrapText(desc, colQtyX - colDescX - 10, textSize);
    const rowHeight = Math.max(1, descLines.length) * lineHeight;
    ensureSpace(rowHeight + 8);

    for (let i = 0; i < descLines.length; i++) {
      drawText(descLines[i]!, colDescX, y - i * lineHeight, textSize);
    }
    drawText(String(qty), colQtyX, y, textSize);
    drawText(unitPrice.toFixed(2), colUnitX, y, textSize);
    drawText(amount.toFixed(2), colAmtX, y, textSize);

    y -= rowHeight;
    y -= 6;
  }

  ensureSpace(140);
  drawHr(y);
  y -= 16;

  const rightX = pageWidth - marginX - 220;
  const labelX = rightX;
  const valueX = pageWidth - marginX;
  const drawRightRow = (label: string, value: string, bold = false) => {
    drawText(label, labelX, y, textSize, bold);
    const w = (bold ? fontBold : font).widthOfTextAtSize(value, textSize);
    drawText(value, valueX - w, y, textSize, bold);
    y -= 14;
  };

  drawRightRow('Subtotal', subtotal.toFixed(2));
  if (discount > 0) drawRightRow('Discount', `-${discount.toFixed(2)}`);
  if (tax > 0) drawRightRow('Tax', tax.toFixed(2));
  drawRightRow('Total', formatMoney(invoice.currency, total), true);

  y -= 8;
  if (invoice.paymentMethod) {
    ensureSpace(40);
    drawText('Payment Method', marginX, y, textSize, true);
    y -= 14;
    drawText(String(invoice.paymentMethod), marginX, y, textSize);
    y -= 16;
  }

  if (invoice.notes) {
    ensureSpace(60);
    drawText('Notes', marginX, y, textSize, true);
    y -= 14;
    const lines = wrapText(String(invoice.notes), pageWidth - marginX * 2, textSize);
    for (const ln of lines) {
      ensureSpace(18);
      drawText(ln, marginX, y, textSize);
      y -= 14;
    }
  }

  const bytes = await doc.save();
  const filenameBase = (invoice.invoiceNo || invoice.id).replaceAll(/[^a-zA-Z0-9._-]+/g, '_');
  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filenameBase}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}

