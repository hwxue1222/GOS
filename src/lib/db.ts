import { promises as fs } from 'fs';
import path from 'path';
import { createHash, randomBytes } from 'crypto';
import { hashPassword } from '@/lib/password';
import { newId } from '@/lib/id';
import type {
  Client,
  ClientPartyRole,
  CompanyRepresentative,
  Db,
  Document,
  ExternalCompany,
  Invoice,
  InvoiceEmailHistory,
  Job,
  JobTask,
  Party,
  Permissions,
  Person,
  RepresentativeDesignationRequest,
  Role,
  Session,
  ShareTransfer,
  SignaturePacket,
  SignatureRequest,
  User,
} from '@/lib/types';

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
  return {
    users: [],
    sessions: [],
    clients: [],
    invoices: [],
    invoiceEmailHistories: [],
    persons: [],
    parties: [],
    externalCompanies: [],
    clientPartyRoles: [],
    companyRepresentatives: [],
    documents: [],
    signaturePackets: [],
    signatureRequests: [],
    representativeDesignationRequests: [],
    shareTransfers: [],
    jobs: [],
    tasks: [],
    reservedNames: [],
  };
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
    fye: (c as Client).fye,
    contactPerson: (c as Client).contactPerson,
    address: (c as Client).address,
    phone: (c as Client).phone,
    email: (c as Client).email,
    paidUpCapitalCurrency: (c as Client).paidUpCapitalCurrency,
    paidUpCapitalAmount: (c as Client).paidUpCapitalAmount,
    totalShares: (c as Client).totalShares,
    incorporationDate: (c as Client).incorporationDate,
    registeredOfficeAddress: (c as Client).registeredOfficeAddress,
    deletedAt: (c as Client).deletedAt,
  }));

  const invoices = (parsed as unknown as { invoices?: unknown }).invoices;
  const normalizedInvoices: Invoice[] = Array.isArray(invoices)
    ? (invoices as Invoice[]).map((inv) => {
        const createdAt = (inv as Invoice).createdAt ?? nowIso();
        const updatedAt = (inv as Invoice).updatedAt ?? createdAt;
        const billTo = (inv as Invoice).billTo as Invoice['billTo'] | undefined;
        const fallbackClientId = (inv as unknown as { clientId?: string }).clientId;
        const legacyClientId = typeof fallbackClientId === 'string' ? fallbackClientId : undefined;
        const nextBillTo: Invoice['billTo'] =
          billTo && (billTo as { type?: string }).type === 'CLIENT' && typeof (billTo as { clientId?: unknown }).clientId === 'string'
            ? {
                type: 'CLIENT',
                clientId: String((billTo as { clientId: string }).clientId),
                companyName:
                  typeof (billTo as { companyName?: unknown }).companyName === 'string'
                    ? String((billTo as { companyName?: string }).companyName)
                    : '',
                address: typeof (billTo as { address?: unknown }).address === 'string' ? String((billTo as { address?: string }).address) : undefined,
                contactNo:
                  typeof (billTo as { contactNo?: unknown }).contactNo === 'string' ? String((billTo as { contactNo?: string }).contactNo) : undefined,
                email: typeof (billTo as { email?: unknown }).email === 'string' ? String((billTo as { email?: string }).email) : undefined,
              }
            : billTo && (billTo as { type?: string }).type === 'ONE_OFF'
              ? {
                  type: 'ONE_OFF',
                  companyName:
                    typeof (billTo as { companyName?: unknown }).companyName === 'string'
                      ? String((billTo as { companyName?: string }).companyName)
                      : '',
                  address: typeof (billTo as { address?: unknown }).address === 'string' ? String((billTo as { address?: string }).address) : undefined,
                  contactNo:
                    typeof (billTo as { contactNo?: unknown }).contactNo === 'string' ? String((billTo as { contactNo?: string }).contactNo) : undefined,
                  email: typeof (billTo as { email?: unknown }).email === 'string' ? String((billTo as { email?: string }).email) : undefined,
                }
              : legacyClientId
                ? { type: 'CLIENT', clientId: legacyClientId, companyName: '' }
                : { type: 'ONE_OFF', companyName: '' };

        return {
          ...inv,
          issuer: (inv as Invoice).issuer ?? 'BBY_SG',
          billTo: nextBillTo,
          currency: (inv as Invoice).currency ?? 'SGD',
          publicToken: typeof (inv as Invoice).publicToken === 'string' ? (inv as Invoice).publicToken : undefined,
          paymentNote: typeof (inv as Invoice).paymentNote === 'string' ? (inv as Invoice).paymentNote : undefined,
          items: Array.isArray((inv as Invoice).items) ? (inv as Invoice).items : [],
          subtotal: typeof (inv as Invoice).subtotal === 'number' ? (inv as Invoice).subtotal : 0,
          total: typeof (inv as Invoice).total === 'number' ? (inv as Invoice).total : 0,
          status: (inv as Invoice).status ?? 'UNPAID',
          createdAt,
          updatedAt,
        };
      })
    : [];

  const invoiceEmailHistories = (parsed as unknown as { invoiceEmailHistories?: unknown }).invoiceEmailHistories;
  const normalizedInvoiceEmailHistories: InvoiceEmailHistory[] = Array.isArray(invoiceEmailHistories)
    ? (invoiceEmailHistories as InvoiceEmailHistory[]).map((h) => {
        const createdAt = (h as InvoiceEmailHistory).createdAt ?? nowIso();
        const updatedAt = (h as InvoiceEmailHistory).updatedAt ?? createdAt;
        const key = (h as InvoiceEmailHistory).key;
        const nextKey: InvoiceEmailHistory['key'] =
          key && (key as { type?: string }).type === 'CLIENT' && typeof (key as { clientId?: unknown }).clientId === 'string'
            ? { type: 'CLIENT', clientId: String((key as { clientId: string }).clientId) }
            : key && (key as { type?: string }).type === 'ONE_OFF' && typeof (key as { companyNameKey?: unknown }).companyNameKey === 'string'
              ? { type: 'ONE_OFF', companyNameKey: String((key as { companyNameKey: string }).companyNameKey) }
              : { type: 'ONE_OFF', companyNameKey: '' };
        const uniq = (xs: unknown) => {
          if (!Array.isArray(xs)) return [];
          const out: string[] = [];
          const seen = new Set<string>();
          for (const v of xs) {
            const s = typeof v === 'string' ? v.trim() : '';
            if (!s) continue;
            const k = s.toLowerCase();
            if (seen.has(k)) continue;
            seen.add(k);
            out.push(s);
          }
          return out;
        };
        return {
          ...h,
          key: nextKey,
          toEmails: uniq((h as InvoiceEmailHistory).toEmails),
          ccEmails: uniq((h as InvoiceEmailHistory).ccEmails),
          createdAt,
          updatedAt,
        };
      })
    : [];
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

  const persons = (parsed.persons ?? []).map((p) => ({
    ...p,
    fullName: (p as Person).fullName,
    email: (p as Person).email,
    phone: (p as Person).phone,
    idType: (p as Person).idType,
    idNo: (p as Person).idNo,
    nationality: (p as Person).nationality,
    dob: (p as Person).dob,
    address: (p as Person).address,
    updatedAt: (p as Person).updatedAt ?? (p as Person).createdAt,
  }));

  const parties = (parsed.parties ?? []).map((p) => ({
    ...p,
    type: (p as Party).type,
    displayName: (p as Party).displayName,
    personId: (p as Party).personId,
    clientId: (p as Party).clientId,
    externalCompanyId: (p as Party).externalCompanyId,
    updatedAt: (p as Party).updatedAt ?? (p as Party).createdAt,
  }));

  const externalCompanies = (parsed.externalCompanies ?? []).map((c) => ({
    ...c,
    name: (c as ExternalCompany).name,
    registrationNo: (c as ExternalCompany).registrationNo,
    jurisdiction: (c as ExternalCompany).jurisdiction,
    address: (c as ExternalCompany).address,
    email: (c as ExternalCompany).email,
    phone: (c as ExternalCompany).phone,
    updatedAt: (c as ExternalCompany).updatedAt ?? (c as ExternalCompany).createdAt,
  }));

  const clientPartyRoles = (parsed.clientPartyRoles ?? []).map((r) => ({
    ...r,
    role: (r as ClientPartyRole).role,
    appointmentDate: (r as ClientPartyRole).appointmentDate,
    resignationDate: (r as ClientPartyRole).resignationDate,
    shareClass: (r as ClientPartyRole).shareClass,
    shares: (r as ClientPartyRole).shares,
    fromDate: (r as ClientPartyRole).fromDate,
    toDate: (r as ClientPartyRole).toDate,
    updatedAt: (r as ClientPartyRole).updatedAt ?? (r as ClientPartyRole).createdAt,
  }));

  const companyRepresentatives = (parsed.companyRepresentatives ?? []).map((r) => ({
    ...r,
    companyPartyId: (r as CompanyRepresentative).companyPartyId,
    representativePersonId: (r as CompanyRepresentative).representativePersonId,
    scope: (r as CompanyRepresentative).scope ?? 'GLOBAL',
    evidenceDocumentId: (r as CompanyRepresentative).evidenceDocumentId,
    effectiveFrom: (r as CompanyRepresentative).effectiveFrom ?? (r as CompanyRepresentative).createdAt,
    effectiveTo: (r as CompanyRepresentative).effectiveTo,
    updatedAt: (r as CompanyRepresentative).updatedAt ?? (r as CompanyRepresentative).createdAt,
  }));

  const documents = (parsed.documents ?? []).map((d) => ({
    ...d,
    type: (d as Document).type,
    title: (d as Document).title,
    html: (d as Document).html,
    sha256: (d as Document).sha256,
  }));

  const signaturePackets = (parsed.signaturePackets ?? []).map((p) => ({
    ...p,
    kind: (p as SignaturePacket).kind,
    relatedType: (p as SignaturePacket).relatedType,
    relatedId: (p as SignaturePacket).relatedId,
    documentId: (p as SignaturePacket).documentId,
    status: (p as SignaturePacket).status ?? 'DRAFT',
    updatedAt: (p as SignaturePacket).updatedAt ?? (p as SignaturePacket).createdAt,
  }));

  const signatureRequests = (parsed.signatureRequests ?? []).map((r) => ({
    ...r,
    packetId: (r as SignatureRequest).packetId,
    email: (r as SignatureRequest).email,
    tokenHash: (r as SignatureRequest).tokenHash,
    expiresAt: (r as SignatureRequest).expiresAt,
    status: (r as SignatureRequest).status ?? 'PENDING',
    rdrRepresentativeName: (r as SignatureRequest).rdrRepresentativeName,
    rdrRepresentativeEmail: (r as SignatureRequest).rdrRepresentativeEmail,
    otpHash: (r as SignatureRequest).otpHash,
    otpExpiresAt: (r as SignatureRequest).otpExpiresAt,
    otpSentAt: (r as SignatureRequest).otpSentAt,
    signedAt: (r as SignatureRequest).signedAt,
    signedIp: (r as SignatureRequest).signedIp,
    signedUserAgent: (r as SignatureRequest).signedUserAgent,
    updatedAt: (r as SignatureRequest).updatedAt ?? (r as SignatureRequest).createdAt,
  }));

  const representativeDesignationRequests = (parsed.representativeDesignationRequests ?? []).map((r) => ({
    ...r,
    triggerType: (r as RepresentativeDesignationRequest).triggerType,
    companyPartyId: (r as RepresentativeDesignationRequest).companyPartyId,
    representativePersonId: (r as RepresentativeDesignationRequest).representativePersonId,
    representativeName: (r as RepresentativeDesignationRequest).representativeName,
    representativeEmail: (r as RepresentativeDesignationRequest).representativeEmail,
    packetId: (r as RepresentativeDesignationRequest).packetId,
    status: (r as RepresentativeDesignationRequest).status ?? 'SIGNING',
    updatedAt: (r as RepresentativeDesignationRequest).updatedAt ?? (r as RepresentativeDesignationRequest).createdAt,
  }));

  const shareTransfers = (parsed.shareTransfers ?? []).map((t) => ({
    ...t,
    clientId: (t as ShareTransfer).clientId,
    transferorPartyId: (t as ShareTransfer).transferorPartyId,
    transfereePartyId: (t as ShareTransfer).transfereePartyId,
    shareClass: (t as ShareTransfer).shareClass,
    shares: (t as ShareTransfer).shares,
    effectiveDate: (t as ShareTransfer).effectiveDate,
    status: (t as ShareTransfer).status ?? 'SIGNING',
    staPacketId: (t as ShareTransfer).staPacketId,
    brPacketId: (t as ShareTransfer).brPacketId,
    blockingRdrIds: Array.isArray((t as ShareTransfer).blockingRdrIds) ? (t as ShareTransfer).blockingRdrIds : undefined,
    updatedAt: (t as ShareTransfer).updatedAt ?? (t as ShareTransfer).createdAt,
  }));

  return {
    users,
    sessions: parsed.sessions ?? [],
    clients,
    invoices: normalizedInvoices,
    invoiceEmailHistories: normalizedInvoiceEmailHistories,
    persons,
    parties,
    externalCompanies,
    clientPartyRoles,
    companyRepresentatives,
    documents,
    signaturePackets,
    signatureRequests,
    representativeDesignationRequests,
    shareTransfers,
    jobs,
    tasks: tasks as unknown as JobTask[],
    reservedNames: [...reservedSet],
  };
}

