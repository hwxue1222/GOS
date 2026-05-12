'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

type Job = {
  id: string;
  clientId: string;
  name: string;
  dueDate?: string;
  repeat: 'none' | 'monthly' | 'quarterly' | 'yearly' | '2-yearly';
  status: 'Pending' | 'Processing' | 'Complete';
};

type JobTask = {
  id: string;
  jobId: string;
  title: string;
  dueDate?: string;
  status: 'Todo' | 'Done';
  createdAt: string;
};

type Props = {
  jobId: string;
  initialJob: Job | null;
  initialClient: { id: string; code: string; name: string } | null;
  initialTasks: JobTask[];
  canEdit: boolean;
};

export default function JobDetailClient({
  jobId,
  initialJob,
  initialClient,
  initialTasks,
  canEdit,
}: Props) {
  const [job] = useState<Job | null>(initialJob);
  const [client] = useState<{ id: string; code: string; name: string } | null>(initialClient);
  const [tasks, setTasks] = useState<JobTask[]>(initialTasks);
  const [loading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);

  const doneCount = useMemo(() => tasks.filter((t) => t.status === 'Done').length, [tasks]);

  async function addTask() {
    if (!canEdit) {
      setError('FORBIDDEN');
      return;
    }
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/tasks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: newTitle }),
      });
      if (res.ok) {
        const j = (await res.json().catch(() => null)) as { ok?: boolean; task?: JobTask } | null;
        if (j?.task) setTasks((prev) => [j.task!, ...prev]);
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
    const next = t.status === 'Done' ? 'Todo' : 'Done';
    const res = await fetch(`/api/tasks/${t.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: next }),
    }).catch(() => null);
    if (!res?.ok) return;
    const j = (await res.json().catch(() => null)) as { ok?: boolean; task?: JobTask } | null;
    if (!j?.task) return;
    setTasks((prev) => prev.map((x) => (x.id === j.task!.id ? j.task! : x)));
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
              {client ? `${client.code} ${client.name}` : '-'} · Due {job?.dueDate ?? '-'} ·{' '}
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
                <button
                  key={t.id}
                  onClick={() => toggleTask(t)}
                  className="w-full flex items-center justify-between px-2 py-3 text-left hover:bg-black/[0.02]"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={[
                        'h-5 w-5 rounded-full border flex items-center justify-center text-xs',
                        t.status === 'Done' ? 'bg-[#2f7bdc] border-[#2f7bdc] text-white' : 'border-black/20',
                      ].join(' ')}
                    >
                      {t.status === 'Done' ? '✓' : ''}
                    </div>
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
                        Created {new Date(t.createdAt).toLocaleString()}
                        {t.dueDate ? ` · Due ${t.dueDate}` : ''}
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-black/50">{t.status}</div>
                </button>
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
