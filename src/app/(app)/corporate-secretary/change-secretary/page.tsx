import AppTopNav from '@/components/AppTopNav';
import { getCurrentUser } from '@/lib/auth';
import ChangeSecretaryClient from '@/app/(app)/corporate-secretary/change-secretary/ui/ChangeSecretaryClient';

export default async function ChangeSecretaryPage() {
  const me = await getCurrentUser();
  if (!me) return null;

  return (
    <div className="min-h-screen flex flex-col">
      <AppTopNav active="corporate-secretary" />
      <div className="flex-1 relative">
        <ChangeSecretaryClient />
      </div>
    </div>
  );
}
