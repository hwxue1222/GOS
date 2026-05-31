'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatDateDMY } from '@/lib/date';
import { DateInputDMY } from '@/components/DateInputDMY';

type Job = {
  id: string;
  clientId: string;
  name: string;
  label?: string;
  dueDate?: string;
  repeat: 'none' | 'monthly' | 'quarterly' | 'yearly' | '2-yearly';
  status: 'Pending' | 'Processing' | 'Complete';
  completed?: boolean;
  managerUserId?: string;
  staffUserId?: string;
};

type JobTask = {
  id: string;
  jobId: string;
  seq: number;
  sortOrder: number;
  title: string;
  dueDate?: string;
  status: 'Todo' | 'Done';
  assigneeUserId?: string;
  assigneeName?: string | null;
  createdByUserId?: string;
  createdByName?: string | null;
  createdAt: string;
};

type Props = {
  jobId: string;
  initialJob: Job | null;
  initialClient: { id: string; code: string; name: string } | null;
  initialClients: Array<{ id: string; code: string; name: string }>;
  initialTasks: JobTask[];
  initialUsers: Array<{ id: string; name: string; role: 'owner' | 'manager' | 'staff' }>;
  meId: string;
  canDeleteJob: boolean;
  canDuplicateJob: boolean;
  canModifyJob: boolean;
  canUpdateJob: boolean;
  canCreateTask: boolean;
  canCompleteTask: boolean;
  canUpdateTask: boolean;
  canReorderTask: boolean;
};

