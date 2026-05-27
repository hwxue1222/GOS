import AppTopNav from '@/components/AppTopNav';
import InvoicesClient from '@/app/(app)/invoices/ui/InvoicesClient';
import { getCurrentUser } from '@/lib/auth';
import { listClients, listInvoices, listUsers } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';

export default async function InvoicesPage() {
  const me = await getCurrentUser();
  if (!me) return null;

  const canViewAll = hasPermission(me, 'invoices', 'viewAll');
  if (!canViewAll) {
    return (
      <div className="min-h-screen flex flex-col">
        <AppTopNav active="invoices" />
        <div className="flex-1">
          <div className="max-w-6xl mx-auto px-4 py-6">
            <div className="rounded-xl bg-white border border-black/5 p-6 text-sm text-red-600">FORBIDDEN</div>
          </div>
        </div>
      </div>
    );
  }

  const [clientsAll, invoicesAll, usersAll] = await Promise.all([listClients(), listInvoices(), listUsers()]);
  const clients = clientsAll.filter((c) => !c.deletedAt).map((c) => ({ id: c.id, code: c.code, name: c.name }));
  const nameById = new Map(usersAll.map((u) => [u.id, u.name]));

  const invoices = invoicesAll
    .filter((x) => !x.deletedAt)
    .map((inv) => {
      const billTo = inv.billTo;
      const client = billTo.type === 'CLIENT' ? clients.find((c) => c.id === billTo.clientId) ?? null : null;
      return {
        invoice: inv,
        client,
        createdByName: nameById.get(inv.createdByUserId) ?? '-',
      };
    });

  return (
    <div className="min-h-screen flex flex-col">
      <AppTopNav active="invoices" />
      <InvoicesClient initialMe={me} initialInvoices={invoices} initialClients={clients} />
    </div>
  );
}
