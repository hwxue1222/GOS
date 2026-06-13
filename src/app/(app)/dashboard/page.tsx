import AppTopNav from '@/components/AppTopNav';
import { getCurrentUser } from '@/lib/auth';
import { readDb } from '@/lib/db';
import Link from 'next/link';
import { buildSecretaryServiceApplications } from '@/lib/secretaryApplications';
import { buildIncorporationApplications } from '@/lib/incorporationApplications';
import DeleteActionClient from '@/components/DeleteActionClient';
import ClientCompanyDetailsCard from '@/app/(app)/dashboard/ui/ClientCompanyDetailsCard';

export default async function DashboardPage() {
  const me = await getCurrentUser();
  if (!me) return null;

  const db = await readDb();

  const isActiveDirector = (r: { role: string; resignationDate?: string }) => {
    return r.role === 'DIRECTOR' && !r.resignationDate;
  };

  const allowedClientIds = (() => {
    if (me.role !== 'client') return null;
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

  const clientCompanies =
    me.role === 'client'
      ? db.clients
          .filter((c) => !c.deletedAt)
          .filter((c) => (allowedClientIds ? allowedClientIds.has(c.id) : true))
          .map((c) => ({ id: c.id, code: c.code, name: c.name }))
          .sort((a, b) => `${a.code} ${a.name}`.localeCompare(`${b.code} ${b.name}`))
      : [];

  const apps = buildSecretaryServiceApplications(db, allowedClientIds);
  const csRows = apps.slice(0, 10);

  const incApps = buildIncorporationApplications(db, allowedClientIds, me.role === 'client' ? me.id : null);
  const incRows = incApps.slice(0, 10);

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

          <div className="mt-6 space-y-4">
            <div className="rounded-xl bg-white border border-black/5 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-base font-semibold">Incorporation of Company</div>
                  <div className="mt-0.5 text-sm text-black/50">Applications</div>
                </div>
                {me.role === 'client' ? <div /> : (
                  <div className="flex items-center gap-2">
                    <Link
                      href="/corporate-secretary/applications"
                      className="rounded-md bg-white border border-black/10 text-black/70 px-3 py-2 text-sm font-medium"
                    >
                      View all
                    </Link>
                    <Link
                      href="/incorporation/register"
                      className="rounded-md bg-[#2f7bdc] text-white px-3 py-2 text-sm font-medium"
                    >
                      Register
                    </Link>
                    <Link
                      href="/incorporation/transfer-secretary"
                      className="rounded-md bg-white border border-black/10 text-black/70 px-3 py-2 text-sm font-medium"
                    >
                      Transfer
                    </Link>
                  </div>
                )}
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-left text-black/60">
                    <tr className="border-b border-black/5">
                      <th className="px-3 py-2 font-medium">Type</th>
                      <th className="px-3 py-2 font-medium">Company Name</th>
                      <th className="px-3 py-2 font-medium">Application Date</th>
                      <th className="px-3 py-2 font-medium">Edit Date</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium">Operate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {incRows.map((r) => {
                      const detailsHref = `/incorporation/applications/${encodeURIComponent(r.sourceId)}`;
                      const typeLabel = r.type === 'REGISTER_COMPANY' ? 'Register Company' : 'Transfer of Company Secretary';
                      return (
                        <tr key={r.id} className="border-b border-black/5">
                          <td className="px-3 py-2">{typeLabel}</td>
                          <td className="px-3 py-2">{r.companyName}</td>
                          <td className="px-3 py-2">{r.applicationDate.slice(0, 10)}</td>
                          <td className="px-3 py-2">{r.editDate.slice(0, 10)}</td>
                          <td className="px-3 py-2">
                            <span className={r.status === 'REJECTED' ? 'text-red-600' : r.status === 'NEED_MORE_INFO' ? 'text-[#d97706]' : 'text-[#16a34a]'}>
                              {r.status}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <Link href={`${detailsHref}#documents`} className="rounded-md bg-[#14b8a6] text-white px-3 py-1.5 text-xs font-medium">
                                Documents
                              </Link>
                              <Link href={detailsHref} className="rounded-md bg-[#14b8a6] text-white px-3 py-1.5 text-xs font-medium">
                                Details
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {incRows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-10 text-center text-black/40">
                          No data
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-xl bg-white border border-black/5 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-base font-semibold">Corporate Secretary</div>
                  <div className="mt-0.5 text-sm text-black/50">Applications</div>
                </div>
                {me.role === 'client' ? <div /> : (
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
                )}
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-left text-black/60">
                    <tr className="border-b border-black/5">
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
                      const map = (() => {
                        if (r.type === 'DIRECTOR_CHANGE') {
                          const detailsHref = `/corporate-secretary/applications/director-change/${encodeURIComponent(r.source.id)}`;
                          return { typeLabel: 'Change of Director', detailsHref };
                        }
                        if (r.type === 'SHARE_TRANSFER') {
                          const detailsHref = `/corporate-secretary/applications/share-transfer/${encodeURIComponent(r.source.id)}`;
                          return { typeLabel: 'Transfer of Shares', detailsHref };
                        }
                        if (r.type === 'CHANGE_COMPANY_NAME') {
                          const detailsHref = `/corporate-secretary/applications/company-update/${encodeURIComponent(r.source.id)}`;
                          return { typeLabel: 'Change of Company Name', detailsHref };
                        }
                        if (r.type === 'CHANGE_FINANCIAL_YEAR_END') {
                          const detailsHref = `/corporate-secretary/applications/company-update/${encodeURIComponent(r.source.id)}`;
                          return { typeLabel: 'Change of Financial Year End (FYE)', detailsHref };
                        }
                        if (r.type === 'CHANGE_REGISTERED_OFFICE_ADDRESS') {
                          const detailsHref = `/corporate-secretary/applications/company-update/${encodeURIComponent(r.source.id)}`;
                          return { typeLabel: 'Change of Registered Office Address', detailsHref };
                        }
                        if (r.type === 'CHANGE_BUSINESS_ACTIVITIES') {
                          const detailsHref = `/corporate-secretary/applications/company-update/${encodeURIComponent(r.source.id)}`;
                          return { typeLabel: 'Change of Business Activities', detailsHref };
                        }
                        if (r.type === 'CHANGE_SECRETARY') {
                          const detailsHref = `/corporate-secretary/applications/company-update/${encodeURIComponent(r.source.id)}`;
                          return { typeLabel: 'Change of Secretary', detailsHref };
                        }
                        if (r.type === 'RORC_DECLARATION') {
                          const detailsHref = `/corporate-secretary/applications/rorc/${encodeURIComponent(r.source.id)}`;
                          return { typeLabel: 'Declaration of Company Controller (RORC)', detailsHref };
                        }
                        if (r.type === 'ANNUAL_GENERAL_MEETING') {
                          const detailsHref = `/corporate-secretary/applications/agm/${encodeURIComponent(r.source.id)}`;
                          return { typeLabel: 'Annual General Meeting', detailsHref };
                        }
                        const detailsHref = `/corporate-secretary/applications`;
                        return { typeLabel: r.type, detailsHref };
                      })();
                      const detailsHref = map.detailsHref;
                      const deleteUrl = (() => {
                        if (me.role !== 'client') return '';
                        if (r.status !== 'SIGNING') return '';
                        if (r.type === 'DIRECTOR_CHANGE') {
                          return `/api/secretary/companies/${encodeURIComponent(r.companyId)}/director-change-requests/${encodeURIComponent(r.source.id)}`;
                        }
                        if (r.type === 'RORC_DECLARATION') {
                          return `/api/secretary/companies/${encodeURIComponent(r.companyId)}/rorc-declaration-requests/${encodeURIComponent(r.source.id)}`;
                        }
                        if (r.type === 'ANNUAL_GENERAL_MEETING') {
                          return `/api/secretary/companies/${encodeURIComponent(r.companyId)}/annual-general-meeting-requests/${encodeURIComponent(r.source.id)}`;
                        }
                        if (r.type === 'SHARE_TRANSFER') {
                          return `/api/secretary/share-transfers/${encodeURIComponent(r.source.id)}`;
                        }
                        if (
                          r.type === 'CHANGE_COMPANY_NAME' ||
                          r.type === 'CHANGE_FINANCIAL_YEAR_END' ||
                          r.type === 'CHANGE_REGISTERED_OFFICE_ADDRESS' ||
                          r.type === 'CHANGE_BUSINESS_ACTIVITIES' ||
                          r.type === 'CHANGE_SECRETARY' ||
                          r.type === 'TRANSFER_COMPANY_SECRETARY'
                        ) {
                          return `/api/secretary/companies/${encodeURIComponent(r.companyId)}/company-update-requests/${encodeURIComponent(r.source.id)}`;
                        }
                        return '';
                      })();
                      return (
                        <tr key={r.id} className="border-b border-black/5">
                          <td className="px-3 py-2">{map.typeLabel}</td>
                          <td className="px-3 py-2">{r.companyName}</td>
                          <td className="px-3 py-2">{r.applicationDate.slice(0, 10)}</td>
                          <td className="px-3 py-2">{r.editDate.slice(0, 10)}</td>
                          <td className="px-3 py-2">
                            <span className={r.status === 'REJECTED' ? 'text-red-600' : r.status === 'NEED_MORE_INFO' ? 'text-[#d97706]' : 'text-[#16a34a]'}>
                              {r.status}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <Link
                                href={detailsHref}
                                className="rounded-md bg-[#14b8a6] text-white px-3 py-1.5 text-xs font-medium"
                              >
                                Details
                              </Link>
                              {deleteUrl ? (
                                <DeleteActionClient
                                  deleteUrl={deleteUrl}
                                  confirmText="Delete this application?"
                                  label="Delete"
                                  className="rounded-md bg-white border border-red-200 text-red-700 px-3 py-1.5 text-xs font-medium hover:bg-red-50 disabled:opacity-60"
                                />
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {csRows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-10 text-center text-black/40">
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
