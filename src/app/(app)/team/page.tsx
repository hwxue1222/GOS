import AppTopNav from '@/components/AppTopNav';
import { getCurrentUser } from '@/lib/auth';
import TeamClient from '@/app/(app)/team/ui/TeamClient';
import { listUsers } from '@/lib/db';

export default async function TeamPage() {
  const me = await getCurrentUser();
  const users = me?.role === 'owner' ? await listUsers() : [];
  const safeUsers = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    position: u.position,
    role: u.role,
    permissions: u.permissions,
  }));
  const staffRows = safeUsers.map((u) => ({ ...u, tasksOverdue: 0 }));

  return (
    <div className="min-h-screen flex flex-col">
      <AppTopNav active="jobs" />
      {me?.role === 'owner' ? (
        <TeamClient initialUsers={staffRows} />
      ) : (
        <div className="flex-1">
          <div className="max-w-6xl mx-auto px-4 py-6">
            <h1 className="text-xl font-semibold">Team</h1>
            <div className="mt-4 rounded-xl bg-white border border-black/5 p-6 text-sm text-red-600">
              FORBIDDEN
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
