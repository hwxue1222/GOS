import AppTopNav from '@/components/AppTopNav';
import { getCurrentUser } from '@/lib/auth';
import { listClients, listShareTransfers, readDb } from '@/lib/db';

import ShareTransferModalClient from '@/app/(app)/corporate-secretary/share-transfer/ui/ShareTransferModalClient';

function isActiveDirector(r: { role: string; resignationDate?: string }) {
  return r.role === 'DIRECTOR' && !r.resignationDate;
}

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

  if (me.role === 'client') {
    const db = await readDb();
    const emailKey = me.email.trim().toLowerCase();
    const partyById = new Map(db.parties.map((p) => [p.id, p]));
    const personById = new Map(db.persons.map((p) => [p.id, p]));
    const ok = db.clientPartyRoles.some((r) => {
      if (r.clientId !== companyId) return false;
      if (!isActiveDirector(r)) return false;
      const party = partyById.get(r.partyId);
      if (!party || party.type !== 'PERSON' || !party.personId) return false;
      const person = personById.get(party.personId);
      if (!person) return false;
      return (person.email ?? '').trim().toLowerCase() === emailKey;
    });
    if (!ok) return null;
  }

  const clients = me.role === 'staff' ? [] : [{ id: c.id, code: c.code, name: c.name }];
  const transfers = me.role === 'staff' ? [] : transfersAll.filter((t) => t.clientId === companyId);

  return (
    <div className="min-h-screen flex flex-col">
      <AppTopNav active="corporate-secretary" />
      <div className="flex-1 relative">
        <ShareTransferModalClient companyId={companyId} initialClients={clients} initialTransfers={transfers} />
      </div>
    </div>
  );
}
