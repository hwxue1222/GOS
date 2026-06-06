import AppTopNav from '@/components/AppTopNav';
import { getCurrentUser } from '@/lib/auth';
import RegisterCompanyApplicationClient from '@/app/(app)/incorporation/ui/RegisterCompanyApplicationClient';

export default async function RegisterCompanyPage() {
  const me = await getCurrentUser();
  if (!me) return null;

  return (
    <div className="min-h-screen flex flex-col">
      <AppTopNav active="incorporation" />
      <div className="flex-1">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <h1 className="text-xl font-semibold">Register Company</h1>
          <div className="mt-4">
            <RegisterCompanyApplicationClient />
          </div>
        </div>
      </div>
    </div>
  );
}
