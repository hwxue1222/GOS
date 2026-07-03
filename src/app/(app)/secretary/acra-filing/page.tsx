import AppTopNav from '@/components/AppTopNav';
import { getCurrentUser } from '@/lib/auth';
import { readDb } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';
import { buildSecretaryServiceApplications } from '@/lib/secretaryApplications';
import { buildIncorporationApplications } from '@/lib/incorporationApplications';
import SecretaryCsReviewClient from '@/app/(app)/secretary/corporate-secretary/review/ui/SecretaryCsReviewClient';
import SecretaryIncorporationReviewClient from '@/app/(app)/secretary/incorporation/review/ui/SecretaryIncorporationReviewClient';
import SecretarySubNavClient from '@/app/(app)/secretary/ui/SecretarySubNavClient';

function isActiveRole(r: { role: string; resignationDate?: string; toDate?: string }) {
  if (r.role === 'DIRECTOR' || r.role === 'SECRETARY') return !r.resignationDate;
  if (r.role === 'SHAREHOLDER' || r.role === 'RORC') return !r.toDate;
  return true;
}

export default async function SecretaryAcraFilingPage({
  searchParams,
}: {
  searchParams: Promise<{ companyId?: string }>;
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
  const filterCompanyId = String(sp.companyId ?? '').trim();

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
    .filter((r) => (!filterCompanyId ? true : r.companyId === filterCompanyId))
    .sort((a, b) => (b.editDate ?? '').localeCompare(a.editDate ?? '') || (b.applicationDate ?? '').localeCompare(a.applicationDate ?? ''));

  const incRows = buildIncorporationApplications(db, allowedClientIds, null)
    .filter((a) => (!filterCompanyId ? true : a.companyId === filterCompanyId))
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
        </div>
      </div>
    </div>
  );
}
