import AppTopNav from '@/components/AppTopNav';
import SettingsClient from '@/app/(app)/settings/ui/SettingsClient';
import { getCurrentUser } from '@/lib/auth';

export default async function SettingsPage() {
  const me = await getCurrentUser();
  if (!me) return null;

  return (
    <div className="min-h-screen flex flex-col">
      <AppTopNav active="jobs" />
      <div className="flex-1">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <h1 className="text-xl font-semibold">Settings</h1>
          <SettingsClient me={{ id: me.id, name: me.name, email: me.email, role: me.role }} />
        </div>
      </div>
    </div>
  );
}
