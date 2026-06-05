'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { formatDateDMY } from '@/lib/date';
import { usePersistedState } from '@/lib/usePersistedState';
import { DateInputDMY } from '@/components/DateInputDMY';

import type { Role } from '@/lib/types';

type Client = {
  id: string;
  code: string;
  name: string;
  fka?: string;
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

type User = { id: string; name: string; email: string; role: Role };

type DirectorItem = {
  role: { id: string; appointmentDate?: string; resignationDate?: string };
  person: { id: string; fullName: string; email?: string; phone?: string };
};

type Props = {
  initialMe: User;
  initialClient: Client;
  initialJobs: JobItem[];
  initialDirectors: DirectorItem[];
  canUpdateClient: boolean;
};

export default function ClientDetailClient({ initialMe, initialClient, initialJobs, initialDirectors, canUpdateClient }: Props) {
  const [me] = useState<User>(initialMe);
  const [client, setClient] = useState<Client>(initialClient);
  const [jobs, setJobs] = useState<JobItem[]>(initialJobs);
  const [directors, setDirectors] = useState<DirectorItem[]>(initialDirectors);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobView, setJobView] = usePersistedState<'uncomplete' | 'complete'>(`gos.client.${initialClient.id}.jobs.view`, 'uncomplete');
  const canDeleteJob = me.role === 'owner';

  const [draft, setDraft] = useState({
    name: initialClient.name,
    fka: initialClient.fka ?? '',
    companyRegistrationNo: initialClient.companyRegistrationNo ?? '',
    fye: initialClient.fye ?? '',
    contactPerson: initialClient.contactPerson ?? '',
    address: initialClient.address ?? '',
    phone: initialClient.phone ?? '',
    email: initialClient.email ?? '',
  });

  const [search, setSearch] = useState('');
  const [directorsError, setDirectorsError] = useState<string | null>(null);
  const [directorSaving, setDirectorSaving] = useState(false);
  const [newDirector, setNewDirector] = useState({ fullName: '', email: '', phone: '', appointmentDate: '' });
  const [editingDirectorId, setEditingDirectorId] = useState<string | null>(null);
  const [editDirectorDraft, setEditDirectorDraft] = useState({
    fullName: '',
    email: '',
    phone: '',
    appointmentDate: '',
    resignationDate: '',
  });
  const [corpRepLoading, setCorpRepLoading] = useState(false);
  const [corpRepSaving, setCorpRepSaving] = useState(false);
  const [corpRepError, setCorpRepError] = useState<string | null>(null);
  const [corpRepCurrent, setCorpRepCurrent] = useState<{
    representative: { id: string; effectiveFrom: string };
    person: { id: string; fullName: string; email?: string };
  } | null>(null);
  const [corpRepLatestRdr, setCorpRepLatestRdr] = useState<{ id: string; status: string; packetId: string } | null>(null);
  const [corpRepLatestRequests, setCorpRepLatestRequests] = useState<Array<{ email: string; status: string; signedAt?: string }>>([]);
  const [corpRepPickPersonId, setCorpRepPickPersonId] = useState('');
  const [corpRepSignLinks, setCorpRepSignLinks] = useState<Array<{ email: string; url: string }> | null>(null);

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

  const todayYmd = new Date().toISOString().slice(0, 10);

  const activeDirectors = useMemo(
    () => directors.filter((d) => !d.role.resignationDate),
    [directors],
  );

  useEffect(() => {
    let ignore = false;
    async function load() {
      setCorpRepError(null);
      setCorpRepLoading(true);
      try {
        const res = await fetch(`/api/clients/${client.id}/corporate-representative`);
        const j = await res.json().catch(() => null);
        if (ignore) return;
        if (!res.ok) {
          setCorpRepError(j?.error ?? `HTTP_${res.status}`);
          return;
        }
        setCorpRepCurrent(j?.current ?? null);
        setCorpRepLatestRdr(j?.latestRdr ? { id: j.latestRdr.id, status: j.latestRdr.status, packetId: j.latestRdr.packetId } : null);
        setCorpRepLatestRequests(Array.isArray(j?.latestRequests) ? j.latestRequests : []);
      } finally {
        if (!ignore) setCorpRepLoading(false);
      }
    }
    void load();
    return () => {
      ignore = true;
    };
  }, [client.id]);

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
          fka: draft.fka || undefined,
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
          fka: j.client.fka ?? '',
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

  async function createDirector() {
    setDirectorsError(null);
    const fullName = newDirector.fullName.trim();
    if (!fullName) {
      setDirectorsError('INVALID_INPUT');
      return;
    }
    setDirectorSaving(true);
    try {
      const res = await fetch(`/api/clients/${client.id}/directors`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fullName,
          email: newDirector.email.trim() || undefined,
          phone: newDirector.phone.trim() || undefined,
          appointmentDate: newDirector.appointmentDate.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        setDirectorsError(j?.error ?? `HTTP_${res.status}`);
        return;
      }
      const j = (await res.json().catch(() => null)) as { director?: DirectorItem } | null;
      if (j?.director) {
        setDirectors((prev) => [j.director!, ...prev]);
        setNewDirector({ fullName: '', email: '', phone: '', appointmentDate: '' });
      }
    } finally {
      setDirectorSaving(false);
    }
  }

  function startEditDirector(d: DirectorItem) {
    setDirectorsError(null);
    setEditingDirectorId(d.role.id);
    setEditDirectorDraft({
      fullName: d.person.fullName,
      email: d.person.email ?? '',
      phone: d.person.phone ?? '',
      appointmentDate: d.role.appointmentDate ?? '',
      resignationDate: d.role.resignationDate ?? '',
    });
  }

  function cancelEditDirector() {
    setEditingDirectorId(null);
  }

  async function saveDirector(roleId: string) {
    setDirectorsError(null);
    const fullName = editDirectorDraft.fullName.trim();
    if (!fullName) {
      setDirectorsError('INVALID_INPUT');
      return;
    }
    setDirectorSaving(true);
    try {
      const res = await fetch(`/api/clients/${client.id}/directors/${roleId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fullName,
          email: editDirectorDraft.email.trim() || undefined,
          phone: editDirectorDraft.phone.trim() || undefined,
          appointmentDate: editDirectorDraft.appointmentDate.trim() || undefined,
          resignationDate: editDirectorDraft.resignationDate.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        setDirectorsError(j?.error ?? `HTTP_${res.status}`);
        return;
      }
      const j = (await res.json().catch(() => null)) as { director?: DirectorItem } | null;
      if (j?.director) {
        setDirectors((prev) => prev.map((x) => (x.role.id === roleId ? j.director! : x)));
        setEditingDirectorId(null);
      }
    } finally {
      setDirectorSaving(false);
    }
  }

  async function resignDirector(roleId: string) {
    setDirectorsError(null);
    const ok = window.confirm('Mark this director as resigned today?');
    if (!ok) return;
    setDirectorSaving(true);
    try {
      const res = await fetch(`/api/clients/${client.id}/directors/${roleId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ resignationDate: todayYmd }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        setDirectorsError(j?.error ?? `HTTP_${res.status}`);
        return;
      }
      const j = (await res.json().catch(() => null)) as { director?: DirectorItem } | null;
      if (j?.director) setDirectors((prev) => prev.map((x) => (x.role.id === roleId ? j.director! : x)));
    } finally {
      setDirectorSaving(false);
    }
  }

  async function appointCorporateRepresentative() {
    setCorpRepError(null);
    setCorpRepSignLinks(null);
    const personId = corpRepPickPersonId.trim();
    if (!personId) {
      setCorpRepError('INVALID_INPUT');
      return;
    }
    setCorpRepSaving(true);
    try {
      const res = await fetch(`/api/clients/${client.id}/corporate-representative`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ representativePersonId: personId }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        setCorpRepError(j?.error ?? `HTTP_${res.status}`);
        return;
      }
      setCorpRepLatestRdr(j?.rdrId ? { id: j.rdrId, status: 'SIGNING', packetId: j.packetId } : null);
      setCorpRepSignLinks(Array.isArray(j?.signLinks) ? j.signLinks : null);

      const refresh = await fetch(`/api/clients/${client.id}/corporate-representative`);
      const rj = await refresh.json().catch(() => null);
      if (refresh.ok) {
        setCorpRepCurrent(rj?.current ?? null);
        setCorpRepLatestRdr(rj?.latestRdr ? { id: rj.latestRdr.id, status: rj.latestRdr.status, packetId: rj.latestRdr.packetId } : null);
        setCorpRepLatestRequests(Array.isArray(rj?.latestRequests) ? rj.latestRequests : []);
      }
    } finally {
      setCorpRepSaving(false);
    }
  }

  return (
    <div className="flex-1">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
          <div className="rounded-xl bg-white border border-black/5 p-4">
            <div className="text-lg font-semibold break-words">{client.fka?.trim() ? `${client.name} (fka ${client.fka})` : client.name}</div>
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
                  <div className="text-black/70">FKA (Formerly known as)</div>
                  <input
                    disabled={!canUpdateClient}
                    value={draft.fka}
                    onChange={(e) => setDraft((v) => ({ ...v, fka: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm disabled:bg-black/[0.02] disabled:text-black/50"
                    placeholder="e.g. Bybridge Sdn Bhd"
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
                    placeholder="e.g. 31/12"
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
                      <td
                        className={[
                          'px-4 py-3 whitespace-nowrap',
                          it.job.dueDate ? (it.job.dueDate < todayYmd ? 'text-red-600' : 'text-[#2f7bdc]') : 'text-black/40',
                        ].join(' ')}
                      >
                        {it.job.dueDate ? formatDateDMY(it.job.dueDate) : '-'}
                      </td>
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

        <div className="mt-4 rounded-xl bg-white border border-black/5">
          <div className="p-4 border-b border-black/5 flex items-center justify-between gap-3">
            <div className="text-lg font-semibold">Directors</div>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <label className="text-sm">
                <div className="text-black/70">Full name</div>
                <input
                  disabled={!canUpdateClient || directorSaving}
                  value={newDirector.fullName}
                  onChange={(e) => setNewDirector((v) => ({ ...v, fullName: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm disabled:bg-black/[0.02] disabled:text-black/50"
                />
              </label>
              <label className="text-sm">
                <div className="text-black/70">Email</div>
                <input
                  disabled={!canUpdateClient || directorSaving}
                  value={newDirector.email}
                  onChange={(e) => setNewDirector((v) => ({ ...v, email: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm disabled:bg-black/[0.02] disabled:text-black/50"
                />
              </label>
              <label className="text-sm">
                <div className="text-black/70">Phone</div>
                <input
                  disabled={!canUpdateClient || directorSaving}
                  value={newDirector.phone}
                  onChange={(e) => setNewDirector((v) => ({ ...v, phone: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm disabled:bg-black/[0.02] disabled:text-black/50"
                />
              </label>
              <label className="text-sm">
                <div className="text-black/70">Appointment date</div>
                <DateInputDMY
                  value={newDirector.appointmentDate}
                  onChange={(next) => setNewDirector((v) => ({ ...v, appointmentDate: next }))}
                  disabled={!canUpdateClient || directorSaving}
                  inputClassName="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm disabled:bg-black/[0.02] disabled:text-black/50"
                />
              </label>
            </div>

            {directorsError ? <div className="mt-3 text-sm text-red-600">{directorsError}</div> : null}

            <div className="mt-4 flex items-center justify-end">
              <button
                disabled={!canUpdateClient || directorSaving}
                onClick={() => void createDirector()}
                className="rounded-full bg-black text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                {directorSaving ? 'Saving...' : 'Add director'}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto border-t border-black/5">
            <table className="min-w-full text-sm">
              <thead className="text-left text-black/60">
                <tr className="border-b border-black/5">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Phone</th>
                  <th className="px-4 py-3 font-medium">Appointment</th>
                  <th className="px-4 py-3 font-medium">Resignation</th>
                  <th className="px-4 py-3 font-medium w-40"></th>
                </tr>
              </thead>
              <tbody>
                {directors.map((d) => {
                  const editing = editingDirectorId === d.role.id;
                  return (
                    <tr key={d.role.id} className="border-b border-black/5 hover:bg-black/[0.02]">
                      <td className="px-4 py-3 whitespace-nowrap">
                        {editing ? (
                          <input
                            disabled={directorSaving}
                            value={editDirectorDraft.fullName}
                            onChange={(e) => setEditDirectorDraft((v) => ({ ...v, fullName: e.target.value }))}
                            className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                          />
                        ) : (
                          <div className="truncate max-w-[240px]" title={d.person.fullName}>
                            {d.person.fullName}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {editing ? (
                          <input
                            disabled={directorSaving}
                            value={editDirectorDraft.email}
                            onChange={(e) => setEditDirectorDraft((v) => ({ ...v, email: e.target.value }))}
                            className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                          />
                        ) : (
                          <div className="truncate max-w-[240px]" title={d.person.email ?? ''}>
                            {d.person.email ?? '-'}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {editing ? (
                          <input
                            disabled={directorSaving}
                            value={editDirectorDraft.phone}
                            onChange={(e) => setEditDirectorDraft((v) => ({ ...v, phone: e.target.value }))}
                            className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                          />
                        ) : (
                          d.person.phone ?? '-'
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {editing ? (
                          <DateInputDMY
                            value={editDirectorDraft.appointmentDate}
                            onChange={(next) => setEditDirectorDraft((v) => ({ ...v, appointmentDate: next }))}
                            disabled={directorSaving}
                            inputClassName="w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                          />
                        ) : d.role.appointmentDate ? (
                          formatDateDMY(d.role.appointmentDate)
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {editing ? (
                          <DateInputDMY
                            value={editDirectorDraft.resignationDate}
                            onChange={(next) => setEditDirectorDraft((v) => ({ ...v, resignationDate: next }))}
                            disabled={directorSaving}
                            inputClassName="w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                          />
                        ) : d.role.resignationDate ? (
                          formatDateDMY(d.role.resignationDate)
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        {canUpdateClient ? (
                          editing ? (
                            <div className="inline-flex items-center gap-2">
                              <button
                                disabled={directorSaving}
                                onClick={() => void saveDirector(d.role.id)}
                                className="rounded-md bg-black text-white px-3 py-1.5 text-sm disabled:opacity-50"
                              >
                                Save
                              </button>
                              <button
                                disabled={directorSaving}
                                onClick={cancelEditDirector}
                                className="rounded-md border border-black/10 bg-white px-3 py-1.5 text-sm disabled:opacity-50"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-2">
                              <button
                                disabled={directorSaving}
                                onClick={() => startEditDirector(d)}
                                className="rounded-md border border-black/10 bg-white px-3 py-1.5 text-sm disabled:opacity-50"
                              >
                                Edit
                              </button>
                              {!d.role.resignationDate ? (
                                <button
                                  disabled={directorSaving}
                                  onClick={() => void resignDirector(d.role.id)}
                                  className="rounded-md border border-black/10 bg-white px-3 py-1.5 text-sm disabled:opacity-50"
                                >
                                  Resign
                                </button>
                              ) : null}
                            </div>
                          )
                        ) : (
                          <span className="text-black/30">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {directors.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-black/50">
                      No directors
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-4 rounded-xl bg-white border border-black/5">
          <div className="p-4 border-b border-black/5 flex items-center justify-between gap-3">
            <div className="text-lg font-semibold">Corporate Representative</div>
            {corpRepLoading ? <div className="text-sm text-black/50">Loading...</div> : null}
          </div>
          <div className="p-4">
            {corpRepError ? <div className="text-sm text-red-600">{corpRepError}</div> : null}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-lg bg-black/[0.02] border border-black/5 p-4">
                <div className="text-sm font-medium">Current</div>
                {corpRepCurrent ? (
                  <div className="mt-2 text-sm">
                    <div className="text-black/80">{corpRepCurrent.person.fullName}</div>
                    <div className="text-black/60">{corpRepCurrent.person.email ?? '-'}</div>
                    <div className="mt-2 text-xs text-black/50">{`Effective: ${formatDateDMY(
                      corpRepCurrent.representative.effectiveFrom.slice(0, 10),
                    )}`}</div>
                  </div>
                ) : (
                  <div className="mt-2 text-sm text-black/50">No representative</div>
                )}

                <div className="mt-4 grid grid-cols-1 gap-3">
                  <label className="text-sm">
                    <div className="text-black/70">Pick a director as representative</div>
                    <select
                      disabled={!canUpdateClient || corpRepSaving}
                      value={corpRepPickPersonId}
                      onChange={(e) => setCorpRepPickPersonId(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm disabled:bg-black/[0.02] disabled:text-black/50"
                    >
                      <option value="">Select...</option>
                      {activeDirectors.map((d) => (
                        <option key={d.person.id} value={d.person.id}>
                          {d.person.fullName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex items-center justify-end">
                    <button
                      disabled={!canUpdateClient || corpRepSaving}
                      onClick={() => void appointCorporateRepresentative()}
                      className="rounded-full bg-black text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
                    >
                      {corpRepSaving ? 'Creating...' : 'Appoint / Change'}
                    </button>
                  </div>
                </div>

                {corpRepSignLinks ? (
                  <div className="mt-4">
                    <div className="text-sm font-medium">Signing links</div>
                    <div className="mt-2 grid grid-cols-1 gap-1 text-sm">
                      {corpRepSignLinks.map((l) => (
                        <div key={l.email} className="break-words">
                          <span className="text-black/60">{l.email}</span>
                          <span className="text-black/40">{' — '}</span>
                          <a className="text-[#2f7bdc] hover:underline" href={l.url} target="_blank" rel="noreferrer">
                            {l.url}
                          </a>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 text-xs text-black/50">
                      Links are shown only once. Use email sending in production.
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="rounded-lg bg-black/[0.02] border border-black/5 p-4">
                <div className="text-sm font-medium">Latest Appointment</div>
                {corpRepLatestRdr ? (
                  <div className="mt-2 text-sm text-black/70">
                    <div>{`Status: ${corpRepLatestRdr.status}`}</div>
                    <div className="mt-2">
                      {corpRepLatestRequests.length > 0 ? (
                        <div className="grid grid-cols-1 gap-1">
                          {corpRepLatestRequests.map((r) => (
                            <div key={r.email} className="flex items-center justify-between gap-3">
                              <div className="truncate" title={r.email}>
                                {r.email}
                              </div>
                              <div className="text-xs text-black/50">{r.status}</div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-black/50">No signers</div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 text-sm text-black/50">No appointment yet</div>
                )}
              </div>
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
