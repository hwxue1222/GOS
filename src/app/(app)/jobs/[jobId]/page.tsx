import AppTopNav from '@/components/AppTopNav';
import JobDetailClient from '@/app/(app)/jobs/ui/JobDetailClient';
import { getCurrentUser } from '@/lib/auth';
import { findJobById, listClients, listTasksByJob, listUsers } from '@/lib/db';
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
  const [clients, tasksAll] = await Promise.all([listClients(), listTasksByJob(jobId)]);
  const assignedByFields = job.managerUserId === me.id || job.staffUserId === me.id;
  const assignedByTask = tasksAll.some((t) => t.assigneeUserId === me.id);
  const assignedByCreator = job.createdByUserId === me.id;
  const assignedAny = assignedByFields || assignedByTask || assignedByCreator;
  const canAccess = canViewAllJobs || (canViewAssignedJobs && assignedAny) || (me.role === 'staff' && assignedByTask);
  if (!canAccess) {
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

  const client = clients.find((c) => c.id === job.clientId) ?? null;
  const visibleTasks = tasksAll;
  const canModifyJob = me.role === 'owner' || (me.role === 'manager' && job.createdByUserId === me.id);
  const canUpdateJob = canModifyJob && hasPermission(me, 'jobs', 'update');
  const canCreateTask = canModifyJob && hasPermission(me, 'tasks', 'create');
  const canCompleteTask = hasPermission(me, 'tasks', 'complete');
  const canUpdateTask = canModifyJob && hasPermission(me, 'tasks', 'update');
  const canReorderTask = canUpdateTask;

  const users = await listUsers();
  const neededIds = new Set<string>([
    me.id,
    ...(job.managerUserId ? [job.managerUserId] : []),
    ...(job.staffUserId ? [job.staffUserId] : []),
    ...visibleTasks.map((t) => t.assigneeUserId).filter(Boolean),
    ...visibleTasks.map((t) => t.createdByUserId).filter(Boolean),
  ] as string[]);
  const nameById = new Map(users.filter((u) => neededIds.has(u.id)).map((u) => [u.id, u.name]));
  const enrichedTasks = visibleTasks.map((t) => ({
    ...t,
    createdByName: t.createdByUserId ? nameById.get(t.createdByUserId) ?? null : null,
    assigneeName: t.assigneeUserId ? nameById.get(t.assigneeUserId) ?? null : null,
  }));
  return (
    <div className="min-h-screen flex flex-col">
      <AppTopNav active="jobs" />
      <JobDetailClient
        jobId={jobId}
        initialJob={job}
        initialClient={client}
        initialTasks={enrichedTasks}
        initialUsers={users.map((u) => ({ id: u.id, name: u.name, role: u.role }))}
        meId={me.id}
        canModifyJob={canModifyJob}
        canUpdateJob={canUpdateJob}
        canCreateTask={canCreateTask}
        canCompleteTask={canCompleteTask}
        canUpdateTask={canUpdateTask}
        canReorderTask={canReorderTask}
      />
    </div>
  );
}
