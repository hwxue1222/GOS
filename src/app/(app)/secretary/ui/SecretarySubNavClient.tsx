'use client';

import Link from 'next/link';

type TabKey = 'companies' | 'external-companies' | 'acra-filing' | 'members';

type Props = {
  active: TabKey;
  showMembers?: boolean;
};

export default function SecretarySubNavClient({ active, showMembers }: Props) {
  const tabBase = 'group flex flex-col gap-0.5 rounded-lg border px-3 py-2 text-left';
  const tabActive = `${tabBase} bg-black text-white border-black`;
  const tabInactive = `${tabBase} bg-white border-black/10 text-black/80 hover:bg-black/[0.02]`;
  const tabHintActive = 'text-white/80';
  const tabHintInactive = 'text-black/40 group-hover:text-black/50';

  const tabs: Array<{ key: TabKey; href: string; title: string; hint: string; show?: boolean }> = [
    { key: 'companies', href: '/secretary/companies', title: 'Companies', hint: 'Main list' },
    { key: 'external-companies', href: '/secretary/external-companies', title: 'External', hint: 'SC* only' },
    { key: 'acra-filing', href: '/secretary/acra-filing', title: 'ACRA Filing', hint: 'Queue' },
    { key: 'members', href: '/secretary/members', title: 'Members', hint: 'People' , show: !!showMembers },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {tabs
        .filter((t) => t.show === undefined || t.show)
        .map((t) => {
          const isActive = active === t.key;
          return (
            <Link key={t.key} href={t.href} className={isActive ? tabActive : tabInactive} aria-current={isActive ? 'page' : undefined}>
              <div className="text-sm font-semibold leading-5">{t.title}</div>
              <div className={`text-[11px] leading-4 ${isActive ? tabHintActive : tabHintInactive}`}>{t.hint}</div>
            </Link>
          );
        })}
    </div>
  );
}
