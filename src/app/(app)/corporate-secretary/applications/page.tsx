import Link from 'next/link';
import { redirect } from 'next/navigation';
import AppTopNav from '@/components/AppTopNav';
import { getCurrentUser } from '@/lib/auth';
import { readDb } from '@/lib/db';
import { buildSecretaryServiceApplications } from '@/lib/secretaryApplications';
import { buildIncorporationApplications } from '@/lib/incorporationApplications';
import DeleteActionClient from '@/components/DeleteActionClient';
import { formatDateDMY } from '@/lib/date';

function isActiveRole(r: { role: string; resignationDate?: string; toDate?: string }) {
  return r.role === 'DIRECTOR' && !r.resignationDate;
}

export default async function CorporateSecretaryApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; companyId?: string }>;
}) {
  const me = await getCurrentUser();
  if (!me) return null;
  if (me.role !== 'client') {
    const sp = await searchParams;
    const qp = new URLSearchParams();
    qp.set('view', 'records');
    if (sp.companyId) qp.set('companyId', String(sp.companyId));
    if (sp.type) qp.set('type', String(sp.type));
    redirect(`/secretary/acra-filing?${qp.toString()}`);
  }
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

  const companies = db.clients
    .filter((c) => !c.deletedAt)
    .filter((c) => (allowedClientIds ? allowedClientIds.has(c.id) : true))
    .map((c) => ({ id: c.id, name: c.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const actionBtnBase = 'rounded-md px-4 py-2 text-sm font-medium';
  const actionBtnPrimary = `${actionBtnBase} bg-[#2f7bdc] text-white`;
  const actionBtnSecondary = `${actionBtnBase} bg-white border border-black/10 text-black/70 hover:bg-black/[0.02]`;

  const chipBase = 'rounded-full px-3 py-1.5 border text-sm';
  const chipActive = `${chipBase} bg-black text-white border-black`;
  const chipInactive = `${chipBase} bg-white border-black/10 text-black/70 hover:bg-black/[0.02]`;

  const statusPill = (s: string) => {
    if (s === 'REJECTED') return 'bg-[#fef2f2] text-[#b91c1c] border-[#fecaca]';
    if (s === 'NEED_MORE_INFO') return 'bg-[#fff7ed] text-[#c2410c] border-[#fed7aa]';
    if (s === 'PENDING_REVIEW') return 'bg-[#faf5ff] text-[#6d28d9] border-[#e9d5ff]';
    if (s === 'DRAFT') return 'bg-black/[0.02] text-black/70 border-black/10';
    if (s === 'SIGNING') return 'bg-[#eff6ff] text-[#1d4ed8] border-[#bfdbfe]';
    if (s === 'APPROVED' || s === 'COMPLETE') return 'bg-[#ecfdf5] text-[#047857] border-[#a7f3d0]';
    return 'bg-white text-black/70 border-black/10';
  };

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
        sourceId: r.source.id,
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
        sourceId: r.sourceId,
      };
    }),
  ].sort((a, b) => (b.editDate ?? '').localeCompare(a.editDate ?? '') || (b.applicationDate ?? '').localeCompare(a.applicationDate ?? ''));

  let visibleRows = allRows;
  if (filterCompanyId) visibleRows = visibleRows.filter((r) => r.companyId === filterCompanyId);
  if (filterType) visibleRows = visibleRows.filter((r) => r.typeKey === filterType);

  const chipDefs: Array<{ typeKey: string; label: string }> = [
    { typeKey: '', label: 'All' },
    { typeKey: 'director_change', label: 'Change of Director' },
    { typeKey: 'share_transfer', label: 'Transfer of Shares' },
    { typeKey: 'rorc', label: 'RORC' },
    { typeKey: 'agm', label: 'AGM' },
    { typeKey: 'register_company', label: 'Register Company' },
    { typeKey: 'transfer_company_secretary', label: 'Transfer Secretary' },
    { typeKey: 'change_company_name', label: 'Change of Company Name' },
    { typeKey: 'change_fye', label: 'Change of FYE' },
    { typeKey: 'change_registered_office_address', label: 'Change of Address' },
    { typeKey: 'change_business_activities', label: 'Change of Activities' },
    { typeKey: 'change_secretary', label: 'Change of Secretary' },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <AppTopNav active="corporate-secretary" />
      <div className="flex-1 bg-[#f7f8fa]">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold">Applications</h1>
              <div className="mt-1 text-sm text-black/60">All services</div>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto max-w-full">
              <Link
                href="/corporate-secretary/applications/new/director-change"
                className={actionBtnPrimary}
              >
                New Director Change
              </Link>
              <Link href="/corporate-secretary/rorc" className={actionBtnSecondary}>
                New RORC
              </Link>
              <Link href="/corporate-secretary/agm" className={actionBtnSecondary}>
                New AGM
              </Link>
              <Link
                href={
                  (() => {
                    const cid = filterCompanyId || companies[0]?.id || '';
                    return cid ? `/corporate-secretary/share-transfer?companyId=${encodeURIComponent(cid)}` : '/corporate-secretary/applications';
                  })()
                }
                className={actionBtnSecondary}
              >
                New Share Transfer
              </Link>
              <Link href="/corporate-secretary/incorporation/register" className={actionBtnSecondary}>
                New Register
              </Link>
              <Link href="/corporate-secretary/incorporation/transfer-secretary" className={actionBtnSecondary}>
                New Transfer Secretary
              </Link>
            </div>
          </div>

          <div className="mt-4 rounded-xl bg-white border border-black/5 p-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <form method="GET" className="flex flex-wrap items-center gap-2">
                {filterType ? <input type="hidden" name="type" value={filterType} /> : null}
                <div className="text-sm text-black/70">Company</div>
                <select
                  name="companyId"
                  defaultValue={filterCompanyId}
                  className="max-w-[420px] truncate rounded-md border border-black/10 bg-white px-3 py-2 text-sm"
                >
                  <option value="">All companies</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <button type="submit" className={actionBtnSecondary}>
                  Apply
                </button>
                {(filterCompanyId || filterType) && (
                  <Link href="/corporate-secretary/applications" className="text-sm text-[#2f7bdc] hover:underline">
                    Clear filters
                  </Link>
                )}
              </form>

              <div className="text-xs text-black/50">
                Showing {visibleRows.length} of {allRows.length}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {chipDefs.map((c) => {
                const href = c.typeKey
                  ? `/corporate-secretary/applications?type=${encodeURIComponent(c.typeKey)}${filterCompanyId ? `&companyId=${encodeURIComponent(filterCompanyId)}` : ''}`
                  : `/corporate-secretary/applications${filterCompanyId ? `?companyId=${encodeURIComponent(filterCompanyId)}` : ''}`;
                const cls = (filterType || '') === (c.typeKey || '') ? chipActive : !filterType && !c.typeKey ? chipActive : chipInactive;
                return (
                  <Link key={c.typeKey || 'all'} href={href} className={cls}>
                    {c.label}
                  </Link>
                );
              })}
            </div>
          </div>

          {visibleRows.length === 0 ? (
            <div className="mt-4 rounded-xl bg-white border border-black/5 p-10 text-center">
              <div className="text-base font-semibold text-black">No applications</div>
              <div className="mt-2 text-sm text-black/50">Try adjusting filters, or start a new application.</div>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                <Link href="/corporate-secretary/applications/new/director-change" className={actionBtnPrimary}>
                  New Director Change
                </Link>
                <Link href="/corporate-secretary/rorc" className={actionBtnSecondary}>
                  New RORC
                </Link>
                <Link href="/corporate-secretary/agm" className={actionBtnSecondary}>
                  New AGM
                </Link>
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-xl bg-white border border-black/5 p-4">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-left text-black/60 bg-black/[0.02]">
                    <tr className="border-b border-black/10">
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
                      const deleteUrl = (() => {
                        if (me.role !== 'client') return '';
                        if (r.status === 'APPROVED' || r.status === 'REJECTED' || r.status === 'COMPLETE') return '';
                        if (!r.companyId || !r.sourceId) return '';
                        if (r.typeKey === 'director_change') {
                          return `/api/secretary/companies/${encodeURIComponent(r.companyId)}/director-change-requests/${encodeURIComponent(r.sourceId)}`;
                        }
                        if (r.typeKey === 'rorc') {
                          return `/api/secretary/companies/${encodeURIComponent(r.companyId)}/rorc-declaration-requests/${encodeURIComponent(r.sourceId)}`;
                        }
                        if (r.typeKey === 'agm') {
                          return `/api/secretary/companies/${encodeURIComponent(r.companyId)}/annual-general-meeting-requests/${encodeURIComponent(r.sourceId)}`;
                        }
                        if (r.typeKey === 'share_transfer') {
                          return `/api/secretary/share-transfers/${encodeURIComponent(r.sourceId)}`;
                        }
                        if (
                          r.typeKey === 'change_company_name' ||
                          r.typeKey === 'change_fye' ||
                          r.typeKey === 'change_registered_office_address' ||
                          r.typeKey === 'change_business_activities' ||
                          r.typeKey === 'change_secretary' ||
                          r.typeKey === 'transfer_company_secretary' ||
                          r.typeKey === 'company_update'
                        ) {
                          return `/api/secretary/companies/${encodeURIComponent(r.companyId)}/company-update-requests/${encodeURIComponent(r.sourceId)}`;
                        }
                        return '';
                      })();
                      return (
                        <tr key={r.id} className="border-b border-black/5 hover:bg-black/[0.02]">
                          <td className="px-3 py-2">{r.typeLabel}</td>
                          <td className="px-3 py-2">{r.companyName}</td>
                          <td className="px-3 py-2">{formatDateDMY(r.applicationDate.slice(0, 10))}</td>
                          <td className="px-3 py-2">{formatDateDMY(r.editDate.slice(0, 10))}</td>
                          <td className="px-3 py-2">
                            <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${statusPill(r.status)}`}>{r.status}</span>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <Link
                                href={r.detailsHref}
                                className="rounded-md bg-[#14b8a6] text-white px-3 py-1.5 text-xs font-medium hover:brightness-95"
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
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
