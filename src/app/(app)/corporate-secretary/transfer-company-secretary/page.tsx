import AppTopNav from '@/components/AppTopNav';
import { getCurrentUser } from '@/lib/auth';
import TransferCompanySecretaryClient from '@/app/(app)/corporate-secretary/transfer-company-secretary/ui/TransferCompanySecretaryClient';

export default async function TransferCompanySecretaryPage() {
  const me = await getCurrentUser();
  if (!me) return null;

  return (
    <div className="min-h-screen flex flex-col">
      <AppTopNav active="corporate-secretary" />
      <div className="flex-1 relative">
        <TransferCompanySecretaryClient />
      </div>
    </div>
  );
}

