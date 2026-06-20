import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/auth';

import TransferSecretaryApplicationClient from '@/app/(app)/incorporation/ui/TransferSecretaryApplicationClient';

export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect('/portal/login');
  if (user.role !== 'client') redirect('/jobs');

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <TransferSecretaryApplicationClient />
    </div>
  );
}
