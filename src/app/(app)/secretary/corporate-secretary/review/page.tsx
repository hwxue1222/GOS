import AppTopNav from '@/components/AppTopNav';
import { getCurrentUser } from '@/lib/auth';
import { readDb } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';
import { buildSecretaryServiceApplications } from '@/lib/secretaryApplications';
import SecretaryCsReviewClient from '@/app/(app)/secretary/corporate-secretary/review/ui/SecretaryCsReviewClient';

function isActiveRole(r: { role: string; resignationDate?: string; toDate?: string }) {
  if (r.role === 'DIRECTOR' || r.role === 'SECRETARY') return !r.resignationDate;
  if (r.role === 'SHAREHOLDER' || r.role === 'RORC') return !r.toDate;
  return true;
}

export default async function SecretaryCorporateSecretaryReviewPage() {
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
  if (!hasPermission(me, 'secretary', 'update')) {
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

  const db = await readDb();
  const canViewAll = hasPermission(me, 'secretary', 'viewAll');
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

  const pendingDirectorRows = buildSecretaryServiceApplications(db, allowedClientIds)
    .filter((r) => r.type === 'DIRECTOR_CHANGE')
    .filter((r) => r.status === 'PENDING_REVIEW')
    .map((r) => ({
      id: `DCR-${r.source.id}`,
      typeLabel: 'Change of Director',
      companyId: r.companyId,
      companyName: r.companyName,
      applicationDate: r.applicationDate,
      editDate: r.editDate,
      status: r.status,
      detailsHref: `/corporate-secretary/applications/director-change/${encodeURIComponent(r.source.id)}`,
      decisionUrl: `/api/secretary/companies/${encodeURIComponent(r.companyId)}/director-change-requests/${encodeURIComponent(r.source.id)}/decision`,
    }));

  const labelForType = (t: string) => {
    if (t === 'CHANGE_COMPANY_NAME') return 'Change of Company Name';
    if (t === 'CHANGE_FINANCIAL_YEAR_END') return 'Change of Financial Year End (FYE)';
    if (t === 'CHANGE_REGISTERED_OFFICE_ADDRESS') return 'Change of Registered Office Address';
    if (t === 'CHANGE_BUSINESS_ACTIVITIES') return 'Change of Business Activities';
    if (t === 'CHANGE_SECRETARY') return 'Change of Secretary';
    return t;
  };

  const companyUpdateRows = (db.companyUpdateRequests ?? [])
    .filter((r) => r.status === 'PENDING_REVIEW')
    .filter((r) => (allowedClientIds ? allowedClientIds.has(r.clientId) : true))
    .map((r) => {
      const company = db.clients.find((c) => c.id === r.clientId);
      const companyName = company?.name ?? r.clientId;
      return {
        id: `CUR-${r.id}`,
        typeLabel: labelForType(r.type),
        companyId: r.clientId,
        companyName,
        applicationDate: r.createdAt,
        editDate: r.updatedAt ?? r.createdAt,
        status: r.status,
        detailsHref: `/corporate-secretary/applications/company-update/${encodeURIComponent(r.id)}`,
        decisionUrl: `/api/secretary/companies/${encodeURIComponent(r.clientId)}/company-update-requests/${encodeURIComponent(r.id)}/decision`,
      };
    });

  const rorcRows = (db.rorcDeclarationRequests ?? [])
    .filter((r) => r.status === 'PENDING_REVIEW')
    .filter((r) => (allowedClientIds ? allowedClientIds.has(r.clientId) : true))
    .map((r) => {
      const company = db.clients.find((c) => c.id === r.clientId);
      const companyName = company?.name ?? r.clientId;
      return {
        id: `RORC-${r.id}`,
        typeLabel: 'Declaration of Company Controller (RORC)',
        companyId: r.clientId,
        companyName,
        applicationDate: r.createdAt,
        editDate: r.updatedAt ?? r.createdAt,
        status: r.status,
        detailsHref: `/corporate-secretary/applications/rorc/${encodeURIComponent(r.id)}`,
        decisionUrl: `/api/secretary/companies/${encodeURIComponent(r.clientId)}/rorc-declaration-requests/${encodeURIComponent(r.id)}/decision`,
      };
    });

  const agmRows = (db.annualGeneralMeetingRequests ?? [])
    .filter((r) => r.status === 'PENDING_REVIEW')
    .filter((r) => (allowedClientIds ? allowedClientIds.has(r.clientId) : true))
    .map((r) => {
      const company = db.clients.find((c) => c.id === r.clientId);
      const companyName = company?.name ?? r.clientId;
      return {
        id: `AGM-${r.id}`,
        typeLabel: 'Annual General Meeting',
        companyId: r.clientId,
        companyName,
        applicationDate: r.createdAt,
        editDate: r.updatedAt ?? r.createdAt,
        status: r.status,
        detailsHref: `/corporate-secretary/applications/agm/${encodeURIComponent(r.id)}`,
        decisionUrl: `/api/secretary/companies/${encodeURIComponent(r.clientId)}/annual-general-meeting-requests/${encodeURIComponent(r.id)}/decision`,
      };
    });

  const rows = [...companyUpdateRows, ...rorcRows, ...agmRows, ...pendingDirectorRows].sort(
    (a, b) => (b.editDate ?? '').localeCompare(a.editDate ?? '') || (b.applicationDate ?? '').localeCompare(a.applicationDate ?? ''),
  );

  return (
    <div className="min-h-screen flex flex-col">
      <AppTopNav active="secretary" />
      <div className="flex-1">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <h1 className="text-xl font-semibold">Corporate Secretary Review</h1>
          <div className="mt-1 text-sm text-black/60">Pending approvals</div>
          <div className="mt-4">
            <SecretaryCsReviewClient rows={rows} />
          </div>
        </div>
      </div>
    </div>
  );
}
