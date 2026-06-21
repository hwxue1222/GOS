import AppTopNav from '@/components/AppTopNav';
import { getCurrentUser } from '@/lib/auth';

import ModalShell from '@/app/(app)/corporate-secretary/ui/ModalShell';
import RegisterCompanyApplicationClient from '@/app/(app)/incorporation/ui/RegisterCompanyApplicationClient';

export default async function ProxyRegisterCompanyModalPage() {
  const me = await getCurrentUser();
  if (!me) return null;

  return (
    <div className="min-h-screen flex flex-col">
      <AppTopNav active="proxy" />
      <div className="flex-1 relative">
        <ModalShell title="Register Company" closeHref="/dashboard">
          <RegisterCompanyApplicationClient />
        </ModalShell>
      </div>
    </div>
  );
}

