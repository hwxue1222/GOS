'use client';

import { useState } from 'react';

type Props = {
  canCreate: boolean;
  onCreated: (message: string) => void;
  onError: (message: string) => void;
};

export default function CreatePersonCard({ canCreate, onCreated, onError }: Props) {
  const [newPerson, setNewPerson] = useState({ fullName: '', email: '', phone: '' });
  const [creating, setCreating] = useState(false);

  async function createOne() {
    if (!canCreate) return;
    const fullName = newPerson.fullName.trim();
    if (!fullName) {
      onError('Full Name required');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/people', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fullName,
          email: newPerson.email.trim() || undefined,
          phone: newPerson.phone.trim() || undefined,
        }),
      }).catch(() => null);
      if (!res?.ok) {
        const j = await res?.json().catch(() => null);
        onError(j?.error ?? `HTTP_${res?.status ?? 'NETWORK'}`);
        return;
      }
      setNewPerson({ fullName: '', email: '', phone: '' });
      onCreated('Created.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="rounded-xl bg-white border border-black/5 p-5">
      <div className="text-sm font-semibold">新建人员</div>
      <div className="mt-4 grid grid-cols-1 gap-3">
        <label className="text-sm">
          <div className="text-black/60">Full Name</div>
          <input
            value={newPerson.fullName}
            onChange={(e) => setNewPerson((s) => ({ ...s, fullName: e.target.value }))}
            disabled={!canCreate}
            className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm disabled:bg-black/5"
          />
        </label>
        <label className="text-sm">
          <div className="text-black/60">Email</div>
          <input
            value={newPerson.email}
            onChange={(e) => setNewPerson((s) => ({ ...s, email: e.target.value }))}
            disabled={!canCreate}
            className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm disabled:bg-black/5"
          />
        </label>
        <label className="text-sm">
          <div className="text-black/60">Phone</div>
          <input
            value={newPerson.phone}
            onChange={(e) => setNewPerson((s) => ({ ...s, phone: e.target.value }))}
            disabled={!canCreate}
            className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm disabled:bg-black/5"
          />
        </label>
        <div className="flex items-center justify-end">
          <button
            onClick={createOne}
            disabled={!canCreate || creating}
            className="rounded-md bg-[#46b35a] text-white px-4 py-2 text-sm font-medium disabled:opacity-60"
          >
            {creating ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
      {!canCreate ? <div className="mt-2 text-xs text-black/50">你没有创建权限。</div> : null}
    </div>
  );
}

