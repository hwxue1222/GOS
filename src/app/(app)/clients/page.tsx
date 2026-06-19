import AppTopNav from '@/components/AppTopNav';
import ClientsClient from '@/app/(app)/clients/ui/ClientsClient';
import { getCurrentUser } from '@/lib/auth';
import { listClients, listJobs } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';

function isScExternalCode(code: string) {
  return /^SC\d+$/i.test(String(code ?? '').trim());
}

export default async function ClientsPage() {
  const me = await getCurrentUser();
  if (!me) return null;

  const canViewAll = hasPermission(me, 'clients', 'viewAll');
  const canViewAssigned = hasPermission(me, 'clients', 'viewAssigned');
  if (!canViewAll && !canViewAssigned) {
    return (
      <div className="min-h-screen flex flex-col">
        <AppTopNav active="clients" />
        <div className="flex-1">
          <div className="max-w-6xl mx-auto px-4 py-6">
            <div className="rounded-xl bg-white border border-black/5 p-6 text-sm text-red-600">FORBIDDEN</div>
          </div>
        </div>
      </div>
    );
  }

  const clientsAll = await listClients();
  let clients = clientsAll.filter((c) => !c.deletedAt).filter((c) => !isScExternalCode(c.code));
  if (!canViewAll) {
    const js = await listJobs();
    const assignedClientIds = new Set(
      js.filter((j) => j.managerUserId === me.id || j.staffUserId === me.id).map((j) => j.clientId),
    );
    clients = clients.filter((c) => assignedClientIds.has(c.id));
  }

  return (
    <div className="min-h-screen flex flex-col">
      <AppTopNav active="clients" />
      <ClientsClient initialMe={me} initialClients={clients} />
    </div>
  );
}
