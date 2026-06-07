import Link from 'next/link';
import AppTopNav from '@/components/AppTopNav';
import { getCurrentUser } from '@/lib/auth';
import { readDb } from '@/lib/db';
import { buildSecretaryServiceApplications } from '@/lib/secretaryApplications';
import { buildIncorporationApplications } from '@/lib/incorporationApplications';

function isActiveRole(r: { role: string; resignationDate?: string; toDate?: string }) {
  if (r.role === 'DIRECTOR' || r.role === 'SECRETARY') return !r.resignationDate;
  if (r.role === 'SHAREHOLDER' || r.role === 'RORC') return !r.toDate;
  return true;
}

export default async function CorporateSecretaryApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; companyId?: string }>;
}) {
  const me = await getCurrentUser();
  if (!me) return null;
  const sp = await searchParams;
  const filterType = (sp.type ?? '').trim();
  const filterCompanyId = (sp.companyId ?? '').trim();

  const db = await readDb();

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

  const rows = buildSecretaryServiceApplications(db, allowedClientIds);
  const incRows = buildIncorporationApplications(db, allowedClientIds, me.role === 'client' ? me.id : null);

  const allRows = [
    ...rows.map((r) => {
      const map = (() => {
        if (r.type === 'DIRECTOR_CHANGE') {
          const detailsHref = `/corporate-secretary/applications/director-change/${encodeURIComponent(r.source.id)}`;
          return { typeKey: 'director_change', typeLabel: 'Change of Director', detailsHref, hasDocuments: true };
        }
        if (r.type === 'SHARE_TRANSFER') {
          const detailsHref = `/corporate-secretary/applications/share-transfer/${encodeURIComponent(r.source.id)}`;
          return { typeKey: 'share_transfer', typeLabel: 'Transfer of Shares', detailsHref, hasDocuments: true };
        }
        if (r.type === 'ANNUAL_GENERAL_MEETING') {
          const detailsHref = `/corporate-secretary/applications/agm/${encodeURIComponent(r.source.id)}`;
          return { typeKey: 'agm', typeLabel: 'Annual General Meeting', detailsHref, hasDocuments: true };
        }
        if (r.type === 'RORC_DECLARATION') {
          const detailsHref = `/corporate-secretary/applications/rorc/${encodeURIComponent(r.source.id)}`;
          return { typeKey: 'rorc', typeLabel: 'Declaration of Company Controller (RORC)', detailsHref, hasDocuments: true };
        }
        if (r.type === 'CHANGE_COMPANY_NAME') {
          const detailsHref = `/corporate-secretary/applications/company-update/${encodeURIComponent(r.source.id)}`;
          return { typeKey: 'change_company_name', typeLabel: 'Change of Company Name', detailsHref, hasDocuments: true };
        }
        if (r.type === 'CHANGE_FINANCIAL_YEAR_END') {
          const detailsHref = `/corporate-secretary/applications/company-update/${encodeURIComponent(r.source.id)}`;
          return { typeKey: 'change_fye', typeLabel: 'Change of Financial Year End (FYE)', detailsHref, hasDocuments: true };
        }
        if (r.type === 'CHANGE_REGISTERED_OFFICE_ADDRESS') {
          const detailsHref = `/corporate-secretary/applications/company-update/${encodeURIComponent(r.source.id)}`;
          return {
            typeKey: 'change_registered_office_address',
            typeLabel: 'Change of Registered Office Address',
            detailsHref,
            hasDocuments: true,
          };
        }
        if (r.type === 'CHANGE_BUSINESS_ACTIVITIES') {
          const detailsHref = `/corporate-secretary/applications/company-update/${encodeURIComponent(r.source.id)}`;
          return { typeKey: 'change_business_activities', typeLabel: 'Change of Business Activities', detailsHref, hasDocuments: true };
        }
        if (r.type === 'CHANGE_SECRETARY') {
          const detailsHref = `/corporate-secretary/applications/company-update/${encodeURIComponent(r.source.id)}`;
          return { typeKey: 'change_secretary', typeLabel: 'Change of Secretary', detailsHref, hasDocuments: true };
        }
        if (r.type === 'TRANSFER_COMPANY_SECRETARY') {
          const detailsHref = `/corporate-secretary/applications/company-update/${encodeURIComponent(r.source.id)}`;
          return {
            typeKey: 'transfer_company_secretary',
            typeLabel: 'Transfer of Company Secretary',
            detailsHref,
            hasDocuments: true,
          };
        }
        const detailsHref = `/corporate-secretary/applications/company-update/${encodeURIComponent(r.source.id)}`;
        return { typeKey: 'company_update', typeLabel: r.type, detailsHref, hasDocuments: true };
      })();

      return {
        id: r.id,
        typeKey: map.typeKey,
        typeLabel: map.typeLabel,
        companyId: r.companyId,
        companyName: r.companyName,
        applicationDate: r.applicationDate,
        editDate: r.editDate,
        status: r.status,
        detailsHref: map.detailsHref,
        hasDocuments: map.hasDocuments,
      };
    }),
    ...incRows.map((r) => {
      const detailsHref = `/incorporation/applications/${encodeURIComponent(r.sourceId)}`;
      return {
        id: r.id,
        typeKey: r.type === 'REGISTER_COMPANY' ? 'register_company' : 'transfer_company_secretary',
        typeLabel: r.type === 'REGISTER_COMPANY' ? 'Register Company' : 'Transfer of Company Secretary',
        companyId: r.companyId ?? '',
        companyName: r.companyName,
        applicationDate: r.applicationDate,
        editDate: r.editDate,
        status: r.status,
        detailsHref,
        hasDocuments: true,
      };
    }),
  ].sort((a, b) => (b.editDate ?? '').localeCompare(a.editDate ?? '') || (b.applicationDate ?? '').localeCompare(a.applicationDate ?? ''));

  let visibleRows = allRows;
  if (filterCompanyId) visibleRows = visibleRows.filter((r) => r.companyId === filterCompanyId);
  if (filterType) visibleRows = visibleRows.filter((r) => r.typeKey === filterType);

  return (
    <div className="min-h-screen flex flex-col">
      <AppTopNav active="corporate-secretary" />
      <div className="flex-1">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold">Applications</h1>
              <div className="mt-1 text-sm text-black/60">All services</div>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/corporate-secretary/applications/new/director-change"
                className="rounded-md bg-[#2f7bdc] text-white px-4 py-2 text-sm font-medium"
              >
                New Director Change
              </Link>
              <Link
                href="/corporate-secretary/rorc"
                className="rounded-md bg-white border border-black/10 text-black/70 px-4 py-2 text-sm font-medium"
              >
                New RORC
              </Link>
              <Link
                href="/corporate-secretary/agm"
                className="rounded-md bg-white border border-black/10 text-black/70 px-4 py-2 text-sm font-medium"
              >
                New AGM
              </Link>
              <Link
                href={filterCompanyId ? `/secretary/share-transfers?clientId=${encodeURIComponent(filterCompanyId)}` : '/secretary/share-transfers'}
                className="rounded-md bg-white border border-black/10 text-black/70 px-4 py-2 text-sm font-medium"
              >
                New Share Transfer
              </Link>
              <Link
                href="/incorporation/register"
                className="rounded-md bg-white border border-black/10 text-black/70 px-4 py-2 text-sm font-medium"
              >
                New Register
              </Link>
              <Link
                href="/incorporation/transfer-secretary"
                className="rounded-md bg-white border border-black/10 text-black/70 px-4 py-2 text-sm font-medium"
              >
                New Transfer Secretary
              </Link>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2 text-sm">
            <Link
              href={`/corporate-secretary/applications${filterCompanyId ? `?companyId=${encodeURIComponent(filterCompanyId)}` : ''}`}
              className={[
                'rounded-full px-3 py-1.5 border',
                !filterType ? 'bg-black text-white border-black' : 'bg-white border-black/10 text-black/70',
              ].join(' ')}
            >
              All
            </Link>
            <Link
              href={`/corporate-secretary/applications?type=director_change${filterCompanyId ? `&companyId=${encodeURIComponent(filterCompanyId)}` : ''}`}
              className={[
                'rounded-full px-3 py-1.5 border',
                filterType === 'director_change' ? 'bg-black text-white border-black' : 'bg-white border-black/10 text-black/70',
              ].join(' ')}
            >
              Change of Director
            </Link>
            <Link
              href={`/corporate-secretary/applications?type=share_transfer${filterCompanyId ? `&companyId=${encodeURIComponent(filterCompanyId)}` : ''}`}
              className={[
                'rounded-full px-3 py-1.5 border',
                filterType === 'share_transfer' ? 'bg-black text-white border-black' : 'bg-white border-black/10 text-black/70',
              ].join(' ')}
            >
              Transfer of Shares
            </Link>
            <Link
              href={`/corporate-secretary/applications?type=rorc${filterCompanyId ? `&companyId=${encodeURIComponent(filterCompanyId)}` : ''}`}
              className={[
                'rounded-full px-3 py-1.5 border',
                filterType === 'rorc' ? 'bg-black text-white border-black' : 'bg-white border-black/10 text-black/70',
              ].join(' ')}
            >
              RORC
            </Link>
            <Link
              href={`/corporate-secretary/applications?type=agm${filterCompanyId ? `&companyId=${encodeURIComponent(filterCompanyId)}` : ''}`}
              className={[
                'rounded-full px-3 py-1.5 border',
                filterType === 'agm' ? 'bg-black text-white border-black' : 'bg-white border-black/10 text-black/70',
              ].join(' ')}
            >
              AGM
            </Link>
            <Link
              href={`/corporate-secretary/applications?type=register_company${filterCompanyId ? `&companyId=${encodeURIComponent(filterCompanyId)}` : ''}`}
              className={[
                'rounded-full px-3 py-1.5 border',
                filterType === 'register_company' ? 'bg-black text-white border-black' : 'bg-white border-black/10 text-black/70',
              ].join(' ')}
            >
              Register Company
            </Link>
            <Link
              href={`/corporate-secretary/applications?type=transfer_company_secretary${filterCompanyId ? `&companyId=${encodeURIComponent(filterCompanyId)}` : ''}`}
              className={[
                'rounded-full px-3 py-1.5 border',
                filterType === 'transfer_company_secretary' ? 'bg-black text-white border-black' : 'bg-white border-black/10 text-black/70',
              ].join(' ')}
            >
              Transfer Secretary
            </Link>
            <Link
              href={`/corporate-secretary/applications?type=change_company_name${filterCompanyId ? `&companyId=${encodeURIComponent(filterCompanyId)}` : ''}`}
              className={[
                'rounded-full px-3 py-1.5 border',
                filterType === 'change_company_name' ? 'bg-black text-white border-black' : 'bg-white border-black/10 text-black/70',
              ].join(' ')}
            >
              Change of Company Name
            </Link>
            <Link
              href={`/corporate-secretary/applications?type=change_fye${filterCompanyId ? `&companyId=${encodeURIComponent(filterCompanyId)}` : ''}`}
              className={[
                'rounded-full px-3 py-1.5 border',
                filterType === 'change_fye' ? 'bg-black text-white border-black' : 'bg-white border-black/10 text-black/70',
              ].join(' ')}
            >
              Change of FYE
            </Link>
            <Link
              href={`/corporate-secretary/applications?type=change_registered_office_address${filterCompanyId ? `&companyId=${encodeURIComponent(filterCompanyId)}` : ''}`}
              className={[
                'rounded-full px-3 py-1.5 border',
                filterType === 'change_registered_office_address'
                  ? 'bg-black text-white border-black'
                  : 'bg-white border-black/10 text-black/70',
              ].join(' ')}
            >
              Change of Address
            </Link>
            <Link
              href={`/corporate-secretary/applications?type=change_business_activities${filterCompanyId ? `&companyId=${encodeURIComponent(filterCompanyId)}` : ''}`}
              className={[
                'rounded-full px-3 py-1.5 border',
                filterType === 'change_business_activities' ? 'bg-black text-white border-black' : 'bg-white border-black/10 text-black/70',
              ].join(' ')}
            >
              Change of Activities
            </Link>
            <Link
              href={`/corporate-secretary/applications?type=change_secretary${filterCompanyId ? `&companyId=${encodeURIComponent(filterCompanyId)}` : ''}`}
              className={[
                'rounded-full px-3 py-1.5 border',
                filterType === 'change_secretary' ? 'bg-black text-white border-black' : 'bg-white border-black/10 text-black/70',
              ].join(' ')}
            >
              Change of Secretary
            </Link>
          </div>

          <div className="mt-4 rounded-xl bg-white border border-black/5 p-4">
            <div className="overflow-x-auto">
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
                  {visibleRows.map((r) => {
                    return (
                      <tr key={r.id} className="border-b border-black/5">
                        <td className="px-3 py-2">{r.id}</td>
                        <td className="px-3 py-2">{r.typeLabel}</td>
                        <td className="px-3 py-2">{r.companyName}</td>
                        <td className="px-3 py-2">{r.applicationDate.slice(0, 10)}</td>
                        <td className="px-3 py-2">{r.editDate.slice(0, 10)}</td>
                        <td className="px-3 py-2">
                          <span
                            className={
                              r.status === 'REJECTED'
                                ? 'text-red-600'
                                : r.status === 'NEED_MORE_INFO'
                                  ? 'text-[#d97706]'
                                  : r.status === 'DRAFT'
                                    ? 'text-black/60'
                                    : 'text-[#16a34a]'
                            }
                          >
                            {r.status}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            {r.hasDocuments ? (
                              <Link
                                href={`${r.detailsHref}#documents`}
                                className="rounded-md bg-[#14b8a6] text-white px-3 py-1.5 text-xs font-medium"
                              >
                                Documents
                              </Link>
                            ) : null}
                            <Link href={r.detailsHref} className="rounded-md bg-[#14b8a6] text-white px-3 py-1.5 text-xs font-medium">
                              Details
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {visibleRows.length === 0 ? (
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
  );
}
