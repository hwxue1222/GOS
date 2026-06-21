import AppTopNav from '@/components/AppTopNav';
import { getCurrentUser } from '@/lib/auth';
import { readDb } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';
import ProxyCompanyPickerClient from '@/app/(app)/proxy/ui/ProxyCompanyPickerClient';

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

  const companies = db.clients
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

  return (
    <div className="min-h-screen flex flex-col">
      <AppTopNav active="proxy" />
      <div className="flex-1">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <h1 className="text-xl font-semibold">Client Portal (Proxy)</h1>
          <ProxyCompanyPickerClient companies={companies} />
        </div>
      </div>
    </div>
  );
}
