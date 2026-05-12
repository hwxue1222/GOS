import AppTopNav from '@/components/AppTopNav';
import JobsClient from '@/app/(app)/jobs/ui/JobsClient';
import { getCurrentUser } from '@/lib/auth';
import { listClients, listJobs, listTasksByJob, listUsers } from '@/lib/db';
import { computeJobStatus } from '@/lib/jobStatus';
import { hasPermission } from '@/lib/permissions';

export default async function JobsPage() {
  const me = await getCurrentUser();
  if (!me) return null;

  const canViewAllJobs = hasPermission(me, 'jobs', 'viewAll');
  const canViewAssignedJobs = hasPermission(me, 'jobs', 'viewAssigned');
  if (!canViewAllJobs && !canViewAssignedJobs) {
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

  const [clientsAll, jobsAll, usersAll] = await Promise.all([listClients(), listJobs(), listUsers()]);
  const taskByJobId = new Map<string, Awaited<ReturnType<typeof listTasksByJob>>>();
  const jobs = canViewAllJobs
    ? jobsAll
    : (
        await Promise.all(
          jobsAll.map(async (j) => {
            const tasks = await listTasksByJob(j.id);
            taskByJobId.set(j.id, tasks);
            const assigned =
              j.managerUserId === me.id ||
              j.staffUserId === me.id ||
              j.createdByUserId === me.id ||
              tasks.some((t) => t.assigneeUserId === me.id);
            return assigned ? j : null;
          }),
        )
      ).filter((j): j is (typeof jobsAll)[number] => j !== null);

  const canViewAllStaffs = hasPermission(me, 'staffs', 'viewAll');
  const safeUsers = (canViewAllStaffs ? usersAll : usersAll.filter((u) => u.id === me.id)).map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
  }));

  const canViewAllClients = hasPermission(me, 'clients', 'viewAll');
  const clients = canViewAllClients
    ? clientsAll
    : clientsAll.filter((c) => jobs.some((j) => j.clientId === c.id));

  const items = await Promise.all(
    jobs.map(async (job) => {
      const client = clients.find((c) => c.id === job.clientId) ?? null;
      const manager = job.managerUserId ? safeUsers.find((u) => u.id === job.managerUserId) ?? null : null;
      const staff = job.staffUserId ? safeUsers.find((u) => u.id === job.staffUserId) ?? null : null;
      const tasks = taskByJobId.get(job.id) ?? (await listTasksByJob(job.id));
      const done = tasks.filter((t) => t.status === 'Done').length;
      return {
        job: { ...job, status: computeJobStatus(tasks) },
        client: client ? { id: client.id, code: client.code, name: client.name } : null,
        tasks: { done, total: tasks.length },
        manager: manager ? { id: manager.id, name: manager.name } : null,
        staff: staff ? { id: staff.id, name: staff.name } : null,
      };
    }),
  );

  return (
    <div className="min-h-screen flex flex-col">
      <AppTopNav active="jobs" />
      <JobsClient initialItems={items} initialClients={clients} initialUsers={safeUsers} initialMe={me} />
    </div>
  );
}
