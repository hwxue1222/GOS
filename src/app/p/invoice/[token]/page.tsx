import { findClientById, findInvoiceByPublicToken } from '@/lib/db';
import { computeInvoiceFxTotals, formatMoney, getInvoiceIssuerConfig } from '@/lib/invoice';
import type { InvoiceBillTo } from '@/lib/types';
import PrintButtonClient from '@/app/(app)/invoices/[invoiceId]/print/PrintButtonClient';
import ScaleToFitClient from '@/components/ScaleToFitClient';

function formatDateDmy(ymd: string) {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return ymd;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function billToLabel(billTo: InvoiceBillTo) {
  return billTo.companyName || (billTo.type === 'CLIENT' ? 'Client' : 'Company');
}

function n2(v: number) {
  return (Math.round(v * 100) / 100).toFixed(2);
}

export default async function PublicInvoicePrintPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invoice = await findInvoiceByPublicToken(token);
  if (!invoice || invoice.deletedAt) return null;

  const cfg = getInvoiceIssuerConfig(invoice.issuer);
  const fx = computeInvoiceFxTotals(invoice);

  const billTo = invoice.billTo;
  const client =
    billTo.type === 'CLIENT'
      ? await findClientById(billTo.clientId).catch(() => null)
      : null;
  const billToAddress = billTo.address ?? client?.address ?? '';
  const billToContact = billTo.contactNo ?? client?.phone ?? '';
  const billToEmail = billTo.email ?? client?.email ?? '';

  if (invoice.issuer === 'BYBRIDGE') {
    const baseBeforeGst = Math.max(0, invoice.total - (invoice.tax || 0));
    const gstAmount = Math.max(0, invoice.tax || 0);
    const gstRate = baseBeforeGst > 0 && gstAmount > 0 ? Math.round((gstAmount / baseBeforeGst) * 1000) / 10 : null;

    return (
      <div className="min-h-screen bg-white no-autolink">
        <div className="max-w-[860px] mx-auto px-4 py-4 print:hidden flex items-center justify-between">
          <div className="text-sm text-black/60">{invoice.invoiceNo}</div>
          <PrintButtonClient />
        </div>

        <div className="px-3 sm:px-4 py-3 sm:py-4 print:p-0">
          <ScaleToFitClient baseWidth={860}>
            <div
              id="invoice-print-root"
              className="bg-white px-8 py-8 min-h-[297mm] flex flex-col"
              style={{ fontFamily: `'Noto Sans SC', system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial` }}
            >
              <link rel="preconnect" href="https://fonts.googleapis.com" />
              <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
              <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;600&display=swap" rel="stylesheet" />

              <div className="flex items-start justify-between gap-6">
                <div className="flex items-center gap-3">
                  <img src="/templates/bybridge-tax-invoice/image1.jpg" alt="Bybridge" className="h-12 w-auto" />
                  <div className="leading-tight">
                    {cfg.displayNameZh ? <div className="text-lg font-semibold">{cfg.displayNameZh}</div> : null}
                    {cfg.uen ? <div className="text-xs text-black/70">{`UEN: ${cfg.uen}`}</div> : null}
                    <div className="text-sm font-semibold">{cfg.displayName}</div>
                  </div>
                </div>
              </div>

              <div className="mt-3 border-t border-black/70" />

              <div className="mt-4 text-center text-xl font-semibold tracking-wide leading-tight">
                <div>TAX</div>
                <div>INVOICE</div>
              </div>

              <table className="mt-4 w-full text-sm border border-black/30 border-collapse">
                <tbody>
                  <tr>
                    <td className="w-[120px] px-3 py-2 border border-black/20 font-medium">Bill To</td>
                    <td className="w-[16px] px-2 py-2 border border-black/20">：</td>
                    <td className="px-3 py-2 border border-black/20">{billToLabel(billTo)}</td>
                    <td className="w-[120px] px-3 py-2 border border-black/20 font-medium">Invoice No.</td>
                    <td className="w-[16px] px-2 py-2 border border-black/20">：</td>
                    <td className="px-3 py-2 border border-black/20">{invoice.invoiceNo}</td>
                  </tr>
                  <tr>
                    <td className="w-[120px] px-3 py-2 border border-black/20 font-medium align-top">Address</td>
                    <td className="w-[16px] px-2 py-2 border border-black/20 align-top">：</td>
                    <td className="px-3 py-2 border border-black/20 whitespace-pre-wrap align-top">{billToAddress}</td>
                    <td className="w-[120px] px-3 py-2 border border-black/20 font-medium">Invoice Date</td>
                    <td className="w-[16px] px-2 py-2 border border-black/20">：</td>
                    <td className="px-3 py-2 border border-black/20">{formatDateDmy(invoice.issueDate)}</td>
                  </tr>
                  <tr>
                    <td className="w-[120px] px-3 py-2 border border-black/20 font-medium">D/O No.</td>
                    <td className="w-[16px] px-2 py-2 border border-black/20">：</td>
                    <td className="px-3 py-2 border border-black/20">{invoice.doNo ?? ''}</td>
                    <td className="w-[120px] px-3 py-2 border border-black/20 font-medium">Contact No.</td>
                    <td className="w-[16px] px-2 py-2 border border-black/20">：</td>
                    <td className="px-3 py-2 border border-black/20">{billToContact}</td>
                  </tr>
                  <tr>
                    <td className="w-[120px] px-3 py-2 border border-black/20 font-medium">Payment Method</td>
                    <td className="w-[16px] px-2 py-2 border border-black/20">：</td>
                    <td className="px-3 py-2 border border-black/20">{invoice.paymentMethod ?? 'As below'}</td>
                    <td className="w-[120px] px-3 py-2 border border-black/20 font-medium">Email</td>
                    <td className="w-[16px] px-2 py-2 border border-black/20">：</td>
                    <td className="px-3 py-2 border border-black/20">{billToEmail}</td>
                  </tr>
                  <tr>
                    <td className="w-[120px] px-3 py-2 border border-black/20 font-medium">Credit Term</td>
                    <td className="w-[16px] px-2 py-2 border border-black/20">：</td>
                    <td className="px-3 py-2 border border-black/20">{invoice.creditTerm ?? 'Net 15'}</td>
                    <td className="px-3 py-2 border border-black/20" colSpan={3} />
                  </tr>
                </tbody>
              </table>

              <div className="mt-4 border border-black/30">
                <div className="grid grid-cols-[60px_1fr_90px_140px] text-sm bg-black/[0.02] border-b border-black/20">
                  <div className="px-3 py-2 font-medium border-r border-black/20">Svc</div>
                  <div className="px-3 py-2 font-medium border-r border-black/20">Description</div>
                  <div className="px-3 py-2 font-medium border-r border-black/20 text-right">Qty</div>
                  <div className="px-3 py-2 font-medium text-right">{invoice.currency}</div>
                </div>
                {invoice.items.map((it, idx) => {
                  const amount = Math.round(it.qty * it.unitPrice * 100) / 100;
                  return (
                    <div key={it.id} className="grid grid-cols-[60px_1fr_90px_140px] text-sm border-b border-black/10">
                      <div className="px-3 py-2 border-r border-black/10">{idx + 1}</div>
                      <div className="px-3 py-2 border-r border-black/10 whitespace-pre-wrap">{it.description}</div>
                      <div className="px-3 py-2 border-r border-black/10 text-right">{it.qty}</div>
                      <div className="px-3 py-2 text-right">{amount.toFixed(2)}</div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 flex justify-end">
                <div className="w-[360px] text-sm">
                  {invoice.discount ? (
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-semibold">Discount</div>
                      <div className="text-right">{`(${Math.abs(invoice.discount).toFixed(2)})`}</div>
                    </div>
                  ) : null}
                  <div className="mt-2 flex items-center justify-between gap-3 font-semibold">
                    <div>Total Amount before GST</div>
                    <div className="text-right">{n2(baseBeforeGst)}</div>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-3 font-semibold">
                    <div>{gstAmount > 0 && gstRate !== null ? `GST Amount at ${gstRate}%` : 'GST Amount'}</div>
                    <div className="text-right">{n2(gstAmount)}</div>
                  </div>
                  <div className="mt-2 border-t border-black/30" />
                  <div className="mt-2 flex items-center justify-between gap-3 font-semibold">
                    <div>{`Total Amount in ${invoice.currency}`}</div>
                    <div className="text-right">{invoice.total.toFixed(2)}</div>
                  </div>
                  {fx.usd !== null ? (
                    <div className="mt-1 flex items-center justify-between gap-3 italic text-black/70">
                      <div>Total Amount in USD</div>
                      <div className="text-right">{formatMoney('USD', fx.usd)}</div>
                    </div>
                  ) : null}
                  {fx.cny !== null ? (
                    <div className="mt-1 flex items-center justify-between gap-3 italic text-black/70">
                      <div>Total Amount in CNY</div>
                      <div className="text-right">{formatMoney('CNY', fx.cny)}</div>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="mt-auto pt-6 break-inside-avoid">
                <div className="border border-black/30">
                  <div className="px-3 py-2 text-sm font-semibold bg-black/[0.02] border-b border-black/20 whitespace-pre-line">
                    {cfg.paymentMethodsTitle ?? 'Payment Methods:'}
                  </div>
                  <div className="text-sm">
                    {cfg.paymentMethods.map((line, idx) => (
                      <div key={idx} className="grid grid-cols-[30px_1fr] border-b border-black/10" style={{ borderStyle: 'dotted' }}>
                        <div className="px-3 py-2 border-r border-black/10" style={{ borderStyle: 'dotted' }}>
                          {idx + 1}
                        </div>
                        <div className="px-3 py-2 whitespace-pre-wrap" style={{ borderStyle: 'dotted' }}>
                          {line}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-5 text-xs italic text-black/70 text-center">
                  "Thank you for your business. We do expect your payment on time, so please process the invoice within grant period. There will be 1.5% interest charge per month for late payment."
                </div>

                <div className="mt-3 text-xs text-center text-black/70 italic">This is computer generated and no signature is required.</div>

                <div className="mt-6 text-[11px] text-center text-black/70">
                  {cfg.addressLine ? (
                    <div>
                      {`Address: ${cfg.addressLine}`}
                      {cfg.tel ? `  Tel: ${cfg.tel}` : ''}
                      {cfg.customerService ? `  Customer Service: ${cfg.customerService}` : ''}
                    </div>
                  ) : null}
                  <div>
                    {cfg.email ? `Email: ${cfg.email}` : ''}
                    {cfg.website ? `  Website: ${cfg.website}` : ''}
                  </div>
                </div>
              </div>
            </div>
          </ScaleToFitClient>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white no-autolink">
      <div className="max-w-[860px] mx-auto px-4 py-4 print:hidden flex items-center justify-between">
        <div className="text-sm text-black/60">{invoice.invoiceNo}</div>
        <PrintButtonClient />
      </div>

      <div className="px-3 sm:px-4 py-3 sm:py-4 print:p-0">
        <ScaleToFitClient baseWidth={860}>
          <div className="bg-white px-8 py-8 min-h-[297mm] flex flex-col">
            <div className="flex items-start justify-between gap-6">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-md bg-red-600 text-white flex items-center justify-center font-semibold text-2xl">
                  B
                </div>
                <div className="leading-tight">
                  {cfg.displayNameZh ? <div className="text-lg font-semibold">{cfg.displayNameZh}</div> : null}
                  <div className="text-sm font-semibold">{cfg.displayName}</div>
                </div>
              </div>
              <div className="text-xs text-black/60 text-right">
                {cfg.uen ? <div>{`UEN: ${cfg.uen}`}</div> : null}
              </div>
            </div>

            <div className="mt-3 border-t border-black/70" />

            <div className="mt-4 text-center text-xl font-semibold tracking-wide">INVOICE</div>

            <table className="mt-4 w-full text-sm border border-black/30 border-collapse">
              <tbody>
                <tr>
                  <td className="w-[120px] px-3 py-2 border border-black/20 font-medium">Bill To</td>
                  <td className="px-3 py-2 border border-black/20">{billToLabel(billTo)}</td>
                  <td className="w-[120px] px-3 py-2 border border-black/20 font-medium">Invoice No.</td>
                  <td className="px-3 py-2 border border-black/20">{invoice.invoiceNo}</td>
                </tr>
                <tr>
                  <td rowSpan={2} className="w-[120px] px-3 py-2 border border-black/20 font-medium align-top">
                    Address
                  </td>
                  <td rowSpan={2} className="px-3 py-2 border border-black/20 whitespace-pre-wrap align-top">
                    {billToAddress}
                  </td>
                  <td className="w-[120px] px-3 py-2 border border-black/20 font-medium">Invoice Date</td>
                  <td className="px-3 py-2 border border-black/20">{formatDateDmy(invoice.issueDate)}</td>
                </tr>
                <tr>
                  <td className="w-[120px] px-3 py-2 border border-black/20 font-medium">D/O No.</td>
                  <td className="px-3 py-2 border border-black/20">{invoice.doNo ?? '-'}</td>
                </tr>
                <tr>
                  <td className="w-[120px] px-3 py-2 border border-black/20 font-medium">Contact No.</td>
                  <td className="px-3 py-2 border border-black/20">{billToContact}</td>
                  <td className="w-[120px] px-3 py-2 border border-black/20 font-medium">Payment Method</td>
                  <td className="px-3 py-2 border border-black/20">{invoice.paymentMethod ?? 'As below'}</td>
                </tr>
                <tr>
                  <td className="w-[120px] px-3 py-2 border border-black/20 font-medium">Email</td>
                  <td className="px-3 py-2 border border-black/20">{billToEmail}</td>
                  <td className="w-[120px] px-3 py-2 border border-black/20 font-medium">Credit Term</td>
                  <td className="px-3 py-2 border border-black/20">{invoice.creditTerm ?? 'Net 15'}</td>
                </tr>
              </tbody>
            </table>

            <div className="mt-4 border border-black/30">
              <div className="grid grid-cols-[60px_1fr_90px_110px] text-sm bg-black/[0.02] border-b border-black/20">
                <div className="px-3 py-2 font-medium border-r border-black/20">Svc</div>
                <div className="px-3 py-2 font-medium border-r border-black/20">Description</div>
                <div className="px-3 py-2 font-medium border-r border-black/20 text-right">Qty</div>
                <div className="px-3 py-2 font-medium text-right">{invoice.currency}</div>
              </div>
              {invoice.items.map((it, idx) => {
                const amount = Math.round(it.qty * it.unitPrice * 100) / 100;
                return (
                  <div key={it.id} className="grid grid-cols-[60px_1fr_90px_110px] text-sm border-b border-black/10">
                    <div className="px-3 py-2 border-r border-black/10">{idx + 1}</div>
                    <div className="px-3 py-2 border-r border-black/10 whitespace-pre-wrap">{it.description}</div>
                    <div className="px-3 py-2 border-r border-black/10 text-right">{it.qty}</div>
                    <div className="px-3 py-2 text-right">{amount.toFixed(2)}</div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex justify-end">
              <div className="w-[320px] text-sm">
                {invoice.discount ? (
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-semibold">{`Discount in ${invoice.currency}`}</div>
                    <div className="text-right">{`(${Math.abs(invoice.discount).toFixed(2)})`}</div>
                  </div>
                ) : null}
                <div className="mt-2 border-t border-black/30" />
                <div className="mt-2 flex items-center justify-between gap-3 font-semibold">
                  <div>{`Total Amount in ${invoice.currency}`}</div>
                  <div className="text-right">{invoice.total.toFixed(2)}</div>
                </div>
                {fx.usd !== null ? (
                  <div className="mt-1 flex items-center justify-between gap-3 italic text-black/70">
                    <div>Total Amount in USD</div>
                    <div className="text-right">{formatMoney('USD', fx.usd)}</div>
                  </div>
                ) : null}
                {fx.cny !== null ? (
                  <div className="mt-1 flex items-center justify-between gap-3 italic text-black/70">
                    <div>Total Amount in CNY</div>
                    <div className="text-right">{formatMoney('CNY', fx.cny)}</div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-auto pt-6 break-inside-avoid">
              <div className="border border-black/30">
                <div className="px-3 py-2 text-sm font-semibold bg-black/[0.02] border-b border-black/20">
                  {cfg.paymentMethodsTitle ?? 'Payment Methods:'}
                </div>
                <div className="text-sm">
                  {cfg.paymentMethods.map((line, idx) => (
                    <div key={idx} className="grid grid-cols-[30px_1fr] border-b border-black/10">
                      <div className="px-3 py-2 border-r border-black/10">{idx + 1}</div>
                      <div className="px-3 py-2 whitespace-pre-wrap">{line}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-5 text-xs italic text-black/70">
                Thank you for your business. We do expect your payment on time, so please process the invoice within grant period.
                There will be 1.5% interest charge per month for late payment.
              </div>

              <div className="mt-3 text-xs text-center text-black/70">This is computer generated and no signature is required.</div>

            <div className="mt-10 text-[11px] text-center text-black/70">
              {cfg.addressLine ? <div>{`Address: ${cfg.addressLine}`}</div> : null}
              <div className="flex items-center justify-center gap-3">
                {cfg.tel ? <span>{`Tel: ${cfg.tel}`}</span> : null}
                {cfg.customerService ? <span>{`Customer Service: ${cfg.customerService}`}</span> : null}
                {cfg.email ? <span>{`Email: ${cfg.email}`}</span> : null}
                {cfg.website ? <span>{`Website: ${cfg.website}`}</span> : null}
              </div>
            </div>
            </div>
          </div>
        </ScaleToFitClient>
      </div>
    </div>
  );
}
