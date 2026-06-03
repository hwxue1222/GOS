import type { Invoice, InvoiceIssuer } from '@/lib/types';

export type InvoiceIssuerConfig = {
  issuer: InvoiceIssuer;
  displayName: string;
  displayNameZh?: string;
  uen?: string;
  addressLine?: string;
  tel?: string;
  customerService?: string;
  email?: string;
  website?: string;
  paymentMethodsTitle?: string;
  paymentMethods: string[];
};

export function getInvoiceIssuerConfig(issuer: InvoiceIssuer): InvoiceIssuerConfig {
  if (issuer === 'BBY_SG') {
    return {
      issuer,
      displayName: 'BBY.SG PTE LTD',
      displayNameZh: '新加坡百桥咨询有限公司',
      uen: '201608450W',
      addressLine: '8 Burn Road#15-03 Trivex Singapore 369977',
      tel: '+65 62215600',
      email: 'Luke@bby.sg',
      website: 'www.bby.sg',
      paymentMethodsTitle: 'Payment Methods 汇款方式:',
      paymentMethods: [
        'Cheque payable to BBY.SG PTE LTD',
        'Bank transfer to BBY.SG PTE LTD, Maybank Singapore, Bank Account No.: 04011569555, Swift Code: MBBESGS2',
        '人民币汇款：收款人：薛宏伟，收款银行：招商银行南京城西支行，收款账号：6225 8812 5777 1831',
        'Scan Paynow QR code or Paynow to UEN: 201608450W',
      ],
    };
  }
  if (issuer === 'BYBRIDGE') {
    return {
      issuer,
      displayName: 'Bybridge Consultancy Pte Ltd',
      displayNameZh: '新加坡百桥咨询有限公司',
      uen: '201523304N',
      addressLine: '10 Anson Road#10-13A International Plaza Singapore 079903',
      tel: '+65 62215600',
      customerService: '+65 90888596',
      email: 'Luke@bby.sg',
      website: 'www.bybridge.com.sg',
      paymentMethodsTitle: 'Payment Methods\n汇款方式\n:',
      paymentMethods: [
        'Cheque payable to Bybridge Consultancy Pte. Ltd.',
        'Bank transfer to Bybridge Consultancy Pte Ltd, CIMB Bank, Bank Account (USD): 2000788241, Bank Account (SGD): 2000766360, Swift Code: CIBBSGSG',
        'Paynow UEN: 201523304N',
      ],
    };
  }
  return {
    issuer,
    displayName: 'Bybridge Consultancy Pte. Ltd.',
    paymentMethodsTitle: 'Payment Methods 汇款方式:',
    paymentMethods: [
      'Bank transfer: please contact us for details',
    ],
  };
}

export function computeInvoiceFxTotals(inv: Pick<Invoice, 'currency' | 'total' | 'fxUsdRate' | 'fxCnyRate'>) {
  const round2 = (n: number) => Math.round(n * 100) / 100;
  if (inv.currency !== 'SGD') return { usd: null, cny: null };
  const usd = typeof inv.fxUsdRate === 'number' && inv.fxUsdRate > 0 ? round2(inv.total * inv.fxUsdRate) : null;
  const cny = typeof inv.fxCnyRate === 'number' && inv.fxCnyRate > 0 ? round2(inv.total * inv.fxCnyRate) : null;
  return { usd, cny };
}

export function formatMoney(currency: string, amount: number) {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}