export default function JobDetailClient({
  jobId,
  initialJob,
  initialClient,
  initialClients,
  initialTasks,
  initialUsers,
  meId,
  canDeleteJob,
  canDuplicateJob,
  canModifyJob,
  canUpdateJob,
  canCreateTask,
  canCompleteTask,
  canUpdateTask,
  canReorderTask,
}: Props) {
  const router = useRouter();
  const [job, setJob] = useState<Job | null>(initialJob);
  const [client] = useState<{ id: string; code: string; name: string } | null>(initialClient);
  const [clients] = useState(initialClients);
  const [tasks, setTasks] = useState<JobTask[]>(initialTasks);
  const [users] = useState(initialUsers);
  const [loading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const successTimerRef = useRef<number | null>(null);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [savingTasks, setSavingTasks] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [deletingTasks, setDeletingTasks] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newAssigneeUserId, setNewAssigneeUserId] = useState<string>('');
  const [creating, setCreating] = useState(false);
  const [jobDraft, setJobDraft] = useState<{
    name: string;
    label: string;
    dueDate: string;
    repeat: Job['repeat'];
    managerUserId: string;
  }>({
    name: initialJob?.name ?? '',
    label: initialJob?.label ?? '',
    dueDate: initialJob?.dueDate ?? '',
    repeat: initialJob?.repeat ?? 'none',
    managerUserId: initialJob?.managerUserId ?? '',
  });
  const [savingJob, setSavingJob] = useState(false);
  const [showDuplicate, setShowDuplicate] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [duplicateErrors, setDuplicateErrors] = useState<{
    clients?: string;
    name?: string;
    dueDate?: string;
    tasks?: string;
    managerUserId?: string;
    general?: string;
  }>({});
  const [clientSearch, setClientSearch] = useState('');
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [dupDraft, setDupDraft] = useState<{
    name: string;
    label: string;
    dueDate: string;
    repeat: Job['repeat'];
    managerUserId: string;
  }>({
    name: initialJob?.name ?? '',
    label: initialJob?.label ?? '',
    dueDate: initialJob?.dueDate ?? '',
    repeat: initialJob?.repeat ?? 'none',
    managerUserId: initialJob?.managerUserId ?? '',
  });
  const [dupTasks, setDupTasks] = useState<
    Array<{ key: string; title: string; createdAt: string; assigneeUserId: string }>
  >([]);
  const [tasksSnapshot, setTasksSnapshot] = useState(() => {
    const orderIds = initialTasks.map((t) => t.id);
    const titlesById = Object.fromEntries(initialTasks.map((t) => [t.id, t.title]));
    return { orderIds, titlesById };
  });

  const doneCount = useMemo(() => tasks.filter((t) => t.status === 'Done').length, [tasks]);
  const meRole = useMemo(() => users.find((u) => u.id === meId)?.role ?? 'staff', [meId, users]);
  const managerUsers = useMemo(() => users.filter((u) => u.role === 'manager'), [users]);
  const assigneeUsers = useMemo(() => {
    if (meRole === 'manager') {
      return users.filter((u) => u.role === 'staff' || u.id === meId);
    }
    return users.filter((u) => u.role === 'manager' || u.role === 'staff');
  }, [meId, meRole, users]);

  useEffect(() => {
    return () => {
      if (successTimerRef.current) window.clearTimeout(successTimerRef.current);
    };
  }, []);

  function todayYmd() {
    return new Date().toISOString().slice(0, 10);
  }

  function toYmd(input?: string | null) {
    if (!input) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
    const d = new Date(input);
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
  }

  async function saveJob() {
    if (!canUpdateJob) return true;
    if (!jobDraft.name.trim()) {
      setError('INVALID_INPUT');
      return false;
    }
    setSavingJob(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: jobDraft.name,
          label: jobDraft.label || undefined,
          dueDate: jobDraft.dueDate || undefined,
          repeat: jobDraft.repeat,
          managerUserId: jobDraft.managerUserId || undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        setError(j?.error ?? 'UPDATE_FAILED');
        return false;
      }
      const j = (await res.json().catch(() => null)) as { ok?: boolean; job?: Job } | null;
      if (j?.job) {
        setJob(j.job);
        setJobDraft({
          name: j.job.name ?? '',
          label: j.job.label ?? '',
          dueDate: j.job.dueDate ?? '',
          repeat: j.job.repeat ?? 'none',
          managerUserId: j.job.managerUserId ?? '',
        });
      }
      return true;
    } finally {
      setSavingJob(false);
    }
  }

  async function deleteThisJob() {
    if (!canDeleteJob) return;
    const ok = window.confirm('Delete this job? It will appear in the Delete list.');
    if (!ok) return;
    setError(null);
    const res = await fetch(`/api/jobs/${jobId}`, { method: 'DELETE' }).catch(() => null);
    if (!res?.ok) {
      const j = await res?.json().catch(() => null);
      setError(j?.error ?? `HTTP_${res?.status ?? 'NETWORK'}`);
      return;
    }
    router.push('/jobs');
    router.refresh();
  }

  function openDuplicate() {
    if (!canDuplicateJob) return;
    setDuplicateErrors({});
    setClientSearch('');
    setSelectedClientIds([]);
    setDupDraft({
      name: job?.name ?? jobDraft.name,
      label: job?.label ?? jobDraft.label,
      dueDate: job?.dueDate ?? jobDraft.dueDate,
      repeat: job?.repeat ?? jobDraft.repeat,
      managerUserId: job?.managerUserId ?? jobDraft.managerUserId,
    });
    setDupTasks(
      tasks.map((t) => ({
        key: t.id,
        title: t.title,
        createdAt: toYmd(t.createdAt) || todayYmd(),
        assigneeUserId: t.assigneeUserId ?? '',
      })),
    );
    setTimeout(() => setShowDuplicate(true), 0);
  }

  function toggleSelectedClient(id: string) {
    setSelectedClientIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const displayClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    const selectedSet = new Set(selectedClientIds);
    const selected = clients.filter((c) => selectedSet.has(c.id));
    const unselected = clients.filter((c) => !selectedSet.has(c.id));
    const filteredUnselected = q ? unselected.filter((c) => `${c.code} ${c.name}`.toLowerCase().includes(q)) : unselected;
    return [...selected, ...filteredUnselected];
  }, [clientSearch, clients, selectedClientIds]);

  async function submitDuplicate() {
    if (!canDuplicateJob) return;
    const nextErrors: typeof duplicateErrors = {};
    if (!selectedClientIds.length) nextErrors.clients = 'Select at least one client.';
    if (!dupDraft.name.trim()) nextErrors.name = 'Job name is required.';
    if (dupDraft.repeat !== 'none' && !dupDraft.dueDate.trim()) {
      nextErrors.dueDate = 'Due date is required when repeat is not none.';
    }
    const hasUnassigned = dupTasks.some((t) => t.title.trim() && !t.assigneeUserId.trim());
    if (hasUnassigned) nextErrors.tasks = 'Each task must have an assignee.';
    if (Object.keys(nextErrors).length) {
      setDuplicateErrors(nextErrors);
      return;
    }
    setDuplicateErrors({});

    setDuplicating(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/duplicate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clientIds: selectedClientIds,
          name: dupDraft.name,
          label: dupDraft.label || undefined,
          dueDate: dupDraft.dueDate || undefined,
          repeat: dupDraft.repeat,
          managerUserId: dupDraft.managerUserId || undefined,
          tasks: dupTasks
            .map((t) => ({
              title: t.title,
              createdAt: t.createdAt || undefined,
              assigneeUserId: t.assigneeUserId || undefined,
            }))
            .filter((t) => (t.title?.trim() ?? '') !== ''),
        }),
      }).catch(() => null);
      if (!res?.ok) {
        const j = await res?.json().catch(() => null);
        const err = j?.error ?? `HTTP_${res?.status ?? 'NETWORK'}`;
        const field = typeof j?.field === 'string' ? j.field : null;
        if (err === 'TASK_UNASSIGNED') {
          setDuplicateErrors({ tasks: 'Each task must have an assignee.' });
          return;
        }
        if (err === 'INVALID_INPUT') {
          if (field === 'clientIds') setDuplicateErrors({ clients: 'Select at least one client.' });
          else if (field === 'name') setDuplicateErrors({ name: 'Job name is required.' });
          else if (field === 'dueDate') setDuplicateErrors({ dueDate: 'Due date is required when repeat is not none.' });
          else if (field === 'managerUserId') setDuplicateErrors({ managerUserId: 'Manager in charge is invalid.' });
          else setDuplicateErrors({ general: 'Invalid input. Please check the form.' });
          return;
        }
        setDuplicateErrors({ general: err });
        return;
      }
      setShowDuplicate(false);
      router.push('/jobs');
      router.refresh();
    } finally {
      setDuplicating(false);
    }
  }

  async function addTask() {
    if (!canCreateTask) {
      setError('FORBIDDEN');
      return;
    }
    if (!newTitle.trim()) return;
    if (!newAssigneeUserId) {
      setError('TASK_UNASSIGNED');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/tasks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: newTitle,
          dueDate: todayYmd(),
          assigneeUserId: newAssigneeUserId || undefined,
        }),
      });
      if (res.ok) {
        const j = (await res.json().catch(() => null)) as { ok?: boolean; task?: JobTask } | null;
        if (j?.task) {
          const next = [...tasks, j.task!].sort((a, b) => a.sortOrder - b.sortOrder);
          setTasks(next);
          setTasksSnapshot({
            orderIds: next.map((t) => t.id),
            titlesById: Object.fromEntries(next.map((t) => [t.id, t.title])),
          });
        }
        setNewTitle('');
      } else {
        const j = await res.json().catch(() => null);
        setError(j?.error ?? 'CREATE_FAILED');
      }
    } finally {
      setCreating(false);
    }
  }

  async function patchTask(taskId: string, patch: Partial<Pick<JobTask, 'dueDate' | 'assigneeUserId'>>) {
    if (!canUpdateTask) return;
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    }).catch(() => null);
    if (!res?.ok) return;
    const j = (await res.json().catch(() => null)) as { ok?: boolean; task?: JobTask } | null;
    if (!j?.task) return;
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== j.task!.id) return t;
        return {
          ...t,
          ...j.task!,
          createdByName: j.task!.createdByName ?? t.createdByName,
          assigneeName: j.task!.assigneeName ?? t.assigneeName,
        };
      }),
    );
  }

  async function toggleTask(t: JobTask) {
    if (!canCompleteTask) return;
    if (!canModifyJob && t.assigneeUserId !== meId) return;
    const next = t.status === 'Done' ? 'Todo' : 'Done';
    const res = await fetch(`/api/tasks/${t.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: next }),
    }).catch(() => null);
    if (!res?.ok) return;
    const j = (await res.json().catch(() => null)) as { ok?: boolean; task?: JobTask } | null;
    if (!j?.task) return;
    setTasks((prev) =>
      prev.map((x) =>
        x.id === j.task!.id
          ? {
              ...j.task!,
              createdByName: j.task!.createdByName ?? x.createdByName,
              assigneeName: j.task!.assigneeName ?? x.assigneeName,
            }
          : x,
      ),
    );
  }

  function toggleSelectedTask(taskId: string) {
    setSelectedTaskIds((prev) => (prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId]));
  }

  async function deleteSelectedTasks() {
    if (!canUpdateTask) return;
    if (!selectedTaskIds.length) return;
    const ok = window.confirm(`Delete ${selectedTaskIds.length} selected tasks?`);
    if (!ok) return;
    setTasksError(null);
    setDeletingTasks(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/tasks`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ taskIds: selectedTaskIds }),
      }).catch(() => null);
      if (!res?.ok) {
        const j = await res?.json().catch(() => null);
        setTasksError(j?.error ?? `HTTP_${res?.status ?? 'NETWORK'}`);
        return;
      }
      const j = (await res.json().catch(() => null)) as { ok?: boolean; tasks?: JobTask[] } | null;
      const tasksFromServer = j?.tasks ?? [];
      const next = [...tasksFromServer].sort((a, b) => a.sortOrder - b.sortOrder);
      setTasks(next);
      setTasksSnapshot({
        orderIds: next.map((t) => t.id),
        titlesById: Object.fromEntries(next.map((t) => [t.id, t.title])),
      });
      setSelectedTaskIds([]);
    } finally {
      setDeletingTasks(false);
    }
  }

  async function saveTasks() {
    if (!canUpdateTask) return true;
    setTasksError(null);
    const titlesById: Record<string, string> = {};
    for (const t of tasks) {
      const title = t.title.trim();
      if (!title) {
        setTasksError('Task title is required.');
        return false;
      }
      const savedTitle = tasksSnapshot.titlesById[t.id];
      if (typeof savedTitle === 'string' && savedTitle !== title) {
        titlesById[t.id] = title;
      }
    }
    const currentOrderIds = tasks.map((t) => t.id);
    let orderChanged = currentOrderIds.length !== tasksSnapshot.orderIds.length;
    if (!orderChanged) {
      for (let i = 0; i < currentOrderIds.length; i++) {
        if (currentOrderIds[i] !== tasksSnapshot.orderIds[i]) {
          orderChanged = true;
          break;
        }
      }
    }
    const hasTitles = Object.keys(titlesById).length > 0;
    if (!orderChanged && !hasTitles) return true;

    setSavingTasks(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/tasks/order`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...(orderChanged ? { orderedIds: currentOrderIds } : {}),
          ...(hasTitles ? { titlesById } : {}),
        }),
      }).catch(() => null);
      if (!res?.ok) {
        const j = await res?.json().catch(() => null);
        setTasksError(j?.error ?? `HTTP_${res?.status ?? 'NETWORK'}`);
        return false;
      }
      const j = (await res.json().catch(() => null)) as { ok?: boolean; tasks?: Array<JobTask> } | null;
      const tasksFromServer = j?.tasks;
      if (!tasksFromServer) return false;
      const createdByNameById = new Map(tasks.map((t) => [t.id, t.createdByName]));
      const assigneeNameById = new Map(tasks.map((t) => [t.id, t.assigneeName]));
      const next = tasksFromServer
        .map((t) => ({
          ...t,
          createdByName: createdByNameById.get(t.id) ?? t.createdByName,
          assigneeName: assigneeNameById.get(t.id) ?? t.assigneeName,
        }))
        .sort((a, b) => a.sortOrder - b.sortOrder);
      setTasks(next);
      setTasksSnapshot({
        orderIds: next.map((t) => t.id),
        titlesById: Object.fromEntries(next.map((t) => [t.id, t.title])),
      });
      return true;
    } finally {
      setSavingTasks(false);
    }
  }

  async function updateAll() {
    setError(null);
    setTasksError(null);
    setSuccess(null);
    if (successTimerRef.current) window.clearTimeout(successTimerRef.current);
    const okJob = await saveJob();
    if (!okJob) return;
    const okTasks = await saveTasks();
    if (!okTasks) return;
    setSuccess('Updated successfully');
    successTimerRef.current = window.setTimeout(() => setSuccess(null), 2000);
  }

  return (
    <div className="flex-1">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 text-sm text-black/60">
          <Link href="/jobs" className="text-[#2f7bdc] hover:underline">
            Jobs
          </Link>
          <span>/</span>
          <span className="text-black/80">{job?.name ?? jobId}</span>
        </div>

        <div className="mt-3 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{job?.name ?? 'Job'}</h1>
            <div className="text-sm text-black/60 mt-1">
              {client ? `${client.code} ${client.name}` : '-'} · Due {formatDateDMY(job?.dueDate)} ·{' '}
              {doneCount}/{tasks.length} tasks done
            </div>
          </div>
          <div className="flex items-center justify-end gap-2">
            {canDuplicateJob ? (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openDuplicate();
                }}
                className="rounded-lg border border-black/10 bg-white px-4 py-2 text-sm hover:bg-black/[0.02]"
              >
                Duplicate
              </button>
            ) : null}
            {canDeleteJob ? (
              <button
                onClick={deleteThisJob}
                className="rounded-lg border border-red-200 bg-white text-red-600 px-4 py-2 text-sm hover:bg-red-50"
              >
                Delete job
              </button>
            ) : null}
          </div>
        </div>

        {canUpdateJob ? (
          <div className="mt-4 rounded-xl bg-white border border-black/5 p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-sm">
                <div className="text-black/70">Job name</div>
                <input
                  value={jobDraft.name}
                  onChange={(e) => setJobDraft((v) => ({ ...v, name: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                />
              </label>
              <label className="text-sm">
                <div className="text-black/70">Remark</div>
                <input
                  value={jobDraft.label}
                  onChange={(e) => setJobDraft((v) => ({ ...v, label: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                />
              </label>
              <label className="text-sm">
                <div className="text-black/70">Due date</div>
                <DateInputDMY
                  value={jobDraft.dueDate}
                  onChange={(dueDate) => setJobDraft((v) => ({ ...v, dueDate }))}
                  className="mt-1"
                  inputClassName="border-0 bg-transparent px-0 py-2 text-sm text-black/80"
                />
              </label>
              <label className="text-sm">
                <div className="text-black/70">Repeat</div>
                <select
                  value={jobDraft.repeat}
                  onChange={(e) => setJobDraft((v) => ({ ...v, repeat: e.target.value as Job['repeat'] }))}
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
                <div className="text-black/70">Manager in charge</div>
                <select
                  value={jobDraft.managerUserId}
                  onChange={(e) => setJobDraft((v) => ({ ...v, managerUserId: e.target.value }))}
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
            <div className="mt-3 flex items-center gap-2">
              {success ? <div className="text-sm text-green-700">{success}</div> : null}
              <button
                disabled={savingJob || savingTasks}
                onClick={updateAll}
                className="ml-auto rounded-lg bg-black text-white px-4 py-2 text-sm disabled:opacity-60"
              >
                {savingJob || savingTasks ? 'Updating...' : 'Update'}
              </button>
            </div>
          </div>
        ) : null}

        <div className="mt-6 rounded-xl bg-white border border-black/5">
          <div className="p-4 border-b border-black/5 flex items-center justify-between">
            <div className="font-medium">Tasks</div>
            <div className="flex items-center gap-3">
              {tasksError ? <div className="text-sm text-red-600">{tasksError}</div> : null}
              {canUpdateTask && tasks.length ? (
                <button
                  onClick={() => setSelectedTaskIds((prev) => (prev.length === tasks.length ? [] : tasks.map((t) => t.id)))}
                  className="text-sm text-black/60 hover:text-black"
                >
                  {selectedTaskIds.length === tasks.length ? 'Clear' : 'Select all'}
                </button>
              ) : null}
              {canUpdateTask && selectedTaskIds.length ? (
                <button
                  disabled={deletingTasks || savingTasks}
                  onClick={deleteSelectedTasks}
                  className="text-sm text-red-600 hover:text-red-700 disabled:opacity-60"
                >
                  {deletingTasks ? 'Deleting...' : `Delete selected (${selectedTaskIds.length})`}
                </button>
              ) : null}
              <div className="text-sm text-black/60">{doneCount}/{tasks.length}</div>
            </div>
          </div>

          <div className="p-4">
            <div
              className="flex gap-2"
              onDropCapture={(e) => {
                if (!draggingTaskId) return;
                e.preventDefault();
                e.stopPropagation();
                setDraggingTaskId(null);
              }}
            >
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="flex-1 rounded-lg border border-black/10 px-3 py-2 text-sm outline-none disabled:opacity-60"
                placeholder="Add a task..."
                disabled={!canCreateTask}
              />
              <select
                value={newAssigneeUserId}
                onChange={(e) => setNewAssigneeUserId(e.target.value)}
                className="w-44 rounded-lg border border-black/10 px-3 py-2 text-sm bg-white disabled:opacity-60"
                disabled={!canCreateTask}
              >
                <option value="">(assign required)</option>
                {assigneeUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role})
                  </option>
                ))}
              </select>
              <button
                disabled={creating || !canCreateTask}
                onClick={addTask}
                className="rounded-lg bg-black text-white px-4 py-2 text-sm disabled:opacity-60"
              >
                Add
              </button>
            </div>

            {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}

            <div className="mt-4 divide-y divide-black/5">
              {tasks.map((t) => (
                <div
                  key={t.id}
                  className="w-full flex items-center justify-between px-2 py-3 text-left hover:bg-black/[0.02]"
                  onDragOver={(e) => {
                    if (!canReorderTask) return;
                    const fromId = draggingTaskId ?? e.dataTransfer.getData('text/plain');
                    if (!fromId || fromId === t.id) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                  }}
                  onDrop={(e) => {
                    if (!canReorderTask) return;
                    e.preventDefault();
                    const fromId = draggingTaskId ?? e.dataTransfer.getData('text/plain');
                    if (!fromId || fromId === t.id) return;
                    const fromIdx = tasks.findIndex((x) => x.id === fromId);
                    const toIdx = tasks.findIndex((x) => x.id === t.id);
                    if (fromIdx < 0 || toIdx < 0) return;
                    const next = [...tasks];
                    const [moved] = next.splice(fromIdx, 1);
                    next.splice(toIdx, 0, moved);
                    const withOrder = next.map((x, idx) => ({ ...x, sortOrder: idx + 1, seq: idx + 1 }));
                    setTasks(withOrder);
                    setDraggingTaskId(null);
                  }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 text-sm text-black/50">{t.seq}.</div>
                    {canReorderTask ? (
                      <div className="w-6 flex items-center justify-center">
                        <span
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.effectAllowed = 'move';
                            e.dataTransfer.setData('text/plain', t.id);
                            setDraggingTaskId(t.id);
                          }}
                          onDragEnd={() => setDraggingTaskId(null)}
                          className="text-black/30 cursor-move select-none"
                          title="Drag to reorder"
                        >
                          ⋮⋮
                        </span>
                      </div>
                    ) : (
                      <div className="w-6" />
                    )}
                    <label className="flex items-center gap-3 min-w-0">
                      <input
                        type="checkbox"
                        checked={t.status === 'Done'}
                        disabled={
                          !canCompleteTask ||
                          (meRole === 'manager' ? !canModifyJob : (!canModifyJob && t.assigneeUserId !== meId))
                        }
                        onChange={() => toggleTask(t)}
                      />
                      <div className="min-w-0">
                        {canUpdateTask ? (
                          <input
                            value={t.title}
                            onChange={(e) => {
                              const v = e.target.value;
                              setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, title: v } : x)));
                            }}
                            className={[
                              'w-full bg-transparent rounded-md border border-black/10 px-2 py-1 text-sm',
                              t.status === 'Done' ? 'line-through text-black/40' : '',
                            ].join(' ')}
                          />
                        ) : (
                          <div
                            className={[
                              'truncate',
                              t.status === 'Done' ? 'line-through text-black/40' : '',
                            ].join(' ')}
                            title={t.title}
                          >
                            {t.title}
                          </div>
                        )}
                        <div className="text-xs text-black/50">
                          {t.createdByName ? `created by ${t.createdByName}` : 'created'}
                          {t.createdAt ? ` · Creation ${formatDateDMY(t.createdAt)}` : ''}
                          {t.assigneeName ? ` · Assigned to ${t.assigneeName}` : ''}
                        </div>
                      </div>
                    </label>
                  </div>
                  {canUpdateTask ? (
                    <div className="flex items-center gap-2">
                      <select
                        value={t.assigneeUserId ?? ''}
                        onChange={(e) => void patchTask(t.id, { assigneeUserId: e.target.value || undefined })}
                        className="w-44 rounded-lg border border-black/10 px-3 py-2 text-sm bg-white"
                      >
                        <option value="">(unassigned)</option>
                        {assigneeUsers.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name} ({u.role})
                          </option>
                        ))}
                      </select>
                      <input
                        type="checkbox"
                        checked={selectedTaskIds.includes(t.id)}
                        onChange={() => toggleSelectedTask(t.id)}
                        title="Select for delete"
                      />
                    </div>
                  ) : (
                    <div className="text-xs text-black/50">-</div>
                  )}
                </div>
              ))}
              {!loading && tasks.length === 0 ? (
                <div className="py-10 text-center text-black/50 text-sm">No tasks</div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {showDuplicate ? (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center px-4">
          <div className="w-full max-w-5xl rounded-xl bg-white p-5 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold">Duplicate job</div>
              <button onClick={() => setShowDuplicate(false)} className="text-black/50 hover:text-black">
                ✕
              </button>
            </div>
            <div className="mt-2 text-sm text-black/60">
              This is a temporary template. Editing here will not change the original job.
            </div>

            <div className="mt-4 grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4">
              <div className="rounded-xl border border-black/5 p-4">
                <div className="text-sm font-medium">Copy to clients</div>
                <input
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  className="mt-2 w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none"
                  placeholder="Find client..."
                />
                {duplicateErrors.clients ? <div className="mt-2 text-sm text-red-600">{duplicateErrors.clients}</div> : null}
                <div className="mt-3 max-h-[340px] overflow-y-auto rounded-lg border border-black/5">
                  {displayClients.map((c) => (
                    <label
                      key={c.id}
                      className="flex items-center gap-3 px-3 py-2 border-b border-black/5 last:border-b-0 hover:bg-black/[0.02] cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedClientIds.includes(c.id)}
                        onChange={() => toggleSelectedClient(c.id)}
                      />
                      <div className="min-w-0">
                        <div className="truncate text-sm" title={`${c.code} ${c.name}`}>
                          {c.code} {c.name}
                        </div>
                      </div>
                    </label>
                  ))}
                  {displayClients.length === 0 ? (
                    <div className="px-3 py-8 text-sm text-black/50 text-center">No clients</div>
                  ) : null}
                </div>
              </div>

              <div className="rounded-xl border border-black/5 p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="text-sm">
                    <div className="text-black/70">Job name</div>
                    <input
                      value={dupDraft.name}
                      onChange={(e) => setDupDraft((v) => ({ ...v, name: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                    />
                    {duplicateErrors.name ? <div className="mt-1 text-sm text-red-600">{duplicateErrors.name}</div> : null}
                  </label>
                  <label className="text-sm">
                    <div className="text-black/70">Remark</div>
                    <input
                      value={dupDraft.label}
                      onChange={(e) => setDupDraft((v) => ({ ...v, label: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="text-sm">
                    <div className="text-black/70">Due date</div>
                    <DateInputDMY
                      value={dupDraft.dueDate}
                      onChange={(dueDate) => setDupDraft((v) => ({ ...v, dueDate }))}
                      className="mt-1"
                      inputClassName="border-0 bg-transparent px-0 py-2 text-sm text-black/80"
                    />
                    {duplicateErrors.dueDate ? <div className="mt-1 text-sm text-red-600">{duplicateErrors.dueDate}</div> : null}
                  </label>
                  <label className="text-sm">
                    <div className="text-black/70">Repeat</div>
                    <select
                      value={dupDraft.repeat}
                      onChange={(e) => setDupDraft((v) => ({ ...v, repeat: e.target.value as Job['repeat'] }))}
                      className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm bg-white"
                    >
                      <option value="none">none</option>
                      <option value="monthly">monthly</option>
                      <option value="quarterly">quarterly</option>
                      <option value="yearly">yearly</option>
                      <option value="2-yearly">2-yearly</option>
                    </select>
                  </label>
                  <label className="text-sm sm:col-span-2">
                    <div className="text-black/70">Manager in charge</div>
                    <select
                      value={dupDraft.managerUserId}
                      onChange={(e) => setDupDraft((v) => ({ ...v, managerUserId: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm bg-white"
                    >
                      <option value="">(none)</option>
                      {managerUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.role})
                        </option>
                      ))}
                    </select>
                    {duplicateErrors.managerUserId ? (
                      <div className="mt-1 text-sm text-red-600">{duplicateErrors.managerUserId}</div>
                    ) : null}
                  </label>
                </div>

                <div className="mt-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">Tasks</div>
                    <button
                      onClick={() =>
                        setDupTasks((prev) => [
                          ...prev,
                          {
                            key: `new_${Date.now()}_${Math.random().toString(16).slice(2)}`,
                            title: '',
                            createdAt: todayYmd(),
                            assigneeUserId: '',
                          },
                        ])
                      }
                      className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm hover:bg-black/[0.02]"
                    >
                      + Add task
                    </button>
                  </div>

                  <div className="mt-3 rounded-xl border border-black/5 overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="text-left text-black/60">
                        <tr className="border-b border-black/5">
                          <th className="px-3 py-2 font-medium">Title</th>
                          <th className="px-3 py-2 font-medium">Assignee</th>
                          <th className="px-3 py-2 font-medium">Creation date</th>
                          <th className="px-3 py-2 font-medium"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {dupTasks.map((t, idx) => (
                          <tr key={t.key} className="border-b border-black/5 last:border-b-0">
                            <td className="px-3 py-2 min-w-[280px]">
                              <input
                                value={t.title}
                                onChange={(e) =>
                                  setDupTasks((prev) =>
                                    prev.map((x, i) => (i === idx ? { ...x, title: e.target.value } : x)),
                                  )
                                }
                                className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                                placeholder="Task title"
                              />
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              <select
                                value={t.assigneeUserId}
                                onChange={(e) =>
                                  setDupTasks((prev) =>
                                    prev.map((x, i) => (i === idx ? { ...x, assigneeUserId: e.target.value } : x)),
                                  )
                                }
                                className="w-56 rounded-lg border border-black/10 px-3 py-2 text-sm bg-white"
                              >
                                <option value="">(assign required)</option>
                                {assigneeUsers.map((u) => (
                                  <option key={u.id} value={u.id}>
                                    {u.name} ({u.role})
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              <DateInputDMY
                                value={t.createdAt}
                                onChange={(createdAt) =>
                                  setDupTasks((prev) => prev.map((x, i) => (i === idx ? { ...x, createdAt } : x)))
                                }
                                className="w-36"
                                inputClassName="border-0 bg-transparent px-0 py-2 text-sm text-black/80"
                              />
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap text-right">
                              <button
                                onClick={() => setDupTasks((prev) => prev.filter((_, i) => i !== idx))}
                                className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm hover:bg-black/[0.02]"
                              >
                                Remove
                              </button>
                            </td>
                          </tr>
                        ))}
                        {dupTasks.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="px-3 py-8 text-center text-black/50">
                              No tasks
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </div>

                {duplicateErrors.tasks ? <div className="mt-3 text-sm text-red-600">{duplicateErrors.tasks}</div> : null}
                {duplicateErrors.general ? <div className="mt-3 text-sm text-red-600">{duplicateErrors.general}</div> : null}

                <div className="mt-5 flex items-center justify-end gap-2">
                  <button
                    onClick={() => setShowDuplicate(false)}
                    className="rounded-lg border border-black/10 px-4 py-2 text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={duplicating}
                    onClick={submitDuplicate}
                    className="rounded-lg bg-black text-white px-4 py-2 text-sm disabled:opacity-60"
                  >
                    {duplicating ? 'Duplicating...' : 'Duplicate'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
