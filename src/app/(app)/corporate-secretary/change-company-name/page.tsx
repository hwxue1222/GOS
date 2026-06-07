import AppTopNav from '@/components/AppTopNav';
import { getCurrentUser } from '@/lib/auth';
import ChangeCompanyNameClient from '@/app/(app)/corporate-secretary/change-company-name/ui/ChangeCompanyNameClient';

export default async function ChangeCompanyNamePage() {
  const me = await getCurrentUser();
  if (!me) return null;

  return (
    <div className="min-h-screen flex flex-col">
      <AppTopNav active="corporate-secretary" />
      <div className="flex-1 relative">
        <ChangeCompanyNameClient />
      </div>
    </div>
  );
}
