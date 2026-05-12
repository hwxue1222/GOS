import { promises as fs } from 'fs';
import path from 'path';
import { hashPassword } from '@/lib/password';
import { newId } from '@/lib/id';
import type { Client, Db, Job, JobTask, Permissions, Role, Session, User } from '@/lib/types';

const KV_DB_KEY = process.env.GOS_KV_DB_KEY?.trim() || 'gos:db';

function getDbFilePath() {
  const fromEnv = process.env.GOS_DB_PATH?.trim();
  if (fromEnv) return fromEnv;
  if (process.env.VERCEL) return path.join('/tmp', 'gos', 'db.json');
  return path.join(process.cwd(), '.gos', 'db.json');
}

const DB_FILE = getDbFilePath();

function nowIso() {
  return new Date().toISOString();
}

async function ensureDir() {
  await fs.mkdir(path.dirname(DB_FILE), { recursive: true });
}

function emptyDb(): Db {
  return { users: [], sessions: [], clients: [], jobs: [], tasks: [], reservedNames: [] };
}

function normalizeDb(parsed: Db): Db {
  const keyOfName = (name: string) => name.trim().toLowerCase();
  const users = (parsed.users ?? []).map((u) => ({
    ...u,
    position: (u as User).position,
    permissions: (u as User).permissions,
  }));

  const reservedFromDb = Array.isArray((parsed as unknown as { reservedNames?: unknown }).reservedNames)
    ? ((parsed as unknown as { reservedNames?: string[] }).reservedNames ?? [])
    : [];
  const reservedSet = new Set<string>();
  for (const rn of reservedFromDb) {
    const k = keyOfName(rn ?? '');
    if (k) reservedSet.add(k);
  }
  for (const u of users) {
    const k = keyOfName(u.name);
    if (k) reservedSet.add(k);
  }
  const clients = (parsed.clients ?? []).map((c) => ({
    ...c,
    tags: (c as Client).tags ?? [],
    companyRegistrationNo: (c as Client).companyRegistrationNo,
    contactPerson: (c as Client).contactPerson,
    address: (c as Client).address,
    deletedAt: (c as Client).deletedAt,
  }));
  const jobs = (parsed.jobs ?? []).map((j) => ({
    ...j,
    repeat: (j as Job).repeat ?? 'none',
    status: (j as Job).status ?? 'Pending',
    completed: (j as Job).completed ?? false,
    deletedAt: (j as Job).deletedAt,
    updatedAt: (j as Job).updatedAt ?? (j as Job).createdAt,
    recurringFromJobId: (j as Job).recurringFromJobId,
    createdByUserId: (j as Job).createdByUserId ?? (j as Job).managerUserId ?? undefined,
  }));

  const tasks = (parsed.tasks ?? []).map((t) => ({
    ...t,
    seq: (t as JobTask).seq,
    sortOrder: (t as JobTask).sortOrder,
    createdByUserId: (t as JobTask).createdByUserId,
  }));

  const byJob = new Map<string, Array<JobTask & { createdAt: string }>>();
  for (const t of tasks as Array<JobTask & { createdAt: string }>) {
    if (!byJob.has(t.jobId)) byJob.set(t.jobId, []);
    byJob.get(t.jobId)!.push(t);
  }
  for (const [jobId, list] of byJob) {
    const needs = list.some((t) => typeof t.seq !== 'number' || typeof t.sortOrder !== 'number');
    if (!needs) continue;
    const sorted = [...list].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const idToSeq = new Map(sorted.map((t, i) => [t.id, i + 1]));
    for (const t of list) {
      const seq = idToSeq.get(t.id) ?? 1;
      if (typeof t.seq !== 'number') (t as unknown as { seq: number }).seq = seq;
      if (typeof t.sortOrder !== 'number') (t as unknown as { sortOrder: number }).sortOrder = seq;
    }
    byJob.set(jobId, list);
  }
  return {
    users,
    sessions: parsed.sessions ?? [],
    clients,
    jobs,
    tasks: tasks as unknown as JobTask[],
    reservedNames: [...reservedSet],
  };
}

