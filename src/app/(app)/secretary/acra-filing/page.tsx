import AppTopNav from '@/components/AppTopNav';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { readDb } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';
import { buildSecretaryServiceApplications } from '@/lib/secretaryApplications';
import { buildIncorporationApplications } from '@/lib/incorporationApplications';
import SecretaryCsReviewClient from '@/app/(app)/secretary/corporate-secretary/review/ui/SecretaryCsReviewClient';
import SecretaryIncorporationReviewClient from '@/app/(app)/secretary/incorporation/review/ui/SecretaryIncorporationReviewClient';
import SecretarySubNavClient from '@/app/(app)/secretary/ui/SecretarySubNavClient';
import AcraFilingRecordsTable, { type AcraRecordRow } from '@/app/(app)/secretary/acra-filing/ui/AcraFilingRecordsTable';

function isActiveRole(r: { role: string; resignationDate?: string; toDate?: string }) {
  if (r.role === 'DIRECTOR' || r.role === 'SECRETARY') return !r.resignationDate;
  if (r.role === 'SHAREHOLDER' || r.role === 'RORC') return !r.toDate;
  return true;
}

export default async function SecretaryAcraFilingPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; companyId?: string; type?: string; status?: string }>;
}) {
  const me = await getCurrentUser();
  if (!me) return null;
  if (me.role === 'client') {
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
  if (!hasPermission(me, 'secretary', 'viewAll') && !hasPermission(me, 'secretary', 'viewAssigned')) {
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
  const view = (sp.view ?? '').trim() === 'records' ? 'records' : 'queue';
  const filterCompanyId = String(sp.companyId ?? '').trim();
  const filterType = String(sp.type ?? '').trim();
  const filterStatus = String(sp.status ?? '').trim();

  const db = await readDb();
  const canViewAll = hasPermission(me, 'secretary', 'viewAll');
  const canWrite = hasPermission(me, 'secretary', 'update');
  const allowedClientIds = (() => {
    if (canViewAll) return null;
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

  const labelForCompanyUpdateType = (t: string) => {
    if (t === 'CHANGE_COMPANY_NAME') return 'Change of Company Name';
    if (t === 'CHANGE_FINANCIAL_YEAR_END') return 'Change of Financial Year End (FYE)';
    if (t === 'CHANGE_REGISTERED_OFFICE_ADDRESS') return 'Change of Registered Office Address';
    if (t === 'CHANGE_BUSINESS_ACTIVITIES') return 'Change of Business Activities';
    if (t === 'CHANGE_SECRETARY') return 'Change of Secretary';
    if (t === 'TRANSFER_COMPANY_SECRETARY') return 'Transfer of Company Secretary';
    return 'Company Update';
  };

  const csRows = buildSecretaryServiceApplications(db, allowedClientIds)
    .filter((r) => r.status !== 'DRAFT')
    .map((r) => {
      const map = (() => {
        if (r.type === 'DIRECTOR_CHANGE') {
          return {
            id: `DCR-${r.source.id}`,
            typeLabel: 'Change of Director',
            detailsHref: `/corporate-secretary/applications/director-change/${encodeURIComponent(r.source.id)}`,
            decisionUrl: `/api/secretary/companies/${encodeURIComponent(r.companyId)}/director-change-requests/${encodeURIComponent(r.source.id)}/decision`,
            deleteUrl: `/api/secretary/companies/${encodeURIComponent(r.companyId)}/director-change-requests/${encodeURIComponent(r.source.id)}`,
          };
        }
        if (r.type === 'RORC_DECLARATION') {
          return {
            id: `RORC-${r.source.id}`,
            typeLabel: 'Declaration of Company Controller (RORC)',
            detailsHref: `/corporate-secretary/applications/rorc/${encodeURIComponent(r.source.id)}`,
            decisionUrl: `/api/secretary/companies/${encodeURIComponent(r.companyId)}/rorc-declaration-requests/${encodeURIComponent(r.source.id)}/decision`,
            deleteUrl: `/api/secretary/companies/${encodeURIComponent(r.companyId)}/rorc-declaration-requests/${encodeURIComponent(r.source.id)}`,
          };
        }
        if (r.type === 'ANNUAL_GENERAL_MEETING') {
          return {
            id: `AGM-${r.source.id}`,
            typeLabel: 'Annual General Meeting',
            detailsHref: `/corporate-secretary/applications/agm/${encodeURIComponent(r.source.id)}`,
            decisionUrl: `/api/secretary/companies/${encodeURIComponent(r.companyId)}/annual-general-meeting-requests/${encodeURIComponent(r.source.id)}/decision`,
            deleteUrl: `/api/secretary/companies/${encodeURIComponent(r.companyId)}/annual-general-meeting-requests/${encodeURIComponent(r.source.id)}`,
          };
        }
        if (r.type === 'SHARE_TRANSFER') {
          return {
            id: `ST-${r.source.id}`,
            typeLabel: 'Transfer of Shares',
            detailsHref: `/corporate-secretary/applications/share-transfer/${encodeURIComponent(r.source.id)}`,
            decisionUrl: `/api/secretary/share-transfers/${encodeURIComponent(r.source.id)}/decision`,
            deleteUrl: `/api/secretary/share-transfers/${encodeURIComponent(r.source.id)}`,
          };
        }
        return {
          id: `CUR-${r.source.id}`,
          typeLabel: labelForCompanyUpdateType(r.type),
          detailsHref: `/corporate-secretary/applications/company-update/${encodeURIComponent(r.source.id)}`,
          decisionUrl: `/api/secretary/companies/${encodeURIComponent(r.companyId)}/company-update-requests/${encodeURIComponent(r.source.id)}/decision`,
          deleteUrl: `/api/secretary/companies/${encodeURIComponent(r.companyId)}/company-update-requests/${encodeURIComponent(r.source.id)}`,
        };
      })();

      return {
        id: map.id,
        typeLabel: map.typeLabel,
        companyId: r.companyId,
        companyName: r.companyName,
        applicationDate: r.applicationDate,
        editDate: r.editDate,
        status: r.status,
        detailsHref: map.detailsHref,
        decisionUrl: map.decisionUrl,
        deleteUrl: map.deleteUrl,
      };
    })
    .sort((a, b) => (b.editDate ?? '').localeCompare(a.editDate ?? '') || (b.applicationDate ?? '').localeCompare(a.applicationDate ?? ''));

  const companies = db.clients
    .filter((c) => !c.deletedAt)
    .filter((c) => (allowedClientIds ? allowedClientIds.has(c.id) : true))
    .map((c) => ({ id: c.id, name: c.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const recordRows: AcraRecordRow[] = (() => {
    const secApps = buildSecretaryServiceApplications(db, allowedClientIds)
      .filter((r) => r.status !== 'DRAFT')
      .map((r) => {
        const map = (() => {
          if (r.type === 'DIRECTOR_CHANGE') {
            return {
              typeKey: 'director_change',
              typeLabel: 'Change of Director',
              detailsHref: `/corporate-secretary/applications/director-change/${encodeURIComponent(r.source.id)}`,
              decisionUrl: `/api/secretary/companies/${encodeURIComponent(r.companyId)}/director-change-requests/${encodeURIComponent(r.source.id)}/decision`,
              deleteUrl: `/api/secretary/companies/${encodeURIComponent(r.companyId)}/director-change-requests/${encodeURIComponent(r.source.id)}`,
            };
          }
          if (r.type === 'SHARE_TRANSFER') {
            return {
              typeKey: 'share_transfer',
              typeLabel: 'Transfer of Shares',
              detailsHref: `/corporate-secretary/applications/share-transfer/${encodeURIComponent(r.source.id)}`,
              decisionUrl: `/api/secretary/share-transfers/${encodeURIComponent(r.source.id)}/decision`,
              deleteUrl: `/api/secretary/share-transfers/${encodeURIComponent(r.source.id)}`,
            };
          }
          if (r.type === 'ANNUAL_GENERAL_MEETING') {
            return {
              typeKey: 'agm',
              typeLabel: 'Annual General Meeting',
              detailsHref: `/corporate-secretary/applications/agm/${encodeURIComponent(r.source.id)}`,
              decisionUrl: `/api/secretary/companies/${encodeURIComponent(r.companyId)}/annual-general-meeting-requests/${encodeURIComponent(r.source.id)}/decision`,
              deleteUrl: `/api/secretary/companies/${encodeURIComponent(r.companyId)}/annual-general-meeting-requests/${encodeURIComponent(r.source.id)}`,
            };
          }
          if (r.type === 'RORC_DECLARATION') {
            return {
              typeKey: 'rorc',
              typeLabel: 'Declaration of Company Controller (RORC)',
              detailsHref: `/corporate-secretary/applications/rorc/${encodeURIComponent(r.source.id)}`,
              decisionUrl: `/api/secretary/companies/${encodeURIComponent(r.companyId)}/rorc-declaration-requests/${encodeURIComponent(r.source.id)}/decision`,
              deleteUrl: `/api/secretary/companies/${encodeURIComponent(r.companyId)}/rorc-declaration-requests/${encodeURIComponent(r.source.id)}`,
            };
          }
          if (r.type === 'CHANGE_COMPANY_NAME') {
            return {
              typeKey: 'change_company_name',
              typeLabel: 'Change of Company Name',
              detailsHref: `/corporate-secretary/applications/company-update/${encodeURIComponent(r.source.id)}`,
              decisionUrl: `/api/secretary/companies/${encodeURIComponent(r.companyId)}/company-update-requests/${encodeURIComponent(r.source.id)}/decision`,
              deleteUrl: `/api/secretary/companies/${encodeURIComponent(r.companyId)}/company-update-requests/${encodeURIComponent(r.source.id)}`,
            };
          }
          if (r.type === 'CHANGE_FINANCIAL_YEAR_END') {
            return {
              typeKey: 'change_fye',
              typeLabel: 'Change of Financial Year End (FYE)',
              detailsHref: `/corporate-secretary/applications/company-update/${encodeURIComponent(r.source.id)}`,
              decisionUrl: `/api/secretary/companies/${encodeURIComponent(r.companyId)}/company-update-requests/${encodeURIComponent(r.source.id)}/decision`,
              deleteUrl: `/api/secretary/companies/${encodeURIComponent(r.companyId)}/company-update-requests/${encodeURIComponent(r.source.id)}`,
            };
          }
          if (r.type === 'CHANGE_REGISTERED_OFFICE_ADDRESS') {
            return {
              typeKey: 'change_registered_office_address',
              typeLabel: 'Change of Registered Office Address',
              detailsHref: `/corporate-secretary/applications/company-update/${encodeURIComponent(r.source.id)}`,
              decisionUrl: `/api/secretary/companies/${encodeURIComponent(r.companyId)}/company-update-requests/${encodeURIComponent(r.source.id)}/decision`,
              deleteUrl: `/api/secretary/companies/${encodeURIComponent(r.companyId)}/company-update-requests/${encodeURIComponent(r.source.id)}`,
            };
          }
          if (r.type === 'CHANGE_BUSINESS_ACTIVITIES') {
            return {
              typeKey: 'change_business_activities',
              typeLabel: 'Change of Business Activities',
              detailsHref: `/corporate-secretary/applications/company-update/${encodeURIComponent(r.source.id)}`,
              decisionUrl: `/api/secretary/companies/${encodeURIComponent(r.companyId)}/company-update-requests/${encodeURIComponent(r.source.id)}/decision`,
              deleteUrl: `/api/secretary/companies/${encodeURIComponent(r.companyId)}/company-update-requests/${encodeURIComponent(r.source.id)}`,
            };
          }
          if (r.type === 'CHANGE_SECRETARY') {
            return {
              typeKey: 'change_secretary',
              typeLabel: 'Change of Secretary',
              detailsHref: `/corporate-secretary/applications/company-update/${encodeURIComponent(r.source.id)}`,
              decisionUrl: `/api/secretary/companies/${encodeURIComponent(r.companyId)}/company-update-requests/${encodeURIComponent(r.source.id)}/decision`,
              deleteUrl: `/api/secretary/companies/${encodeURIComponent(r.companyId)}/company-update-requests/${encodeURIComponent(r.source.id)}`,
            };
          }
          if (r.type === 'TRANSFER_COMPANY_SECRETARY') {
            return {
              typeKey: 'transfer_company_secretary',
              typeLabel: 'Transfer of Company Secretary',
              detailsHref: `/corporate-secretary/applications/company-update/${encodeURIComponent(r.source.id)}`,
              decisionUrl: `/api/secretary/companies/${encodeURIComponent(r.companyId)}/company-update-requests/${encodeURIComponent(r.source.id)}/decision`,
              deleteUrl: `/api/secretary/companies/${encodeURIComponent(r.companyId)}/company-update-requests/${encodeURIComponent(r.source.id)}`,
            };
          }
          return {
            typeKey: 'company_update',
            typeLabel: labelForCompanyUpdateType(r.type),
            detailsHref: `/corporate-secretary/applications/company-update/${encodeURIComponent(r.source.id)}`,
            decisionUrl: `/api/secretary/companies/${encodeURIComponent(r.companyId)}/company-update-requests/${encodeURIComponent(r.source.id)}/decision`,
            deleteUrl: `/api/secretary/companies/${encodeURIComponent(r.companyId)}/company-update-requests/${encodeURIComponent(r.source.id)}`,
          };
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
          decisionUrl: map.decisionUrl,
          deleteUrl: map.deleteUrl,
        };
      });

    const incRows = buildIncorporationApplications(db, allowedClientIds, null)
      .filter((r) => r.status !== 'DRAFT')
      .map((r) => ({
        id: r.id,
        typeKey: r.type === 'REGISTER_COMPANY' ? 'register_company' : 'transfer_company_secretary',
        typeLabel: r.type === 'REGISTER_COMPANY' ? 'Register Company' : 'Transfer of Company Secretary',
        companyId: r.companyId ?? '',
        companyName: r.companyName,
        applicationDate: r.applicationDate,
        editDate: r.editDate,
        status: r.status,
        detailsHref: `/incorporation/applications/${encodeURIComponent(r.sourceId)}`,
      }));

    const all = [...secApps, ...incRows];
    all.sort((a, b) => (b.editDate ?? '').localeCompare(a.editDate ?? '') || (b.applicationDate ?? '').localeCompare(a.applicationDate ?? ''));
    return all;
  })();

  const visibleRecordRows = (() => {
    let rows = recordRows;
    if (filterCompanyId) rows = rows.filter((r) => r.companyId === filterCompanyId);
    if (filterType) rows = rows.filter((r) => r.typeKey === filterType);
    if (filterStatus) rows = rows.filter((r) => r.status === filterStatus);
    return rows;
  })();

  const incRows = buildIncorporationApplications(db, allowedClientIds, null)
    .filter((a) => a.status === 'SUBMITTED' || a.status === 'PROCESSING' || a.status === 'NEED_MORE_INFO' || a.status === 'REJECTED')
    .map((a) => ({
      applicationId: a.sourceId,
      type: a.type,
      companyName: a.companyName,
      status: a.status,
      applicationDate: a.applicationDate,
      editDate: a.editDate,
    }));

  return (
    <div className="min-h-screen flex flex-col">
      <AppTopNav active="secretary" />
      <div className="flex-1">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex flex-col gap-3">
            <div>
              <h1 className="text-xl font-semibold">ACRA Filing</h1>
              <div className="mt-1 text-sm text-black/60">Unified queue for front-end submitted applications</div>
            </div>
            <SecretarySubNavClient active="acra-filing" showMembers={true} />
          </div>

          <div className="mt-4">
            <div className="inline-flex rounded-lg border border-black/10 bg-white p-1">
              <Link
                href="/secretary/acra-filing"
                className={
                  view === 'queue'
                    ? 'rounded-md bg-black text-white px-3 py-1.5 text-sm font-medium'
                    : 'rounded-md px-3 py-1.5 text-sm font-medium text-black/70 hover:bg-black/[0.02]'
                }
              >
                Queue
              </Link>
              <Link
                href={
                  `/secretary/acra-filing?view=records${filterCompanyId ? `&companyId=${encodeURIComponent(filterCompanyId)}` : ''}${filterType ? `&type=${encodeURIComponent(filterType)}` : ''}${filterStatus ? `&status=${encodeURIComponent(filterStatus)}` : ''}`
                }
                className={
                  view === 'records'
                    ? 'rounded-md bg-black text-white px-3 py-1.5 text-sm font-medium'
                    : 'rounded-md px-3 py-1.5 text-sm font-medium text-black/70 hover:bg-black/[0.02]'
                }
              >
                Records
              </Link>
            </div>
          </div>

          {view === 'records' ? (
            <AcraFilingRecordsTable
              companies={companies}
              allRows={recordRows}
              visibleRows={visibleRecordRows}
              filterCompanyId={filterCompanyId}
              filterType={filterType}
              filterStatus={filterStatus}
              canWrite={canWrite}
            />
          ) : (
            <>
              <div className="mt-6">
                <div className="mt-3">
                  <SecretaryCsReviewClient rows={csRows} canWrite={canWrite} />
                </div>
              </div>

              <div className="mt-8">
                <div className="text-sm font-semibold">Incorporation of Company</div>
                <div className="mt-3">
                  <SecretaryIncorporationReviewClient rows={incRows} canWrite={canWrite} />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
