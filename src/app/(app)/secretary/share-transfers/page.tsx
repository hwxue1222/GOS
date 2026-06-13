import AppTopNav from '@/components/AppTopNav';
import ShareTransfersClient from '@/app/(app)/secretary/share-transfers/ui/ShareTransfersClient';
import { getCurrentUser } from '@/lib/auth';
import { listClients, listShareTransfers, readDb } from '@/lib/db';

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
  if (me.role === 'client') {
    const db = await readDb();
    const emailKey = me.email.trim().toLowerCase();
    const partyById = new Map(db.parties.map((p) => [p.id, p]));
    const personById = new Map(db.persons.map((p) => [p.id, p]));
    const allowed = new Set<string>();
    for (const r of db.clientPartyRoles) {
      if (r.role !== 'DIRECTOR' || r.resignationDate) continue;
      const party = partyById.get(r.partyId);
      if (!party || party.type !== 'PERSON' || !party.personId) continue;
      const person = personById.get(party.personId);
      if (!person) continue;
      if ((person.email ?? '').trim().toLowerCase() !== emailKey) continue;
      allowed.add(r.clientId);
    }
    const clients = clientsAll.filter((c) => allowed.has(c.id) && !c.deletedAt).map((c) => ({ id: c.id, code: c.code, name: c.name }));
    const transfersVisible = transfersAll.filter((t) => allowed.has(t.clientId));
    const cid = initialClientId && allowed.has(initialClientId) ? initialClientId : clients[0]?.id;
    const transfers = cid ? transfersVisible.filter((t) => t.clientId === cid) : transfersVisible;
    return (
      <div className="min-h-screen flex flex-col">
        <AppTopNav active="secretary" />
        <ShareTransfersClient initialClients={clients} initialTransfers={transfers} initialClientId={cid} />
      </div>
    );
  }

  const clients = clientsAll.filter((c) => !c.deletedAt).map((c) => ({ id: c.id, code: c.code, name: c.name }));
  const transfers = initialClientId ? transfersAll.filter((t) => t.clientId === initialClientId) : transfersAll;

  return (
    <div className="min-h-screen flex flex-col">
      <AppTopNav active="secretary" />
      <ShareTransfersClient initialClients={clients} initialTransfers={transfers} initialClientId={initialClientId} />
    </div>
  );
}
