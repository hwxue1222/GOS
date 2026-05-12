import AppTopNav from '@/components/AppTopNav';
import JobsClient from '@/app/(app)/jobs/ui/JobsClient';
import { getCurrentUser } from '@/lib/auth';
import { listClients, listJobs, listTasksByJob, listUsers } from '@/lib/db';
import { computeJobStatus } from '@/lib/jobStatus';

export default async function JobsPage() {
  const me = await getCurrentUser();
  const [clients, jobs, users] = await Promise.all([listClients(), listJobs(), listUsers()]);
  const safeUsers = users.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role }));

  const items = await Promise.all(
    jobs.map(async (job) => {
      const client = clients.find((c) => c.id === job.clientId) ?? null;
      const manager = job.managerUserId ? safeUsers.find((u) => u.id === job.managerUserId) ?? null : null;
      const staff = job.staffUserId ? safeUsers.find((u) => u.id === job.staffUserId) ?? null : null;
      const tasks = await listTasksByJob(job.id);
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
      {me ? (
        <JobsClient initialItems={items} initialClients={clients} initialUsers={safeUsers} initialMe={me} />
      ) : null}
    </div>
  );
}
