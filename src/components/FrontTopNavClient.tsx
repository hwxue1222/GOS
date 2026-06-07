'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import FrontUserMenuClient from '@/components/FrontUserMenuClient';
import type { Role } from '@/lib/types';
import LanguageToggleClient from '@/components/LanguageToggleClient';

type Company = { id: string; name: string; code: string };

type Props = {
  active: 'dashboard' | 'incorporation' | 'corporate-secretary';
  user: { id: string; name: string; email: string; role: Role };
  companies: Company[];
};

function MenuButton(props: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={props.onClick}
      className={[
        'px-3 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap hover:shadow-sm',
        props.active ? 'text-black' : 'text-black/70 hover:text-black hover:bg-black/5',
      ].join(' ')}
    >
      {props.label}
    </button>
  );
}

function Dropdown(props: {
  open: boolean;
  onClose: () => void;
  trigger: React.ReactNode;
  children: React.ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { open, onClose, trigger, children } = props;
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current) return;
      if (rootRef.current.contains(e.target as Node)) return;
      onClose();
    }
    if (open) document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open, onClose]);

  return (
    <div ref={rootRef} className="relative">
      {trigger}
      {open ? (
        <div className="absolute left-0 mt-2 min-w-[520px] rounded-xl border border-black/10 bg-white shadow-lg overflow-hidden z-50">
          {children}
        </div>
      ) : null}
    </div>
  );
}

function itemClass() {
  return 'block w-full text-left px-3 py-2 text-sm hover:bg-black/5 text-black/80 whitespace-nowrap truncate';
}

export default function FrontTopNavClient({ active, user, companies }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState<'inc' | 'cs' | null>(null);
  const [currentCompanyId, setCurrentCompanyId] = useState<string>('');

  useEffect(() => {
    const stored = window.localStorage.getItem('gos.currentCompanyId') ?? '';
    const valid = companies.some((c) => c.id === stored);
    const next = valid ? stored : companies[0]?.id ?? '';
    if (next) {
      setCurrentCompanyId(next);
      window.localStorage.setItem('gos.currentCompanyId', next);
    }
  }, [companies]);

  function switchCompany(id: string) {
    setCurrentCompanyId(id);
    window.localStorage.setItem('gos.currentCompanyId', id);
    router.push(`/portal/companies/${encodeURIComponent(id)}`);
  }

  function goCompanyService(service: 'director' | 'share_transfer') {
    if (!currentCompanyId) return;
    if (service === 'director') {
      router.push(`/corporate-secretary/applications?type=director_change&companyId=${encodeURIComponent(currentCompanyId)}`);
      return;
    }
    router.push(`/corporate-secretary/applications?type=share_transfer&companyId=${encodeURIComponent(currentCompanyId)}`);
  }

  return (
    <header className="bg-white border-b border-black/5">
      <div className="h-14 px-4 flex items-center justify-between gap-6 max-w-6xl mx-auto">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/dashboard" className="flex items-center gap-2 shrink-0">
            <div className="h-8 w-8 rounded-md bg-[#c62828]/10 text-[#c62828] flex items-center justify-center font-semibold">B</div>
            <div className="hidden sm:block text-sm font-semibold text-black">Corporate Portal</div>
          </Link>

          <nav className="flex items-center gap-1">
            <Link
              href="/dashboard"
              className={[
                'px-3 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap hover:shadow-sm',
                active === 'dashboard' ? 'text-black' : 'text-black/70 hover:text-black hover:bg-black/5',
              ].join(' ')}
            >
              Home
            </Link>

            <Dropdown
              open={open === 'inc'}
              onClose={() => setOpen(null)}
              trigger={
                <MenuButton
                  active={active === 'incorporation'}
                  label="Incorporation of Company"
                  onClick={() => setOpen((v) => (v === 'inc' ? null : 'inc'))}
                />
              }
            >
              <button
                onClick={() => {
                  setOpen(null);
                  router.push('/incorporation/register');
                }}
                className={itemClass()}
              >
                Register Company
              </button>
              <button
                onClick={() => {
                  setOpen(null);
                  router.push('/incorporation/transfer-secretary');
                }}
                className={itemClass()}
              >
                Transfer of Company Secretary
              </button>
            </Dropdown>

            <Dropdown
              open={open === 'cs'}
              onClose={() => setOpen(null)}
              trigger={
                <MenuButton
                  active={active === 'corporate-secretary'}
                  label="Corporate Secretary Services"
                  onClick={() => setOpen((v) => (v === 'cs' ? null : 'cs'))}
                />
              }
            >
              <Link href="/corporate-secretary/change-company-name" onClick={() => setOpen(null)} className={itemClass()}>
                Change of Company Name
              </Link>
              <Link href="/corporate-secretary/change-fye" onClick={() => setOpen(null)} className={itemClass()}>
                Change of Fiscal Financial Year
              </Link>
              <Link href="/corporate-secretary/change-address" onClick={() => setOpen(null)} className={itemClass()}>
                Change of Registered Office Address
              </Link>
              <Link href="/corporate-secretary/change-business-activities" onClick={() => setOpen(null)} className={itemClass()}>
                Change of Business Activities
              </Link>
              <Link href="/corporate-secretary/change-secretary" onClick={() => setOpen(null)} className={itemClass()}>
                Change of Secretary
              </Link>
              <button
                onClick={() => {
                  setOpen(null);
                  goCompanyService('director');
                }}
                className={itemClass()}
              >
                Change of Director
              </button>
              <button
                onClick={() => {
                  setOpen(null);
                  goCompanyService('share_transfer');
                }}
                className={itemClass()}
              >
                Transfer of Shares
              </button>
              <Link href="/corporate-secretary/agm" onClick={() => setOpen(null)} className={itemClass()}>
                Annual General Meeting
              </Link>
              <Link href="/corporate-secretary/rorc" onClick={() => setOpen(null)} className={itemClass()}>
                Declaration of Company Controller (RORC)
              </Link>
            </Dropdown>

            <Link
              href="/user-guide"
              className="px-3 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap hover:shadow-sm text-black/70 hover:text-black hover:bg-black/5"
            >
              User Guide
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <LanguageToggleClient />

          <select
            value={currentCompanyId}
            onChange={(e) => switchCompany(e.target.value)}
            disabled={!companies.length}
            className="w-[220px] truncate rounded-md border border-black/10 bg-white px-3 py-2 text-sm disabled:opacity-60"
          >
            {!companies.length ? <option value="">No companies</option> : null}
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <FrontUserMenuClient user={user} />
        </div>
      </div>
    </header>
  );
}
