'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { Role } from '@/lib/types';

export default function FrontUserMenuClient(props: { user: { id: string; name: string; email: string; role: Role } }) {
  const { user } = props;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

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
    router.replace('/portal/login');
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-black/5"
      >
        <div className="h-8 w-8 rounded-full bg-black/10 flex items-center justify-center text-xs font-semibold">
          {user.name.slice(0, 2).toUpperCase()}
        </div>
        <div className="hidden sm:flex items-center gap-1 text-sm font-medium text-black whitespace-nowrap">
          <span>{user.name}</span>
          <span className="text-black/50">▾</span>
        </div>
      </button>

      {open ? (
        <div className="absolute right-0 mt-2 w-56 rounded-lg border border-black/10 bg-white shadow-lg overflow-hidden z-50">
          <div className="px-3 py-2 text-xs text-black/60 border-b border-black/5">{user.email}</div>
          <button
            onClick={() => {
              setOpen(false);
              router.push('/profile');
            }}
            className="w-full text-left px-3 py-2 text-sm hover:bg-black/5"
          >
            Profile
          </button>
          <button
            onClick={signOut}
            className="w-full text-left px-3 py-2 text-sm hover:bg-black/5 text-red-600"
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
