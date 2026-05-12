'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
  client: { id: string; code: string; name: string } | null;
  tasks: { done: number; total: number };
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
  const router = useRouter();
  const [items, setItems] = useState<JobListItem[]>(initialItems);
  const [clients] = useState<Client[]>(initialClients);
  const [users] = useState<User[]>(initialUsers);
  const [me] = useState<User>(initialMe);
  const managerUsers = useMemo(() => users.filter((u) => u.role === 'manager' || u.role === 'owner'), [users]);

  const [search, setSearch] = usePersistedState('gos.jobs.search', '');
  const [filterClientId, setFilterClientId] = usePersistedState<string>('gos.jobs.filter.clientId', '');
  const [view, setView] = usePersistedState<'uncomplete' | 'complete' | 'delete'>('gos.jobs.view', 'uncomplete');
  const showDeleteColumn = me.role === 'owner' && view !== 'delete';

  const [showNewJob, setShowNewJob] = useState(false);
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

  async function reloadJobsOnly() {
    const jobsRes = await fetch('/api/jobs').catch(() => null);
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
      if (search.trim()) {
        const clientText = it.client ? `${it.client.code} ${it.client.name}` : '';
        if (!textMatch(`${it.job.name} ${clientText}`, search)) return false;
      }
      return true;
    });
  }, [filterClientId, items, search, view]);

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
      const j = (await res.json().catch(() => null)) as { ok?: boolean; job?: { id?: string } } | null;
      setShowNewJob(false);
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
      const jobId = j?.job?.id;
      if (jobId) router.push(`/jobs/${jobId}`);
      else await reloadJobsOnly();
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
                onClick={() => setView('uncomplete')}
                className={[
                  'rounded-full px-3 py-1.5 border',
                  view === 'uncomplete' ? 'bg-black text-white border-black' : 'bg-white border-black/10 text-black/70',
                ].join(' ')}
              >
                Uncomplete
              </button>
              <button
                onClick={() => setView('complete')}
                className={[
                  'rounded-full px-3 py-1.5 border',
                  view === 'complete' ? 'bg-black text-white border-black' : 'bg-white border-black/10 text-black/70',
                ].join(' ')}
              >
                Complete
              </button>
              <button
                onClick={() => setView('delete')}
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
            <div className="hidden sm:block text-sm text-black/60">Export results to Excel</div>
            <button
              disabled={!canCreate}
              onClick={() => {
                if (!canCreate) return;
                setShowNewJob(true);
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
                onChange={(e) => setSearch(e.target.value)}
                className="w-full sm:max-w-md rounded-lg border border-black/10 px-3 py-2 text-sm outline-none"
                placeholder="Find job or client by name"
              />
            </div>

            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
              <select
                value={filterClientId}
                onChange={(e) => setFilterClientId(e.target.value)}
                className="rounded-md border border-black/10 px-2 py-2 text-sm bg-white"
              >
                <option value="">Client: All</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} {c.name}
                  </option>
                ))}
              </select>
              <div className="hidden lg:block col-span-7" />
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
                  <th className="px-4 py-3 font-medium">Manager</th>
                  <th className="px-4 py-3 font-medium">Creation date</th>
                  {showDeleteColumn ? <th className="px-4 py-3 font-medium w-24"></th> : null}
                </tr>
              </thead>
              <tbody>
                {filtered.map((it) => (
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
                    <td className="px-4 py-3 whitespace-nowrap text-red-600">{formatDateDMY(it.job.dueDate)}</td>
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
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={showDeleteColumn ? 9 : 8} className="px-4 py-10 text-center text-black/50">
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
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center px-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-5">
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold">New job</div>
              <button onClick={() => setShowNewJob(false)} className="text-black/50 hover:text-black">
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
                    <select
                      value={newJob.clientId}
                      onChange={(e) => setNewJob((v) => ({ ...v, clientId: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm bg-white"
                    >
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.code} {c.name}
                        </option>
                      ))}
                    </select>
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
                    <input
                      value={newJob.name}
                      onChange={(e) => setNewJob((v) => ({ ...v, name: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                      placeholder="e.g. Corporate secretary service_AGM"
                    />
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
                          {users.map((u) => (
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
                    onClick={() => setShowNewJob(false)}
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
