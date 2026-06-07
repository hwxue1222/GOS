import AppTopNav from '@/components/AppTopNav';
import { getCurrentUser } from '@/lib/auth';
import ChangeFyeClient from '@/app/(app)/corporate-secretary/change-fye/ui/ChangeFyeClient';

export default async function ChangeFyePage() {
  const me = await getCurrentUser();
  if (!me) return null;

  return (
    <div className="min-h-screen flex flex-col">
      <AppTopNav active="corporate-secretary" />
      <div className="flex-1 relative">
        <ChangeFyeClient />
      </div>
    </div>
  );
}
