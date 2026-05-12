import AppTopNav from '@/components/AppTopNav';
import ProfileClient from '@/app/(app)/profile/ui/ProfileClient';
import { getCurrentUser } from '@/lib/auth';

export default async function ProfilePage() {
  const me = await getCurrentUser();
  if (!me) return null;

  return (
    <div className="min-h-screen flex flex-col">
      <AppTopNav active="jobs" />
      <div className="flex-1">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <h1 className="text-xl font-semibold">Profile</h1>
          <ProfileClient initialUser={{ id: me.id, name: me.name, email: me.email }} />
        </div>
      </div>
    </div>
  );
}
