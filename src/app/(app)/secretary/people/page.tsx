import AppTopNav from '@/components/AppTopNav';
import PeopleClient from '@/app/(app)/secretary/people/ui/PeopleClient';
import { getCurrentUser } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';

export default async function SecretaryPeoplePage() {
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

  return (
    <div className="min-h-screen flex flex-col">
      <AppTopNav active="secretary" />
      <div className="flex-1">
        <PeopleClient />
      </div>
    </div>
  );
}
