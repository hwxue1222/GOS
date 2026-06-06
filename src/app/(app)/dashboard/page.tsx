import AppTopNav from '@/components/AppTopNav';
import { getCurrentUser } from '@/lib/auth';
import { readDb } from '@/lib/db';
import Link from 'next/link';
import { buildSecretaryServiceApplications } from '@/lib/secretaryApplications';

export default async function DashboardPage() {
  const me = await getCurrentUser();
  if (!me) return null;

  const db = await readDb();

  const isActiveRole = (r: { role: string; resignationDate?: string; toDate?: string }) => {
    if (r.role === 'DIRECTOR' || r.role === 'SECRETARY') return !r.resignationDate;
    if (r.role === 'SHAREHOLDER' || r.role === 'RORC') return !r.toDate;
    return true;
  };

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

  const apps = buildSecretaryServiceApplications(db, allowedClientIds);
  const csRows = apps.slice(0, 10);

  return (
    <div className="min-h-screen flex flex-col">
      <AppTopNav active="dashboard" />
      <div className="flex-1">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <h1 className="text-xl font-semibold">Home</h1>

          <div className="mt-6 space-y-4">
            <div className="rounded-xl bg-white border border-black/5 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-base font-semibold">Incorporation of Company</div>
                <Link href="/incorporation/register" className="text-sm text-[#2f7bdc] hover:underline">
                  New
                </Link>
              </div>
              <div className="mt-4 rounded-lg border border-black/5 p-8 text-center text-sm text-black/40">
                No data
              </div>
            </div>

            <div className="rounded-xl bg-white border border-black/5 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-base font-semibold">Corporate Secretary</div>
                  <div className="mt-0.5 text-sm text-black/50">Applications</div>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href="/corporate-secretary/applications"
                    className="rounded-md bg-white border border-black/10 text-black/70 px-3 py-2 text-sm font-medium"
                  >
                    View all
                  </Link>
                  <Link
                    href="/corporate-secretary/applications/new/director-change"
                    className="rounded-md bg-[#2f7bdc] text-white px-3 py-2 text-sm font-medium"
                  >
                    New
                  </Link>
                </div>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-left text-black/60">
                    <tr className="border-b border-black/5">
                      <th className="px-3 py-2 font-medium">ID</th>
                      <th className="px-3 py-2 font-medium">Type</th>
                      <th className="px-3 py-2 font-medium">Company Name</th>
                      <th className="px-3 py-2 font-medium">Application Date</th>
                      <th className="px-3 py-2 font-medium">Edit Date</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium">Operate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {csRows.map((r) => {
                      const detailsHref =
                        r.type === 'DIRECTOR_CHANGE'
                          ? `/corporate-secretary/applications/director-change/${encodeURIComponent(r.source.id)}`
                          : `/corporate-secretary/applications/share-transfer/${encodeURIComponent(r.source.id)}`;
                      return (
                        <tr key={r.id} className="border-b border-black/5">
                          <td className="px-3 py-2">{r.id}</td>
                          <td className="px-3 py-2">{r.type === 'DIRECTOR_CHANGE' ? 'Change of Director' : 'Transfer of Shares'}</td>
                          <td className="px-3 py-2">{r.companyName}</td>
                          <td className="px-3 py-2">{r.applicationDate.slice(0, 10)}</td>
                          <td className="px-3 py-2">{r.editDate.slice(0, 10)}</td>
                          <td className="px-3 py-2">
                            <span className={r.status === 'REJECTED' ? 'text-red-600' : r.status === 'APPROVED' ? 'text-[#16a34a]' : 'text-[#16a34a]'}>
                              {r.status}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <Link
                                href={`${detailsHref}#documents`}
                                className="rounded-md bg-[#14b8a6] text-white px-3 py-1.5 text-xs font-medium"
                              >
                                Documents
                              </Link>
                              <Link
                                href={detailsHref}
                                className="rounded-md bg-[#14b8a6] text-white px-3 py-1.5 text-xs font-medium"
                              >
                                Details
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {csRows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-3 py-10 text-center text-black/40">
                          No data
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
