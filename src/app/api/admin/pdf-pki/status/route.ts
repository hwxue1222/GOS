import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { isPdfPkiEnabled } from '@/lib/pdfPki';

function parseP12Meta(p12b64: string, passphrase: string) {
  const forge = require('node-forge') as typeof import('node-forge');
  const der = forge.util.decode64(p12b64);
  const asn1 = forge.asn1.fromDer(der);
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, passphrase);
  const bags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const certBag = (bags[forge.pki.oids.certBag] ?? [])[0];
  const cert = certBag?.cert;
  if (!cert) throw new Error('CERT_NOT_FOUND');

  const subject = cert.subject?.attributes?.map((a: any) => `${a.shortName || a.name}=${a.value}`).join(', ') ?? '';
  const issuer = cert.issuer?.attributes?.map((a: any) => `${a.shortName || a.name}=${a.value}`).join(', ') ?? '';
  const notBefore = cert.validity?.notBefore ? new Date(cert.validity.notBefore).toISOString() : '';
  const notAfter = cert.validity?.notAfter ? new Date(cert.validity.notAfter).toISOString() : '';
  const serialNumber = String(cert.serialNumber ?? '');
  return { subject, issuer, notBefore, notAfter, serialNumber };
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!hasPermission(user, 'clients', 'viewAll')) return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });

  const enabled = isPdfPkiEnabled();
  const p12b64 = (process.env.PDF_PKI_P12_BASE64 ?? '').trim();
  const passphrase = process.env.PDF_PKI_P12_PASSWORD ?? '';

  const configured = {
    enabled,
    hasP12: !!p12b64,
    hasPassword: !!passphrase,
    signatureLength: Number(process.env.PDF_PKI_SIGNATURE_LENGTH ?? '') || 8192,
    name: (process.env.PDF_PKI_NAME ?? '').trim() || 'ByBridge',
    reason: (process.env.PDF_PKI_REASON ?? '').trim() || 'Approved',
    location: (process.env.PDF_PKI_LOCATION ?? '').trim(),
    contact: (process.env.PDF_PKI_CONTACT ?? '').trim(),
    appName: (process.env.PDF_PKI_APP_NAME ?? '').trim() || 'GOS',
  };

  if (!enabled) return NextResponse.json({ ok: true, configured });
  if (!p12b64) return NextResponse.json({ ok: false, error: 'PDF_PKI_P12_BASE64_MISSING', configured }, { status: 500 });
  if (!passphrase) return NextResponse.json({ ok: false, error: 'PDF_PKI_P12_PASSWORD_MISSING', configured }, { status: 500 });

  try {
    const cert = parseP12Meta(p12b64, passphrase);
    return NextResponse.json({ ok: true, configured, cert });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: 'P12_PARSE_FAILED', message: msg, configured }, { status: 500 });
  }
}

