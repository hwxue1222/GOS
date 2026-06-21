import { redirect } from 'next/navigation';

import AppTopNav from '@/components/AppTopNav';
import { getCurrentUser } from '@/lib/auth';

import TransferSecretaryApplicationClient from '@/app/(app)/incorporation/ui/TransferSecretaryApplicationClient';

export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect('/portal/login');

  return (
    <div className="min-h-screen flex flex-col">
      <AppTopNav active="incorporation" />
      <div className="flex-1">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <TransferSecretaryApplicationClient />
        </div>
      </div>
    </div>
  );
}
