import AppTopNav from '@/components/AppTopNav';
import { getCurrentUser } from '@/lib/auth';
import RorcClient from '@/app/(app)/corporate-secretary/rorc/ui/RorcClient';

export default async function RorcPage() {
  const me = await getCurrentUser();
  if (!me) return null;

  return (
    <div className="min-h-screen flex flex-col">
      <AppTopNav active="corporate-secretary" />
      <div className="flex-1 relative">
        <RorcClient />
      </div>
    </div>
  );
}
