import AppTopNav from '@/components/AppTopNav';
import ContractDetailClient from '@/app/(app)/contracts/ui/ContractDetailClient';
import { getCurrentUser } from '@/lib/auth';
import { findContractById, listContractTemplates, readDb } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';

export default async function ContractDetailPage({ params }: { params: Promise<{ contractId: string }> }) {
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

  const { contractId } = await params;
  const contract = await findContractById(contractId);
  if (!contract) {
    return (
      <div className="min-h-screen flex flex-col">
        <AppTopNav active="contracts" />
        <div className="flex-1">
          <div className="max-w-6xl mx-auto px-4 py-6">
            <div className="rounded-xl bg-white border border-black/5 p-6 text-sm text-red-600">NOT_FOUND</div>
          </div>
        </div>
      </div>
    );
  }
  if (!canViewAll && contract.createdByUserId !== me.id) {
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

  const [templates, db] = await Promise.all([listContractTemplates(), readDb()]);
  const template = templates.find((t) => t.id === contract.templateId) ?? null;
  const requests = contract.packetId ? db.signatureRequests.filter((r) => r.packetId === contract.packetId) : [];
  const doc = contract.documentId ? db.documents.find((d) => d.id === contract.documentId) ?? null : null;

  return (
    <div className="min-h-screen flex flex-col">
      <AppTopNav active="contracts" />
      <div className="flex-1">
        <ContractDetailClient
          initialContract={contract}
          templateName={template?.name ?? '-'}
          templateHtml={template?.templateHtml ?? ''}
          documentSha256={doc?.sha256 ?? ''}
          signatureRequests={requests.map((r) => ({ email: r.email, status: r.status, signedAt: r.signedAt }))}
        />
      </div>
    </div>
  );
}