async function hasKv(): Promise<boolean> {
  return !!process.env.KV_REST_API_URL && !!process.env.KV_REST_API_TOKEN;
}

async function hasRedis(): Promise<boolean> {
  return !!process.env.REDIS_URL;
}

type RedisClient = {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<unknown>;
};

async function getRedisClient(): Promise<RedisClient> {
  const g = globalThis as unknown as {
    __gosRedisClientPromise?: Promise<RedisClient>;
  };
  if (g.__gosRedisClientPromise) return g.__gosRedisClientPromise;
  g.__gosRedisClientPromise = (async () => {
    const mod = (await import('redis')) as unknown as {
      createClient: (opts: { url: string }) => {
        connect: () => Promise<void>;
        get: (key: string) => Promise<string | null>;
        set: (key: string, value: string) => Promise<unknown>;
      };
    };
    const url = process.env.REDIS_URL;
    if (!url) throw new Error('REDIS_URL missing');
    const client = mod.createClient({ url });
    await client.connect();
    return client;
  })();
  return g.__gosRedisClientPromise;
}

async function readDbRaw(): Promise<Db> {
  try {
    if (await hasKv()) {
      const mod = (await import('@vercel/kv')) as unknown as { kv: { get: (key: string) => Promise<unknown> } };
      const raw = await mod.kv.get(KV_DB_KEY);
      if (!raw) return emptyDb();
      if (typeof raw === 'string') return normalizeDb(JSON.parse(raw) as Db);
      return normalizeDb(raw as Db);
    }
    if (await hasRedis()) {
      const redis = await getRedisClient();
      const raw = await redis.get(KV_DB_KEY);
      if (!raw) return emptyDb();
      return normalizeDb(JSON.parse(raw) as Db);
    }
    const content = await fs.readFile(DB_FILE, 'utf-8');
    return normalizeDb(JSON.parse(content) as Db);
  } catch {
    return emptyDb();
  }
}

async function writeDbRaw(db: Db) {
  if (await hasKv()) {
    const mod = (await import('@vercel/kv')) as unknown as { kv: { set: (key: string, value: unknown) => Promise<unknown> } };
    await mod.kv.set(KV_DB_KEY, db);
    return;
  }
  if (await hasRedis()) {
    const redis = await getRedisClient();
    await redis.set(KV_DB_KEY, JSON.stringify(db));
    return;
  }
  await ensureDir();
  await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
}

export async function readDb(): Promise<Db> {
  const db = await readDbRaw();
  if (db.users.length > 0) return db;

  const lukePasswordHash = await hashPassword('123456');
  const luke: User = {
    id: newId('usr'),
    name: 'Luke',
    email: 'luke@gos.local',
    position: 'Owner',
    role: 'owner',
    permissions: {
      jobs: { viewAll: true, create: true, update: true, complete: true, duplicate: true, archive: true, trash: true },
      tasks: { viewAll: true, create: true, update: true, complete: true, trash: true },
      clients: { viewAll: true, create: true, update: true, import: true },
      staffs: { viewAll: true, create: true, update: true },
    },
    passwordHash: lukePasswordHash,
    createdAt: nowIso(),
  };

  const seeded = { ...db, users: [luke], reservedNames: ['luke'] };
  await writeDbRaw(seeded);
  return seeded;
}

export async function writeDb(db: Db) {
  await writeDbRaw(db);
}

export async function clearBusinessData() {
  const db = await readDb();
  const next: Db = {
    ...db,
    clients: [],
    jobs: [],
    tasks: [],
  };
  await writeDb(next);
  return { ok: true as const };
}

export async function findUserByEmail(email: string) {
  const db = await readDb();
  return db.users.find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null;
}

export async function findUserByName(name: string) {
  const db = await readDb();
  return db.users.find((u) => u.name.toLowerCase() === name.toLowerCase()) ?? null;
}

