'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { Role } from '@/lib/types';
import { useI18n } from '@/components/I18nProviderClient';

type Props = {
  user: { id: string; name: string; email: string; role: Role };
  canManageTeam: boolean;
};

export default function UserMenuClient({ user, canManageTeam }: Props) {
  const router = useRouter();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  function clearGosClientState() {
    function clearStore(store: Storage) {
      const keys: string[] = [];
      for (let i = 0; i < store.length; i += 1) {
        const k = store.key(i);
        if (k) keys.push(k);
      }
      for (const k of keys) {
        if (k.startsWith('gos.')) store.removeItem(k);
      }
    }

    try {
      clearStore(window.sessionStorage);
    } catch {}
    try {
      clearStore(window.localStorage);
    } catch {}
  }

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current) return;
      if (rootRef.current.contains(e.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    clearGosClientState();
    router.replace('/login');
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-white/10"
      >
        <div className="h-7 w-7 rounded-full bg-white/20 flex items-center justify-center text-xs">
          {user.name.slice(0, 2).toUpperCase()}
        </div>
        <div className="text-left leading-tight hidden sm:block">
          <div className="text-sm font-medium">{user.name}</div>
          <div className="text-xs opacity-70">{user.role}</div>
        </div>
        <div className="text-xs opacity-80">▾</div>
      </button>

      {open ? (
        <div className="absolute right-0 mt-2 w-56 rounded-lg border border-white/10 bg-[#1f2a33] shadow-lg overflow-hidden z-50">
          <div className="px-3 py-2 text-xs opacity-80 border-b border-white/10">
            {user.email}
          </div>
          {canManageTeam ? (
            <button
              onClick={() => {
                setOpen(false);
                router.push('/team');
              }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-white/10"
            >
              {t('menu.manageTeam')}
            </button>
          ) : null}
          <button
            onClick={() => {
              setOpen(false);
              router.push('/profile');
            }}
            className="w-full text-left px-3 py-2 text-sm hover:bg-white/10"
          >
            {t('menu.editProfile')}
          </button>
          <button
            onClick={() => {
              setOpen(false);
              router.push('/settings');
            }}
            className="w-full text-left px-3 py-2 text-sm hover:bg-white/10"
          >
            {t('menu.settings')}
          </button>
          <div className="border-t border-white/10" />
          <button onClick={signOut} className="w-full text-left px-3 py-2 text-sm hover:bg-white/10">
            {t('menu.signOut')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
