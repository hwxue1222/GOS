import SignClient from '@/app/sign/[token]/ui/SignClient';
import { getSignatureContextByToken, readDb } from '@/lib/db';
import { normalizeDocumentHtml } from '@/lib/htmlNormalize';

export default async function SignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await getSignatureContextByToken(token);
  if (!ctx) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-lg rounded-xl bg-white border border-black/5 p-6 text-sm text-red-600">
          INVALID_LINK
        </div>
      </div>
    );
  }

  const requiresRepresentative =
    ctx.packet.relatedType === 'RDR' && (!ctx.rdr?.representativeEmail || !ctx.rdr?.representativeName);
  const requiresSignerProfile =
    (ctx.packet.relatedType === 'RORC_DECLARATION' &&
      !ctx.person &&
      (!ctx.request.signerFullName || !ctx.request.signerIdNo || !ctx.request.signerPhone)) ||
    (ctx.packet.relatedType === 'CONTRACT' && (!ctx.request.signerFullName || !ctx.request.signerTitle));
  const expired = ctx.request.status === 'EXPIRED';
  const pdfUrl = ctx.packet.kind === 'CONTRACT' ? `/api/sign/${encodeURIComponent(token)}/pdf?disposition=inline` : undefined;
  const html = normalizeDocumentHtml(ctx.document.html);

  const signedItemsResolved =
    ctx.request.status === 'SIGNED'
      ? (await (async () => {
          const db = await readDb();
          return db.signatureRequests
            .filter((r) => r.packetId === ctx.packet.id && r.status === 'SIGNED' && !!r.signedAt)
            .map((r) => ({
              email: String(r.email ?? '').trim(),
              name: String(r.signerFullName ?? r.rdrRepresentativeName ?? '').trim(),
              title: String(r.signerTitle ?? '').trim(),
              signedAt: String(r.signedAt ?? ''),
            }))
            .filter((x) => !!x.email && !!x.signedAt);
        })())
      : [];

  return (
    <SignClient
      token={token}
      title={ctx.document.title}
      html={html}
      pdfUrl={pdfUrl}
      sha256={ctx.document.sha256}
      requestEmail={ctx.request.email}
      requestStatus={ctx.request.status}
      expiresAt={ctx.request.expiresAt}
      signedAt={ctx.request.signedAt ?? ''}
      signedItems={signedItemsResolved}
      expired={expired}
      packetKind={ctx.packet.kind}
      requiresRepresentative={requiresRepresentative}
      requiresSignerProfile={requiresSignerProfile}
      initialRepresentativeName={ctx.rdr?.representativeName ?? ''}
      initialRepresentativeEmail={ctx.rdr?.representativeEmail ?? ''}
      initialSignerFullName={ctx.request.signerFullName ?? ''}
      initialSignerTitle={ctx.request.signerTitle ?? ''}
      initialSignerIdType={(ctx.request.signerIdType as string) ?? ''}
      initialSignerIdNo={ctx.request.signerIdNo ?? ''}
      initialSignerPhone={ctx.request.signerPhone ?? ''}
    />
  );
}
