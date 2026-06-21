import AppTopNav from '@/components/AppTopNav';
import { getCurrentUser } from '@/lib/auth';
import { readDb } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';
import ProxyShellClient from '@/app/(app)/proxy/[companyId]/ui/ProxyShellClient';

export default async function ProxyCompanyShellPage({ params }: { params: Promise<{ companyId: string }> }) {
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

  const { companyId } = await params;
  const db = await readDb();
  const company = db.clients.find((c) => c.id === companyId) ?? null;
  if (!company || company.deletedAt) {
    return (
      <div className="min-h-screen flex flex-col">
        <AppTopNav active="proxy" />
        <div className="flex-1">
          <div className="max-w-6xl mx-auto px-4 py-6">
            <h1 className="text-xl font-semibold">Client Portal (Proxy)</h1>
            <div className="mt-4 rounded-xl bg-white border border-black/5 p-6 text-sm text-red-600">NOT_FOUND</div>
          </div>
        </div>
      </div>
    );
  }

  const canViewAll = hasPermission(user, 'proxy', 'viewAll');
  if (!canViewAll) {
    const assignedJobId = new Set(
      db.tasks
        .filter((t) => (t as any).assigneeUserId === user.id)
        .map((t) => String((t as any).jobId ?? ''))
        .filter(Boolean),
    );

    const visible = db.jobs.some((j) => {
      if (j.clientId !== companyId) return false;
      const assigned =
        j.managerUserId === user.id ||
        (j as any).staffUserId === user.id ||
        (j as any).createdByUserId === user.id ||
        assignedJobId.has(j.id);
      return assigned;
    });
    if (!visible) {
      return (
        <div className="min-h-screen flex flex-col">
          <AppTopNav active="proxy" />
          <div className="flex-1">
            <div className="max-w-6xl mx-auto px-4 py-6">
              <h1 className="text-xl font-semibold">Client Portal (Proxy)</h1>
              <div className="mt-4 rounded-xl bg-white border border-black/5 p-6 text-sm text-red-600">FORBIDDEN</div>
            </div>
          </div>
        </div>
      );
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <AppTopNav active="proxy" />
      <div className="flex-1">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <h1 className="text-xl font-semibold">Client Portal (Proxy)</h1>
          <ProxyShellClient company={{ id: company.id, code: company.code, name: company.name }} />
        </div>
      </div>
    </div>
  );
}

