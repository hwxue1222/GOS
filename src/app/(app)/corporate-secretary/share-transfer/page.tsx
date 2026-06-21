import AppTopNav from '@/components/AppTopNav';
import { getCurrentUser } from '@/lib/auth';
import { listClients, listShareTransfers } from '@/lib/db';

import ShareTransferModalClient from '@/app/(app)/corporate-secretary/share-transfer/ui/ShareTransferModalClient';

export default async function ShareTransferPage({
  searchParams,
}: {
  searchParams: Promise<{ companyId?: string }>;
}) {
  const me = await getCurrentUser();
  if (!me) return null;

  const sp = await searchParams;
  const companyId = (sp.companyId ?? '').trim();
  if (!companyId) return null;

  const [clientsAll, transfersAll] = await Promise.all([listClients(), listShareTransfers()]);
  const c = clientsAll.find((x) => x.id === companyId && !x.deletedAt);
  if (!c) return null;

  const clients = [{ id: c.id, code: c.code, name: c.name }];
  const transfers = transfersAll.filter((t) => t.clientId === companyId);

  return (
    <div className="min-h-screen flex flex-col">
      <AppTopNav active="corporate-secretary" />
      <div className="flex-1 relative">
        <ShareTransferModalClient companyId={companyId} initialClients={clients} initialTransfers={transfers} />
      </div>
    </div>
  );
}

