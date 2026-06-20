import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getCurrentUser } from '@/lib/auth';

export default async function HomePage() {
  const h = await headers();
  const rawHost = String(h.get('x-forwarded-host') ?? h.get('host') ?? '').toLowerCase();
  const firstHost = rawHost.split(',')[0]?.trim() ?? '';
  const hostNoPort = firstHost.replace(/^https?:\/\//, '').split('/')[0]?.split(':')[0]?.trim() ?? '';
  const isFrontDomain = hostNoPort === 'bby.today' || hostNoPort === 'www.bby.today' || hostNoPort.endsWith('.bby.today');

  const user = await getCurrentUser();
  if (isFrontDomain) redirect('/portal');
  if (!user) redirect('/login');
  if (user.role === 'client') redirect('/dashboard');
  redirect('/jobs');
}
