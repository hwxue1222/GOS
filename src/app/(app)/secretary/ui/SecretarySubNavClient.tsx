'use client';

import Link from 'next/link';

type TabKey = 'companies' | 'external-companies' | 'acra-filing' | 'members';

type Props = {
  active: TabKey;
  showMembers?: boolean;
};

export default function SecretarySubNavClient({ active, showMembers }: Props) {
  const tabBase = 'rounded-lg border px-3 py-2 text-sm font-semibold';
  const tabActive = `${tabBase} bg-black text-white border-black`;
  const tabInactive = `${tabBase} bg-white border-black/10 text-black/70 hover:bg-black/[0.02]`;

  const tabs: Array<{ key: TabKey; href: string; title: string; show?: boolean }> = [
    { key: 'companies', href: '/secretary/companies', title: 'Companies' },
    { key: 'external-companies', href: '/secretary/external-companies', title: 'External Companies' },
    { key: 'acra-filing', href: '/secretary/acra-filing', title: 'ACRA Filing' },
    { key: 'members', href: '/secretary/members', title: 'Members', show: !!showMembers },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {tabs
        .filter((t) => t.show === undefined || t.show)
        .map((t) => {
          const isActive = active === t.key;
          return (
            <Link key={t.key} href={t.href} className={isActive ? tabActive : tabInactive} aria-current={isActive ? 'page' : undefined}>
              {t.title}
            </Link>
          );
        })}
    </div>
  );
}
