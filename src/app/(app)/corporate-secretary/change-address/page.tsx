import AppTopNav from '@/components/AppTopNav';
import { getCurrentUser } from '@/lib/auth';

export default async function ChangeAddressPage() {
  const me = await getCurrentUser();
  if (!me) return null;

  return (
    <div className="min-h-screen flex flex-col">
      <AppTopNav active="corporate-secretary" />
      <div className="flex-1">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <h1 className="text-xl font-semibold">Change of Registered Office Address</h1>
          <div className="mt-4 rounded-xl bg-white border border-black/5 p-6 text-sm text-black/60">Coming soon.</div>
        </div>
      </div>
    </div>
  );
}

