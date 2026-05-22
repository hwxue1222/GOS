'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { formatDateDMY } from '@/lib/date';
import { usePersistedState } from '@/lib/usePersistedState';

type Client = {
  id: string;
  code: string;
  name: string;
  companyRegistrationNo?: string;
  fye?: string;
  contactPerson?: string;
  address?: string;
  phone?: string;
  email?: string;
  tags: string[];
};

type JobItem = {
  job: {
    id: string;
    name: string;
    label?: string;
    dueDate?: string;
    status: 'Pending' | 'Processing' | 'Complete';
    completed?: boolean;
    deletedAt?: string;
    recurringFromJobId?: string;
    managerUserId?: string;
  };
  tasks: { done: number; total: number };
  manager: { id: string; name: string } | null;
};

type User = { id: string; name: string; email: string; role: 'owner' | 'manager' | 'staff' };

type Props = {
  initialMe: User;
  initialClient: Client;
  initialJobs: JobItem[];
  canUpdateClient: boolean;
};

export default function ClientDetailClient({ initialMe, initialClient, initialJobs, canUpdateClient }: Props) {
  const [me] = useState<User>(initialMe);
  const [client, setClient] = useState<Client>(initialClient);
  const [jobs, setJobs] = useState<JobItem[]>(initialJobs);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobView, setJobView] = usePersistedState<'uncomplete' | 'complete'>(`gos.client.${initialClient.id}.jobs.view`, 'uncomplete');
  const canDeleteJob = me.role === 'owner';

  const [draft, setDraft] = useState({
    name: initialClient.name,
    companyRegistrationNo: initialClient.companyRegistrationNo ?? '',
    fye: initialClient.fye ?? '',
    contactPerson: initialClient.contactPerson ?? '',
    address: initialClient.address ?? '',
    phone: initialClient.phone ?? '',
    email: initialClient.email ?? '',
  });

  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return jobs.filter((it) => {
      if (it.job.deletedAt) return false;
      const isComplete =
        !!it.job.completed || it.job.status === 'Complete' || (it.tasks.total > 0 && it.tasks.done === it.tasks.total);
      if (jobView === 'complete') {
        if (!isComplete) return false;
      } else {
        if (isComplete) return false;
      }
      if (q) {
        if (!`${it.job.name} ${it.job.label ?? ''}`.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [jobView, jobs, search]);

  async function update() {
    setError(null);
    if (!draft.name.trim()) {
      setError('INVALID_INPUT');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${client.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: draft.name,
          companyRegistrationNo: draft.companyRegistrationNo,
          fye: draft.fye,
          contactPerson: draft.contactPerson,
          address: draft.address,
          phone: draft.phone || undefined,
          email: draft.email || undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        setError(j?.error ?? `HTTP_${res.status}`);
        return;
      }
      const j = (await res.json().catch(() => null)) as { client?: Client } | null;
      if (j?.client) {
        setClient(j.client);
        setDraft({
          name: j.client.name,
          companyRegistrationNo: j.client.companyRegistrationNo ?? '',
          fye: j.client.fye ?? '',
          contactPerson: j.client.contactPerson ?? '',
          address: j.client.address ?? '',
          phone: j.client.phone ?? '',
          email: j.client.email ?? '',
        });
      }
    } finally {
      setSaving(false);
    }
  }

  async function deleteJobFromList(jobId: string) {
    if (!canDeleteJob) return;
    const ok = window.confirm('Delete this job? It will appear in the Delete list.');
    if (!ok) return;
    const res = await fetch(`/api/jobs/${jobId}`, { method: 'DELETE' }).catch(() => null);
    if (!res?.ok) return;
    setJobs((prev) => prev.filter((x) => x.job.id !== jobId));
  }

  return (
    <div className="flex-1">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
          <div className="rounded-xl bg-white border border-black/5 p-4">
            <div className="text-lg font-semibold break-words">{client.name}</div>
            <div className="mt-1 text-sm text-black/60 break-words">{`Code: ${client.code}`}</div>

            <div className="mt-5 rounded-lg bg-black/[0.02] border border-black/5 p-3">
              <div className="grid grid-cols-1 gap-3">
                <label className="text-sm">
                  <div className="text-black/70">Name</div>
                  <input
                    disabled={!canUpdateClient}
                    value={draft.name}
                    onChange={(e) => setDraft((v) => ({ ...v, name: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm disabled:bg-black/[0.02] disabled:text-black/50"
                  />
                </label>
                <label className="text-sm">
                  <div className="text-black/70">Company registration no.</div>
                  <input
                    disabled={!canUpdateClient}
                    value={draft.companyRegistrationNo}
                    onChange={(e) => setDraft((v) => ({ ...v, companyRegistrationNo: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm disabled:bg-black/[0.02] disabled:text-black/50"
                  />
                </label>
                <label className="text-sm">
                  <div className="text-black/70">FYE (Financial year end)</div>
                  <input
                    disabled={!canUpdateClient}
                    value={draft.fye}
                    onChange={(e) => setDraft((v) => ({ ...v, fye: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm disabled:bg-black/[0.02] disabled:text-black/50"
                  />
                </label>
                <label className="text-sm">
                  <div className="text-black/70">Contact person</div>
                  <input
                    disabled={!canUpdateClient}
                    value={draft.contactPerson}
                    onChange={(e) => setDraft((v) => ({ ...v, contactPerson: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm disabled:bg-black/[0.02] disabled:text-black/50"
                  />
                </label>
                <label className="text-sm">
                  <div className="text-black/70">Address</div>
                  <textarea
                    disabled={!canUpdateClient}
                    value={draft.address}
                    onChange={(e) => setDraft((v) => ({ ...v, address: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm disabled:bg-black/[0.02] disabled:text-black/50"
                    rows={3}
                  />
                </label>
                <label className="text-sm">
                  <div className="text-black/70">Phone</div>
                  <input
                    disabled={!canUpdateClient}
                    value={draft.phone}
                    onChange={(e) => setDraft((v) => ({ ...v, phone: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm disabled:bg-black/[0.02] disabled:text-black/50"
                  />
                </label>
                <label className="text-sm">
                  <div className="text-black/70">Email</div>
                  <input
                    disabled={!canUpdateClient}
                    value={draft.email}
                    onChange={(e) => setDraft((v) => ({ ...v, email: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm disabled:bg-black/[0.02] disabled:text-black/50"
                  />
                </label>
              </div>

              {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}

              <div className="mt-4 flex items-center justify-end">
                <button
                  disabled={!canUpdateClient || saving}
                  onClick={update}
                  className="rounded-full bg-black text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
                >
                  {saving ? 'Updating...' : 'Update'}
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-white border border-black/5">
            <div className="p-4 border-b border-black/5 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                <div className="text-lg font-semibold">Jobs</div>
                <div className="flex items-center gap-2 text-sm">
                  <button
                    onClick={() => setJobView('uncomplete')}
                    className={[
                      'rounded-full px-3 py-1.5 border',
                      jobView === 'uncomplete'
                        ? 'bg-black text-white border-black'
                        : 'bg-white border-black/10 text-black/70',
                    ].join(' ')}
                  >
                    Uncomplete
                  </button>
                  <button
                    onClick={() => setJobView('complete')}
                    className={[
                      'rounded-full px-3 py-1.5 border',
                      jobView === 'complete' ? 'bg-black text-white border-black' : 'bg-white border-black/10 text-black/70',
                    ].join(' ')}
                  >
                    Complete
                  </button>
                </div>
              </div>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full sm:max-w-md rounded-lg border border-black/10 px-3 py-2 text-sm outline-none"
                placeholder="Find job by name"
              />
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-black/60">
                  <tr className="border-b border-black/5">
                    <th className="px-4 py-3 font-medium">Job Name</th>
                    <th className="px-4 py-3 font-medium">Tasks</th>
                    <th className="px-4 py-3 font-medium">Due Date</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Manager</th>
                    <th className="px-4 py-3 font-medium w-24"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((it) => (
                    <tr key={it.job.id} className="border-b border-black/5 hover:bg-black/[0.02]">
                      <td className="px-4 py-3 whitespace-nowrap max-w-[380px]">
                        <Link
                          className="text-[#2f7bdc] hover:underline truncate inline-block max-w-[380px]"
                          href={`/jobs/${it.job.id}`}
                          title={it.job.name}
                        >
                          {it.job.recurringFromJobId ? `↻ ${it.job.name}` : it.job.name}
                        </Link>
                        {it.job.label ? <div className="text-xs text-black/50 truncate">{it.job.label}</div> : null}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {it.tasks.done}/{it.tasks.total}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-red-600">{formatDateDMY(it.job.dueDate)}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-[#7a5cff]">
                        {it.job.completed ? 'Complete' : it.job.status}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {it.manager ? (
                          <div className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-black/10 text-xs">
                            {it.manager.name.slice(0, 2).toUpperCase()}
                          </div>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        {canDeleteJob ? (
                          <button
                            onClick={() => void deleteJobFromList(it.job.id)}
                            className="rounded-md border border-red-200 bg-white text-red-600 px-3 py-1.5 text-sm hover:bg-red-50"
                          >
                            Delete
                          </button>
                        ) : (
                          <span className="text-black/30">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-black/50">
                        No jobs
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="mt-4 text-sm text-black/60">
          <span>Logged in as </span>
          <span className="text-black/80">{me.name}</span>
        </div>
      </div>
    </div>
  );
}
