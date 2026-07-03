import AppTopNav from '@/components/AppTopNav';
import { getCurrentUser } from '@/lib/auth';
import { readDb } from '@/lib/db';
import Link from 'next/link';
import ClientCompanyDetailsCard from '@/app/(app)/dashboard/ui/ClientCompanyDetailsCard';

export default async function DashboardPage() {
  const me = await getCurrentUser();
  if (!me) return null;

  const actionBtnBase = 'rounded-md px-4 py-2 text-sm font-medium';
  const actionBtnPrimary = `${actionBtnBase} bg-[#2f7bdc] text-white`;
  const actionBtnSecondary = `${actionBtnBase} bg-white border border-black/10 text-black/70 hover:bg-black/[0.02]`;

  const clientCompanies = await (async () => {
    if (me.role !== 'client') return [];
    const db = await readDb();
    const isActiveDirector = (r: { role: string; resignationDate?: string }) => {
      return r.role === 'DIRECTOR' && !r.resignationDate;
    };
    const allowedClientIds = (() => {
      const emailKey = me.email.trim().toLowerCase();
      const partyById = new Map(db.parties.map((p) => [p.id, p]));
      const personById = new Map(db.persons.map((p) => [p.id, p]));
      const allowed = new Set<string>();
      for (const r of db.clientPartyRoles) {
        if (!isActiveDirector(r)) continue;
        const party = partyById.get(r.partyId);
        if (!party || party.type !== 'PERSON' || !party.personId) continue;
        const person = personById.get(party.personId);
        if (!person) continue;
        if ((person.email ?? '').trim().toLowerCase() !== emailKey) continue;
        allowed.add(r.clientId);
      }
      return allowed;
    })();

    return db.clients
      .filter((c) => !c.deletedAt)
      .filter((c) => allowedClientIds.has(c.id))
      .map((c) => ({ id: c.id, code: c.code, name: c.name }))
      .sort((a, b) => `${a.code} ${a.name}`.localeCompare(`${b.code} ${b.name}`));
  })();

  return (
    <div className="min-h-screen flex flex-col">
      <AppTopNav active="dashboard" />
      <div className="flex-1">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <h1 className="text-xl font-semibold">Home</h1>

          {me.role === 'client' ? (
            <div className="mt-6">
              <ClientCompanyDetailsCard companies={clientCompanies} initialCompanyId={clientCompanies[0]?.id} />
            </div>
          ) : null}

          <div className="mt-6">
            <div className="rounded-xl bg-white border border-black/5 p-6">
              <div className="text-base font-semibold">Quick actions</div>
              <div className="mt-1 text-sm text-black/50">Go to the unified queue for submitted applications.</div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {me.role === 'client' ? (
                  <>
                    <Link href="/corporate-secretary/applications" className={actionBtnPrimary}>
                      Applications
                    </Link>
                    <Link href="/corporate-secretary/incorporation/register" className={actionBtnSecondary}>
                      New Register
                    </Link>
                    <Link href="/corporate-secretary/incorporation/transfer-secretary" className={actionBtnSecondary}>
                      New Transfer Secretary
                    </Link>
                  </>
                ) : (
                  <>
                    <Link href="/secretary/acra-filing" className={actionBtnPrimary}>
                      ACRA Filing
                    </Link>
                    <Link href="/proxy" className={actionBtnSecondary}>
                      Proxy
                    </Link>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
