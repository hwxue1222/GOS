'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { usePersistedState } from '@/lib/usePersistedState';
import { hasPermission } from '@/lib/permissions';
import type { Permissions } from '@/lib/types';
import { formatDateDMY } from '@/lib/date';
import { DateInputDMY } from '@/components/DateInputDMY';

type JobListItem = {
  job: {
    id: string;
    clientId: string;
    name: string;
    label?: string;
    dueDate?: string;
    repeat: 'none' | 'monthly' | 'quarterly' | 'yearly' | '2-yearly';
    status: 'Pending' | 'Processing' | 'Complete';
    completed?: boolean;
    deletedAt?: string;
    updatedAt?: string;
    recurringFromJobId?: string;
    managerUserId?: string;
    staffUserId?: string;
    createdAt: string;
  };
  client: { id: string; code: string; name: string; contactPerson?: string } | null;
  tasks: { done: number; total: number };
  staffNames: string[];
  manager: { id: string; name: string } | null;
  staff: { id: string; name: string } | null;
};

type Client = { id: string; code: string; name: string };
type User = {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'manager' | 'staff';
  permissions?: Permissions;
};

type Props = {
  initialItems: JobListItem[];
  initialClients: Client[];
  initialUsers: User[];
  initialMe: User;
};

function textMatch(haystack: string, needle: string) {
  return haystack.toLowerCase().includes(needle.trim().toLowerCase());
}

