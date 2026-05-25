import AppTopNav from '@/components/AppTopNav';
import InvoiceDetailClient from '@/app/(app)/invoices/[invoiceId]/ui/InvoiceDetailClient';
import { getCurrentUser } from '@/lib/auth';
import { findInvoiceById, findJobById, listClients, listUsers } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';

export default async function InvoiceDetailPage({ params }: { params: Promise<{ invoiceId: string }> }) {
  const me = await getCurrentUser();
  if (!me) return null;
  if (!hasPermission(me, 'invoices', 'viewAll')) {
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

  const { invoiceId } = await params;
  const invoice = await findInvoiceById(invoiceId);
  if (!invoice || invoice.deletedAt) {
    return (
      <div className="min-h-screen flex flex-col">
        <AppTopNav active="invoices" />
        <div className="flex-1">
          <div className="max-w-6xl mx-auto px-4 py-6">
            <div className="rounded-xl bg-white border border-black/5 p-6 text-sm text-red-600">NOT FOUND</div>
          </div>
        </div>
      </div>
    );
  }

  const [clientsAll, usersAll] = await Promise.all([listClients(), listUsers()]);
  const clients = clientsAll.filter((c) => !c.deletedAt).map((c) => ({ id: c.id, code: c.code, name: c.name }));
  const createdByName = usersAll.find((u) => u.id === invoice.createdByUserId)?.name ?? '-';
  const job = invoice.jobId ? await findJobById(invoice.jobId) : null;

  return (
    <div className="min-h-screen flex flex-col">
      <AppTopNav active="invoices" />
      <InvoiceDetailClient
        initialMe={me}
        initialInvoice={invoice}
        initialClients={clients}
        createdByName={createdByName}
        initialJob={job ? { id: job.id, name: job.name } : null}
      />
    </div>
  );
}
