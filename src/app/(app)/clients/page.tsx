import AppTopNav from '@/components/AppTopNav';
import ClientsClient from '@/app/(app)/clients/ui/ClientsClient';
import { getCurrentUser } from '@/lib/auth';
import { listClients, listJobs } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';

function isScExternalCode(code: string) {
  return /^SC\d+$/i.test(String(code ?? '').trim());
}

function parseClientCode(code: string) {
  const raw = String(code ?? '').trim();
  const m = raw.match(/^([A-Za-z]+)?(\d+)?([A-Za-z]+)?$/);
  const prefix = String(m?.[1] ?? '').toUpperCase();
  const num = m?.[2] ? Number.parseInt(m[2], 10) : -1;
  const suffix = String(m?.[3] ?? '').toUpperCase();
  return { prefix, num: Number.isFinite(num) ? num : -1, suffix, rawUpper: raw.toUpperCase() };
}

function prefixPriority(prefix: string) {
  const p = String(prefix ?? '').toUpperCase();
  if (p.startsWith('E')) return 0;
  if (p.startsWith('D')) return 1;
  return 2;
}

function compareClientCodeDesc(a: { code: string }, b: { code: string }) {
  const pa = parseClientCode(a.code);
  const pb = parseClientCode(b.code);

  const priA = prefixPriority(pa.prefix);
  const priB = prefixPriority(pb.prefix);
  if (priA !== priB) return priA - priB;

  const prefixCmp = pa.prefix.localeCompare(pb.prefix);
  if (prefixCmp) return prefixCmp;
  if (pa.num !== pb.num) return pb.num - pa.num;
  const suffixCmp = pa.suffix.localeCompare(pb.suffix);
  if (suffixCmp) return suffixCmp;
  return pa.rawUpper.localeCompare(pb.rawUpper);
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

  clients = clients.slice().sort(compareClientCodeDesc);

  return (
    <div className="min-h-screen flex flex-col">
      <AppTopNav active="clients" />
      <ClientsClient initialMe={me} initialClients={clients} />
    </div>
  );
}