function sha256Hex(content: string) {
  return createHash('sha256').update(content).digest('hex');
}

function newToken() {
  return randomBytes(24).toString('hex');
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
      invoices: { viewAll: true, create: true, update: true, markPaid: true, trash: true },
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
  fye?: string;
  contactPerson?: string;
  address?: string;
  phone?: string;
  email?: string;
  businessActivities?: string;
  paidUpCapitalCurrency?: Client['paidUpCapitalCurrency'];
  paidUpCapitalAmount?: Client['paidUpCapitalAmount'];
  totalShares?: Client['totalShares'];
  incorporationDate?: Client['incorporationDate'];
  registeredOfficeAddress?: Client['registeredOfficeAddress'];
  tags?: string[];
}) {
  const db = await readDb();
  const codeKey = input.code.trim().toLowerCase();
  const nameKey = input.name.trim().toLowerCase();
  if (!codeKey || !nameKey) throw new Error('INVALID_INPUT');
  if (db.clients.some((c) => !c.deletedAt && (c.code || '').trim().toLowerCase() === codeKey)) throw new Error('DUPLICATE_CODE');
  if (db.clients.some((c) => !c.deletedAt && (c.name || '').trim().toLowerCase() === nameKey)) throw new Error('DUPLICATE_NAME');
  const client: Client = {
    id: newId('cli'),
    code: input.code,
    name: input.name,
    companyRegistrationNo: input.companyRegistrationNo,
    fye: input.fye,
    contactPerson: input.contactPerson,
    address: input.address,
    phone: input.phone,
    email: input.email,
    businessActivities: input.businessActivities,
    paidUpCapitalCurrency: input.paidUpCapitalCurrency,
    paidUpCapitalAmount: input.paidUpCapitalAmount,
    totalShares: input.totalShares,
    incorporationDate: input.incorporationDate,
    registeredOfficeAddress: input.registeredOfficeAddress,
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
  patch: Partial<
    Pick<
      Client,
      | 'code'
      | 'name'
      | 'companyRegistrationNo'
      | 'fye'
      | 'contactPerson'
      | 'address'
      | 'phone'
      | 'email'
      | 'businessActivities'
      | 'tags'
      | 'paidUpCapitalCurrency'
      | 'paidUpCapitalAmount'
      | 'totalShares'
      | 'incorporationDate'
      | 'registeredOfficeAddress'
    >
  >,
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

export async function listPersons() {
  const db = await readDb();
  return db.persons;
}

export async function findPersonById(id: string) {
  const db = await readDb();
  return db.persons.find((p) => p.id === id) ?? null;
}

export async function createPerson(input: {
  fullName: string;
  email?: string;
  phone?: string;
  idType?: Person['idType'];
  idNo?: string;
  nationality?: string;
  dob?: string;
  address?: string;
  memberSince?: string;
  lastLoginDate?: string;
}) {
  const db = await readDb();
  const createdAt = nowIso();
  const person: Person = {
    id: newId('per'),
    fullName: input.fullName,
    email: input.email,
    phone: input.phone,
    idType: input.idType,
    idNo: input.idNo,
    nationality: input.nationality,
    dob: input.dob,
    address: input.address,
    memberSince: input.memberSince,
    lastLoginDate: input.lastLoginDate,
    createdAt,
    updatedAt: createdAt,
  };
  db.persons.unshift(person);
  await writeDb(db);
  return person;
}

export async function updatePerson(
  personId: string,
  patch: Partial<
    Pick<Person, 'fullName' | 'email' | 'phone' | 'idType' | 'idNo' | 'nationality' | 'dob' | 'address' | 'memberSince' | 'lastLoginDate'>
  >,
) {
  const db = await readDb();
  const idx = db.persons.findIndex((p) => p.id === personId);
  if (idx < 0) return null;
  db.persons[idx] = { ...db.persons[idx], ...patch, updatedAt: nowIso() };
  await writeDb(db);
  return db.persons[idx];
}

export async function createPartyForPerson(person: Person) {
  const db = await readDb();
  const createdAt = nowIso();
  const party: Party = {
    id: newId('pty'),
    type: 'PERSON',
    displayName: person.fullName,
    personId: person.id,
    createdAt,
    updatedAt: createdAt,
  };
  db.parties.unshift(party);
  await writeDb(db);
  return party;
}

export async function getOrCreatePartyForPersonId(personId: string) {
  const db = await readDb();
  const person = db.persons.find((p) => p.id === personId) ?? null;
  if (!person) return null;
  const hit = db.parties.find((p) => p.type === 'PERSON' && p.personId === personId) ?? null;
  if (hit) return hit;
  const now = nowIso();
  const party: Party = {
    id: newId('pty'),
    type: 'PERSON',
    displayName: person.fullName,
    personId: person.id,
    createdAt: now,
    updatedAt: now,
  };
  db.parties.unshift(party);
  await writeDb(db);
  return party;
}

export async function listClientPeopleRoles(clientId: string) {
  const db = await readDb();
  const roles = db.clientPartyRoles
    .filter((r) => r.clientId === clientId)
    .filter((r) => {
      if (r.role === 'DIRECTOR' || r.role === 'SECRETARY') return !r.resignationDate;
      if (r.role === 'SHAREHOLDER' || r.role === 'RORC') return !r.toDate;
      return true;
    });

  const partyById = new Map(db.parties.map((p) => [p.id, p]));
  const personById = new Map(db.persons.map((p) => [p.id, p]));

  const rows = roles
    .map((r) => {
      const party = partyById.get(r.partyId);
      if (!party || party.type !== 'PERSON' || !party.personId) return null;
      const person = personById.get(party.personId);
      if (!person) return null;
      return { role: r, party, person };
    })
    .filter((x): x is { role: ClientPartyRole; party: Party; person: Person } => x !== null);

  return {
    directors: rows.filter((x) => x.role.role === 'DIRECTOR'),
    shareholders: rows.filter((x) => x.role.role === 'SHAREHOLDER'),
    rorc: rows.filter((x) => x.role.role === 'RORC'),
    secretaries: rows.filter((x) => x.role.role === 'SECRETARY'),
  };
}

export async function listPeopleWithRoleTags() {
  const db = await readDb();
  const partyById = new Map(db.parties.map((p) => [p.id, p]));

  const activeRoles = db.clientPartyRoles.filter((r) => {
    if (r.role === 'DIRECTOR' || r.role === 'SECRETARY') return !r.resignationDate;
    if (r.role === 'SHAREHOLDER' || r.role === 'RORC') return !r.toDate;
    return true;
  });

  const tagsByPersonId = new Map<string, Set<ClientPartyRole['role']>>();
  const clientIdsByPersonId = new Map<string, Set<string>>();

  for (const r of activeRoles) {
    const party = partyById.get(r.partyId);
    if (!party || party.type !== 'PERSON' || !party.personId) continue;
    const personId = party.personId;
    const t = tagsByPersonId.get(personId) ?? new Set<ClientPartyRole['role']>();
    t.add(r.role);
    tagsByPersonId.set(personId, t);
    const c = clientIdsByPersonId.get(personId) ?? new Set<string>();
    c.add(r.clientId);
    clientIdsByPersonId.set(personId, c);
  }

  return db.persons.map((p) => ({
    person: p,
    roleTags: [...(tagsByPersonId.get(p.id) ?? new Set())],
    companyCount: (clientIdsByPersonId.get(p.id) ?? new Set()).size,
  }));
}

export async function addClientRoleByPersonId(input: { clientId: string; personId: string; role: ClientPartyRole['role'] }) {
  const db = await readDb();
  const client = db.clients.find((c) => c.id === input.clientId) ?? null;
  if (!client || client.deletedAt) return { ok: false as const, error: 'NOT_FOUND' as const };
  const person = db.persons.find((p) => p.id === input.personId) ?? null;
  if (!person) return { ok: false as const, error: 'NOT_FOUND' as const };
  const party = db.parties.find((p) => p.type === 'PERSON' && p.personId === person.id) ?? null;
  const now = nowIso();
  const nextParty: Party =
    party ??
    ({
      id: newId('pty'),
      type: 'PERSON',
      displayName: person.fullName,
      personId: person.id,
      createdAt: now,
      updatedAt: now,
    } as const);
  if (!party) db.parties.unshift(nextParty);

  const exists = db.clientPartyRoles.some((r) => {
    if (r.clientId !== input.clientId) return false;
    if (r.partyId !== nextParty.id) return false;
    if (r.role !== input.role) return false;
    if (input.role === 'DIRECTOR' || input.role === 'SECRETARY') return !r.resignationDate;
    if (input.role === 'SHAREHOLDER' || input.role === 'RORC') return !r.toDate;
    return true;
  });
  if (exists) return { ok: true as const };

  const role: ClientPartyRole = {
    id: newId('cpr'),
    clientId: input.clientId,
    partyId: nextParty.id,
    role: input.role,
    appointmentDate: input.role === 'DIRECTOR' || input.role === 'SECRETARY' ? now.slice(0, 10) : undefined,
    fromDate: input.role === 'SHAREHOLDER' || input.role === 'RORC' ? now.slice(0, 10) : undefined,
    createdAt: now,
    updatedAt: now,
  };
  db.clientPartyRoles.unshift(role);
  await writeDb(db);
  return { ok: true as const, role };
}

export async function endClientRole(input: { clientId: string; roleId: string }) {
  const db = await readDb();
  const idx = db.clientPartyRoles.findIndex((r) => r.id === input.roleId && r.clientId === input.clientId);
  if (idx < 0) return null;
  const r = db.clientPartyRoles[idx];
  const now = nowIso();
  if (r.role === 'DIRECTOR' || r.role === 'SECRETARY') {
    db.clientPartyRoles[idx] = { ...r, resignationDate: now.slice(0, 10), updatedAt: now };
  } else {
    db.clientPartyRoles[idx] = { ...r, toDate: now.slice(0, 10), updatedAt: now };
  }
  await writeDb(db);
  return db.clientPartyRoles[idx];
}

export async function importPersons(input: {
  items: Array<
    Pick<Person, 'fullName' | 'email' | 'phone' | 'idType' | 'idNo' | 'nationality' | 'dob' | 'address' | 'memberSince' | 'lastLoginDate'>
  >;
}) {
  const db = await readDb();
  const now = nowIso();
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const normalized = input.items
    .map((x) => ({
      fullName: (x.fullName ?? '').trim(),
      email: (x.email ?? '').trim() || undefined,
      phone: (x.phone ?? '').trim() || undefined,
      idType: x.idType,
      idNo: (x.idNo ?? '').trim() || undefined,
      nationality: (x.nationality ?? '').trim() || undefined,
      dob: (x.dob ?? '').trim() || undefined,
      address: (x.address ?? '').trim() || undefined,
      memberSince: (x.memberSince ?? '').trim() || undefined,
      lastLoginDate: (x.lastLoginDate ?? '').trim() || undefined,
    }))
    .filter((x) => !!x.fullName);

  for (const row of normalized) {
    const emailKey = row.email?.toLowerCase() ?? '';
    const hit = emailKey ? db.persons.find((p) => (p.email ?? '').toLowerCase() === emailKey) ?? null : null;
    if (hit) {
      const next: Person = {
        ...hit,
        fullName: row.fullName || hit.fullName,
        email: row.email ?? hit.email,
        phone: row.phone ?? hit.phone,
        idType: row.idType ?? hit.idType,
        idNo: row.idNo ?? hit.idNo,
        nationality: row.nationality ?? hit.nationality,
        dob: row.dob ?? hit.dob,
        address: row.address ?? hit.address,
        memberSince: row.memberSince ?? hit.memberSince,
        lastLoginDate: row.lastLoginDate ?? hit.lastLoginDate,
        updatedAt: now,
      };
      const idx = db.persons.findIndex((p) => p.id === hit.id);
      if (idx >= 0) db.persons[idx] = next;
      updated++;
      continue;
    }
    if (!row.email && !row.phone && !row.idNo) {
      skipped++;
      continue;
    }
    const person: Person = {
      id: newId('per'),
      fullName: row.fullName,
      email: row.email,
      phone: row.phone,
      idType: row.idType,
      idNo: row.idNo,
      nationality: row.nationality,
      dob: row.dob,
      address: row.address,
      memberSince: row.memberSince,
      lastLoginDate: row.lastLoginDate,
      createdAt: now,
      updatedAt: now,
    };
    db.persons.unshift(person);
    created++;
  }
  await writeDb(db);
  return { ok: true as const, created, updated, skipped, total: normalized.length };
}

function makeTempPassword() {
  return randomBytes(9).toString('base64url');
}

export async function createClientLoginForPerson(input: { personId: string }) {
  const db = await readDb();
  const person = db.persons.find((p) => p.id === input.personId) ?? null;
  const email = person?.email?.trim() ?? '';
  if (!person || !email) return { ok: false as const, error: 'INVALID_INPUT' as const };
  const existing = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null;
  if (existing) return { ok: true as const, user: existing, tempPassword: null as string | null };
  const baseName = person.fullName.trim() || email;
  const reserved = new Set((db.reservedNames ?? []).map((x) => (x ?? '').trim().toLowerCase()).filter(Boolean));
  const taken = new Set(db.users.map((u) => u.name.trim().toLowerCase()));
  let name = baseName;
  let idx = 1;
  while (!name.trim() || taken.has(name.trim().toLowerCase()) || reserved.has(name.trim().toLowerCase())) {
    idx++;
    name = `${baseName} ${idx}`;
  }
  const tempPassword = makeTempPassword();
  const user: User = {
    id: newId('usr'),
    name,
    email,
    role: 'client',
    passwordHash: await hashPassword(tempPassword),
    createdAt: nowIso(),
  };
  db.users.unshift(user);
  reserved.add(name.trim().toLowerCase());
  db.reservedNames = [...reserved];
  await writeDb(db);
  return { ok: true as const, user, tempPassword };
}

export async function listClientDirectors(clientId: string, opts?: { includeResigned?: boolean }) {
  const db = await readDb();
  const roles = db.clientPartyRoles
    .filter((r) => r.clientId === clientId && r.role === 'DIRECTOR')
    .filter((r) => (opts?.includeResigned ? true : !r.resignationDate))
    .sort((a, b) => (a.appointmentDate ?? '').localeCompare(b.appointmentDate ?? '') || a.createdAt.localeCompare(b.createdAt));

  const partyById = new Map(db.parties.map((p) => [p.id, p]));
  const personById = new Map(db.persons.map((p) => [p.id, p]));

  return roles
    .map((r) => {
      const party = partyById.get(r.partyId);
      if (!party || party.type !== 'PERSON' || !party.personId) return null;
      const person = personById.get(party.personId);
      if (!person) return null;
      return { role: r, party, person };
    })
    .filter((x): x is { role: ClientPartyRole; party: Party; person: Person } => x !== null);
}

export async function addClientDirector(input: {
  clientId: string;
  fullName: string;
  email?: string;
  phone?: string;
  appointmentDate?: string;
}) {
  const db = await readDb();
  const createdAt = nowIso();
  const person: Person = {
    id: newId('per'),
    fullName: input.fullName,
    email: input.email,
    phone: input.phone,
    createdAt,
    updatedAt: createdAt,
  };
  const party: Party = {
    id: newId('pty'),
    type: 'PERSON',
    displayName: input.fullName,
    personId: person.id,
    createdAt,
    updatedAt: createdAt,
  };
  const role: ClientPartyRole = {
    id: newId('cpr'),
    clientId: input.clientId,
    partyId: party.id,
    role: 'DIRECTOR',
    appointmentDate: input.appointmentDate,
    createdAt,
    updatedAt: createdAt,
  };
  db.persons.unshift(person);
  db.parties.unshift(party);
  db.clientPartyRoles.unshift(role);
  await writeDb(db);
  return { role, party, person };
}

export async function updateClientDirector(input: {
  clientId: string;
  roleId: string;
  personPatch?: Partial<Pick<Person, 'fullName' | 'email' | 'phone'>>;
  rolePatch?: Partial<Pick<ClientPartyRole, 'appointmentDate' | 'resignationDate'>>;
}) {
  const db = await readDb();
  const roleIdx = db.clientPartyRoles.findIndex((r) => r.id === input.roleId && r.clientId === input.clientId && r.role === 'DIRECTOR');
  if (roleIdx < 0) return null;
  const role = db.clientPartyRoles[roleIdx];
  const party = db.parties.find((p) => p.id === role.partyId) ?? null;
  if (!party || party.type !== 'PERSON' || !party.personId) return null;
  const personIdx = db.persons.findIndex((p) => p.id === party.personId);
  if (personIdx < 0) return null;

  const now = nowIso();
  if (input.personPatch) {
    db.persons[personIdx] = { ...db.persons[personIdx], ...input.personPatch, updatedAt: now };
    if (typeof input.personPatch.fullName === 'string' && input.personPatch.fullName.trim()) {
      const nextName = input.personPatch.fullName.trim();
      const partyIdx = db.parties.findIndex((p) => p.id === party.id);
      if (partyIdx >= 0) db.parties[partyIdx] = { ...db.parties[partyIdx], displayName: nextName, updatedAt: now };
    }
  }
  if (input.rolePatch) {
    db.clientPartyRoles[roleIdx] = { ...db.clientPartyRoles[roleIdx], ...input.rolePatch, updatedAt: now };
  }

  await writeDb(db);
  const updatedRole = db.clientPartyRoles[roleIdx];
  const updatedParty = db.parties.find((p) => p.id === updatedRole.partyId)!;
  const updatedPerson = db.persons.find((p) => p.id === updatedParty.personId)!;
  return { role: updatedRole, party: updatedParty, person: updatedPerson };
}

export async function getOrCreateCompanyPartyForClient(clientId: string) {
  const db = await readDb();
  const client = db.clients.find((c) => c.id === clientId) ?? null;
  if (!client || client.deletedAt) return null;

  const hit = db.parties.find((p) => p.type === 'COMPANY' && p.clientId === clientId) ?? null;
  if (hit) return hit;

  const createdAt = nowIso();
  const party: Party = {
    id: newId('pty'),
    type: 'COMPANY',
    displayName: client.name,
    clientId,
    createdAt,
    updatedAt: createdAt,
  };
  db.parties.unshift(party);
  await writeDb(db);
  return party;
}

export async function getActiveCompanyRepresentative(companyPartyId: string) {
  const db = await readDb();
  const reps = db.companyRepresentatives
    .filter((r) => r.companyPartyId === companyPartyId && r.scope === 'GLOBAL')
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  const active = reps.find((r) => !r.effectiveTo) ?? null;
  if (!active) return null;
  const person = db.persons.find((p) => p.id === active.representativePersonId) ?? null;
  return person ? { representative: active, person } : null;
}

export async function listRepresentativeDesignationRequests(companyPartyId: string) {
  const db = await readDb();
  return db.representativeDesignationRequests
    .filter((r) => r.companyPartyId === companyPartyId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createRepresentativeDesignationRequest(input: {
  id?: string;
  triggerType: RepresentativeDesignationRequest['triggerType'];
  companyPartyId: string;
  packetId: string;
  representativePersonId?: string;
  representativeName?: string;
  representativeEmail?: string;
}) {
  const db = await readDb();
  const createdAt = nowIso();
  const rdr: RepresentativeDesignationRequest = {
    id: input.id ?? newId('rdr'),
    triggerType: input.triggerType,
    companyPartyId: input.companyPartyId,
    representativePersonId: input.representativePersonId,
    representativeName: input.representativeName,
    representativeEmail: input.representativeEmail,
    packetId: input.packetId,
    status: 'SIGNING',
    createdAt,
    updatedAt: createdAt,
  };
  db.representativeDesignationRequests.unshift(rdr);
  await writeDb(db);
  return rdr;
}

export async function listSignatureRequestsByPacket(packetId: string) {
  const db = await readDb();
  return db.signatureRequests
    .filter((r) => r.packetId === packetId)
    .sort((a, b) => a.email.localeCompare(b.email));
}

export async function createDocument(input: { type: Document['type']; title: string; html: string }) {
  const db = await readDb();
  const createdAt = nowIso();
  const doc: Document = {
    id: newId('doc'),
    type: input.type,
    title: input.title,
    html: input.html,
    sha256: sha256Hex(input.html),
    createdAt,
  };
  db.documents.unshift(doc);
  await writeDb(db);
  return doc;
}

export async function createSignaturePacket(input: {
  kind: SignaturePacket['kind'];
  relatedType: SignaturePacket['relatedType'];
  relatedId: string;
  documentId: string;
  status?: SignaturePacket['status'];
}) {
  const db = await readDb();
  const createdAt = nowIso();
  const packet: SignaturePacket = {
    id: newId('spk'),
    kind: input.kind,
    relatedType: input.relatedType,
    relatedId: input.relatedId,
    documentId: input.documentId,
    status: input.status ?? 'DRAFT',
    createdAt,
    updatedAt: createdAt,
  };
  db.signaturePackets.unshift(packet);
  await writeDb(db);
  return packet;
}

export async function createSignatureRequestsForPacket(input: { packetId: string; emails: string[] }) {
  const db = await readDb();
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

  const links: Array<{ email: string; url: string }> = [];
  for (const raw of input.emails) {
    const email = raw.trim();
    if (!email) continue;
    const token = newToken();
    const req: SignatureRequest = {
      id: newId('sgr'),
      packetId: input.packetId,
      email,
      tokenHash: sha256Hex(token),
      expiresAt,
      status: 'PENDING',
      createdAt,
      updatedAt: createdAt,
    };
    db.signatureRequests.unshift(req);
    links.push({ email, url: `/sign/${token}` });
  }

  await writeDb(db);
  return links;
}

export async function getSignatureContextByToken(token: string) {
  const tokenHash = sha256Hex(token);
  const db = await readDb();
  const request = db.signatureRequests.find((r) => r.tokenHash === tokenHash) ?? null;
  if (!request) return null;
  const packet = db.signaturePackets.find((p) => p.id === request.packetId) ?? null;
  if (!packet) return null;
  const document = db.documents.find((d) => d.id === packet.documentId) ?? null;
  if (!document) return null;
  const rdr =
    packet.relatedType === 'RDR'
      ? (db.representativeDesignationRequests.find((x) => x.id === packet.relatedId) ?? null)
      : null;
  return { request, packet, document, rdr };
}

export async function issueSignatureOtp(token: string) {
  const tokenHash = sha256Hex(token);
  const db = await readDb();
  const idx = db.signatureRequests.findIndex((r) => r.tokenHash === tokenHash);
  if (idx < 0) return { ok: false as const, error: 'NOT_FOUND' as const };

  const req = db.signatureRequests[idx];
  if (req.status === 'SIGNED') return { ok: false as const, error: 'ALREADY_SIGNED' as const };
  if (new Date(req.expiresAt).getTime() < Date.now()) {
    db.signatureRequests[idx] = { ...req, status: 'EXPIRED', updatedAt: nowIso() };
    await writeDb(db);
    return { ok: false as const, error: 'EXPIRED' as const };
  }

  const otp = `${Math.floor(100000 + Math.random() * 900000)}`;
  const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const now = nowIso();
  db.signatureRequests[idx] = {
    ...req,
    otpHash: sha256Hex(otp),
    otpExpiresAt,
    otpSentAt: now,
    status: 'OTP_SENT',
    updatedAt: now,
  };
  await writeDb(db);
  return { ok: true as const, otp, email: req.email };
}

async function finalizeRdrIfReady(db: Db, packet: SignaturePacket) {
  if (packet.relatedType !== 'RDR') return;
  if (packet.status !== 'SIGNED') return;

  const rdrIdx = db.representativeDesignationRequests.findIndex((r) => r.id === packet.relatedId);
  if (rdrIdx < 0) return;
  const rdr = db.representativeDesignationRequests[rdrIdx];
  if (rdr.status !== 'SIGNING') return;

  const name = rdr.representativeName?.trim() || undefined;
  const email = rdr.representativeEmail?.trim() || undefined;
  if (!name || !email) return;

  const existingPerson = db.persons.find((p) => (p.email ?? '').toLowerCase() === email.toLowerCase()) ?? null;
  const now = nowIso();
  const person: Person = existingPerson
    ? { ...existingPerson, fullName: name, updatedAt: now }
    : { id: newId('per'), fullName: name, email, createdAt: now, updatedAt: now };
  if (existingPerson) {
    const pIdx = db.persons.findIndex((p) => p.id === existingPerson.id);
    if (pIdx >= 0) db.persons[pIdx] = person;
  } else {
    db.persons.unshift(person);
  }

  const prevActive = db.companyRepresentatives
    .filter((r) => r.companyPartyId === rdr.companyPartyId && r.scope === 'GLOBAL')
    .find((r) => !r.effectiveTo);
  if (prevActive) {
    const i = db.companyRepresentatives.findIndex((r) => r.id === prevActive.id);
    if (i >= 0) db.companyRepresentatives[i] = { ...db.companyRepresentatives[i], effectiveTo: now, updatedAt: now };
  }
  const rep: CompanyRepresentative = {
    id: newId('rep'),
    companyPartyId: rdr.companyPartyId,
    representativePersonId: person.id,
    scope: 'GLOBAL',
    evidenceDocumentId: packet.documentId,
    effectiveFrom: now,
    createdAt: now,
    updatedAt: now,
  };
  db.companyRepresentatives.unshift(rep);
  db.representativeDesignationRequests[rdrIdx] = { ...rdr, representativePersonId: person.id, status: 'EFFECTIVE', updatedAt: now };
}

async function maybeFinalizeShareTransferIfReady(db: Db, packet: SignaturePacket) {
  if (packet.relatedType !== 'SHARE_TRANSFER') return;
  const idx = db.shareTransfers.findIndex((t) => t.id === packet.relatedId);
  if (idx < 0) return;
  const t = db.shareTransfers[idx];
  if (t.status === 'APPLIED') return;
  const sta = db.signaturePackets.find((p) => p.id === t.staPacketId) ?? null;
  const br = db.signaturePackets.find((p) => p.id === t.brPacketId) ?? null;
  if (!sta || !br) return;
  if (sta.status === 'SIGNED' && br.status === 'SIGNED') {
    db.shareTransfers[idx] = { ...t, status: 'SIGNED', updatedAt: nowIso(), blockingRdrIds: undefined };
  }
}

export async function signByToken(input: {
  token: string;
  otp: string;
  ip?: string;
  userAgent?: string;
  rdrRepresentativeName?: string;
  rdrRepresentativeEmail?: string;
}) {
  const tokenHash = sha256Hex(input.token);
  const db = await readDb();
  const reqIdx = db.signatureRequests.findIndex((r) => r.tokenHash === tokenHash);
  if (reqIdx < 0) return { ok: false as const, error: 'NOT_FOUND' as const };
  const req = db.signatureRequests[reqIdx];
  if (req.status === 'SIGNED') return { ok: false as const, error: 'ALREADY_SIGNED' as const };
  if (req.status === 'REVOKED') return { ok: false as const, error: 'REVOKED' as const };
  if (new Date(req.expiresAt).getTime() < Date.now()) return { ok: false as const, error: 'EXPIRED' as const };

  if (!req.otpHash || !req.otpExpiresAt) return { ok: false as const, error: 'OTP_REQUIRED' as const };
  if (new Date(req.otpExpiresAt).getTime() < Date.now()) return { ok: false as const, error: 'OTP_EXPIRED' as const };
  if (sha256Hex(input.otp.trim()) !== req.otpHash) return { ok: false as const, error: 'OTP_INVALID' as const };

  const packetIdx = db.signaturePackets.findIndex((p) => p.id === req.packetId);
  if (packetIdx < 0) return { ok: false as const, error: 'NOT_FOUND' as const };
  const packet = db.signaturePackets[packetIdx];

  const now = nowIso();
  const nextReq: SignatureRequest = {
    ...req,
    status: 'SIGNED',
    signedAt: now,
    signedIp: input.ip,
    signedUserAgent: input.userAgent,
    updatedAt: now,
  };

  if (packet.relatedType === 'RDR') {
    const rdrIdx = db.representativeDesignationRequests.findIndex((r) => r.id === packet.relatedId);
    if (rdrIdx < 0) return { ok: false as const, error: 'NOT_FOUND' as const };
    const rdr = db.representativeDesignationRequests[rdrIdx];

    const repName = input.rdrRepresentativeName?.trim() || undefined;
    const repEmail = input.rdrRepresentativeEmail?.trim() || undefined;
    if (repName && repEmail) {
      nextReq.rdrRepresentativeName = repName;
      nextReq.rdrRepresentativeEmail = repEmail;
      if (rdr.representativeEmail && rdr.representativeEmail.toLowerCase() !== repEmail.toLowerCase()) {
        return { ok: false as const, error: 'REPRESENTATIVE_MISMATCH' as const };
      }
      if (rdr.representativeName && rdr.representativeName !== repName) {
        return { ok: false as const, error: 'REPRESENTATIVE_MISMATCH' as const };
      }
      if (!rdr.representativeEmail || !rdr.representativeName) {
        db.representativeDesignationRequests[rdrIdx] = {
          ...rdr,
          representativeName: repName,
          representativeEmail: repEmail,
          updatedAt: now,
        };
      }
    } else if (!rdr.representativeEmail || !rdr.representativeName) {
      return { ok: false as const, error: 'REPRESENTATIVE_REQUIRED' as const };
    }
  }

  db.signatureRequests[reqIdx] = nextReq;

  const all = db.signatureRequests.filter((r) => r.packetId === packet.id);
  if (all.length > 0 && all.every((r) => r.status === 'SIGNED')) {
    db.signaturePackets[packetIdx] = { ...packet, status: 'SIGNED', updatedAt: now };
    await finalizeRdrIfReady(db, db.signaturePackets[packetIdx]);
    await maybeFinalizeShareTransferIfReady(db, db.signaturePackets[packetIdx]);
  } else if (packet.status === 'DRAFT') {
    db.signaturePackets[packetIdx] = { ...packet, status: 'SIGNING', updatedAt: now };
  }

  await writeDb(db);
  return { ok: true as const };
}

export async function listShareTransfers() {
  const db = await readDb();
  return db.shareTransfers;
}

export async function createShareTransferRequest(input: {
  clientId: string;
  transferor:
    | { kind: 'PERSON'; fullName: string; email: string }
    | { kind: 'COMPANY_CLIENT'; clientId: string };
  transferee:
    | { kind: 'PERSON'; fullName: string; email: string }
    | { kind: 'COMPANY_CLIENT'; clientId: string };
  shares: number;
  shareClass?: string;
  effectiveDate: string;
}) {
  const db = await readDb();
  const client = db.clients.find((c) => c.id === input.clientId) ?? null;
  if (!client || client.deletedAt) return { ok: false as const, error: 'NOT_FOUND' as const };

  const now = nowIso();
  const effectiveDate = input.effectiveDate.trim();
  if (!effectiveDate) return { ok: false as const, error: 'INVALID_INPUT' as const };
  const shares = Number(input.shares);
  if (!Number.isFinite(shares) || shares <= 0) return { ok: false as const, error: 'INVALID_INPUT' as const };

  const makePersonParty = (fullNameRaw: string, emailRaw: string) => {
    const fullName = fullNameRaw.trim();
    const email = emailRaw.trim();
    if (!fullName || !email) return null;
    const person: Person = { id: newId('per'), fullName, email, createdAt: now, updatedAt: now };
    const party: Party = {
      id: newId('pty'),
      type: 'PERSON',
      displayName: fullName,
      personId: person.id,
      createdAt: now,
      updatedAt: now,
    };
    db.persons.unshift(person);
    db.parties.unshift(party);
    return { person, party };
  };

  const ensureCompanyParty = (companyClientId: string) => {
    const c = db.clients.find((x) => x.id === companyClientId) ?? null;
    if (!c || c.deletedAt) return null;
    const hit = db.parties.find((p) => p.type === 'COMPANY' && p.clientId === companyClientId) ?? null;
    if (hit) return { company: c, party: hit };
    const party: Party = {
      id: newId('pty'),
      type: 'COMPANY',
      displayName: c.name,
      clientId: companyClientId,
      createdAt: now,
      updatedAt: now,
    };
    db.parties.unshift(party);
    return { company: c, party };
  };

  const transferor =
    input.transferor.kind === 'PERSON'
      ? makePersonParty(input.transferor.fullName, input.transferor.email)
      : ensureCompanyParty(input.transferor.clientId);
  if (!transferor) return { ok: false as const, error: 'INVALID_INPUT' as const };
  const transferee =
    input.transferee.kind === 'PERSON'
      ? makePersonParty(input.transferee.fullName, input.transferee.email)
      : ensureCompanyParty(input.transferee.clientId);
  if (!transferee) return { ok: false as const, error: 'INVALID_INPUT' as const };

  const transferorPartyId = transferor.party.id;
  const transfereePartyId = transferee.party.id;

  const transferorName = transferor.party.displayName;
  const transfereeName = transferee.party.displayName;

  const transferId = newId('stf');

  const staDoc: Document = {
    id: newId('doc'),
    type: 'STA',
    title: `Share Transfer Agreement - ${client.name}`,
    html: '',
    sha256: '',
    createdAt: now,
  };
  const brDoc: Document = {
    id: newId('doc'),
    type: 'BR',
    title: `Board Resolution - ${client.name}`,
    html: '',
    sha256: '',
    createdAt: now,
  };

  db.documents.unshift(staDoc, brDoc);

  const staPacket: SignaturePacket = {
    id: newId('spk'),
    kind: 'STA',
    relatedType: 'SHARE_TRANSFER',
    relatedId: transferId,
    documentId: staDoc.id,
    status: 'DRAFT',
    createdAt: now,
    updatedAt: now,
  };
  const brPacket: SignaturePacket = {
    id: newId('spk'),
    kind: 'BR',
    relatedType: 'SHARE_TRANSFER',
    relatedId: transferId,
    documentId: brDoc.id,
    status: 'SIGNING',
    createdAt: now,
    updatedAt: now,
  };
  db.signaturePackets.unshift(staPacket, brPacket);

  const shareClass = typeof input.shareClass === 'string' ? input.shareClass.trim() || undefined : undefined;

  const staHtml = (await import('@/lib/docTemplates')).renderShareTransferAgreementHtml({
    targetCompanyName: client.name,
    transferorName,
    transfereeName,
    shares,
    shareClass,
    effectiveDate,
  });
  const brSummary = `Approve the transfer of ${shares}${shareClass ? ` (${shareClass})` : ''} shares from ${transferorName} to ${transfereeName} effective on ${effectiveDate}.`;
  const brHtml = (await import('@/lib/docTemplates')).renderBoardResolutionHtml({
    companyName: client.name,
    resolutionDate: effectiveDate,
    summary: brSummary,
  });

  const staSha = sha256Hex(staHtml);
  const brSha = sha256Hex(brHtml);
  const staIdx = db.documents.findIndex((d) => d.id === staDoc.id);
  const brIdx = db.documents.findIndex((d) => d.id === brDoc.id);
  if (staIdx >= 0) db.documents[staIdx] = { ...db.documents[staIdx], html: staHtml, sha256: staSha };
  if (brIdx >= 0) db.documents[brIdx] = { ...db.documents[brIdx], html: brHtml, sha256: brSha };

  const directors = db.clientPartyRoles
    .filter((r) => r.clientId === client.id && r.role === 'DIRECTOR' && !r.resignationDate)
    .map((r) => db.parties.find((p) => p.id === r.partyId) ?? null)
    .filter((p): p is Party => !!p && p.type === 'PERSON' && !!p.personId)
    .map((p) => db.persons.find((x) => x.id === p.personId!) ?? null)
    .filter((p): p is Person => !!p);

  const directorEmails = directors.map((d) => d.email).filter((e): e is string => !!e && !!e.trim());
  if (directorEmails.length !== directors.length) return { ok: false as const, error: 'MISSING_SIGNER_EMAIL' as const };

  const brLinks: Array<{ email: string; url: string }> = [];
  for (const email of directorEmails) {
    const token = newToken();
    const req: SignatureRequest = {
      id: newId('sgr'),
      packetId: brPacket.id,
      email,
      tokenHash: sha256Hex(token),
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'PENDING',
      createdAt: now,
      updatedAt: now,
    };
    db.signatureRequests.unshift(req);
    brLinks.push({ email, url: `/sign/${token}` });
  }

  const blockingRdrIds: string[] = [];
  const staSignerEmails: string[] = [];
  const rdrLinks: Array<{ email: string; url: string }> = [];

  const resolveStaEmail = (party: Party) => {
    if (party.type === 'PERSON') {
      const person = party.personId ? db.persons.find((p) => p.id === party.personId) ?? null : null;
      return person?.email ?? null;
    }
    if (party.type === 'COMPANY' && party.clientId) {
      const activeRep = db.companyRepresentatives
        .filter((r) => r.companyPartyId === party.id && r.scope === 'GLOBAL')
        .find((r) => !r.effectiveTo);
      if (!activeRep) return null;
      const person = db.persons.find((p) => p.id === activeRep.representativePersonId) ?? null;
      return person?.email ?? null;
    }
    return null;
  };

  const ensureAutoRdr = async (companyParty: Party) => {
    const companyClientId = companyParty.clientId;
    if (!companyClientId) return null;
    const company = db.clients.find((c) => c.id === companyClientId) ?? null;
    if (!company || company.deletedAt) return null;

    const directors = db.clientPartyRoles
      .filter((r) => r.clientId === companyClientId && r.role === 'DIRECTOR' && !r.resignationDate)
      .map((r) => db.parties.find((p) => p.id === r.partyId) ?? null)
      .filter((p): p is Party => !!p && p.type === 'PERSON' && !!p.personId)
      .map((p) => db.persons.find((x) => x.id === p.personId!) ?? null)
      .filter((p): p is Person => !!p);
    const emails = directors.map((d) => d.email).filter((e): e is string => !!e && !!e.trim());
    if (emails.length !== directors.length) return null;

    const rdrId = newId('rdr');
    const html = (await import('@/lib/docTemplates')).renderRdrAuthorizationHtml({
      companyName: company.name,
      representativeName: undefined,
      purpose: `Appoint a GLOBAL corporate representative for signing documents (Share Transfer).`,
      dateYmd: effectiveDate,
    });
    const doc: Document = {
      id: newId('doc'),
      type: 'RDR_AUTH',
      title: `Corporate Representative - ${company.name}`,
      html,
      sha256: sha256Hex(html),
      createdAt: now,
    };
    db.documents.unshift(doc);

    const packet: SignaturePacket = {
      id: newId('spk'),
      kind: 'RDR',
      relatedType: 'RDR',
      relatedId: rdrId,
      documentId: doc.id,
      status: 'SIGNING',
      createdAt: now,
      updatedAt: now,
    };
    db.signaturePackets.unshift(packet);

    const rdr: RepresentativeDesignationRequest = {
      id: rdrId,
      triggerType: 'AUTO_FOR_CHANGE_REQUEST',
      companyPartyId: companyParty.id,
      representativePersonId: undefined,
      representativeName: undefined,
      representativeEmail: undefined,
      packetId: packet.id,
      status: 'SIGNING',
      createdAt: now,
      updatedAt: now,
    };
    db.representativeDesignationRequests.unshift(rdr);

    const links: Array<{ email: string; url: string }> = [];
    for (const email of emails) {
      const token = newToken();
      const req: SignatureRequest = {
        id: newId('sgr'),
        packetId: packet.id,
        email,
        tokenHash: sha256Hex(token),
        expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'PENDING',
        createdAt: now,
        updatedAt: now,
      };
      db.signatureRequests.unshift(req);
      links.push({ email, url: `/sign/${token}` });
    }

    return { rdrId, links };
  };

  for (const party of [transferor.party, transferee.party]) {
    const email = resolveStaEmail(party);
    if (email) {
      staSignerEmails.push(email);
      continue;
    }
    if (party.type === 'COMPANY') {
      const created = await ensureAutoRdr(party);
      if (!created) return { ok: false as const, error: 'MISSING_REPRESENTATIVE' as const };
      blockingRdrIds.push(created.rdrId);
      rdrLinks.push(...created.links);
      continue;
    }
    return { ok: false as const, error: 'MISSING_SIGNER_EMAIL' as const };
  }

  const staLinks: Array<{ email: string; url: string }> = [];
  if (blockingRdrIds.length === 0) {
    (staPacket as unknown as { status: SignaturePacket['status'] }).status = 'SIGNING';
    for (const email of staSignerEmails) {
      const token = newToken();
      const req: SignatureRequest = {
        id: newId('sgr'),
        packetId: staPacket.id,
        email,
        tokenHash: sha256Hex(token),
        expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'PENDING',
        createdAt: now,
        updatedAt: now,
      };
      db.signatureRequests.unshift(req);
      staLinks.push({ email, url: `/sign/${token}` });
    }
  }

  const status: ShareTransfer['status'] = blockingRdrIds.length > 0 ? 'BLOCKED_REPRESENTATIVE' : 'SIGNING';
  const transfer: ShareTransfer = {
    id: transferId,
    clientId: client.id,
    transferorPartyId,
    transfereePartyId,
    shareClass,
    shares,
    effectiveDate,
    status,
    staPacketId: staPacket.id,
    brPacketId: brPacket.id,
    blockingRdrIds: blockingRdrIds.length > 0 ? blockingRdrIds : undefined,
    createdAt: now,
    updatedAt: now,
  };
  db.shareTransfers.unshift(transfer);

  await writeDb(db);
  return { ok: true as const, transfer, signLinks: { br: brLinks, sta: staLinks, rdr: rdrLinks } };
}

export async function resumeShareTransfer(transferId: string) {
  const db = await readDb();
  const idx = db.shareTransfers.findIndex((t) => t.id === transferId);
  if (idx < 0) return { ok: false as const, error: 'NOT_FOUND' as const };
  const t = db.shareTransfers[idx];
  if (t.status !== 'BLOCKED_REPRESENTATIVE') return { ok: false as const, error: 'INVALID_STATE' as const };

  const staPacketIdx = db.signaturePackets.findIndex((p) => p.id === t.staPacketId);
  if (staPacketIdx < 0) return { ok: false as const, error: 'NOT_FOUND' as const };
  const staPacket = db.signaturePackets[staPacketIdx];

  const transferorParty = db.parties.find((p) => p.id === t.transferorPartyId) ?? null;
  const transfereeParty = db.parties.find((p) => p.id === t.transfereePartyId) ?? null;
  if (!transferorParty || !transfereeParty) return { ok: false as const, error: 'NOT_FOUND' as const };

  const resolveEmail = (party: Party) => {
    if (party.type === 'PERSON' && party.personId) {
      const person = db.persons.find((p) => p.id === party.personId) ?? null;
      return person?.email ?? null;
    }
    if (party.type === 'COMPANY') {
      const rep = db.companyRepresentatives
        .filter((r) => r.companyPartyId === party.id && r.scope === 'GLOBAL')
        .find((r) => !r.effectiveTo);
      if (!rep) return null;
      const person = db.persons.find((p) => p.id === rep.representativePersonId) ?? null;
      return person?.email ?? null;
    }
    return null;
  };

  const emails = [resolveEmail(transferorParty), resolveEmail(transfereeParty)];
  if (emails.some((e) => !e)) return { ok: false as const, error: 'MISSING_REPRESENTATIVE' as const };

  const now = nowIso();
  const links: Array<{ email: string; url: string }> = [];
  for (const email of emails as string[]) {
    const token = newToken();
    const req: SignatureRequest = {
      id: newId('sgr'),
      packetId: staPacket.id,
      email,
      tokenHash: sha256Hex(token),
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'PENDING',
      createdAt: now,
      updatedAt: now,
    };
    db.signatureRequests.unshift(req);
    links.push({ email, url: `/sign/${token}` });
  }

  db.signaturePackets[staPacketIdx] = { ...staPacket, status: 'SIGNING', updatedAt: now };
  db.shareTransfers[idx] = { ...t, status: 'SIGNING', blockingRdrIds: undefined, updatedAt: now };

  await writeDb(db);
  return { ok: true as const, signLinks: links };
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

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function uniqEmails(input: string[]) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    const v = raw.trim();
    if (!v) continue;
    const k = normalizeEmail(v);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

function invoiceEmailHistoryKeyOfBillTo(billTo: Invoice['billTo']): InvoiceEmailHistory['key'] {
  if (billTo.type === 'CLIENT') return { type: 'CLIENT', clientId: billTo.clientId };
  const key = billTo.companyName.trim().toLowerCase().replaceAll(/\s+/g, ' ');
  return { type: 'ONE_OFF', companyNameKey: key };
}

function safeNumber(v: unknown) {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function computeInvoiceTotals(items: Invoice['items'], discount: number, tax: number) {
  const subtotal = round2(items.reduce((sum, it) => sum + safeNumber(it.qty) * safeNumber(it.unitPrice), 0));
  const safeDiscount = round2(Math.max(0, discount));
  const safeTax = round2(Math.max(0, tax));
  const total = round2(Math.max(0, subtotal - safeDiscount + safeTax));
  return { subtotal, discount: safeDiscount, tax: safeTax, total };
}

function yyyymmFromYmd(ymd: string) {
  const m = ymd.match(/^(\d{4})-(\d{2})-\d{2}$/);
  if (!m) return '';
  return `${m[1]}${m[2]}`;
}

function parseSeqFromInvoiceNo(invoiceNo: string, prefix: string) {
  if (!invoiceNo.startsWith(prefix)) return null;
  const rest = invoiceNo.slice(prefix.length);
  const m = rest.match(/^(\d{3})/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function issuerPrefix(issuer: Invoice['issuer'], yyyymm: string) {
  if (issuer === 'BBY_SG') return `BBYSG${yyyymm}`;
  return `BYBR${yyyymm}`;
}

async function generateNextInvoiceNo(issuer: Invoice['issuer'], issueDateYmd: string) {
  const db = await readDb();
  const yyyymm = yyyymmFromYmd(issueDateYmd) || yyyymmFromYmd(nowIso().slice(0, 10));
  const prefix = issuerPrefix(issuer, yyyymm);
  const existingNos = new Set(db.invoices.map((x) => x.invoiceNo));
  let lastSeq = 0;
  for (const inv of db.invoices) {
    if (inv.issuer !== issuer) continue;
    const seq = parseSeqFromInvoiceNo(inv.invoiceNo, prefix);
    if (seq && seq > lastSeq) lastSeq = seq;
  }
  const nextSeq = lastSeq + 1;
  const seq3 = String(nextSeq).padStart(3, '0');
  for (let i = 0; i < 20; i++) {
    const randDigit = String(Math.floor(Math.random() * 10));
    const candidate = `${prefix}${seq3}${randDigit}`;
    if (!existingNos.has(candidate)) return candidate;
  }
  return `${prefix}${seq3}${randomBytes(1).toString('hex').toUpperCase().slice(0, 1)}`;
}

export async function listInvoices() {
  const db = await readDb();
  return db.invoices;
}

export async function findInvoiceById(id: string) {
  const db = await readDb();
  return db.invoices.find((x) => x.id === id) ?? null;
}

export async function findInvoiceByPublicToken(token: string) {
  const t = token.trim();
  if (!t) return null;
  const db = await readDb();
  return db.invoices.find((x) => x.publicToken === t) ?? null;
}

function upsertInvoiceEmailHistoryInDb(
  db: Db,
  input: {
    billTo: Invoice['billTo'];
    toEmails: string[];
    ccEmails: string[];
  },
) {
  const key = invoiceEmailHistoryKeyOfBillTo(input.billTo);
  const idx = db.invoiceEmailHistories.findIndex((h) => {
    if (h.key.type !== key.type) return false;
    if (key.type === 'CLIENT') return h.key.type === 'CLIENT' && h.key.clientId === key.clientId;
    return h.key.type === 'ONE_OFF' && h.key.companyNameKey === key.companyNameKey;
  });
  const toEmails = uniqEmails(input.toEmails);
  const ccEmails = uniqEmails(input.ccEmails);
  const now = nowIso();
  if (idx >= 0) {
    const current = db.invoiceEmailHistories[idx];
    const mergedTo = uniqEmails([...toEmails, ...(current.toEmails ?? [])]);
    const mergedCc = uniqEmails([...ccEmails, ...(current.ccEmails ?? [])]);
    db.invoiceEmailHistories[idx] = { ...current, toEmails: mergedTo, ccEmails: mergedCc, updatedAt: now };
    return db.invoiceEmailHistories[idx];
  }
  const history: InvoiceEmailHistory = {
    id: newId('ieh'),
    key,
    toEmails,
    ccEmails,
    createdAt: now,
    updatedAt: now,
  };
  db.invoiceEmailHistories.unshift(history);
  return history;
}

export async function upsertInvoiceEmailHistory(input: {
  billTo: Invoice['billTo'];
  toEmails: string[];
  ccEmails: string[];
}) {
  const db = await readDb();
  const history = upsertInvoiceEmailHistoryInDb(db, input);
  await writeDb(db);
  return history;
}

export async function findInvoiceEmailHistoryByBillTo(billTo: Invoice['billTo']) {
  const db = await readDb();
  const key = invoiceEmailHistoryKeyOfBillTo(billTo);
  return (
    db.invoiceEmailHistories.find((h) => {
      if (h.key.type !== key.type) return false;
      if (key.type === 'CLIENT') return h.key.type === 'CLIENT' && h.key.clientId === key.clientId;
      return h.key.type === 'ONE_OFF' && h.key.companyNameKey === key.companyNameKey;
    }) ?? null
  );
}

export async function createInvoice(input: Omit<Invoice, 'id' | 'createdAt' | 'updatedAt'>) {
  const db = await readDb();
  const createdAt = nowIso();
  const issueDate = input.issueDate || createdAt.slice(0, 10);
  const invoiceNo = input.invoiceNo?.trim() ? input.invoiceNo.trim() : await generateNextInvoiceNo(input.issuer, issueDate);
  if (db.invoices.some((x) => x.invoiceNo === invoiceNo)) {
    throw new Error('DUPLICATE_INVOICE_NO');
  }
  const totals = computeInvoiceTotals(input.items, input.discount ?? 0, input.tax ?? 0);
  const invoice: Invoice = {
    ...input,
    id: newId('inv'),
    invoiceNo,
    issueDate,
    currency: input.currency ?? 'SGD',
    discount: totals.discount || undefined,
    tax: totals.tax || undefined,
    subtotal: totals.subtotal,
    total: totals.total,
    createdAt,
    updatedAt: createdAt,
  };
  db.invoices.unshift(invoice);
  await writeDb(db);
  return invoice;
}

export async function updateInvoice(invoiceId: string, next: Omit<Invoice, 'updatedAt'> | Invoice) {
  const db = await readDb();
  const idx = db.invoices.findIndex((x) => x.id === invoiceId);
  if (idx < 0) return null;
  const now = nowIso();
  const rest = { ...(next as Invoice) } as Record<string, unknown>;
  delete rest.updatedAt;
  const invoice: Invoice = { ...(rest as Invoice), updatedAt: now };
  db.invoices[idx] = invoice;
  await writeDb(db);
  return invoice;
}

export async function deleteInvoice(invoiceId: string) {
  const db = await readDb();
  const idx = db.invoices.findIndex((x) => x.id === invoiceId);
  if (idx < 0) return null;
  db.invoices[idx] = { ...db.invoices[idx], deletedAt: nowIso(), updatedAt: nowIso() };
  await writeDb(db);
  return db.invoices[idx];
}
