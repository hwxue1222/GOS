import type { JobStatus, JobTask } from '@/lib/types';

export function computeJobStatus(tasks: JobTask[]): JobStatus {
  if (tasks.length === 0) return 'Pending';
  const done = tasks.filter((t) => t.status === 'Done').length;
  if (done === 0) return 'Pending';
  if (done === tasks.length) return 'Complete';
  return 'Processing';
}

