'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
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
  initialTasks: JobTask[];
  initialUsers: Array<{ id: string; name: string; role: 'owner' | 'manager' | 'staff' }>;
  meId: string;
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
  initialTasks,
  initialUsers,
  meId,
  canModifyJob,
  canUpdateJob,
  canCreateTask,
  canCompleteTask,
  canUpdateTask,
  canReorderTask,
}: Props) {
  const [job, setJob] = useState<Job | null>(initialJob);
  const [client] = useState<{ id: string; code: string; name: string } | null>(initialClient);
  const [tasks, setTasks] = useState<JobTask[]>(initialTasks);
  const [users] = useState(initialUsers);
  const [loading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  const doneCount = useMemo(() => tasks.filter((t) => t.status === 'Done').length, [tasks]);
  const managerUsers = useMemo(() => users.filter((u) => u.role === 'manager' || u.role === 'owner'), [users]);
  const assigneeUsers = useMemo(() => users.filter((u) => u.role === 'manager' || u.role === 'staff'), [users]);

  function todayYmd() {
    return new Date().toISOString().slice(0, 10);
  }

  async function saveJob() {
    if (!canUpdateJob) return;
    if (!jobDraft.name.trim()) {
      setError('INVALID_INPUT');
      return;
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
        return;
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
    } finally {
      setSavingJob(false);
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
        if (j?.task) setTasks((prev) => [...prev, j.task!].sort((a, b) => a.sortOrder - b.sortOrder));
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

  async function persistOrder(next: JobTask[]) {
    if (!canReorderTask) return;
    const orderedIds = next.map((t) => t.id);
    const res = await fetch(`/api/jobs/${jobId}/tasks/order`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orderedIds }),
    }).catch(() => null);
    if (!res?.ok) return;
    const j = (await res.json().catch(() => null)) as { ok?: boolean; tasks?: Array<JobTask> } | null;
    const tasksFromServer = j?.tasks;
    if (!tasksFromServer) return;
    setTasks((prev) => {
      const createdByNameById = new Map(prev.map((t) => [t.id, t.createdByName]));
      const assigneeNameById = new Map(prev.map((t) => [t.id, t.assigneeName]));
      return tasksFromServer
        .map((t) => ({
          ...t,
          createdByName: createdByNameById.get(t.id) ?? t.createdByName,
          assigneeName: assigneeNameById.get(t.id) ?? t.assigneeName,
        }))
        .sort((a, b) => a.sortOrder - b.sortOrder);
    });
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
            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                disabled={savingJob}
                onClick={saveJob}
                className="rounded-lg bg-black text-white px-4 py-2 text-sm disabled:opacity-60"
              >
                {savingJob ? 'Updating...' : 'Update'}
              </button>
            </div>
          </div>
        ) : null}

        <div className="mt-6 rounded-xl bg-white border border-black/5">
          <div className="p-4 border-b border-black/5 flex items-center justify-between">
            <div className="font-medium">Tasks</div>
            <div className="text-sm text-black/60">{doneCount}/{tasks.length}</div>
          </div>

          <div className="p-4">
            <div className="flex gap-2">
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
                  draggable={canReorderTask}
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', t.id);
                  }}
                  onDragOver={(e) => {
                    if (!canReorderTask) return;
                    const fromId = e.dataTransfer.getData('text/plain');
                    if (!fromId || fromId === t.id) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                  }}
                  onDrop={(e) => {
                    if (!canReorderTask) return;
                    e.preventDefault();
                    const fromId = e.dataTransfer.getData('text/plain');
                    if (!fromId || fromId === t.id) return;
                    const fromIdx = tasks.findIndex((x) => x.id === fromId);
                    const toIdx = tasks.findIndex((x) => x.id === t.id);
                    if (fromIdx < 0 || toIdx < 0) return;
                    const next = [...tasks];
                    const [moved] = next.splice(fromIdx, 1);
                    next.splice(toIdx, 0, moved);
                    const withOrder = next.map((x, idx) => ({ ...x, sortOrder: idx + 1, seq: idx + 1 }));
                    setTasks(withOrder);
                    void persistOrder(withOrder);
                  }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 text-sm text-black/50">{t.seq}.</div>
                    <label className="flex items-center gap-3 min-w-0">
                      <input
                        type="checkbox"
                        checked={t.status === 'Done'}
                        disabled={
                          !canCompleteTask ||
                          (!canModifyJob && t.assigneeUserId !== meId)
                        }
                        onChange={() => toggleTask(t)}
                      />
                      <div className="min-w-0">
                        <div
                          className={[
                            'truncate',
                            t.status === 'Done' ? 'line-through text-black/40' : '',
                          ].join(' ')}
                          title={t.title}
                        >
                          {t.title}
                        </div>
                        <div className="text-xs text-black/50">
                          {t.createdByName ? `created by ${t.createdByName}` : 'created'}
                          {t.createdAt ? ` · ${formatDateDMY(t.createdAt)}` : ''}
                          {t.assigneeName ? ` · Assigned to ${t.assigneeName}` : ''}
                          {t.dueDate ? ` · Due ${formatDateDMY(t.dueDate)}` : ''}
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
                      <DateInputDMY
                        value={t.dueDate ?? ''}
                        onChange={(dueDate) => void patchTask(t.id, { dueDate: dueDate || undefined })}
                        className="w-36"
                        inputClassName="border-0 bg-transparent px-0 py-2 text-sm text-black/80"
                      />
                    </div>
                  ) : (
                    <div className="text-xs text-black/50">{t.dueDate ? formatDateDMY(t.dueDate) : '-'}</div>
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
    </div>
  );
}
