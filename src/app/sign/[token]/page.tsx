import SignClient from '@/app/sign/[token]/ui/SignClient';
import { getSignatureContextByToken } from '@/lib/db';

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
  const expired = ctx.request.status === 'EXPIRED';

  return (
    <SignClient
      token={token}
      title={ctx.document.title}
      html={ctx.document.html}
      sha256={ctx.document.sha256}
      requestEmail={ctx.request.email}
      requestStatus={ctx.request.status}
      expiresAt={ctx.request.expiresAt}
      expired={expired}
      packetKind={ctx.packet.kind}
      requiresRepresentative={requiresRepresentative}
      initialRepresentativeName={ctx.rdr?.representativeName ?? ''}
      initialRepresentativeEmail={ctx.rdr?.representativeEmail ?? ''}
    />
  );
}
