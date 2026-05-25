import AppTopNav from '@/components/AppTopNav';
import ClientDetailClient from '@/app/(app)/clients/ui/ClientDetailClient';
import { getCurrentUser } from '@/lib/auth';
import { listClientDirectors, listClients, listJobs, listTasksByJob, listUsers } from '@/lib/db';
import { computeJobStatus } from '@/lib/jobStatus';
import { hasPermission } from '@/lib/permissions';

export default async function ClientDetailPage({ params }: { params: Promise<{ clientId: string }> }) {
  const me = await getCurrentUser();
  if (!me) return null;

  const { clientId } = await params;

  const canViewAllJobs = hasPermission(me, 'jobs', 'viewAll');
  const canViewAssignedJobs = hasPermission(me, 'jobs', 'viewAssigned');
  if (!canViewAllJobs && !canViewAssignedJobs) {
    return (
      <div className="min-h-screen flex flex-col">
        <AppTopNav active="clients" />
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

  const visibleJobs = canViewAllJobs
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

  const client = clientsAll.find((c) => c.id === clientId) ?? null;
  if (!client) {
    return (
      <div className="min-h-screen flex flex-col">
        <AppTopNav active="clients" />
        <div className="flex-1">
          <div className="max-w-6xl mx-auto px-4 py-6">
            <div className="rounded-xl bg-white border border-black/5 p-6 text-sm text-red-600">NOT_FOUND</div>
          </div>
        </div>
      </div>
    );
  }
  if (client.deletedAt) {
    return (
      <div className="min-h-screen flex flex-col">
        <AppTopNav active="clients" />
        <div className="flex-1">
          <div className="max-w-6xl mx-auto px-4 py-6">
            <div className="rounded-xl bg-white border border-black/5 p-6 text-sm text-red-600">NOT_FOUND</div>
          </div>
        </div>
      </div>
    );
  }

  const canViewAllClients = hasPermission(me, 'clients', 'viewAll');
  if (!canViewAllClients && !visibleJobs.some((j) => j.clientId === clientId)) {
    return (
      <div className="min-h-screen flex flex-col">
        <AppTopNav active="clients" />
        <div className="flex-1">
          <div className="max-w-6xl mx-auto px-4 py-6">
            <div className="rounded-xl bg-white border border-black/5 p-6 text-sm text-red-600">FORBIDDEN</div>
          </div>
        </div>
      </div>
    );
  }

  const canViewAllStaffs = hasPermission(me, 'staffs', 'viewAll');
  const safeUsers = (canViewAllStaffs ? usersAll : usersAll.filter((u) => u.id === me.id)).map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
  }));

  const jobs = visibleJobs.filter((j) => j.clientId === clientId);
  const items = await Promise.all(
    jobs.map(async (job) => {
      const manager = job.managerUserId ? safeUsers.find((u) => u.id === job.managerUserId) ?? null : null;
      const tasks = taskByJobId.get(job.id) ?? (await listTasksByJob(job.id));
      const done = tasks.filter((t) => t.status === 'Done').length;
      return {
        job: { ...job, status: job.completed ? 'Complete' : computeJobStatus(tasks) },
        tasks: { done, total: tasks.length },
        manager: manager ? { id: manager.id, name: manager.name } : null,
      };
    }),
  );

  const canUpdateClient = hasPermission(me, 'clients', 'update');
  const directors = await listClientDirectors(clientId, { includeResigned: true });

  return (
    <div className="min-h-screen flex flex-col">
      <AppTopNav active="clients" />
      <ClientDetailClient
        initialMe={me}
        initialClient={client}
        initialJobs={items}
        initialDirectors={directors}
        canUpdateClient={canUpdateClient}
      />
    </div>
  );
}