export async function findUserByEmailOrName(identifier: string) {
  const db = await readDb();
  const needle = identifier.trim().toLowerCase();
  if (!needle) return null;

  const emailHit = db.users.find((u) => u.email.toLowerCase() === needle) ?? null;
  if (emailHit) return emailHit;

  const nameMatches = db.users.filter((u) => u.name.toLowerCase() === needle);
  if (nameMatches.length <= 1) return nameMatches[0] ?? null;

  const scoreByUserId = new Map<string, number>();
  const addScore = (userId: string | undefined, delta: number) => {
    if (!userId) return;
    scoreByUserId.set(userId, (scoreByUserId.get(userId) ?? 0) + delta);
  };

  for (const j of db.jobs) {
    addScore(j.managerUserId, 5);
    addScore((j as unknown as { createdByUserId?: string }).createdByUserId, 2);
    addScore((j as unknown as { staffUserId?: string }).staffUserId, 1);
  }
  for (const t of db.tasks) {
    addScore((t as unknown as { assigneeUserId?: string }).assigneeUserId, 1);
    addScore((t as unknown as { createdByUserId?: string }).createdByUserId, 1);
  }

  const ranked = [...nameMatches].sort((a, b) => {
    const sa = scoreByUserId.get(a.id) ?? 0;
    const sb = scoreByUserId.get(b.id) ?? 0;
    if (sb !== sa) return sb - sa;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
  return ranked[0] ?? null;
}

export async function findUserById(id: string) {
  const db = await readDb();
  return db.users.find((u) => u.id === id) ?? null;
}

export async function createSession(userId: string, ttlDays = 14) {
  const db = await readDb();
  const token = newId('sess');
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString();
  const session: Session = { token, userId, expiresAt, createdAt };
  db.sessions.unshift(session);
  await writeDb(db);
  return session;
}

export async function deleteSession(token: string) {
  const db = await readDb();
  db.sessions = db.sessions.filter((s) => s.token !== token);
  await writeDb(db);
}

export async function findSession(token: string) {
  const db = await readDb();
  const s = db.sessions.find((x) => x.token === token);
  if (!s) return null;
  if (new Date(s.expiresAt).getTime() <= Date.now()) return null;
  return s;
}

export async function createUser(input: {
  name: string;
  email: string;
  position?: string;
  role: Role;
  permissions?: Permissions;
  password: string;
}) {
  const db = await readDb();
  const nameKey = input.name.trim().toLowerCase();
  const reserved = new Set((db.reservedNames ?? []).map((x) => (x ?? '').trim().toLowerCase()).filter(Boolean));
  const emailTaken = db.users.some((u) => u.email.toLowerCase() === input.email.toLowerCase());
  if (emailTaken) return { ok: false as const, error: 'EMAIL_TAKEN' as const };
  const nameTaken = db.users.some((u) => u.name.toLowerCase() === input.name.toLowerCase()) || reserved.has(nameKey);
  if (nameTaken) return { ok: false as const, error: 'NAME_TAKEN' as const };
  const user: User = {
    id: newId('usr'),
    name: input.name,
    email: input.email,
    position: input.position,
    role: input.role,
    permissions: input.permissions,
    passwordHash: await hashPassword(input.password),
    createdAt: nowIso(),
  };
  db.users.unshift(user);
  if (nameKey) {
    reserved.add(nameKey);
    db.reservedNames = [...reserved];
  }
  await writeDb(db);
  return { ok: true as const, user };
}

export async function updateUser(
  userId: string,
  patch: Partial<Pick<User, 'name' | 'email' | 'position' | 'role' | 'permissions'>>,
): Promise<{ ok: true; user: User } | { ok: false; error: 'NOT_FOUND' | 'NAME_TAKEN' | 'EMAIL_TAKEN' }> {
  const db = await readDb();
  const idx = db.users.findIndex((u) => u.id === userId);
  if (idx < 0) return { ok: false, error: 'NOT_FOUND' };
  const current = db.users[idx];
  const nextNameKey = typeof patch.name === 'string' ? patch.name.trim().toLowerCase() : current.name.trim().toLowerCase();
  const currentNameKey = current.name.trim().toLowerCase();

  if (typeof patch.email === 'string') {
    const emailKey = patch.email.trim().toLowerCase();
    const emailTaken = db.users.some((u) => u.id !== userId && u.email.toLowerCase() === emailKey);
    if (emailTaken) return { ok: false, error: 'EMAIL_TAKEN' };
  }
  if (typeof patch.name === 'string') {
    const inUseByOther = db.users.some((u) => u.id !== userId && u.name.trim().toLowerCase() === nextNameKey);
    if (inUseByOther) return { ok: false, error: 'NAME_TAKEN' };
    const reserved = new Set((db.reservedNames ?? []).map((x) => (x ?? '').trim().toLowerCase()).filter(Boolean));
    if (nextNameKey && nextNameKey !== currentNameKey && reserved.has(nextNameKey)) {
      return { ok: false, error: 'NAME_TAKEN' };
    }
  }

  const next: User = { ...current, ...patch };
  db.users[idx] = next;
  const reserved = new Set((db.reservedNames ?? []).map((x) => (x ?? '').trim().toLowerCase()).filter(Boolean));
  if (currentNameKey) reserved.add(currentNameKey);
  if (nextNameKey) reserved.add(nextNameKey);
  db.reservedNames = [...reserved];
  await writeDb(db);
  return { ok: true, user: next };
}

export async function setUserPassword(userId: string, newPassword: string) {
  const db = await readDb();
  const idx = db.users.findIndex((u) => u.id === userId);
  if (idx < 0) return null;
  db.users[idx] = { ...db.users[idx], passwordHash: await hashPassword(newPassword) };
  await writeDb(db);
  return db.users[idx];
}

export async function listUsers() {
  const db = await readDb();
  return db.users;
}

export async function createClient(input: {
  code: string;
  name: string;
  companyRegistrationNo?: string;
  contactPerson?: string;
  address?: string;
  phone?: string;
  email?: string;
  tags?: string[];
}) {
  const db = await readDb();
  const client: Client = {
    id: newId('cli'),
    code: input.code,
    name: input.name,
    companyRegistrationNo: input.companyRegistrationNo,
    contactPerson: input.contactPerson,
    address: input.address,
    phone: input.phone,
    email: input.email,
    tags: input.tags ?? [],
    createdAt: nowIso(),
  };
  db.clients.unshift(client);
  await writeDb(db);
  return client;
}

export async function listClients() {
  const db = await readDb();
  return db.clients;
}

export async function findClientById(id: string) {
  const db = await readDb();
  return db.clients.find((c) => c.id === id) ?? null;
}

export async function updateClient(
  clientId: string,
  patch: Partial<Pick<Client, 'code' | 'name' | 'companyRegistrationNo' | 'contactPerson' | 'address' | 'phone' | 'email' | 'tags'>>,
) {
  const db = await readDb();
  const idx = db.clients.findIndex((c) => c.id === clientId);
  if (idx < 0) return null;
  const current = db.clients[idx];
  const next: Client = { ...current, ...patch };
  db.clients[idx] = next;
  await writeDb(db);
  return next;
}

export async function deleteClient(clientId: string) {
  const db = await readDb();
  const idx = db.clients.findIndex((c) => c.id === clientId);
  if (idx < 0) return null;
  db.clients[idx] = { ...db.clients[idx], deletedAt: nowIso() };
  await writeDb(db);
  return db.clients[idx];
}

export async function createJob(input: Omit<Job, 'id' | 'createdAt'>) {
  const db = await readDb();
  const createdAt = nowIso();
  const job: Job = { ...input, id: newId('job'), createdAt, updatedAt: createdAt };
  db.jobs.unshift(job);
  await writeDb(db);
  return job;
}

export async function createJobWithTasks(
  input: Omit<Job, 'id' | 'createdAt'>,
  tasks: Array<Omit<JobTask, 'id' | 'createdAt' | 'jobId'>>,
) {
  const db = await readDb();
  const createdAt = nowIso();
  const job: Job = { ...input, id: newId('job'), createdAt, updatedAt: createdAt };
  db.jobs.unshift(job);
  const createdTasks: JobTask[] = tasks.map((t) => ({ ...t, jobId: job.id, id: newId('tsk'), createdAt }));
  db.tasks.push(...createdTasks);
  await writeDb(db);
  return { job, tasks: createdTasks };
}

export async function createJobsWithTasks(
  inputs: Array<{ job: Omit<Job, 'id' | 'createdAt'>; tasks: Array<Omit<JobTask, 'id' | 'createdAt' | 'jobId'>> }>,
) {
  const db = await readDb();
  const createdAt = nowIso();
  const createdJobs: Job[] = [];
  const createdTasks: JobTask[] = [];
  for (const it of inputs) {
    const job: Job = { ...it.job, id: newId('job'), createdAt, updatedAt: createdAt };
    createdJobs.push(job);
    db.jobs.unshift(job);
    for (const t of it.tasks) {
      createdTasks.push({ ...t, jobId: job.id, id: newId('tsk'), createdAt });
    }
  }
  db.tasks.push(...createdTasks);
  await writeDb(db);
  return { jobs: createdJobs, tasks: createdTasks };
}

export async function createManyJobsWithTasks(
  inputs: Array<
    | {
        job: Omit<Job, 'id' | 'createdAt'>;
        tasks: Array<Omit<JobTask, 'id' | 'createdAt' | 'jobId'> & { createdAt?: string }>;
      }
    | {
        job: Omit<Job, 'id' | 'createdAt'>;
        tasks: Array<Omit<JobTask, 'id' | 'createdAt' | 'jobId'> & { createdAt?: string }>;
        recurringJob: Omit<Job, 'id' | 'createdAt'>;
        recurringTasks: Array<Omit<JobTask, 'id' | 'createdAt' | 'jobId'> & { createdAt?: string }>;
      }
  >,
) {
  const db = await readDb();
  const createdAt = nowIso();
  const createdTasks: JobTask[] = [];

  for (const it of inputs) {
    const primary: Job = { ...it.job, id: newId('job'), createdAt, updatedAt: createdAt };
    db.jobs.unshift(primary);
    for (const t of it.tasks) {
      createdTasks.push({ ...t, jobId: primary.id, id: newId('tsk'), createdAt: t.createdAt ?? createdAt });
    }

    if ('recurringJob' in it) {
      const recurring: Job = {
        ...it.recurringJob,
        id: newId('job'),
        createdAt,
        updatedAt: createdAt,
        recurringFromJobId: primary.id,
      };
      db.jobs.unshift(recurring);
      for (const t of it.recurringTasks) {
        createdTasks.push({ ...t, jobId: recurring.id, id: newId('tsk'), createdAt: t.createdAt ?? createdAt });
      }
    }
  }

  db.tasks.push(...createdTasks);
  await writeDb(db);
}

export async function createJobWithRecurringCopy(input: {
  job: Omit<Job, 'id' | 'createdAt'>;
  tasks: Array<Omit<JobTask, 'id' | 'createdAt' | 'jobId'>>;
  recurringJob: Omit<Job, 'id' | 'createdAt'>;
  recurringTasks: Array<Omit<JobTask, 'id' | 'createdAt' | 'jobId'>>;
}) {
  const db = await readDb();
  const createdAt = nowIso();
  const primary: Job = { ...input.job, id: newId('job'), createdAt, updatedAt: createdAt };
  const recurring: Job = {
    ...input.recurringJob,
    id: newId('job'),
    createdAt,
    updatedAt: createdAt,
    recurringFromJobId: primary.id,
  };
  db.jobs.unshift(recurring);
  db.jobs.unshift(primary);
  const createdTasks: JobTask[] = input.tasks.map((t) => ({ ...t, jobId: primary.id, id: newId('tsk'), createdAt }));
  const createdRecurringTasks: JobTask[] = input.recurringTasks.map((t) => ({
    ...t,
    jobId: recurring.id,
    id: newId('tsk'),
    createdAt,
  }));
  db.tasks.push(...createdTasks, ...createdRecurringTasks);
  await writeDb(db);
  return { job: primary, recurringJob: recurring, tasks: createdTasks, recurringTasks: createdRecurringTasks };
}

export async function listJobs() {
  const db = await readDb();
  return db.jobs;
}

export async function findJobById(id: string) {
  const db = await readDb();
  return db.jobs.find((j) => j.id === id) ?? null;
}

export async function updateJob(
  jobId: string,
  patch: Partial<
    Pick<Job, 'clientId' | 'name' | 'label' | 'dueDate' | 'repeat' | 'completed' | 'managerUserId' | 'staffUserId'>
  >,
) {
  const db = await readDb();
  const idx = db.jobs.findIndex((j) => j.id === jobId);
  if (idx < 0) return null;
  db.jobs[idx] = { ...db.jobs[idx], ...patch, updatedAt: nowIso() };
  await writeDb(db);
  return db.jobs[idx];
}

export async function deleteJob(jobId: string) {
  const db = await readDb();
  const job = db.jobs.find((j) => j.id === jobId) ?? null;
  if (!job) return null;
  const idx = db.jobs.findIndex((j) => j.id === jobId);
  if (idx < 0) return null;
  db.jobs[idx] = { ...db.jobs[idx], deletedAt: nowIso() };
  await writeDb(db);
  return db.jobs[idx];
}

export async function touchJob(jobId: string) {
  const db = await readDb();
  const idx = db.jobs.findIndex((j) => j.id === jobId);
  if (idx < 0) return null;
  db.jobs[idx] = { ...db.jobs[idx], updatedAt: nowIso() };
  await writeDb(db);
  return db.jobs[idx];
}

export async function completeAllTasksForJob(jobId: string) {
  const db = await readDb();
  const has = db.tasks.some((t) => t.jobId === jobId);
  if (!has) return [];
  db.tasks = db.tasks.map((t) => (t.jobId === jobId ? { ...t, status: 'Done' } : t));
  await writeDb(db);
  return db.tasks.filter((t) => t.jobId === jobId).sort((a, b) => a.sortOrder - b.sortOrder || a.seq - b.seq);
}

export async function listTasksByJob(jobId: string) {
  const db = await readDb();
  return db.tasks
    .filter((t) => t.jobId === jobId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.seq - b.seq);
}

export async function findTaskById(id: string) {
  const db = await readDb();
  return db.tasks.find((t) => t.id === id) ?? null;
}

export async function createTask(
  input: Omit<JobTask, 'id' | 'createdAt' | 'seq' | 'sortOrder'> &
    Partial<Pick<JobTask, 'seq' | 'sortOrder'>>,
) {
  const db = await readDb();
  const existing = db.tasks.filter((t) => t.jobId === input.jobId);
  const maxSeq = existing.reduce((m, t) => (t.seq > m ? t.seq : m), 0);
  const maxOrder = existing.reduce((m, t) => (t.sortOrder > m ? t.sortOrder : m), 0);
  const seq = typeof input.seq === 'number' ? input.seq : maxSeq + 1;
  const sortOrder = typeof input.sortOrder === 'number' ? input.sortOrder : maxOrder + 1;
  const task: JobTask = { ...input, seq, sortOrder, id: newId('tsk'), createdAt: nowIso() };
  db.tasks.push(task);
  await writeDb(db);
  return task;
}

export async function updateTaskOrder(taskId: string, sortOrder: number) {
  const db = await readDb();
  const idx = db.tasks.findIndex((t) => t.id === taskId);
  if (idx < 0) return null;
  db.tasks[idx] = { ...db.tasks[idx], sortOrder };
  await writeDb(db);
  return db.tasks[idx];
}

export async function reorderTasks(jobId: string, orderedIds: string[]) {
  const db = await readDb();
  const set = new Set(orderedIds);
  const inJob = db.tasks.filter((t) => t.jobId === jobId);
  if (orderedIds.length !== inJob.length) return null;
  if (inJob.some((t) => !set.has(t.id))) return null;
  const idToOrder = new Map(orderedIds.map((id, idx) => [id, idx + 1]));
  db.tasks = db.tasks.map((t) => {
    if (t.jobId !== jobId) return t;
    const nextOrder = idToOrder.get(t.id);
    if (!nextOrder) return t;
    return { ...t, sortOrder: nextOrder, seq: nextOrder };
  });
  await writeDb(db);
  return db.tasks.filter((t) => t.jobId === jobId).sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function updateTasksInJob(input: {
  jobId: string;
  orderedIds?: string[];
  titlesById?: Record<string, string>;
}) {
  const db = await readDb();
  const inJob = db.tasks.filter((t) => t.jobId === input.jobId);
  if (inJob.length === 0) return [];

  let idToOrder: Map<string, number> | null = null;
  if (Array.isArray(input.orderedIds) && input.orderedIds.length > 0) {
    const orderedIds = input.orderedIds;
    const set = new Set(orderedIds);
    if (orderedIds.length !== inJob.length) return null;
    if (inJob.some((t) => !set.has(t.id))) return null;
    idToOrder = new Map(orderedIds.map((id, idx) => [id, idx + 1]));
  }

  const titlesById = input.titlesById ?? {};
  const titleKeys = Object.keys(titlesById);
  if (titleKeys.length > 0) {
    const inJobIdSet = new Set(inJob.map((t) => t.id));
    for (const id of titleKeys) {
      if (!inJobIdSet.has(id)) return null;
      const title = titlesById[id]?.trim() ?? '';
      if (!title) return null;
      titlesById[id] = title;
    }
  }

  db.tasks = db.tasks.map((t) => {
    if (t.jobId !== input.jobId) return t;
    const sortOrder = idToOrder ? (idToOrder.get(t.id) ?? t.sortOrder) : t.sortOrder;
    const seq = idToOrder ? sortOrder : t.seq;
    const title = titleKeys.length && titlesById[t.id] ? titlesById[t.id] : t.title;
    return { ...t, sortOrder, seq, title };
  });

  await writeDb(db);
  return db.tasks.filter((t) => t.jobId === input.jobId).sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function updateTaskStatus(taskId: string, status: JobTask['status']) {
  const db = await readDb();
  const idx = db.tasks.findIndex((t) => t.id === taskId);
  if (idx < 0) return null;
  const nextTask = { ...db.tasks[idx], status };
  db.tasks[idx] = nextTask;

  if (status === 'Todo') {
    const jobIdx = db.jobs.findIndex((j) => j.id === nextTask.jobId);
    if (jobIdx >= 0 && db.jobs[jobIdx]?.completed) {
      db.jobs[jobIdx] = { ...db.jobs[jobIdx], completed: false, updatedAt: nowIso() };
    }
  } else {
    const jobIdx = db.jobs.findIndex((j) => j.id === nextTask.jobId);
    if (jobIdx >= 0) {
      db.jobs[jobIdx] = { ...db.jobs[jobIdx], updatedAt: nowIso() };
    }
  }
  await writeDb(db);
  return nextTask;
}

export async function updateTask(
  taskId: string,
  patch: Partial<Pick<JobTask, 'title' | 'dueDate' | 'assigneeUserId'>>,
) {
  const db = await readDb();
  const idx = db.tasks.findIndex((t) => t.id === taskId);
  if (idx < 0) return null;
  db.tasks[idx] = { ...db.tasks[idx], ...patch };
  await writeDb(db);
  return db.tasks[idx];
}
