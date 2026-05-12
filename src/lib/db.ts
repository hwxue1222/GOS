import { promises as fs } from 'fs';
import path from 'path';
import { hashPassword } from '@/lib/password';
import { newId } from '@/lib/id';
import type { Client, Db, Job, JobTask, Permissions, Role, Session, User } from '@/lib/types';

const DB_FILE = path.join(process.cwd(), '.gos', 'db.json');

function nowIso() {
  return new Date().toISOString();
}

async function ensureDir() {
  await fs.mkdir(path.dirname(DB_FILE), { recursive: true });
}

function emptyDb(): Db {
  return { users: [], sessions: [], clients: [], jobs: [], tasks: [] };
}

async function readDbRaw(): Promise<Db> {
  try {
    const content = await fs.readFile(DB_FILE, 'utf-8');
    const parsed = JSON.parse(content) as Db;
    const users = (parsed.users ?? []).map((u) => ({
      ...u,
      position: (u as User).position,
      permissions: (u as User).permissions,
    }));
    const jobs = (parsed.jobs ?? []).map((j) => ({
      ...j,
      repeat: (j as Job).repeat ?? 'none',
      status: (j as Job).status ?? 'Pending',
    }));
    return {
      users,
      sessions: parsed.sessions ?? [],
      clients: parsed.clients ?? [],
      jobs,
      tasks: parsed.tasks ?? [],
    };
  } catch {
    return emptyDb();
  }
}

async function writeDbRaw(db: Db) {
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

  const seeded = { ...db, users: [luke] };
  await writeDbRaw(seeded);
  return seeded;
}

export async function writeDb(db: Db) {
  await writeDbRaw(db);
}

export async function findUserByEmail(email: string) {
  const db = await readDb();
  return db.users.find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null;
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
  const existing = db.users.find((u) => u.email.toLowerCase() === input.email.toLowerCase());
  if (existing) return { ok: false as const, error: 'EMAIL_TAKEN' as const };
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
  await writeDb(db);
  return { ok: true as const, user };
}

export async function updateUser(
  userId: string,
  patch: Partial<Pick<User, 'name' | 'email' | 'position' | 'role' | 'permissions'>>,
) {
  const db = await readDb();
  const idx = db.users.findIndex((u) => u.id === userId);
  if (idx < 0) return null;
  const current = db.users[idx];
  const next: User = { ...current, ...patch };
  db.users[idx] = next;
  await writeDb(db);
  return next;
}

export async function listUsers() {
  const db = await readDb();
  return db.users;
}

export async function createClient(input: {
  code: string;
  name: string;
  phone?: string;
  email?: string;
  tags?: string[];
}) {
  const db = await readDb();
  const client: Client = {
    id: newId('cli'),
    code: input.code,
    name: input.name,
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

export async function createJob(input: Omit<Job, 'id' | 'createdAt'>) {
  const db = await readDb();
  const job: Job = { ...input, id: newId('job'), createdAt: nowIso() };
  db.jobs.unshift(job);
  await writeDb(db);
  return job;
}

export async function listJobs() {
  const db = await readDb();
  return db.jobs;
}

export async function findJobById(id: string) {
  const db = await readDb();
  return db.jobs.find((j) => j.id === id) ?? null;
}

export async function listTasksByJob(jobId: string) {
  const db = await readDb();
  return db.tasks.filter((t) => t.jobId === jobId);
}

export async function findTaskById(id: string) {
  const db = await readDb();
  return db.tasks.find((t) => t.id === id) ?? null;
}

export async function createTask(input: Omit<JobTask, 'id' | 'createdAt'>) {
  const db = await readDb();
  const task: JobTask = { ...input, id: newId('tsk'), createdAt: nowIso() };
  db.tasks.unshift(task);
  await writeDb(db);
  return task;
}

export async function updateTaskStatus(taskId: string, status: JobTask['status']) {
  const db = await readDb();
  const idx = db.tasks.findIndex((t) => t.id === taskId);
  if (idx < 0) return null;
  db.tasks[idx] = { ...db.tasks[idx], status };
  await writeDb(db);
  return db.tasks[idx];
}
