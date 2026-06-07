import AppTopNav from '@/components/AppTopNav';
import { getCurrentUser } from '@/lib/auth';
import ChangeAddressClient from '@/app/(app)/corporate-secretary/change-address/ui/ChangeAddressClient';

export default async function ChangeAddressPage() {
  const me = await getCurrentUser();
  if (!me) return null;

  return (
    <div className="min-h-screen flex flex-col">
      <AppTopNav active="corporate-secretary" />
      <div className="flex-1 relative">
        <ChangeAddressClient />
      </div>
    </div>
  );
}
