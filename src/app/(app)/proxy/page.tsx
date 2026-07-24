import AppTopNav from '@/components/AppTopNav';
import { getCurrentUser } from '@/lib/auth';
import { readDb } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';
import ProxyHomeClient, { type ProxyHomeCompanyRow, type ProxySubmittedRecordRow } from '@/app/(app)/proxy/ui/ProxyHomeClient';
import { buildSecretaryServiceApplications } from '@/lib/secretaryApplications';

export default async function ProxyCompanyPickerPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  if (user.role === 'client' || (!hasPermission(user, 'proxy', 'viewAll') && !hasPermission(user, 'proxy', 'viewAssigned'))) {
    return (
      <div className="min-h-screen flex flex-col">
        <AppTopNav active="jobs" />
        <div className="flex-1">
          <div className="max-w-6xl mx-auto px-4 py-6">
            <h1 className="text-xl font-semibold">Client Portal (Proxy)</h1>
            <div className="mt-4 rounded-xl bg-white border border-black/5 p-6 text-sm text-red-600">FORBIDDEN</div>
          </div>
        </div>
      </div>
    );
  }

  const canViewAll = hasPermission(user, 'proxy', 'viewAll');
  const canSecretaryUpdate = hasPermission(user, 'secretary', 'update');
  const db = await readDb();

  const visibleClientIds = (() => {
    if (canViewAll) return null;

    const assignedJobId = new Set(
      db.tasks
        .filter((t) => (t as any).assigneeUserId === user.id)
        .map((t) => String((t as any).jobId ?? ''))
        .filter(Boolean),
    );

    const ids = new Set<string>();
    for (const j of db.jobs) {
      if (!j.clientId) continue;
      const assigned =
        j.managerUserId === user.id ||
        (j as any).staffUserId === user.id ||
        (j as any).createdByUserId === user.id ||
        assignedJobId.has(j.id);
      if (assigned) ids.add(j.clientId);
    }
    return ids;
  })();

  const companies: ProxyHomeCompanyRow[] = db.clients
    .filter((c) => !c.deletedAt)
    .filter((c) => (visibleClientIds ? visibleClientIds.has(c.id) : true))
    .map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      companyRegistrationNo: c.companyRegistrationNo,
      entityStatus: (c as any).entityStatus,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const labelForCompanyUpdateType = (t: string) => {
    if (t === 'CHANGE_COMPANY_NAME') return 'Change of Company Name';
    if (t === 'CHANGE_FINANCIAL_YEAR_END') return 'Change of Financial Year End (FYE)';
    if (t === 'CHANGE_REGISTERED_OFFICE_ADDRESS') return 'Change of Registered Office Address';
    if (t === 'CHANGE_BUSINESS_ACTIVITIES') return 'Change of Business Activities';
    if (t === 'CHANGE_SECRETARY') return 'Change of Secretary';
    if (t === 'TRANSFER_COMPANY_SECRETARY') return 'Transfer of Company Secretary';
    return 'Company Update';
  };

  const labelForSecretaryServiceType = (t: string) => {
    if (t === 'DIRECTOR_CHANGE') return 'Change of Director';
    if (t === 'RORC_DECLARATION') return 'RORC Declaration';
    if (t === 'ANNUAL_GENERAL_MEETING') return 'Annual General Meeting';
    return labelForCompanyUpdateType(t);
  };

  const userById = new Map(db.users.map((u) => [u.id, u]));
  const auditLogs = Array.isArray((db as any).auditLogs) ? ((db as any).auditLogs as Array<any>) : [];
  const shareTransferCreateLogById = new Map<string, any>();
  for (const l of auditLogs) {
    if (l?.area !== 'secretary') continue;
    if (l?.action !== 'create_share_transfer') continue;
    if (l?.entityType !== 'share_transfer') continue;
    if (!l?.entityId) continue;
    if (!shareTransferCreateLogById.has(l.entityId) || String(l.createdAt ?? '') > String(shareTransferCreateLogById.get(l.entityId)?.createdAt ?? '')) {
      shareTransferCreateLogById.set(l.entityId, l);
    }
  }

  const directorChangeById = new Map((db.directorChangeRequests ?? []).map((r) => [r.id, r]));
  const rorcById = new Map((db.rorcDeclarationRequests ?? []).map((r) => [r.id, r]));
  const agmById = new Map((db.annualGeneralMeetingRequests ?? []).map((r) => [r.id, r]));

  const rdrs = Array.isArray((db as any).representativeDesignationRequests)
    ? (((db as any).representativeDesignationRequests ?? []) as Array<any>)
    : [];
  const partyById = new Map(db.parties.map((p) => [p.id, p]));
  const clientById = new Map(db.clients.map((c) => [c.id, c]));

  const proxySubmittedRecords: ProxySubmittedRecordRow[] = (() => {
    const allowedClientIds = visibleClientIds ?? null;
    const secApps = buildSecretaryServiceApplications(db, allowedClientIds)
      .filter((r) => r.status !== 'DRAFT')
      .map((r) => {
        if (r.source.kind === 'COMPANY_UPDATE_REQUEST') {
          const req = (db.companyUpdateRequests ?? []).find((x) => x.id === r.source.id) ?? null;
          const createdBy = req?.createdByUserId ? userById.get(req.createdByUserId) ?? null : null;
          if (!createdBy) return null;
          if (!r.viaProxy) return null;
          const canDelete =
            canSecretaryUpdate &&
            req?.createdByUserId === user.id &&
            !['REJECTED', 'COMPLETE'].includes(String(req?.status ?? ''));
          return {
            id: `CUR-${r.source.id}`,
            typeLabel: labelForCompanyUpdateType(r.type),
            companyId: r.companyId,
            companyName: r.companyName,
            applicationDate: r.applicationDate,
            editDate: r.editDate,
            status: r.status,
            createdByName: createdBy.name,
            detailsHref: `/corporate-secretary/applications/company-update/${encodeURIComponent(r.source.id)}`,
            deleteUrl: canDelete
              ? `/api/secretary/companies/${encodeURIComponent(r.companyId)}/company-update-requests/${encodeURIComponent(r.source.id)}`
              : undefined,
          } satisfies ProxySubmittedRecordRow;
        }

        if (r.source.kind === 'SHARE_TRANSFER') {
          const log = shareTransferCreateLogById.get(r.source.id) ?? null;
          if (!log || log.actorRole === 'client') return null;
          const canDelete =
            canSecretaryUpdate &&
            String(log.actorUserId ?? '') === user.id &&
            !['APPROVED', 'REJECTED', 'APPLIED'].includes(String((db.shareTransfers.find((t) => t.id === r.source.id) as any)?.status ?? ''));
          return {
            id: `ST-${r.source.id}`,
            typeLabel: 'Transfer of Shares',
            companyId: r.companyId,
            companyName: r.companyName,
            applicationDate: r.applicationDate,
            editDate: r.editDate,
            status: r.status,
            createdByName: String(log.actorName ?? ''),
            detailsHref: `/corporate-secretary/applications/share-transfer/${encodeURIComponent(r.source.id)}`,
            deleteUrl: canDelete ? `/api/secretary/share-transfers/${encodeURIComponent(r.source.id)}` : undefined,
          } satisfies ProxySubmittedRecordRow;
        }

        if (r.source.kind === 'DIRECTOR_CHANGE_REQUEST') {
          const req = directorChangeById.get(r.source.id) ?? null;
          const createdBy = req?.createdByUserId ? userById.get(req.createdByUserId) ?? null : null;
          if (!createdBy || createdBy.role === 'client') return null;
          const canDelete =
            canSecretaryUpdate &&
            req?.createdByUserId === user.id &&
            !['REJECTED', 'APPROVED'].includes(String(req?.status ?? ''));
          return {
            id: `DCR-${r.source.id}`,
            typeLabel: labelForSecretaryServiceType(r.type),
            companyId: r.companyId,
            companyName: r.companyName,
            applicationDate: r.applicationDate,
            editDate: r.editDate,
            status: r.status,
            createdByName: createdBy.name,
            detailsHref: `/corporate-secretary/applications/director-change/${encodeURIComponent(r.source.id)}`,
            deleteUrl: canDelete
              ? `/api/secretary/companies/${encodeURIComponent(r.companyId)}/director-change-requests/${encodeURIComponent(r.source.id)}`
              : undefined,
          } satisfies ProxySubmittedRecordRow;
        }

        if (r.source.kind === 'RORC_DECLARATION_REQUEST') {
          const req = rorcById.get(r.source.id) ?? null;
          const createdBy = req?.createdByUserId ? userById.get(req.createdByUserId) ?? null : null;
          if (!createdBy || createdBy.role === 'client') return null;
          const canDelete =
            canSecretaryUpdate &&
            req?.createdByUserId === user.id &&
            !['REJECTED', 'COMPLETE'].includes(String(req?.status ?? ''));
          return {
            id: `RORC-${r.source.id}`,
            typeLabel: labelForSecretaryServiceType(r.type),
            companyId: r.companyId,
            companyName: r.companyName,
            applicationDate: r.applicationDate,
            editDate: r.editDate,
            status: r.status,
            createdByName: createdBy.name,
            detailsHref: `/corporate-secretary/applications/rorc/${encodeURIComponent(r.source.id)}`,
            deleteUrl: canDelete
              ? `/api/secretary/companies/${encodeURIComponent(r.companyId)}/rorc-declaration-requests/${encodeURIComponent(r.source.id)}`
              : undefined,
          } satisfies ProxySubmittedRecordRow;
        }

        if (r.source.kind === 'ANNUAL_GENERAL_MEETING_REQUEST') {
          const req = agmById.get(r.source.id) ?? null;
          const createdBy = req?.createdByUserId ? userById.get(req.createdByUserId) ?? null : null;
          if (!createdBy || createdBy.role === 'client') return null;
          const canDelete =
            canSecretaryUpdate &&
            req?.createdByUserId === user.id &&
            !['REJECTED', 'COMPLETE'].includes(String(req?.status ?? ''));
          return {
            id: `AGM-${r.source.id}`,
            typeLabel: labelForSecretaryServiceType(r.type),
            companyId: r.companyId,
            companyName: r.companyName,
            applicationDate: r.applicationDate,
            editDate: r.editDate,
            status: r.status,
            createdByName: createdBy.name,
            detailsHref: `/corporate-secretary/applications/agm/${encodeURIComponent(r.source.id)}`,
            deleteUrl: canDelete
              ? `/api/secretary/companies/${encodeURIComponent(r.companyId)}/annual-general-meeting-requests/${encodeURIComponent(r.source.id)}`
              : undefined,
          } satisfies ProxySubmittedRecordRow;
        }

        return null;
      })
      .filter(Boolean) as ProxySubmittedRecordRow[];

    const rdrRows: ProxySubmittedRecordRow[] = rdrs
      .filter((r) => r && r.triggerType === 'MANUAL_MAINTENANCE')
      .map((r) => {
        const companyParty = partyById.get(String(r.companyPartyId ?? '')) as any;
        const clientId = companyParty && companyParty.type === 'COMPANY' ? String(companyParty.clientId ?? '').trim() : '';
        if (!clientId) return null;
        if (allowedClientIds && !allowedClientIds.has(clientId)) return null;
        const c = clientById.get(clientId) as any;
        if (!c || c.deletedAt) return null;
        const createdBy = r.createdByUserId ? (userById.get(String(r.createdByUserId)) ?? null) : null;
        const canDelete =
          canSecretaryUpdate &&
          String(r.status ?? '') === 'SIGNING' &&
          String(r.createdByUserId ?? '') === user.id;
        return {
          id: `RDR-${String(r.id ?? '')}`,
          typeLabel: 'Appointment of (GLOBAL) Corporate Representative',
          companyId: c.id,
          companyName: c.name,
          applicationDate: String(r.createdAt ?? ''),
          editDate: String(r.updatedAt ?? r.createdAt ?? ''),
          status: String(r.status ?? ''),
          createdByName: createdBy?.name ?? '-',
          detailsHref: `/corporate-secretary/applications/corporate-representative/${encodeURIComponent(String(r.id ?? ''))}`,
          deleteUrl: canDelete
            ? `/api/secretary/companies/${encodeURIComponent(c.id)}/corporate-representative/${encodeURIComponent(String(r.id ?? ''))}`
            : undefined,
        } satisfies ProxySubmittedRecordRow;
      })
      .filter(Boolean) as ProxySubmittedRecordRow[];

    const all = [...secApps, ...rdrRows];
    all.sort((a, b) => (b.editDate ?? '').localeCompare(a.editDate ?? '') || (b.applicationDate ?? '').localeCompare(a.applicationDate ?? ''));
    return all;
  })();

  return (
    <div className="min-h-screen flex flex-col">
      <AppTopNav active="proxy" />
      <div className="flex-1">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <h1 className="text-xl font-semibold">Client Portal (Proxy)</h1>
          <ProxyHomeClient companies={companies} records={proxySubmittedRecords} />
        </div>
      </div>
    </div>
  );
}
