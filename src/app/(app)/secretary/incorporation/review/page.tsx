import AppTopNav from '@/components/AppTopNav';
import { getCurrentUser } from '@/lib/auth';
import { listIncorporationApplications } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';
import SecretaryIncorporationReviewClient from '@/app/(app)/secretary/incorporation/review/ui/SecretaryIncorporationReviewClient';

export default async function SecretaryIncorporationReviewPage() {
  const me = await getCurrentUser();
  if (!me) return null;

  if (me.role === 'client') {
    return (
      <div className="min-h-screen flex flex-col">
        <AppTopNav active="secretary" />
        <div className="flex-1">
          <div className="max-w-6xl mx-auto px-4 py-6">
            <div className="rounded-xl bg-white border border-black/5 p-6 text-sm text-red-600">FORBIDDEN</div>
          </div>
        </div>
      </div>
    );
  }
  if (!hasPermission(me, 'secretary', 'viewAll') && !hasPermission(me, 'secretary', 'viewAssigned')) {
    return (
      <div className="min-h-screen flex flex-col">
        <AppTopNav active="secretary" />
        <div className="flex-1">
          <div className="max-w-6xl mx-auto px-4 py-6">
            <div className="rounded-xl bg-white border border-black/5 p-6 text-sm text-red-600">FORBIDDEN</div>
          </div>
        </div>
      </div>
    );
  }
  if (!hasPermission(me, 'secretary', 'update')) {
    return (
      <div className="min-h-screen flex flex-col">
        <AppTopNav active="secretary" />
        <div className="flex-1">
          <div className="max-w-6xl mx-auto px-4 py-6">
            <div className="rounded-xl bg-white border border-black/5 p-6 text-sm text-red-600">FORBIDDEN</div>
          </div>
        </div>
      </div>
    );
  }

  const apps = await listIncorporationApplications();
  const rows = apps
    .filter((a) => a.status === 'SUBMITTED' || a.status === 'PROCESSING' || a.status === 'NEED_MORE_INFO')
    .sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt))
    .map((a) => ({
      applicationId: a.id,
      type: a.type,
      companyName:
        a.type === 'TRANSFER_COMPANY_SECRETARY'
          ? String(a.companyName ?? '').trim() || (a.companyId ? a.companyId : '-')
          : String(a.companyName ?? '').trim() || (typeof a.payload.companyName === 'string' ? String(a.payload.companyName) : '-'),
      status: a.status,
      applicationDate: (a.submittedAt ?? a.createdAt) as string,
      editDate: (a.updatedAt ?? a.createdAt) as string,
    }));

  return (
    <div className="min-h-screen flex flex-col">
      <AppTopNav active="secretary" />
      <div className="flex-1">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <h1 className="text-xl font-semibold">Incorporation Review</h1>
          <div className="mt-1 text-sm text-black/60">Submitted / processing applications</div>
          <div className="mt-4">
            <SecretaryIncorporationReviewClient rows={rows} />
          </div>
        </div>
      </div>
    </div>
  );
}