export default function JobsClient({ initialItems, initialClients, initialUsers, initialMe }: Props) {
  const searchParams = useSearchParams();
  const overdueUserId = searchParams.get('overdueUserId') ?? '';
  const at = searchParams.get('at') ?? '';
  const todayYmdNow = new Date().toISOString().slice(0, 10);

  const [items, setItems] = useState<JobListItem[]>(initialItems);
  const [clients] = useState<Client[]>(initialClients);
  const [users] = useState<User[]>(initialUsers);
  const [me] = useState<User>(initialMe);
  const managerUsers = useMemo(() => users.filter((u) => u.role === 'manager'), [users]);
  const assigneeUsers = useMemo(() => {
    if (me.role === 'manager') {
      return users.filter((u) => u.role === 'staff' || u.id === me.id);
    }
    return users.filter((u) => u.role === 'manager' || u.role === 'staff');
  }, [me.id, me.role, users]);

  const [search, setSearch] = usePersistedState('gos.jobs.search', '');
  const [filterClientId, setFilterClientId] = usePersistedState<string>('gos.jobs.filter.clientId', '');
  const [filterManagerUserId, setFilterManagerUserId] = usePersistedState<string>('gos.jobs.filter.managerUserId', '');
  const [filterJobName, setFilterJobName] = usePersistedState<string>('gos.jobs.filter.jobName', '');
  const [view, setView] = usePersistedState<'uncomplete' | 'complete' | 'delete'>('gos.jobs.view', 'uncomplete');
  const showDeleteColumn = me.role === 'owner' && view !== 'delete';
  const [pageSize, setPageSize] = usePersistedState('gos.jobs.pageSize', 20);
  const [page, setPage] = usePersistedState('gos.jobs.page', 1);

  const [showNewJob, setShowNewJob] = useState(false);
  const [newJobClientSearch, setNewJobClientSearch] = useState('');
  const [newJobClientOpen, setNewJobClientOpen] = useState(false);
  const [newJobNameChoice, setNewJobNameChoice] = useState<'__new__' | string>('__new__');
  const [newJob, setNewJob] = useState({
    clientId: '',
    name: '',
    label: '',
    dueDate: '',
    repeat: 'none' as JobListItem['job']['repeat'],
    managerUserId: '',
  });
  const [draftTasks, setDraftTasks] = useState<
    Array<{
      id: string;
      seq: number;
      title: string;
      dueDate: string;
      done: boolean;
      createdByName: string;
      assigneeUserId: string;
    }>
  >([]);
  const [taskInput, setTaskInput] = useState('');
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const newJobClientRef = useRef<HTMLDivElement | null>(null);
  const newJobClientSearchRef = useRef<HTMLInputElement | null>(null);

  const newJobClients = useMemo(() => {
    const needle = newJobClientSearch.trim();
    if (!needle) return clients;
    const filtered = clients.filter((c) => textMatch(`${c.code} ${c.name}`, needle));
    const selected = newJob.clientId ? clients.find((c) => c.id === newJob.clientId) ?? null : null;
    if (selected && !filtered.some((c) => c.id === selected.id)) return [selected, ...filtered];
    return filtered;
  }, [clients, newJob.clientId, newJobClientSearch]);

  const newJobSelectedClient = useMemo(() => {
    return newJob.clientId ? clients.find((c) => c.id === newJob.clientId) ?? null : null;
  }, [clients, newJob.clientId]);

  useEffect(() => {
    if (!newJobClientOpen) return;
    const onDown = (e: MouseEvent) => {
      const root = newJobClientRef.current;
      const target = e.target as Node | null;
      if (!root || !target) return;
      if (!root.contains(target)) setNewJobClientOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [newJobClientOpen]);

  useEffect(() => {
    if (!newJobClientOpen) return;
    setTimeout(() => newJobClientSearchRef.current?.focus(), 0);
  }, [newJobClientOpen]);

  useEffect(() => {
    if (!overdueUserId) return;
    setView('uncomplete');
    setSearch('');
    setFilterClientId('');
    setFilterManagerUserId('');
    setFilterJobName('');
    setPage(1);
  }, [overdueUserId, setFilterClientId, setFilterJobName, setFilterManagerUserId, setSearch, setView, setPage]);

  async function reloadJobsOnly() {
    const url = overdueUserId
      ? `/api/jobs?overdueUserId=${encodeURIComponent(overdueUserId)}${at ? `&at=${encodeURIComponent(at)}` : ''}`
      : '/api/jobs';
    const jobsRes = await fetch(url).catch(() => null);
    if (!jobsRes?.ok) return;
    const j = (await jobsRes.json().catch(() => null)) as { ok?: boolean; items?: JobListItem[] } | null;
    setItems(j?.items ?? []);
  }

  async function toggleJobCompleted(jobId: string, nextCompleted: boolean) {
    const res = await fetch(`/api/jobs/${jobId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ completed: nextCompleted }),
    }).catch(() => null);
    if (!res?.ok) return;
    const j = (await res.json().catch(() => null)) as { ok?: boolean; job?: { completed?: boolean } } | null;
    if (!j?.ok) return;
    setItems((prev) =>
      prev.map((it) => {
        if (it.job.id !== jobId) return it;
        const completed = j.job?.completed ?? nextCompleted;
        return { ...it, job: { ...it.job, completed, status: completed ? 'Complete' : it.job.status } };
      }),
    );
    await reloadJobsOnly();
  }

  async function deleteJobFromList(jobId: string) {
    if (me.role !== 'owner') return;
    const ok = window.confirm('Delete this job? It will appear in the Delete list.');
    if (!ok) return;
    const res = await fetch(`/api/jobs/${jobId}`, { method: 'DELETE' }).catch(() => null);
    if (!res?.ok) return;
    await reloadJobsOnly();
  }

  const filtered = useMemo(() => {
    return items.filter((it) => {
      const isDeleted = !!it.job.deletedAt;
      const isComplete = !!it.job.completed || it.job.status === 'Complete';
      if (view === 'delete') {
        if (!isDeleted) return false;
      } else {
        if (isDeleted) return false;
        if (view === 'complete' && !isComplete) return false;
        if (view === 'uncomplete' && isComplete) return false;
      }
      if (filterClientId && it.job.clientId !== filterClientId) return false;
      if (filterManagerUserId) {
        if (filterManagerUserId === '__none__') {
          if (it.job.managerUserId) return false;
        } else {
          if (it.job.managerUserId !== filterManagerUserId) return false;
        }
      }
      if (filterJobName) {
        if (it.job.name !== filterJobName) return false;
      }
      if (search.trim()) {
        const clientText = it.client ? `${it.client.code} ${it.client.name} ${it.client.contactPerson ?? ''}` : '';
        if (!textMatch(`${it.job.name} ${clientText}`, search)) return false;
      }
      return true;
    });
  }, [filterClientId, filterJobName, filterManagerUserId, items, search, view]);

  const dueKey = (dueDate?: string) => {
    if (!dueDate) return null;
    const head = dueDate.trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(head)) return null;
    return head;
  };

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const da = dueKey(a.job.dueDate);
      const db = dueKey(b.job.dueDate);
      if (!da && !db) return a.job.id.localeCompare(b.job.id);
      if (!da) return 1;
      if (!db) return -1;
      if (da !== db) return da.localeCompare(db);
      return a.job.id.localeCompare(b.job.id);
    });
  }, [filtered]);

  const total = sorted.length;
  const safePageSize = Math.max(1, Number(pageSize) || 20);
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const safePage = Math.min(Math.max(1, Number(page) || 1), totalPages);
  const pageStart = (safePage - 1) * safePageSize;
  const pageEnd = Math.min(total, pageStart + safePageSize);
  const visible = sorted.slice(pageStart, pageEnd);

  const exportResultsToExcel = () => {
    const escape = (v: string) =>
      v
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');

    const rows = sorted.map((it) => {
      const clientText = it.client ? `${it.client.code} ${it.client.name}` : '-';
      const manager = it.manager?.name ?? '-';
      const staff = it.staff?.name ?? (it.staffNames.length ? it.staffNames.join(', ') : '-');
      const tasks = `${it.tasks.done}/${it.tasks.total}`;
      const dueDate = it.job.dueDate ? formatDateDMY(it.job.dueDate) : '-';
      const createdAt = it.job.createdAt ? formatDateDMY(it.job.createdAt) : '-';
      const status = it.job.completed ? 'Complete' : it.job.status;
      return [clientText, it.job.name, tasks, dueDate, status, manager, staff, createdAt];
    });

    const html =
      `\ufeff<html><head><meta charset="utf-8" /></head><body><table border="1"><thead><tr>` +
      `<th>${escape('Client')}</th>` +
      `<th>${escape('Job Name')}</th>` +
      `<th>${escape('Tasks')}</th>` +
      `<th>${escape('Due Date')}</th>` +
      `<th>${escape('Status')}</th>` +
      `<th>${escape('Manager in charge')}</th>` +
      `<th>${escape('Staff')}</th>` +
      `<th>${escape('Created')}</th>` +
      `</tr></thead><tbody>` +
      rows
        .map((r) => `<tr>` + r.map((c) => `<td>${escape(c)}</td>`).join('') + `</tr>`)
        .join('') +
      `</tbody></table></body></html>`;

    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jobs-results-${todayYmdNow}.xls`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (Number(page) !== safePage) setPage(safePage);
  }, [page, safePage, setPage]);

  async function createJob() {
    setError(null);
    if (!newJob.clientId || !newJob.name.trim()) {
      setError('INVALID_INPUT');
      return;
    }
    if (newJob.repeat !== 'none' && !newJob.dueDate) {
      setError('DUE_DATE_REQUIRED');
      return;
    }
    const tasksToSend = draftTasks
      .map((t, idx) => ({
        title: t.title,
        dueDate: t.dueDate || undefined,
        assigneeUserId: t.assigneeUserId || undefined,
        status: t.done && hasPermission(me, 'tasks', 'complete') ? 'Done' : 'Todo',
        seq: idx + 1,
        sortOrder: idx + 1,
      }))
      .filter((t) => t.title.trim());
    const hasUnassigned = tasksToSend.some((t) => !t.assigneeUserId);
    if (hasUnassigned) {
      setError('TASK_UNASSIGNED');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clientId: newJob.clientId,
          name: newJob.name,
          label: newJob.label.trim() || undefined,
          dueDate: newJob.dueDate || undefined,
          repeat: newJob.repeat,
          managerUserId: newJob.managerUserId || undefined,
          tasks: tasksToSend,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        setError(j?.error ?? 'CREATE_FAILED');
        return;
      }
      await res.json().catch(() => null);
      setShowNewJob(false);
      setNewJobClientSearch('');
      setNewJobClientOpen(false);
      setNewJobNameChoice('__new__');
      setNewJob({
        clientId: '',
        name: '',
        label: '',
        dueDate: '',
        repeat: 'none',
        managerUserId: '',
      });
      setDraftTasks([]);
      setTaskInput('');
      setView('uncomplete');
      setPage(1);
      await reloadJobsOnly();
    } finally {
      setCreating(false);
    }
  }

  const canCreate = hasPermission(me, 'jobs', 'create');
  const canCreateTasks = hasPermission(me, 'tasks', 'create');
  const canCompleteTasks = hasPermission(me, 'tasks', 'complete');
  const hasUnassignedDraftTask = useMemo(
    () => draftTasks.some((t) => t.title.trim() && !t.assigneeUserId),
    [draftTasks],
  );
  const jobNameOptions = useMemo(() => {
    const set = new Set(items.map((it) => it.job.name).filter(Boolean));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [items]);
  const isOverdue = (dueDate?: string) => {
    if (!dueDate) return false;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return false;
    return dueDate < todayYmdNow;
  };

  function newTempId() {
    return globalThis.crypto?.randomUUID?.() ?? `tmp_${Math.random().toString(16).slice(2)}`;
  }

  function todayYmd() {
    return new Date().toISOString().slice(0, 10);
  }

  function addDraftTask() {
    const title = taskInput.trim();
    if (!title) return;
    setDraftTasks((prev) => {
      return [
        ...prev,
        {
          id: newTempId(),
          seq: prev.length + 1,
          title,
          dueDate: todayYmd(),
          done: false,
          createdByName: me.name,
          assigneeUserId: '',
        },
      ];
    });
    setTaskInput('');
  }

  function reorderDraftTasks(fromId: string, toId: string) {
    if (fromId === toId) return;
    setDraftTasks((prev) => {
      const fromIdx = prev.findIndex((t) => t.id === fromId);
      const toIdx = prev.findIndex((t) => t.id === toId);
      if (fromIdx < 0 || toIdx < 0) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next.map((t, idx) => ({ ...t, seq: idx + 1 }));
    });
  }

  return (
    <div className="flex-1">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <h1 className="text-xl font-semibold">Jobs</h1>
            <div className="hidden sm:flex items-center gap-2 text-sm">
              <button
                onClick={() => {
                  setView('uncomplete');
                  setPage(1);
                }}
                className={[
                  'rounded-full px-3 py-1.5 border',
                  view === 'uncomplete' ? 'bg-black text-white border-black' : 'bg-white border-black/10 text-black/70',
                ].join(' ')}
              >
                Uncomplete
              </button>
              <button
                onClick={() => {
                  setView('complete');
                  setPage(1);
                }}
                className={[
                  'rounded-full px-3 py-1.5 border',
                  view === 'complete' ? 'bg-black text-white border-black' : 'bg-white border-black/10 text-black/70',
                ].join(' ')}
              >
                Complete
              </button>
              <button
                onClick={() => {
                  setView('delete');
                  setPage(1);
                }}
                className={[
                  'rounded-full px-3 py-1.5 border',
                  view === 'delete' ? 'bg-black text-white border-black' : 'bg-white border-black/10 text-black/70',
                ].join(' ')}
              >
                Delete
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {me.role === 'owner' ? (
              <button
                type="button"
                disabled={sorted.length === 0}
                onClick={exportResultsToExcel}
                className="hidden sm:block text-sm text-black/60 hover:text-black disabled:opacity-40 disabled:hover:text-black/60"
              >
                Export results to Excel
              </button>
            ) : null}
            <button
              disabled={!canCreate}
              onClick={() => {
                if (!canCreate) return;
                setShowNewJob(true);
                setNewJobClientSearch('');
                setNewJobClientOpen(false);
                setNewJobNameChoice('__new__');
                if (!newJob.clientId && clients.length) {
                  setNewJob((v) => ({ ...v, clientId: clients[0]?.id ?? '' }));
                }
              }}
              className="rounded-full bg-[#5aa7ff] text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              New job
            </button>
          </div>
        </div>

        <div className="mt-4 rounded-xl bg-white border border-black/5">
          <div className="p-4 border-b border-black/5">
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="w-full sm:max-w-md rounded-lg border border-black/10 px-3 py-2 text-sm outline-none"
                placeholder="Find job, client, or contact person"
              />
            </div>

            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
              <select
                value={filterClientId}
                onChange={(e) => {
                  setFilterClientId(e.target.value);
                  setPage(1);
                }}
                className="rounded-md border border-black/10 px-2 py-2 text-sm bg-white"
              >
                <option value="">Client: All</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} {c.name}
                  </option>
                ))}
              </select>
              <select
                value={filterManagerUserId}
                onChange={(e) => {
                  setFilterManagerUserId(e.target.value);
                  setPage(1);
                }}
                className="rounded-md border border-black/10 px-2 py-2 text-sm bg-white"
              >
                <option value="">Manager in charge: All</option>
                <option value="__none__">(none)</option>
                {managerUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
              <select
                value={filterJobName}
                onChange={(e) => {
                  setFilterJobName(e.target.value);
                  setPage(1);
                }}
                className="rounded-md border border-black/10 px-2 py-2 text-sm bg-white"
              >
                <option value="">Job name: All</option>
                {jobNameOptions.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <div className="hidden lg:block col-span-2" />
              <div className="col-span-2 sm:col-span-4 lg:col-span-3 flex items-center justify-end gap-2 text-sm text-black/60">
                <div className="hidden sm:block">
                  {total === 0 ? '0' : `${pageStart + 1}-${pageEnd}`} / {total}
                </div>
                <select
                  value={safePageSize}
                  onChange={(e) => {
                    const next = Number(e.target.value) || 20;
                    setPageSize(next);
                    setPage(1);
                  }}
                  className="rounded-md border border-black/10 bg-white px-2 py-2 text-sm text-black/70"
                >
                  {[10, 20, 50, 100].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                <button
                  disabled={safePage <= 1}
                  onClick={() => setPage(safePage - 1)}
                  className="rounded-md border border-black/10 bg-white px-3 py-2 text-sm disabled:opacity-50"
                >
                  Prev
                </button>
                <div className="min-w-[72px] text-center">
                  {safePage} / {totalPages}
                </div>
                <button
                  disabled={safePage >= totalPages}
                  onClick={() => setPage(safePage + 1)}
                  className="rounded-md border border-black/10 bg-white px-3 py-2 text-sm disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-black/60">
                <tr className="border-b border-black/5">
                  <th className="px-4 py-3 font-medium w-10"></th>
                  <th className="px-4 py-3 font-medium">Client</th>
                  <th className="px-4 py-3 font-medium">Job Name</th>
                  <th className="px-4 py-3 font-medium">Tasks</th>
                  <th className="px-4 py-3 font-medium">Due Date</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap">Manager in charge</th>
                  <th className="px-4 py-3 font-medium">Staff</th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap min-w-[120px]">Creation date</th>
                  {showDeleteColumn ? <th className="px-4 py-3 font-medium w-24"></th> : null}
                </tr>
              </thead>
              <tbody>
                {visible.map((it) => (
                  <tr key={it.job.id} className="border-b border-black/5 hover:bg-black/[0.02]">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={!!it.job.completed}
                        disabled={
                          !!it.job.deletedAt ||
                          !(me.role === 'owner' || (me.role === 'manager' && it.job.managerUserId === me.id))
                        }
                        onChange={(e) => {
                          if (it.job.deletedAt) return;
                          if (e.target.checked && it.tasks.total > 0 && it.tasks.done < it.tasks.total) {
                            const ok = window.confirm('有未完成的 tasks。确定要完成该 job 并自动完成所有 tasks 吗？');
                            if (!ok) return;
                          }
                          void toggleJobCompleted(it.job.id, e.target.checked);
                        }}
                      />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap max-w-[220px]">
                      <div className="truncate" title={it.client ? `${it.client.code} ${it.client.name}` : ''}>
                        {it.client ? (
                          <Link className="text-[#2f7bdc] hover:underline" href={`/clients/${it.client.id}`}>
                            {it.client.code} {it.client.name}
                          </Link>
                        ) : (
                          '-'
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap max-w-[340px]">
                      <Link
                        className="text-[#2f7bdc] hover:underline truncate inline-block max-w-[340px]"
                        href={`/jobs/${it.job.id}`}
                        title={it.job.name}
                      >
                        {it.job.recurringFromJobId ? `↻ ${it.job.name}` : it.job.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {it.tasks.done}/{it.tasks.total}
                    </td>
                    <td
                      className={[
                        'px-4 py-3 whitespace-nowrap',
                        !it.job.dueDate
                          ? 'text-black/40'
                          : isOverdue(it.job.dueDate)
                            ? 'text-red-600'
                            : 'text-[#2f7bdc]',
                      ].join(' ')}
                    >
                      {formatDateDMY(it.job.dueDate)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-[#7a5cff]">
                      {it.job.deletedAt ? 'Deleted' : it.job.completed ? 'Complete' : it.job.status}
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
                    <td className="px-4 py-3 whitespace-nowrap max-w-[260px]">
                      <div className="truncate" title={it.staffNames.join(', ')}>
                        {it.staffNames.length ? it.staffNames.join(', ') : '-'}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {formatDateDMY(it.job.updatedAt ?? it.job.createdAt)}
                    </td>
                    {showDeleteColumn ? (
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <button
                          onClick={() => void deleteJobFromList(it.job.id)}
                          className="rounded-md border border-red-200 bg-white text-red-600 px-3 py-1.5 text-sm hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={showDeleteColumn ? 10 : 9} className="px-4 py-10 text-center text-black/50">
                      No jobs
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showNewJob ? (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-5 max-h-[calc(100vh-2rem)] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold">New job</div>
              <button
                onClick={() => {
                  setShowNewJob(false);
                  setNewJobClientSearch('');
                  setNewJobClientOpen(false);
                  setNewJobNameChoice('__new__');
                }}
                className="text-black/50 hover:text-black"
              >
                ✕
              </button>
            </div>

            {!canCreate ? (
              <div className="mt-4 text-sm text-red-600">FORBIDDEN</div>
            ) : (
              <>
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="text-sm">
                    <div className="text-black/70">Client</div>
                    <div ref={newJobClientRef} className="mt-1 relative">
                      <button
                        type="button"
                        onClick={() => setNewJobClientOpen((v) => !v)}
                        className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm bg-white flex items-center justify-between gap-2"
                      >
                        <span className="truncate">
                          {newJobSelectedClient ? `${newJobSelectedClient.code} ${newJobSelectedClient.name}` : '-'}
                        </span>
                        <span className="text-black/40">▾</span>
                      </button>
                      {newJobClientOpen ? (
                        <div className="absolute z-[70] mt-1 w-full rounded-lg border border-black/10 bg-white shadow-sm">
                          <div className="p-2 border-b border-black/5">
                            <input
                              ref={newJobClientSearchRef}
                              value={newJobClientSearch}
                              onChange={(e) => setNewJobClientSearch(e.target.value)}
                              className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none"
                              placeholder="Search client..."
                            />
                          </div>
                          <div className="max-h-56 overflow-y-auto">
                            {newJobClients.map((c) => (
                              <button
                                type="button"
                                key={c.id}
                                onClick={() => {
                                  setNewJob((v) => ({ ...v, clientId: c.id }));
                                  setNewJobClientOpen(false);
                                }}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-black/[0.02]"
                                title={`${c.code} ${c.name}`}
                              >
                                <div className="truncate">
                                  {c.code} {c.name}
                                </div>
                              </button>
                            ))}
                            {newJobClients.length === 0 ? (
                              <div className="px-3 py-2 text-sm text-black/50">No clients</div>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </label>
                  <label className="text-sm">
                    <div className="text-black/70">Due date</div>
                    <DateInputDMY
                      value={newJob.dueDate}
                      onChange={(dueDate) => setNewJob((v) => ({ ...v, dueDate }))}
                      className="mt-1"
                      inputClassName="rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="text-sm">
                    <div className="text-black/70">Repeat</div>
                    <select
                      value={newJob.repeat}
                      onChange={(e) =>
                        setNewJob((v) => ({ ...v, repeat: e.target.value as JobListItem['job']['repeat'] }))
                      }
                      className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm bg-white"
                    >
                      <option value="none">none</option>
                      <option value="monthly">monthly</option>
                      <option value="quarterly">quarterly</option>
                      <option value="yearly">yearly</option>
                      <option value="2-yearly">2-yearly</option>
                    </select>
                  </label>
                  <label className="text-sm">
                    <div className="text-black/70">Job name</div>
                    <select
                      value={newJobNameChoice}
                      onChange={(e) => {
                        const v = e.target.value;
                        setNewJobNameChoice(v);
                        if (v === '__new__') {
                          setNewJob((x) => ({ ...x, name: '' }));
                        } else {
                          setNewJob((x) => ({ ...x, name: v }));
                        }
                      }}
                      className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm bg-white"
                    >
                      <option value="__new__">new name</option>
                      {jobNameOptions.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                    {newJobNameChoice === '__new__' ? (
                      <input
                        value={newJob.name}
                        onChange={(e) => setNewJob((v) => ({ ...v, name: e.target.value }))}
                        className="mt-2 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                        placeholder="New job name..."
                      />
                    ) : null}
                  </label>
                  <label className="text-sm">
                    <div className="text-black/70">Remark</div>
                    <input
                      value={newJob.label}
                      onChange={(e) => setNewJob((v) => ({ ...v, label: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                      placeholder="Optional remark"
                    />
                  </label>
                  <label className="text-sm">
                    <div className="text-black/70">Manager in charge</div>
                    <select
                      value={newJob.managerUserId}
                      onChange={(e) => setNewJob((v) => ({ ...v, managerUserId: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm bg-white"
                    >
                      <option value="">(none)</option>
                      {managerUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.role})
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="mt-5 rounded-xl border border-black/10 p-4">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">Tasks</div>
                    {!canCreateTasks ? (
                      <div className="text-xs text-red-600">No permission to create tasks</div>
                    ) : null}
                  </div>

                  <div className="mt-3 flex gap-2">
                    <input
                      value={taskInput}
                      onChange={(e) => setTaskInput(e.target.value)}
                      className="flex-1 rounded-lg border border-black/10 px-3 py-2 text-sm outline-none"
                      placeholder="Add a task..."
                      disabled={!canCreateTasks}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addDraftTask();
                        }
                      }}
                    />
                    <button
                      onClick={addDraftTask}
                      disabled={!canCreateTasks}
                      className="rounded-lg bg-black text-white px-3 py-2 text-sm disabled:opacity-50"
                    >
                      Add
                    </button>
                  </div>

                  <div className="mt-3 divide-y divide-black/5">
                    {draftTasks.map((t) => (
                      <div
                        key={t.id}
                        className={[
                          'py-2 flex flex-wrap items-center gap-2',
                          draggingTaskId === t.id ? 'opacity-60' : '',
                        ].join(' ')}
                        draggable={canCreateTasks}
                        onDragStart={(e) => {
                          setDraggingTaskId(t.id);
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData('text/plain', t.id);
                        }}
                        onDragEnd={() => setDraggingTaskId(null)}
                        onDragOver={(e) => {
                          if (!draggingTaskId || draggingTaskId === t.id) return;
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const fromId = e.dataTransfer.getData('text/plain') || draggingTaskId;
                          if (!fromId) return;
                          reorderDraftTasks(fromId, t.id);
                          setDraggingTaskId(null);
                        }}
                      >
                        <div className="w-20 text-xs text-black/50">
                          {t.seq}. <span className="text-black/40">created by {t.createdByName}</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={t.done}
                          disabled={!canCompleteTasks}
                          onChange={(e) =>
                            setDraftTasks((prev) =>
                              prev.map((x) => (x.id === t.id ? { ...x, done: e.target.checked } : x)),
                            )
                          }
                        />
                        <input
                          value={t.title}
                          onChange={(e) =>
                            setDraftTasks((prev) =>
                              prev.map((x) => (x.id === t.id ? { ...x, title: e.target.value } : x)),
                            )
                          }
                          className={[
                            'flex-1 min-w-44 rounded-md border border-black/10 px-3 py-2 text-sm',
                            t.done ? 'line-through text-black/40' : '',
                          ].join(' ')}
                          placeholder="Task title"
                          disabled={!canCreateTasks}
                        />
                        <select
                          value={t.assigneeUserId}
                          onChange={(e) =>
                            setDraftTasks((prev) =>
                              prev.map((x) => (x.id === t.id ? { ...x, assigneeUserId: e.target.value } : x)),
                            )
                          }
                          className={[
                            'w-44 rounded-md border px-3 py-2 text-sm bg-white',
                            !t.assigneeUserId && t.title.trim() ? 'border-red-400' : 'border-black/10',
                          ].join(' ')}
                          disabled={!canCreateTasks}
                        >
                          <option value="">(unassigned)</option>
                          {assigneeUsers.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name} ({u.role})
                            </option>
                          ))}
                        </select>
                        <div className="w-full sm:w-28 text-sm text-black/60 whitespace-nowrap sm:text-right">
                          {formatDateDMY(t.dueDate)}
                        </div>
                        <button
                          onClick={() => setDraftTasks((prev) => prev.filter((x) => x.id !== t.id))}
                          className="text-black/40 hover:text-black"
                          disabled={!canCreateTasks}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    {draftTasks.length === 0 ? (
                      <div className="py-6 text-sm text-black/50 text-center">No tasks</div>
                    ) : null}
                  </div>
                </div>

                {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}

                <div className="mt-5 flex items-center justify-end gap-2">
                  <button
                    onClick={() => {
                      setShowNewJob(false);
                      setNewJobClientSearch('');
                      setNewJobClientOpen(false);
                      setNewJobNameChoice('__new__');
                    }}
                    className="rounded-lg border border-black/10 px-4 py-2 text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={creating || hasUnassignedDraftTask}
                    onClick={createJob}
                    className="rounded-lg bg-black text-white px-4 py-2 text-sm disabled:opacity-60"
                  >
                    {creating ? 'Creating...' : 'Create'}
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
