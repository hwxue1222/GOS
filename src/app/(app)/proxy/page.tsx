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

  const proxySubmittedRecords: ProxySubmittedRecordRow[] = (() => {
    const allowedClientIds = visibleClientIds ?? null;
    const secApps = buildSecretaryServiceApplications(db, allowedClientIds)
      .filter((r) => r.status !== 'DRAFT')
      .filter((r) => r.source.kind === 'COMPANY_UPDATE_REQUEST' || r.source.kind === 'SHARE_TRANSFER')
      .map((r) => {
        if (r.source.kind === 'COMPANY_UPDATE_REQUEST') {
          const req = (db.companyUpdateRequests ?? []).find((x) => x.id === r.source.id) ?? null;
          const createdBy = req?.createdByUserId ? userById.get(req.createdByUserId) ?? null : null;
          if (!createdBy) return null;
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
          } satisfies ProxySubmittedRecordRow;
        }

        const log = shareTransferCreateLogById.get(r.source.id) ?? null;
        if (!log || log.actorRole === 'client') return null;
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
        } satisfies ProxySubmittedRecordRow;
      })
      .filter(Boolean) as ProxySubmittedRecordRow[];

    secApps.sort((a, b) => (b.editDate ?? '').localeCompare(a.editDate ?? '') || (b.applicationDate ?? '').localeCompare(a.applicationDate ?? ''));
    return secApps;
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
