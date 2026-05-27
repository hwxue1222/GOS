import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { findInvoiceById, updateInvoice, upsertInvoiceEmailHistory } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { newPublicToken } from '@/lib/id';
import { hasPermission } from '@/lib/permissions';

export const runtime = 'nodejs';
export const maxDuration = 60;

function normalizeEmailList(input: unknown) {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    const v = typeof raw === 'string' ? raw.trim() : '';
    if (!v) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

function fillTemplate(template: string, vars: Record<string, string>) {
  return template.replaceAll(/\{\{(\w+)\}\}/g, (_m, k) => vars[k] ?? '');
}

const DEFAULT_INVOICE_EMAIL_SUBJECT = 'Invoice 发票 {{invoiceNo}}';

const DEFAULT_INVOICE_EMAIL_HTML =
  '<div style="font-family: ui-sans-serif, system-ui; line-height: 1.7; color: #111;">' +
    '<div style="font-size:14px;">{{billToCompany}}</div>' +
    '<div style="margin-top:10px;">欢迎您使用百桥咨询 BBY.SG 的财务/税务/公司秘书等专业服务，请查收发票，并尽快安排付款。</div>' +
    '<div style="margin-top:10px;">如有问题，请联系百桥咨询客服（微信 18851644566 或者 电话 +65 89926681）。</div>' +
    '<div style="margin-top:12px;">发票号 Invoice No: <b>{{invoiceNo}}</b></div>' +
    '<div style="margin-top:10px;">预览 / 打印 Preview / Print: <a href="{{printUrl}}">{{printUrl}}</a></div>' +
    '<hr style="border:0;border-top:1px solid #e5e5e5;margin:18px 0;" />' +
    '<div style="font-size:14px;">{{billToCompany}}</div>' +
    '<div style="margin-top:10px;">Thank you for choosing BBY.SG for professional accounting, tax, and corporate secretarial services. Please find the invoice attached and kindly arrange payment at your earliest convenience.</div>' +
    '<div style="margin-top:10px;">If you have any questions, please contact our customer service (WeChat: 18851644566 or Tel: +65 89926681).</div>' +
    '<div style="margin-top:12px;">Invoice No: <b>{{invoiceNo}}</b></div>' +
    '<div style="margin-top:10px;">Preview / Print: <a href="{{printUrl}}">{{printUrl}}</a></div>' +
  '</div>';

export async function POST(req: Request, ctx: { params: Promise<{ invoiceId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!hasPermission(user, 'invoices', 'update')) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const { invoiceId } = await ctx.params;
  let invoice = await findInvoiceById(invoiceId);
  if (!invoice || invoice.deletedAt) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

  const body = (await req.json().catch(() => null)) as
    | {
        to?: unknown;
        cc?: unknown;
        subject?: unknown;
        html?: unknown;
      }
    | null;

  const to = normalizeEmailList(body?.to);
  const cc = normalizeEmailList(body?.cc);
  if (!to.length) return NextResponse.json({ ok: false, error: 'MISSING_TO' }, { status: 400 });

  const baseUrl = process.env.APP_BASE_URL?.trim() || new URL(req.url).origin;
  let publicToken = invoice.publicToken;
  if (!publicToken) {
    const token = newPublicToken();
    const updated = await updateInvoice(invoice.id, { ...invoice, publicToken: token });
    if (updated) invoice = updated;
    publicToken = invoice.publicToken ?? token;
  }
  const printUrl = `${baseUrl}/p/invoice/${publicToken}`;

  const subjectTemplate =
    typeof body?.subject === 'string' && body.subject.trim()
      ? body.subject.trim()
      : process.env.INVOICE_EMAIL_SUBJECT?.trim() || DEFAULT_INVOICE_EMAIL_SUBJECT;
  const htmlTemplate =
    typeof body?.html === 'string' && body.html.trim()
      ? body.html
      : process.env.INVOICE_EMAIL_HTML?.trim() || DEFAULT_INVOICE_EMAIL_HTML;

  const billToName = invoice.billTo.companyName || '';
  const vars = {
    invoiceNo: invoice.invoiceNo,
    billToCompany: billToName,
    printUrl,
  };

  const subject = fillTemplate(subjectTemplate, vars);
  const html = fillTemplate(htmlTemplate, vars);

  const sendRes = await sendEmail({
    to,
    cc: cc.length ? cc : undefined,
    subject,
    html,
  });

  if (!sendRes.ok) {
    return NextResponse.json({ ok: false, error: sendRes.error }, { status: 500 });
  }

  const nowIso = new Date().toISOString();
  const updated = await updateInvoice(invoice.id, {
    ...invoice,
    recipients: { to, cc },
    sentAt: nowIso,
  });

  await upsertInvoiceEmailHistory({ billTo: invoice.billTo, toEmails: to, ccEmails: cc });

  return NextResponse.json({ ok: true, invoice: updated });
}
