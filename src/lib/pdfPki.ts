import { Buffer } from 'node:buffer';

type SignOptions = {
  reason?: string;
  contactInfo?: string;
  name?: string;
  location?: string;
  appName?: string;
  signingTime?: Date;
};

export function isPdfPkiEnabled() {
  return (process.env.PDF_PKI_ENABLED ?? '').trim() === '1';
}

export async function digitallySignPdfIfEnabled(input: {
  pdf: Buffer;
  shouldSign: boolean;
  signingTime?: Date;
}): Promise<Buffer> {
  if (!isPdfPkiEnabled()) return input.pdf;
  if (!input.shouldSign) return input.pdf;

  const p12b64 = (process.env.PDF_PKI_P12_BASE64 ?? '').trim();
  const passphrase = process.env.PDF_PKI_P12_PASSWORD ?? '';
  if (!p12b64) throw new Error('PDF_PKI_P12_BASE64_MISSING');

  const p12Buffer = Buffer.from(p12b64, 'base64');

  const [{ pdflibAddPlaceholder }, { PDFDocument }, signpdfMod, signerP12Mod] = await Promise.all([
    import('@signpdf/placeholder-pdf-lib'),
    import('pdf-lib'),
    import('@signpdf/signpdf'),
    import('@signpdf/signer-p12'),
  ]);

  const signpdf = signpdfMod.default;
  const { P12Signer } = signerP12Mod;

  const opts: SignOptions = {
    reason: process.env.PDF_PKI_REASON ?? 'Approved',
    contactInfo: process.env.PDF_PKI_CONTACT ?? '',
    name: process.env.PDF_PKI_NAME ?? 'ByBridge',
    location: process.env.PDF_PKI_LOCATION ?? '',
    appName: process.env.PDF_PKI_APP_NAME ?? 'GOS',
    signingTime: input.signingTime,
  };

  const pdfDoc = await PDFDocument.load(input.pdf, { updateMetadata: false });
  pdflibAddPlaceholder({
    pdfDoc,
    reason: opts.reason ?? 'Approved',
    contactInfo: opts.contactInfo ?? '',
    name: opts.name ?? 'ByBridge',
    location: opts.location ?? '',
    signingTime: opts.signingTime,
    signatureLength: Number(process.env.PDF_PKI_SIGNATURE_LENGTH ?? '') || 8192,
    appName: opts.appName,
  });
  const pdfWithPlaceholder = Buffer.from(await pdfDoc.save({ useObjectStreams: false }));

  const signer = new P12Signer(p12Buffer, { passphrase });
  const signed = await signpdf.sign(pdfWithPlaceholder, signer, opts.signingTime);
  return Buffer.from(signed);
}

