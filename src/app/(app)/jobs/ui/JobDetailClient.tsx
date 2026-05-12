'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { formatDateDMY } from '@/lib/date';

type Job = {
  id: string;
  clientId: string;
  name: string;
  dueDate?: string;
  repeat: 'none' | 'monthly' | 'quarterly' | 'yearly' | '2-yearly';
  status: 'Pending' | 'Processing' | 'Complete';
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
  canCreateTask: boolean;
  canCompleteTask: boolean;
  canReorderTask: boolean;
};

export default function JobDetailClient({
  jobId,
  initialJob,
  initialClient,
  initialTasks,
  initialUsers,
  canCreateTask,
  canCompleteTask,
  canReorderTask,
}: Props) {
  const [job] = useState<Job | null>(initialJob);
  const [client] = useState<{ id: string; code: string; name: string } | null>(initialClient);
  const [tasks, setTasks] = useState<JobTask[]>(initialTasks);
  const [users] = useState(initialUsers);
  const [loading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newAssigneeUserId, setNewAssigneeUserId] = useState<string>(initialJob?.staffUserId ?? '');
  const [creating, setCreating] = useState(false);

  const doneCount = useMemo(() => tasks.filter((t) => t.status === 'Done').length, [tasks]);

  function todayYmd() {
    return new Date().toISOString().slice(0, 10);
  }

  async function addTask() {
    if (!canCreateTask) {
      setError('FORBIDDEN');
      return;
    }
    if (!newTitle.trim()) return;
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

  async function toggleTask(t: JobTask) {
    if (!canCompleteTask) return;
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
        x.id === j.task!.id ? { ...j.task!, createdByName: x.createdByName ?? j.task!.createdByName } : x,
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
                className="flex-1 rounded-lg border border-black/10 px-3 py-2 text-sm outline-none"
                placeholder="Add a task..."
              />
              <select
                value={newAssigneeUserId}
                onChange={(e) => setNewAssigneeUserId(e.target.value)}
                className="w-44 rounded-lg border border-black/10 px-3 py-2 text-sm bg-white"
              >
                <option value="">(unassigned)</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role})
                  </option>
                ))}
              </select>
              <button
                disabled={creating}
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
                        disabled={!canCompleteTask}
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
                          Created {formatDateDMY(t.createdAt)}
                          {t.createdByName ? ` · by ${t.createdByName}` : ''}
                          {t.assigneeName ? ` · Assigned to ${t.assigneeName}` : ''}
                          {t.dueDate ? ` · Due ${formatDateDMY(t.dueDate)}` : ''}
                        </div>
                      </div>
                    </label>
                  </div>
                  <div className="text-xs text-black/50">{t.status}</div>
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
