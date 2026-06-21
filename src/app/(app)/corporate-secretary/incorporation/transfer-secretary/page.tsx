import AppTopNav from '@/components/AppTopNav';
import { getCurrentUser } from '@/lib/auth';

import ModalShell from '@/app/(app)/corporate-secretary/ui/ModalShell';
import TransferSecretaryWizardClient from '@/app/(app)/incorporation/ui/transfer-secretary/TransferSecretaryWizardClient';

export default async function ProxyTransferSecretaryModalPage() {
  const me = await getCurrentUser();
  if (!me) return null;

  return (
    <div className="min-h-screen flex flex-col">
      <AppTopNav active="corporate-secretary" />
      <div className="flex-1 relative">
        <ModalShell title="Transfer of Company Secretary" closeHref="/corporate-secretary/applications">
          <TransferSecretaryWizardClient mode="create" />
        </ModalShell>
      </div>
    </div>
  );
}
