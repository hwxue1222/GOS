import AppTopNav from '@/components/AppTopNav';
import ContractsListClient from '@/app/(app)/contracts/ui/ContractsListClient';
import { getCurrentUser } from '@/lib/auth';
import { listContracts, listContractTemplates } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';

export default async function ContractsPage() {
  const me = await getCurrentUser();
  if (!me) return null;

  const canViewAll = hasPermission(me, 'contracts', 'viewAll');
  const canViewAssigned = hasPermission(me, 'contracts', 'viewAssigned');
  if (!canViewAll && !canViewAssigned) {
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

  const [templates, contractsAll] = await Promise.all([listContractTemplates(), listContracts()]);
  const contracts = canViewAll ? contractsAll : contractsAll.filter((c) => c.createdByUserId === me.id);
  const templateNameById = new Map(templates.map((t) => [t.id, t.name] as const));

  const rows = contracts.map((c) => ({
    contract: c,
    templateName: templateNameById.get(c.templateId) ?? '-',
  }));

  return (
    <div className="min-h-screen flex flex-col">
      <AppTopNav active="contracts" />
      <div className="flex-1">
        <ContractsListClient initialRows={rows} />
      </div>
    </div>
  );
}

