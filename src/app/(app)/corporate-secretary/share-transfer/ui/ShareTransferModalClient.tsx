'use client';

import ModalShell from '@/app/(app)/corporate-secretary/ui/ModalShell';
import ShareTransfersClient from '@/app/(app)/secretary/share-transfers/ui/ShareTransfersClient';

export default function ShareTransferModalClient(props: {
  companyId: string;
  initialClients: Array<{ id: string; code: string; name: string }>;
  initialTransfers: any[];
}) {
  return (
    <ModalShell title="Share Transfer" closeHref={`/portal/companies/${encodeURIComponent(props.companyId)}`}>
      <ShareTransfersClient
        initialClients={props.initialClients}
        initialTransfers={props.initialTransfers as any}
        initialClientId={props.companyId}
        hideTitle
      />
    </ModalShell>
  );
}
