import AppTopNav from '@/components/AppTopNav';
import { getCurrentUser } from '@/lib/auth';
import AuditLogClient from '@/app/(app)/reports/audit-log/ui/AuditLogClient';

export default async function AuditLogPage() {
  const me = await getCurrentUser();
  if (!me) return null;
  if (me.role !== 'owner') {
    return (
      <div className="min-h-screen flex flex-col">
        <AppTopNav active="reports" />
        <div className="flex-1">
          <div className="max-w-6xl mx-auto px-4 py-6">
            <div className="rounded-xl bg-white border border-black/5 p-6 text-sm text-red-600">FORBIDDEN</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <AppTopNav active="reports" />
      <div className="flex-1">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <h1 className="text-xl font-semibold">Audit Log</h1>
          <div className="mt-4 rounded-xl bg-white border border-black/5 p-4">
            <AuditLogClient />
          </div>
        </div>
      </div>
    </div>
  );
}

