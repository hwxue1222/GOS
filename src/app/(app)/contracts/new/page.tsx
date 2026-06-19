import AppTopNav from '@/components/AppTopNav';
import ContractNewClient from '@/app/(app)/contracts/ui/ContractNewClient';
import { getCurrentUser } from '@/lib/auth';
import { listContractTemplates } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';

export default async function NewContractPage() {
  const me = await getCurrentUser();
  if (!me) return null;
  if (!hasPermission(me, 'contracts', 'create')) {
    return (
      <div className="min-h-screen flex flex-col">
        <AppTopNav active="contracts" />
        <div className="flex-1">
          <div className="max-w-6xl mx-auto px-4 py-6">
            <div className="rounded-xl bg-white border border-black/5 p-6 text-sm text-red-600">FORBIDDEN</div>
          </div>
        </div>
      </div>
    );
  }

  const templates = await listContractTemplates();
  if (templates.length === 0) {
    return (
      <div className="min-h-screen flex flex-col">
        <AppTopNav active="contracts" />
        <div className="flex-1">
          <div className="max-w-6xl mx-auto px-4 py-6">
            <div className="rounded-xl bg-white border border-black/5 p-6 text-sm text-red-600">NO_TEMPLATES</div>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="min-h-screen flex flex-col">
      <AppTopNav active="contracts" />
      <div className="flex-1">
        <ContractNewClient initialTemplates={templates} />
      </div>
    </div>
  );
}
