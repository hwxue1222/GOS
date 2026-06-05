import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import UserMenuClient from '@/components/UserMenuClient';
import { canManageTeam } from '@/lib/permissions';
import LanguageToggleClient from '@/components/LanguageToggleClient';
import { tServer } from '@/lib/i18n';
import { getLangFromCookies } from '@/lib/i18n.server';

type Props = {
  active: 'jobs' | 'clients' | 'invoices' | 'reports' | 'secretary';
};

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={[
        'px-3 py-2 rounded-md text-sm font-medium transition-colors',
        active ? 'bg-white/15 text-white' : 'text-white/80 hover:bg-white/10 hover:text-white',
      ].join(' ')}
    >
      {children}
    </Link>
  );
}

export default async function AppTopNav({ active }: Props) {
  const user = await getCurrentUser();
  if (!user) return null;
  const lang = await getLangFromCookies();

  return (
    <header className="bg-[#23323d] text-white">
      <div className="h-14 px-4 flex items-center justify-between max-w-6xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-md bg-white/10 flex items-center justify-center font-semibold">
            G
          </div>
          <nav className="flex items-center gap-1 ml-2">
            <NavLink href="/jobs" active={active === 'jobs'}>
              {tServer(lang, 'nav.jobs')}
            </NavLink>
            <NavLink href="/clients" active={active === 'clients'}>
              {tServer(lang, 'nav.clients')}
            </NavLink>
            <NavLink href="/invoices" active={active === 'invoices'}>
              {tServer(lang, 'nav.invoices')}
            </NavLink>
            <NavLink href="/secretary/companies" active={active === 'secretary'}>
              {tServer(lang, 'nav.secretary')}
            </NavLink>
            <NavLink href="/reports" active={active === 'reports'}>
              {tServer(lang, 'nav.reports')}
            </NavLink>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <LanguageToggleClient />
          <UserMenuClient user={user} canManageTeam={canManageTeam(user)} />
        </div>
      </div>
    </header>
  );
}
