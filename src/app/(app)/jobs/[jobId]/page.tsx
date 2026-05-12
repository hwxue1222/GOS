import AppTopNav from '@/components/AppTopNav';
import JobDetailClient from '@/app/(app)/jobs/ui/JobDetailClient';
import { getCurrentUser } from '@/lib/auth';
import { findJobById, listClients, listTasksByJob } from '@/lib/db';

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  const me = await getCurrentUser();
  const job = await findJobById(jobId);
  const [clients, tasks] = await Promise.all([listClients(), listTasksByJob(jobId)]);
  const client = job ? clients.find((c) => c.id === job.clientId) ?? null : null;
  const canEdit = me?.role === 'owner' || me?.role === 'manager';
  return (
    <div className="min-h-screen flex flex-col">
      <AppTopNav active="jobs" />
      <JobDetailClient
        jobId={jobId}
        initialJob={job}
        initialClient={client}
        initialTasks={tasks}
        canEdit={!!canEdit}
      />
    </div>
  );
}
