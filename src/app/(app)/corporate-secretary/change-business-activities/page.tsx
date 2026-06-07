import AppTopNav from '@/components/AppTopNav';
import { getCurrentUser } from '@/lib/auth';
import ChangeBusinessActivitiesClient from '@/app/(app)/corporate-secretary/change-business-activities/ui/ChangeBusinessActivitiesClient';

export default async function ChangeBusinessActivitiesPage() {
  const me = await getCurrentUser();
  if (!me) return null;

  return (
    <div className="min-h-screen flex flex-col">
      <AppTopNav active="corporate-secretary" />
      <div className="flex-1 relative">
        <ChangeBusinessActivitiesClient />
      </div>
    </div>
  );
}
