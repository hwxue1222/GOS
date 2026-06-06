import AppTopNav from '@/components/AppTopNav';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { readDb } from '@/lib/db';
import DirectorChangeRequestForm from '@/app/(app)/secretary/companies/[clientId]/ui/DirectorChangeRequestForm';

function isActiveRole(r: { role: string; resignationDate?: string; toDate?: string }) {
  if (r.role === 'DIRECTOR' || r.role === 'SECRETARY') return !r.resignationDate;
  if (r.role === 'SHAREHOLDER' || r.role === 'RORC') return !r.toDate;
  return true;
}

export default async function NewDirectorChangePage({
  searchParams,
}: {
  searchParams: Promise<{ companyId?: string }>;
}) {
  const me = await getCurrentUser();
  if (!me) return null;

  const db = await readDb();
  const sp = await searchParams;
  const wantedCompanyId = (sp.companyId ?? '').trim();

  const allowedClientIds = (() => {
    if (me.role !== 'client') return null;
    const emailKey = me.email.trim().toLowerCase();
    const partyById = new Map(db.parties.map((p) => [p.id, p]));
    const personById = new Map(db.persons.map((p) => [p.id, p]));
    const allowed = new Set<string>();
    for (const r of db.clientPartyRoles) {
      if (!isActiveRole(r)) continue;
      const party = partyById.get(r.partyId);
      if (!party || party.type !== 'PERSON' || !party.personId) continue;
      const person = personById.get(party.personId);
      if (!person) continue;
      if ((person.email ?? '').trim().toLowerCase() !== emailKey) continue;
      allowed.add(r.clientId);
    }
    return allowed;
  })();

  const companies = db.clients
    .filter((c) => !c.deletedAt)
    .filter((c) => (allowedClientIds ? allowedClientIds.has(c.id) : true))
    .map((c) => ({ id: c.id, name: c.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const companyId = companies.some((c) => c.id === wantedCompanyId) ? wantedCompanyId : companies[0]?.id ?? '';
  if (!companyId) {
    return (
      <div className="min-h-screen flex flex-col">
        <AppTopNav active="corporate-secretary" />
        <div className="flex-1">
          <div className="max-w-6xl mx-auto px-4 py-6">
            <div className="rounded-xl bg-white border border-black/5 p-6 text-sm text-black/60">No companies</div>
          </div>
        </div>
      </div>
    );
  }

  const partyById = new Map(db.parties.map((p) => [p.id, p]));
  const personById = new Map(db.persons.map((p) => [p.id, p]));
  const directors = db.clientPartyRoles
    .filter((r) => r.clientId === companyId)
    .filter((r) => r.role === 'DIRECTOR')
    .filter((r) => isActiveRole(r))
    .map((r) => {
      const party = partyById.get(r.partyId);
      if (!party || party.type !== 'PERSON' || !party.personId) return null;
      const person = personById.get(party.personId);
      if (!person) return null;
      return { roleId: r.id, fullName: person.fullName, email: person.email };
    })
    .filter(Boolean) as Array<{ roleId: string; fullName: string; email?: string }>;

  return (
    <div className="min-h-screen flex flex-col">
      <AppTopNav active="corporate-secretary" />
      <div className="flex-1">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold">New Change of Director</h1>
              <div className="mt-1 text-sm text-black/60">Select a company, then submit the request.</div>
            </div>
            <Link href="/corporate-secretary/applications" className="text-sm text-[#2f7bdc] hover:underline">
              Back
            </Link>
          </div>

          <div className="mt-4 rounded-xl bg-white border border-black/5 p-4">
            <form method="GET" className="flex items-center gap-2">
              <label className="text-sm text-black/70">Company</label>
              <select
                name="companyId"
                defaultValue={companyId}
                className="max-w-[420px] truncate rounded-md border border-black/10 bg-white px-3 py-2 text-sm"
              >
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button type="submit" className="rounded-md bg-white border border-black/10 text-black/70 px-3 py-2 text-sm font-medium">
                Load
              </button>
            </form>
          </div>

          <div className="mt-4">
            <DirectorChangeRequestForm
              clientId={companyId}
              directors={directors}
              onSubmitted={() => undefined}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

