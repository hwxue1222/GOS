import AppTopNav from '@/components/AppTopNav';
import ShareTransfersClient from '@/app/(app)/secretary/share-transfers/ui/ShareTransfersClient';
import { getCurrentUser } from '@/lib/auth';
import { listClients, listShareTransfers } from '@/lib/db';

export default async function ShareTransfersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const me = await getCurrentUser();
  if (!me) return null;
  if (me.role === 'staff') {
    return (
      <div className="min-h-screen flex flex-col">
        <AppTopNav active="secretary" />
        <div className="flex-1">
          <div className="max-w-6xl mx-auto px-4 py-6">
            <div className="rounded-xl bg-white border border-black/5 p-6 text-sm text-red-600">FORBIDDEN</div>
          </div>
        </div>
      </div>
    );
  }

  const sp = await searchParams;
  const initialClientId = Array.isArray(sp.clientId) ? sp.clientId[0] : sp.clientId;

  const [clientsAll, transfersAll] = await Promise.all([listClients(), listShareTransfers()]);
  const clients = clientsAll.filter((c) => !c.deletedAt).map((c) => ({ id: c.id, code: c.code, name: c.name }));
  const transfers = initialClientId ? transfersAll.filter((t) => t.clientId === initialClientId) : transfersAll;

  return (
    <div className="min-h-screen flex flex-col">
      <AppTopNav active="secretary" />
      <ShareTransfersClient initialClients={clients} initialTransfers={transfers} initialClientId={initialClientId} />
    </div>
  );
}
