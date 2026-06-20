import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getCurrentUser } from '@/lib/auth';

export default async function HomePage() {
  const h = await headers();
  const host = String(h.get('x-forwarded-host') ?? h.get('host') ?? '').toLowerCase();
  const isFrontDomain = host === 'bby.today' || host.endsWith('.bby.today');

  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.role === 'client') redirect('/dashboard');
  if (isFrontDomain) redirect('/login');
  redirect('/jobs');
}
