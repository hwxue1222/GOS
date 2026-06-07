import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/auth';

export default async function PortalEntryPage() {
  const me = await getCurrentUser();
  if (!me) redirect('/portal/login');
  if (me.role === 'client') redirect('/portal/companies');
  redirect('/dashboard');
}

