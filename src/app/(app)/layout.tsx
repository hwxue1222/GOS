import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1 bg-[#f4f6f8] text-[#0b1220]">{children}</main>
    </div>
  );
}
