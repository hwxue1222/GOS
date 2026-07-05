import AppTopNav from '@/components/AppTopNav';
import { getCurrentUser } from '@/lib/auth';
import AppointCorporateRepresentativeClient from '@/app/(app)/corporate-secretary/appoint-corporate-representative/ui/AppointCorporateRepresentativeClient';

export default async function AppointCorporateRepresentativePage() {
  const me = await getCurrentUser();
  if (!me) return null;

  return (
    <div className="min-h-screen flex flex-col">
      <AppTopNav active="corporate-secretary" />
      <div className="flex-1 relative">
        <AppointCorporateRepresentativeClient />
      </div>
    </div>
  );
}

