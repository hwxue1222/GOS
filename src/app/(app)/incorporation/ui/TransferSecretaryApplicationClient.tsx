'use client';

import TransferSecretaryWizardClient from '@/app/(app)/incorporation/ui/transfer-secretary/TransferSecretaryWizardClient';

export default function TransferSecretaryApplicationClient() {
  return (
    <div>
      <div className="text-lg font-semibold">Transfer of Company Secretary</div>
      <div className="mt-1 text-sm text-black/60">Please fill in the form and submit for approval.</div>
      <div className="mt-4">
        <TransferSecretaryWizardClient mode="create" />
      </div>
    </div>
  );
}

