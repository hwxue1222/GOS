'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePersistedState } from '@/lib/usePersistedState';

type Client = {
  id: string;
  code: string;
  name: string;
  phone?: string;
  email?: string;
  tags: string[];
};

type User = { id: string; name: string; email: string; role: 'owner' | 'manager' | 'staff' };

type Props = {
  initialMe: User;
  initialClients: Client[];
};

function textMatch(haystack: string, needle: string) {
  return haystack.toLowerCase().includes(needle.trim().toLowerCase());
}

export default function ClientsClient({ initialMe, initialClients }: Props) {
  const [me] = useState<User>(initialMe);
  const [clients, setClients] = useState<Client[]>(initialClients);
  const [search, setSearch] = usePersistedState('gos.clients.search', '');
  const [showAdd, setShowAdd] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    code: '',
    name: '',
    phone: '',
    email: '',
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return clients;
    return clients.filter((c) => textMatch(`${c.code} ${c.name} ${c.phone ?? ''} ${c.email ?? ''}`, search));
  }, [clients, search]);

  const canCreate = me?.role === 'owner' || me?.role === 'manager';

  async function addClient() {
    setError(null);
    if (!form.code.trim() || !form.name.trim()) {
      setError('INVALID_INPUT');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code: form.code,
          name: form.name,
          phone: form.phone || undefined,
          email: form.email || undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        setError(j?.error ?? 'CREATE_FAILED');
        return;
      }
      const j = (await res.json().catch(() => null)) as { ok?: boolean; client?: Client } | null;
      if (j?.client) setClients((prev) => [j.client!, ...prev]);
      setShowAdd(false);
      setForm({ code: '', name: '', phone: '', email: '' });
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex-1">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Clients</h1>
          <div className="flex items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-64 max-w-[60vw] rounded-lg border border-black/10 px-3 py-2 text-sm outline-none bg-white"
              placeholder="Find client..."
            />
            <button
              disabled={!canCreate}
              onClick={() => setShowAdd(true)}
              className="rounded-md border border-black/10 bg-white px-3 py-2 text-sm font-medium disabled:opacity-50"
            >
              + Add Client
            </button>
          </div>
        </div>

        <div className="mt-4 rounded-xl bg-white border border-black/5 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-black/60">
              <tr className="border-b border-black/5">
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Tags</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-b border-black/5 hover:bg-black/[0.02]">
                  <td className="px-4 py-3 whitespace-nowrap max-w-[320px]">
                    <Link className="truncate text-[#2f7bdc] hover:underline block" href={`/clients/${c.id}`} title={`${c.code} ${c.name}`}>
                      {c.code}_{c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{c.phone ?? '-'}</td>
                  <td className="px-4 py-3 whitespace-nowrap max-w-[260px]">
                    <div className="truncate" title={c.email ?? ''}>
                      {c.email ?? '-'}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{c.tags?.length ? c.tags.join(', ') : '-'}</td>
                </tr>
              ))}
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-black/50">
                    No clients
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {showAdd ? (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center px-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-5">
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold">Add Client</div>
              <button onClick={() => setShowAdd(false)} className="text-black/50 hover:text-black">
                ✕
              </button>
            </div>

            {!canCreate ? (
              <div className="mt-4 text-sm text-red-600">FORBIDDEN</div>
            ) : (
              <>
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="text-sm">
                    <div className="text-black/70">Code</div>
                    <input
                      value={form.code}
                      onChange={(e) => setForm((v) => ({ ...v, code: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                      placeholder="e.g. DA141"
                    />
                  </label>
                  <label className="text-sm">
                    <div className="text-black/70">Name</div>
                    <input
                      value={form.name}
                      onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                      placeholder="Client name"
                    />
                  </label>
                  <label className="text-sm">
                    <div className="text-black/70">Phone</div>
                    <input
                      value={form.phone}
                      onChange={(e) => setForm((v) => ({ ...v, phone: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                      placeholder="Phone"
                    />
                  </label>
                  <label className="text-sm">
                    <div className="text-black/70">Email</div>
                    <input
                      value={form.email}
                      onChange={(e) => setForm((v) => ({ ...v, email: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                      placeholder="Email"
                    />
                  </label>
                </div>

                {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}

                <div className="mt-5 flex items-center justify-end gap-2">
                  <button
                    onClick={() => setShowAdd(false)}
                    className="rounded-lg border border-black/10 px-4 py-2 text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={creating}
                    onClick={addClient}
                    className="rounded-lg bg-black text-white px-4 py-2 text-sm disabled:opacity-60"
                  >
                    {creating ? 'Saving...' : 'Add'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
