import AppTopNav from '@/components/AppTopNav';
import ClientsClient from '@/app/(app)/clients/ui/ClientsClient';
import { getCurrentUser } from '@/lib/auth';
import { listClients } from '@/lib/db';

export default async function ClientsPage() {
  const me = await getCurrentUser();
  const clients = await listClients();

  return (
    <div className="min-h-screen flex flex-col">
      <AppTopNav active="clients" />
      {me ? <ClientsClient initialMe={me} initialClients={clients} /> : null}
    </div>
  );
}
