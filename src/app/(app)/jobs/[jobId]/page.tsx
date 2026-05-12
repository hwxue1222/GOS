import AppTopNav from '@/components/AppTopNav';
import JobDetailClient from '@/app/(app)/jobs/ui/JobDetailClient';
import { getCurrentUser } from '@/lib/auth';
import { findJobById, listClients, listTasksByJob } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  const me = await getCurrentUser();
  if (!me) return null;
  const job = await findJobById(jobId);
  if (!job) {
    return (
      <div className="min-h-screen flex flex-col">
        <AppTopNav active="jobs" />
        <div className="flex-1">
          <div className="max-w-6xl mx-auto px-4 py-6">
            <div className="rounded-xl bg-white border border-black/5 p-6 text-sm text-red-600">NOT_FOUND</div>
          </div>
        </div>
      </div>
    );
  }

  const canViewAllJobs = hasPermission(me, 'jobs', 'viewAll');
  const canViewAssignedJobs = hasPermission(me, 'jobs', 'viewAssigned');
  const assigned = job.managerUserId === me.id || job.staffUserId === me.id;
  if (!canViewAllJobs && !(canViewAssignedJobs && assigned)) {
    return (
      <div className="min-h-screen flex flex-col">
        <AppTopNav active="jobs" />
        <div className="flex-1">
          <div className="max-w-6xl mx-auto px-4 py-6">
            <div className="rounded-xl bg-white border border-black/5 p-6 text-sm text-red-600">FORBIDDEN</div>
          </div>
        </div>
      </div>
    );
  }

  const [clients, tasks] = await Promise.all([listClients(), listTasksByJob(jobId)]);
  const client = clients.find((c) => c.id === job.clientId) ?? null;
  const canViewAllTasks = hasPermission(me, 'tasks', 'viewAll') || canViewAllJobs;
  const canViewAssignedTasks = hasPermission(me, 'tasks', 'viewAssigned') || canViewAssignedJobs;
  const visibleTasks = canViewAllTasks || (canViewAssignedTasks && assigned) ? tasks : [];
  const canEdit = hasPermission(me, 'tasks', 'create');
  return (
    <div className="min-h-screen flex flex-col">
      <AppTopNav active="jobs" />
      <JobDetailClient
        jobId={jobId}
        initialJob={job}
        initialClient={client}
        initialTasks={visibleTasks}
        canEdit={!!canEdit}
      />
    </div>
  );
}
