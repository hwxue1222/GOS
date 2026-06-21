import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import UserMenuClient from '@/components/UserMenuClient';
import { canManageTeam, hasPermission } from '@/lib/permissions';
import LanguageToggleClient from '@/components/LanguageToggleClient';
import { tServer } from '@/lib/i18n';
import { getLangFromCookies } from '@/lib/i18n.server';
import { readDb } from '@/lib/db';
import FrontTopNavClient from '@/components/FrontTopNavClient';

type Props = {
  active:
    | 'jobs'
    | 'clients'
    | 'invoices'
    | 'reports'
    | 'secretary'
    | 'contracts'
    | 'proxy'
    | 'dashboard'
    | 'incorporation'
    | 'corporate-secretary';
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

  if (user.role === 'client') {
    const db = await readDb();
    const emailKey = user.email.trim().toLowerCase();
    const partyById = new Map(db.parties.map((p) => [p.id, p]));
    const personById = new Map(db.persons.map((p) => [p.id, p]));
    const allowed = new Set<string>();
    for (const r of db.clientPartyRoles) {
      if (r.role !== 'DIRECTOR' || r.resignationDate) continue;
      const party = partyById.get(r.partyId);
      if (!party || party.type !== 'PERSON' || !party.personId) continue;
      const person = personById.get(party.personId);
      if (!person) continue;
      if ((person.email ?? '').trim().toLowerCase() !== emailKey) continue;
      allowed.add(r.clientId);
    }
    const companies = db.clients
      .filter((c) => !c.deletedAt)
      .filter((c) => allowed.has(c.id))
      .map((c) => ({
        id: c.id,
        name: c.name,
        code: c.code,
        isStruckOff: Boolean(c.isStruckOff || (c.entityStatus ?? '').toLowerCase().includes('struck off')),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const frontActive: 'dashboard' | 'incorporation' | 'corporate-secretary' =
      active === 'incorporation'
        ? 'incorporation'
        : active === 'corporate-secretary' || active === 'secretary'
          ? 'corporate-secretary'
          : 'dashboard';

    return <FrontTopNavClient active={frontActive} user={user} companies={companies} />;
  }

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
            {hasPermission(user, 'proxy', 'viewAll') || hasPermission(user, 'proxy', 'viewAssigned') ? (
              <NavLink href="/proxy" active={active === 'proxy'}>
                {tServer(lang, 'nav.proxy')}
              </NavLink>
            ) : null}
            <NavLink href="/invoices" active={active === 'invoices'}>
              {tServer(lang, 'nav.invoices')}
            </NavLink>
            <NavLink href="/contracts" active={active === 'contracts'}>
              {tServer(lang, 'nav.contracts')}
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
