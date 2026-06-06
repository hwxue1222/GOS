import { promises as fs } from 'fs';
import path from 'path';
import { createHash, randomBytes } from 'crypto';
import ssic from '@/data/ssic.json';
import { hashPassword } from '@/lib/password';
import { newId } from '@/lib/id';
import type {
  Client,
  ClientPartyRole,
  CompanyRepresentative,
  Currency,
  Db,
  Document,
  ExternalCompany,
  AuditLog,
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

type SsicRow = { code: string; description: string };
const SSIC_ROWS = (Array.isArray(ssic) ? ssic : []) as unknown as SsicRow[];

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
    auditLogs: [],
    reservedNames: [],
    seed: {},
  };
}

function normalizeFkaAppend(existing: string | undefined, next: string) {
  const cleanNext = next.trim();
  if (!cleanNext) return existing;
  const parts = (existing ?? '')
    .split(/\s*;\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.some((p) => p.toLowerCase() === cleanNext.toLowerCase())) return existing;
  return [...parts, cleanNext].join('; ');
}

function cleanupClientNameStatusSuffixes(db: Db) {
  const statusRegex = /\s*\((resigned|transferred|strike off|transfer out|no reply|deregistered|bvi)\)\s*$/i;
  let changed = false;
  for (const c of db.clients) {
    if (!c || c.deletedAt) continue;
    const name = String(c.name ?? '');
    const m = name.match(statusRegex);
    if (!m) continue;
    const status = m[1];
    const nextName = name.replace(statusRegex, '').trim();
    if (nextName && nextName !== c.name) {
      c.name = nextName;
      changed = true;
    }
    const nextFka = normalizeFkaAppend(c.fka, status);
    if (nextFka !== c.fka) {
      c.fka = nextFka;
      changed = true;
    }
  }
  return changed;
}

const SEED_KEY_CLIENT_CODE_MIGRATION_V1 = 'clients.codeMigration.v1';
const SEED_KEY_CLIENT_CODE_MIGRATION_V2 = 'clients.codeMigration.v2';
const SEED_KEY_CLIENT_CODE_MIGRATION_V3 = 'clients.codeMigration.v3';
const SEED_KEY_CLIENT_CODE_MIGRATION_V4 = 'clients.codeMigration.v4';
const SEED_KEY_CLIENT_CODE_MIGRATION_V5 = 'clients.codeMigration.v5';
const SEED_KEY_CLIENT_CODE_MIGRATION_V6 = 'clients.codeMigration.v6';
const SEED_KEY_CLIENT_CODE_MIGRATION_V7 = 'clients.codeMigration.v7';
const SEED_KEY_CLIENT_CODE_MIGRATION_V8 = 'clients.codeMigration.v8';
const SEED_KEY_CLIENT_DEDUPE_BY_NAME_V1 = 'clients.dedupeByName.v1';
const SEED_KEY_CLIENT_DEDUPE_BY_NAME_V2 = 'clients.dedupeByName.v2';

function migrateClientCodesV1(db: Db) {
  if (!db.seed) db.seed = {};
  if (db.seed[SEED_KEY_CLIENT_CODE_MIGRATION_V1]) return false;

  const mapping: Record<string, string> = {
    SC001: 'DA211',
    SC002: 'DA210',
    SC003: 'DA209',
    SC004: 'DA208',
    SC005: 'EA007',
    SC006: 'SC001',
  };

  const codeToClient = new Map(db.clients.filter((c) => !c.deletedAt).map((c) => [String(c.code ?? ''), c]));
  for (const [from, to] of Object.entries(mapping)) {
    const c = codeToClient.get(from);
    if (!c) continue;
    const existing = codeToClient.get(to);
    if (existing && existing.id !== c.id) {
      continue;
    }
    c.code = to;
    codeToClient.delete(from);
    codeToClient.set(to, c);
  }

  db.seed[SEED_KEY_CLIENT_CODE_MIGRATION_V1] = true;
  return true;
}

function migrateClientCodesV2(db: Db) {
  if (!db.seed) db.seed = {};
  if (db.seed[SEED_KEY_CLIENT_CODE_MIGRATION_V2]) return false;

  const mapping: Record<string, string> = {
    SC027: 'DA100',
  };

  let changed = false;
  const activeClients = db.clients.filter((c) => !c.deletedAt);
  const codeToClient = new Map(activeClients.map((c) => [String(c.code ?? ''), c]));
  for (const [from, to] of Object.entries(mapping)) {
    const c = codeToClient.get(from);
    if (!c) continue;

    const existing = codeToClient.get(to);
    if (existing && existing.id !== c.id) {
      const sameName =
        normalizeClientNameForMerge(String(existing.name ?? '')) === normalizeClientNameForMerge(String(c.name ?? ''));
      const sameReg = String(existing.companyRegistrationNo ?? '').trim() === String(c.companyRegistrationNo ?? '').trim();
      if (sameName && sameReg) {
        if (mergeClientInto(db, c.id, existing.id)) changed = true;
      }
      continue;
    }

    c.code = to;
    codeToClient.delete(from);
    codeToClient.set(to, c);
    changed = true;
  }

  db.seed[SEED_KEY_CLIENT_CODE_MIGRATION_V2] = true;
  return changed;
}

function migrateClientCodesV3(db: Db) {
  if (!db.seed) db.seed = {};
  if (db.seed[SEED_KEY_CLIENT_CODE_MIGRATION_V3]) return false;

  const mapping: Record<string, string> = {
    SC015: 'DA135',
  };

  let changed = false;
  const activeClients = db.clients.filter((c) => !c.deletedAt);
  const codeToClient = new Map(activeClients.map((c) => [String(c.code ?? ''), c]));
  for (const [from, to] of Object.entries(mapping)) {
    const c = codeToClient.get(from);
    if (!c) continue;

    const existing = codeToClient.get(to);
    if (existing && existing.id !== c.id) {
      const sameName =
        normalizeClientNameForMerge(String(existing.name ?? '')) === normalizeClientNameForMerge(String(c.name ?? ''));
      const sameReg = String(existing.companyRegistrationNo ?? '').trim() === String(c.companyRegistrationNo ?? '').trim();
      if (sameName && sameReg) {
        if (mergeClientInto(db, c.id, existing.id)) changed = true;
      }
      continue;
    }

    c.code = to;
    codeToClient.delete(from);
    codeToClient.set(to, c);
    changed = true;
  }

  db.seed[SEED_KEY_CLIENT_CODE_MIGRATION_V3] = true;
  return changed;
}

function migrateClientCodesV4(db: Db) {
  if (!db.seed) db.seed = {};
  if (db.seed[SEED_KEY_CLIENT_CODE_MIGRATION_V4]) return false;

  const mapping: Record<string, string> = {
    SC022: 'DA106',
  };

  let changed = false;
  const activeClients = db.clients.filter((c) => !c.deletedAt);
  const codeToClient = new Map(activeClients.map((c) => [String(c.code ?? ''), c]));
  for (const [from, to] of Object.entries(mapping)) {
    const c = codeToClient.get(from);
    if (!c) continue;

    const existing = codeToClient.get(to);
    if (existing && existing.id !== c.id) {
      const sameName =
        normalizeClientNameForMerge(String(existing.name ?? '')) === normalizeClientNameForMerge(String(c.name ?? ''));
      const sameReg = String(existing.companyRegistrationNo ?? '').trim() === String(c.companyRegistrationNo ?? '').trim();
      if (sameName && sameReg) {
        if (mergeClientInto(db, c.id, existing.id)) changed = true;
      }
      continue;
    }

    c.code = to;
    codeToClient.delete(from);
    codeToClient.set(to, c);
    changed = true;
  }

  db.seed[SEED_KEY_CLIENT_CODE_MIGRATION_V4] = true;
  return changed;
}

function migrateClientCodesV5(db: Db) {
  if (!db.seed) db.seed = {};
  if (db.seed[SEED_KEY_CLIENT_CODE_MIGRATION_V5]) return false;

  const mapping: Record<string, string> = {
    SC021: 'DA108',
  };

  let changed = false;
  const activeClients = db.clients.filter((c) => !c.deletedAt);
  const codeToClient = new Map(activeClients.map((c) => [String(c.code ?? ''), c]));
  for (const [from, to] of Object.entries(mapping)) {
    const c = codeToClient.get(from);
    if (!c) continue;

    const existing = codeToClient.get(to);
    if (existing && existing.id !== c.id) {
      const sameName =
        normalizeClientNameForMerge(String(existing.name ?? '')) === normalizeClientNameForMerge(String(c.name ?? ''));
      const sameReg = String(existing.companyRegistrationNo ?? '').trim() === String(c.companyRegistrationNo ?? '').trim();
      if (sameName && sameReg) {
        if (mergeClientInto(db, c.id, existing.id)) changed = true;
      }
      continue;
    }

    c.code = to;
    codeToClient.delete(from);
    codeToClient.set(to, c);
    changed = true;
  }

  db.seed[SEED_KEY_CLIENT_CODE_MIGRATION_V5] = true;
  return changed;
}

function migrateClientCodesV6(db: Db) {
  if (!db.seed) db.seed = {};
  if (db.seed[SEED_KEY_CLIENT_CODE_MIGRATION_V6]) return false;

  const mapping: Record<string, string> = {
    SC018: 'DA095a',
    SC013: 'DA143',
  };

  let changed = false;
  const activeClients = db.clients.filter((c) => !c.deletedAt);
  const codeToClient = new Map(activeClients.map((c) => [String(c.code ?? ''), c]));
  for (const [from, to] of Object.entries(mapping)) {
    const c = codeToClient.get(from);
    if (!c) continue;

    const existing = codeToClient.get(to);
    if (existing && existing.id !== c.id) {
      const sameName =
        normalizeClientNameForMerge(String(existing.name ?? '')) === normalizeClientNameForMerge(String(c.name ?? ''));
      const sameReg = String(existing.companyRegistrationNo ?? '').trim() === String(c.companyRegistrationNo ?? '').trim();
      if (sameName && sameReg) {
        if (mergeClientInto(db, c.id, existing.id)) changed = true;
      }
      continue;
    }

    c.code = to;
    codeToClient.delete(from);
    codeToClient.set(to, c);
    changed = true;
  }

  db.seed[SEED_KEY_CLIENT_CODE_MIGRATION_V6] = true;
  return changed;
}

function migrateClientCodesV7(db: Db) {
  if (!db.seed) db.seed = {};
  if (db.seed[SEED_KEY_CLIENT_CODE_MIGRATION_V7]) return false;

  const mapping: Record<string, string> = {
    SC006: 'DA187',
    SC036: 'DA067',
  };

  let changed = false;
  const activeClients = db.clients.filter((c) => !c.deletedAt);
  const codeToClient = new Map(activeClients.map((c) => [String(c.code ?? ''), c]));
  for (const [from, to] of Object.entries(mapping)) {
    const c = codeToClient.get(from);
    if (!c) continue;

    const existing = codeToClient.get(to);
    if (existing && existing.id !== c.id) {
      const sameName =
        normalizeClientNameForMerge(String(existing.name ?? '')) === normalizeClientNameForMerge(String(c.name ?? ''));
      const sameReg = String(existing.companyRegistrationNo ?? '').trim() === String(c.companyRegistrationNo ?? '').trim();
      if (sameName && sameReg) {
        if (mergeClientInto(db, c.id, existing.id)) changed = true;
      }
      continue;
    }

    c.code = to;
    codeToClient.delete(from);
    codeToClient.set(to, c);
    changed = true;
  }

  db.seed[SEED_KEY_CLIENT_CODE_MIGRATION_V7] = true;
  return changed;
}

function migrateClientCodesV8(db: Db) {
  if (!db.seed) db.seed = {};
  if (db.seed[SEED_KEY_CLIENT_CODE_MIGRATION_V8]) return false;

  let changed = false;

  const targetNameKey = normalizeClientNameForMerge('Xing Xin Medical Technology Pte Ltd');
  const targetUen = '202503155H';
  const desiredCode = 'DA205';

  const active = db.clients.filter((c) => !c.deletedAt);
  const match =
    active.find(
      (c) =>
        normalizeClientNameForMerge(String(c.name ?? '')) === targetNameKey &&
        String(c.companyRegistrationNo ?? '').trim().toUpperCase() === targetUen,
    ) ?? null;
  if (!match) {
    db.seed[SEED_KEY_CLIENT_CODE_MIGRATION_V8] = true;
    return false;
  }

  const existingDesired = active.find((c) => String(c.code ?? '') === desiredCode) ?? null;
  if (existingDesired && existingDesired.id !== match.id) {
    const sameName =
      normalizeClientNameForMerge(String(existingDesired.name ?? '')) === normalizeClientNameForMerge(String(match.name ?? ''));
    const sameReg =
      String(existingDesired.companyRegistrationNo ?? '').trim() === String(match.companyRegistrationNo ?? '').trim();
    if (sameName && sameReg) {
      if (mergeClientInto(db, match.id, existingDesired.id)) changed = true;
    }
    db.seed[SEED_KEY_CLIENT_CODE_MIGRATION_V8] = true;
    return changed;
  }

  if (String(match.code ?? '') !== desiredCode) {
    match.code = desiredCode;
    changed = true;
  }

  db.seed[SEED_KEY_CLIENT_CODE_MIGRATION_V8] = true;
  return changed;
}

function mergeClientInto(db: Db, fromClientId: string, toClientId: string) {
  if (fromClientId === toClientId) return false;
  const from = db.clients.find((c) => c.id === fromClientId && !c.deletedAt) ?? null;
  const to = db.clients.find((c) => c.id === toClientId && !c.deletedAt) ?? null;
  if (!from || !to) return false;

  let changed = false;

  const mergeScalar = <K extends keyof Client>(key: K) => {
    const fromVal = from[key];
    const toVal = to[key];
    if (toVal === undefined || toVal === '' || toVal === null) {
      if (fromVal !== undefined && fromVal !== '' && fromVal !== null) {
        (to as any)[key] = fromVal;
        changed = true;
      }
    }
  };

  mergeScalar('fka');
  mergeScalar('companyRegistrationNo');
  mergeScalar('fye');
  mergeScalar('contactPerson');
  mergeScalar('address');
  mergeScalar('phone');
  mergeScalar('email');
  mergeScalar('businessActivities');
  mergeScalar('ssicPrimaryCode');
  mergeScalar('ssicSecondaryCode');
  mergeScalar('paidUpCapitalCurrency');
  mergeScalar('paidUpCapitalAmount');
  mergeScalar('totalShares');
  mergeScalar('incorporationDate');
  mergeScalar('registeredOfficeAddress');

  const mergedTags = Array.from(new Set([...(to.tags ?? []), ...(from.tags ?? [])].filter(Boolean)));
  if (JSON.stringify(mergedTags) !== JSON.stringify(to.tags ?? [])) {
    to.tags = mergedTags;
    changed = true;
  }

  const partyFrom = db.parties.find((p) => p.type === 'COMPANY' && p.clientId === from.id) ?? null;
  const partyTo = db.parties.find((p) => p.type === 'COMPANY' && p.clientId === to.id) ?? null;
  if (partyFrom && partyTo) {
    const oldId = partyFrom.id;
    const newId = partyTo.id;
    for (const r of db.clientPartyRoles) {
      if (r.partyId === oldId) {
        r.partyId = newId;
        changed = true;
      }
    }
    for (const t of db.shareTransfers) {
      if (t.transferorPartyId === oldId) {
        t.transferorPartyId = newId;
        changed = true;
      }
      if (t.transfereePartyId === oldId) {
        t.transfereePartyId = newId;
        changed = true;
      }
    }
    for (const cr of db.companyRepresentatives) {
      if (cr.companyPartyId === oldId) {
        cr.companyPartyId = newId;
        changed = true;
      }
    }
    for (const rdr of db.representativeDesignationRequests) {
      if (rdr.companyPartyId === oldId) {
        rdr.companyPartyId = newId;
        changed = true;
      }
    }
    db.parties = db.parties.filter((p) => p.id !== oldId);
    changed = true;
  } else if (partyFrom && !partyTo) {
    partyFrom.clientId = to.id;
    partyFrom.displayName = to.name;
    changed = true;
  }

  for (const p of db.parties) {
    if (p.clientId === from.id) {
      p.clientId = to.id;
      if (p.type === 'COMPANY') p.displayName = to.name;
      changed = true;
    }
  }

  for (const r of db.clientPartyRoles) {
    if (r.clientId === from.id) {
      r.clientId = to.id;
      changed = true;
    }
  }

  for (const t of db.shareTransfers) {
    if (t.clientId === from.id) {
      t.clientId = to.id;
      changed = true;
    }
  }

  for (const j of db.jobs) {
    if (j.clientId === from.id) {
      j.clientId = to.id;
      changed = true;
    }
  }

  for (const inv of db.invoices) {
    if (inv.billTo?.type === 'CLIENT' && inv.billTo.clientId === from.id) {
      inv.billTo.clientId = to.id;
      inv.billTo.companyName = to.name;
      changed = true;
    }
  }

  for (const h of db.invoiceEmailHistories) {
    if (h.key?.type === 'CLIENT' && h.key.clientId === from.id) {
      h.key.clientId = to.id;
      changed = true;
    }
  }

  from.deletedAt = nowIso();
  changed = true;
  return changed;
}

function rankClientForDedupe(c: Client) {
  const code = String(c.code ?? '');
  const isSc = /^SC\d+$/i.test(code);
  return {
    isSc: isSc ? 1 : 0,
    code,
    createdAt: c.createdAt ?? '',
  };
}

function countClientRefs(db: Db, clientId: string) {
  let refs = 0;
  for (const r of db.clientPartyRoles) if (r.clientId === clientId) refs++;
  for (const j of db.jobs) if (j.clientId === clientId) refs++;
  for (const t of db.shareTransfers) if (t.clientId === clientId) refs++;
  for (const inv of db.invoices) if (inv.billTo?.type === 'CLIENT' && inv.billTo.clientId === clientId) refs++;
  for (const p of db.parties) if (p.clientId === clientId) refs++;
  return refs;
}

function countClientFilledFields(c: Client) {
  const candidates: Array<unknown> = [
    c.companyRegistrationNo,
    c.fye,
    c.contactPerson,
    c.address,
    c.phone,
    c.email,
    c.businessActivities,
    c.ssicPrimaryCode,
    c.ssicSecondaryCode,
    c.paidUpCapitalCurrency,
    c.paidUpCapitalAmount,
    c.totalShares,
    c.incorporationDate,
    c.registeredOfficeAddress,
  ];
  let filled = 0;
  for (const v of candidates) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'string' && !v.trim()) continue;
    filled++;
  }
  return filled;
}

function choosePrimaryClientForMerge(db: Db, list: Client[]) {
  const hasNonSc = list.some((c) => {
    const code = String(c.code ?? '');
    return !/^SC\d+$/i.test(code);
  });
  const candidates = hasNonSc
    ? list.filter((c) => {
        const code = String(c.code ?? '');
        return !/^SC\d+$/i.test(code);
      })
    : list;

  const scored = candidates.map((c) => {
    const r = rankClientForDedupe(c);
    const refs = countClientRefs(db, c.id);
    const filled = countClientFilledFields(c);
    const nonScBonus = r.isSc === 1 ? 0 : 50;
    return { c, score: refs * 10 + filled + nonScBonus };
  });
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ra = rankClientForDedupe(a.c);
    const rb = rankClientForDedupe(b.c);
    if (ra.isSc !== rb.isSc) return ra.isSc - rb.isSc;
    if (ra.code !== rb.code) return ra.code.localeCompare(rb.code);
    return ra.createdAt.localeCompare(rb.createdAt);
  });
  return scored[0]?.c ?? list[0];
}

function dedupeClientsByNormalizedNameAlways(db: Db) {
  const active = db.clients.filter((c) => !c.deletedAt);
  const groups = new Map<string, Client[]>();
  for (const c of active) {
    const nameKey = normalizeClientNameForMerge(String(c.name ?? ''));
    if (!nameKey) continue;
    const list = groups.get(nameKey) ?? [];
    list.push(c);
    groups.set(nameKey, list);
  }

  const deletedNonScByNameKey = new Map<string, Client[]>();
  for (const c of db.clients) {
    if (!c.deletedAt) continue;
    const nameKey = normalizeClientNameForMerge(String(c.name ?? ''));
    if (!nameKey) continue;
    const code = String(c.code ?? '');
    const isSc = /^SC\d+$/i.test(code);
    if (isSc) continue;
    const list = deletedNonScByNameKey.get(nameKey) ?? [];
    list.push(c);
    deletedNonScByNameKey.set(nameKey, list);
  }

  let changed = false;
  for (const [nameKey, list] of groups.entries()) {
    const isSc = (c: Client) => /^SC\d+$/i.test(String(c.code ?? ''));

    const scOnly = list.length === 1 && isSc(list[0]);
    if (scOnly) {
      const deletedNonSc = deletedNonScByNameKey.get(nameKey) ?? [];
      if (deletedNonSc.length) {
        const restored = choosePrimaryClientForMerge(db, deletedNonSc);
        if (restored.deletedAt) {
          restored.deletedAt = undefined;
          changed = true;
        }
      }
    }

    const activeNow = list.filter((c) => !c.deletedAt);
    const scClients = activeNow.filter((c) => isSc(c));
    const nonScClients = activeNow.filter((c) => !isSc(c));

    if (scClients.length && nonScClients.length === 0) {
      const deletedNonSc = deletedNonScByNameKey.get(nameKey) ?? [];
      if (deletedNonSc.length) {
        const restored = choosePrimaryClientForMerge(db, deletedNonSc);
        if (restored.deletedAt) {
          restored.deletedAt = undefined;
          changed = true;
        }
      }
    }

    const activeAfterRestore = list.filter((c) => !c.deletedAt);
    const scAfter = activeAfterRestore.filter((c) => isSc(c));
    const nonScAfter = activeAfterRestore.filter((c) => !isSc(c));

    if (scAfter.length && nonScAfter.length) {
      const primary = choosePrimaryClientForMerge(db, nonScAfter);
      for (const sc of scAfter) {
        if (sc.id === primary.id) continue;
        if (mergeClientInto(db, sc.id, primary.id)) changed = true;
      }
    }

    const regBuckets = new Map<string, Client[]>();
    const emptyBucket: Client[] = [];
    const nonEmptyRegSet = new Set<string>();

    const activeForBuckets = list.filter((c) => !c.deletedAt);
    if (activeForBuckets.length <= 1) continue;

    for (const c of activeForBuckets) {
      const reg = (c.companyRegistrationNo ?? '').trim();
      if (!reg) {
        emptyBucket.push(c);
        continue;
      }
      nonEmptyRegSet.add(reg);
      const b = regBuckets.get(reg) ?? [];
      b.push(c);
      regBuckets.set(reg, b);
    }

    for (const bucket of regBuckets.values()) {
      if (bucket.length <= 1) continue;
      const primary = choosePrimaryClientForMerge(db, bucket);
      for (const dup of bucket) {
        if (dup.id === primary.id) continue;
        if (mergeClientInto(db, dup.id, primary.id)) changed = true;
      }
    }

    if (emptyBucket.length > 1 && nonEmptyRegSet.size === 0) {
      const primary = choosePrimaryClientForMerge(db, emptyBucket);
      for (const dup of emptyBucket) {
        if (dup.id === primary.id) continue;
        if (mergeClientInto(db, dup.id, primary.id)) changed = true;
      }
    }

    if (emptyBucket.length && nonEmptyRegSet.size === 1) {
      const reg = Array.from(nonEmptyRegSet)[0];
      const targetBucket = regBuckets.get(reg) ?? [];
      if (targetBucket.length) {
        const primary = choosePrimaryClientForMerge(db, targetBucket);
        for (const dup of emptyBucket) {
          if (dup.id === primary.id) continue;
          if (mergeClientInto(db, dup.id, primary.id)) changed = true;
        }
      }
    }
  }
  return changed;
}

function dedupeClientsByNormalizedNameV1(db: Db) {
  if (!db.seed) db.seed = {};
  if (db.seed[SEED_KEY_CLIENT_DEDUPE_BY_NAME_V1]) return false;

  const active = db.clients.filter((c) => !c.deletedAt);
  const groups = new Map<string, Client[]>();
  for (const c of active) {
    const key = normalizeClientNameForMerge(String(c.name ?? ''));
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(c);
    groups.set(key, list);
  }

  let changed = false;
  for (const list of groups.values()) {
    if (list.length <= 1) continue;
    const sorted = [...list].sort((a, b) => {
      const ra = rankClientForDedupe(a);
      const rb = rankClientForDedupe(b);
      if (ra.isSc !== rb.isSc) return ra.isSc - rb.isSc;
      if (ra.code !== rb.code) return ra.code.localeCompare(rb.code);
      return ra.createdAt.localeCompare(rb.createdAt);
    });
    const primary = sorted[0];
    for (const dup of sorted.slice(1)) {
      if (mergeClientInto(db, dup.id, primary.id)) changed = true;
    }
  }

  db.seed[SEED_KEY_CLIENT_DEDUPE_BY_NAME_V1] = true;
  return changed;
}

function dedupeClientsByNormalizedNameV2(db: Db) {
  if (!db.seed) db.seed = {};
  if (db.seed[SEED_KEY_CLIENT_DEDUPE_BY_NAME_V2]) return false;

  const active = db.clients.filter((c) => !c.deletedAt);
  const groups = new Map<string, Client[]>();
  for (const c of active) {
    const nameKey = normalizeClientNameForMerge(String(c.name ?? ''));
    const regKey = (c.companyRegistrationNo ?? '').trim();
    const key = `${nameKey}::${regKey || '_'}`;
    const list = groups.get(key) ?? [];
    list.push(c);
    groups.set(key, list);
  }

  let changed = false;
  for (const list of groups.values()) {
    if (list.length <= 1) continue;
    const sorted = [...list].sort((a, b) => {
      const ra = rankClientForDedupe(a);
      const rb = rankClientForDedupe(b);
      if (ra.isSc !== rb.isSc) return ra.isSc - rb.isSc;
      if (ra.code !== rb.code) return ra.code.localeCompare(rb.code);
      return ra.createdAt.localeCompare(rb.createdAt);
    });
    const primary = sorted[0];
    for (const dup of sorted.slice(1)) {
      if (mergeClientInto(db, dup.id, primary.id)) changed = true;
    }
  }

  db.seed[SEED_KEY_CLIENT_DEDUPE_BY_NAME_V2] = true;
  return changed;
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
    fka: (c as Client).fka,
    companyRegistrationNo: (c as Client).companyRegistrationNo,
    fye: (c as Client).fye,
    contactPerson: (c as Client).contactPerson,
    address: (c as Client).address,
    phone: (c as Client).phone,
    email: (c as Client).email,
    businessActivities: (c as Client).businessActivities,
    ssicPrimaryCode: (c as Client).ssicPrimaryCode,
    ssicSecondaryCode: (c as Client).ssicSecondaryCode,
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
    deletedAt: (p as Person).deletedAt,
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

  const rawAuditLogs = (parsed as unknown as { auditLogs?: unknown }).auditLogs;
  const auditLogs: AuditLog[] = Array.isArray(rawAuditLogs)
    ? (rawAuditLogs as unknown as AuditLog[])
        .map((l) => ({
          id: String((l as AuditLog).id ?? ''),
          createdAt: String((l as AuditLog).createdAt ?? nowIso()),
          actorUserId: typeof (l as AuditLog).actorUserId === 'string' ? (l as AuditLog).actorUserId : undefined,
          actorName: typeof (l as AuditLog).actorName === 'string' ? (l as AuditLog).actorName : undefined,
          actorRole: (l as AuditLog).actorRole,
          area: (l as AuditLog).area,
          action: String((l as AuditLog).action ?? ''),
          entityType: typeof (l as AuditLog).entityType === 'string' ? (l as AuditLog).entityType : undefined,
          entityId: typeof (l as AuditLog).entityId === 'string' ? (l as AuditLog).entityId : undefined,
          summary: String((l as AuditLog).summary ?? ''),
        }))
        .filter((l) => !!l.id && !!l.createdAt && !!l.area && !!l.action && !!l.summary)
        .slice(-5000)
    : [];

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
    auditLogs,
    reservedNames: [...reservedSet],
    seed:
      typeof (parsed as unknown as { seed?: unknown }).seed === 'object' && (parsed as unknown as { seed?: unknown }).seed
        ? ((parsed as unknown as { seed?: Record<string, boolean> }).seed ?? {})
        : {},
  };
}

const SEED_KEY_SECRETARY_COMPANIES_SCREENSHOT = 'secretaryCompanies.screenshotPage.v1';

const SEED_KEY_SECRETARY_COMPANIES_SCREENSHOT_2 = 'secretaryCompanies.screenshotPage.v2';
const SEED_KEY_SECRETARY_COMPANIES_SCREENSHOT_3 = 'secretaryCompanies.screenshotPage.v3';
const SEED_KEY_SECRETARY_COMPANIES_SCREENSHOT_4 = 'secretaryCompanies.screenshotPage.v4';
const SEED_KEY_SECRETARY_COMPANIES_SCREENSHOT_5 = 'secretaryCompanies.screenshotPage.v5';
const SEED_KEY_SECRETARY_COMPANIES_SCREENSHOT_6 = 'secretaryCompanies.screenshotPage.v6';
const SEED_KEY_SECRETARY_COMPANIES_SCREENSHOT_7 = 'secretaryCompanies.screenshotPage.v7';

const SEED_SECRETARY_COMPANIES: Array<{
  name: string;
  member: string;
  regNo: string;
  paidUpCurrency: 'SGD';
  paidUpAmount: number;
  totalShares: number;
  rorc: string;
  directors: string[];
  shareholders: string[];
  createdDate: string;
}> = [
  {
    name: 'Liyang Engineering Pte Ltd',
    member: 'TAN YING YING',
    regNo: '202622672W',
    paidUpCurrency: 'SGD',
    paidUpAmount: 100000,
    totalShares: 100000,
    rorc: 'Zang Song',
    directors: ['Xue Hongwei', 'Zang Song'],
    shareholders: ['Zang Song', 'Zang Song'],
    createdDate: '2026-05-21',
  },
  {
    name: 'Edenburg Pte Ltd',
    member: 'Xu Yongjiang',
    regNo: '202618128G',
    paidUpCurrency: 'SGD',
    paidUpAmount: 50000,
    totalShares: 100000,
    rorc: 'Xu Yongjiang',
    directors: ['Xu Yongjiang'],
    shareholders: ['Xu Yongjiang'],
    createdDate: '2026-04-23',
  },
  {
    name: 'Stone Group Development Pte Ltd',
    member: 'Low Seow Pin (Luo Chaobin)',
    regNo: '202606717Z',
    paidUpCurrency: 'SGD',
    paidUpAmount: 50000,
    totalShares: 50000,
    rorc: 'Low Seow Pin (Luo Chaobin)',
    directors: ['Low Seow Pin (Luo Chaobin)', 'Shenton Yap Wen Howe'],
    shareholders: ['Low Seow Pin (Luo Chaobin)', 'Shenton Yap Wen Howe'],
    createdDate: '2026-02-11',
  },
  {
    name: 'Axera Pte Ltd',
    member: 'Dai Zaohong',
    regNo: '202604255D',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Dai Zaohong',
    directors: ['Chi Zhaofei'],
    shareholders: ['Dai Zaohong'],
    createdDate: '2026-01-27',
  },
  {
    name: 'Xing Xin Medical Technology Pte Ltd',
    member: 'Li Cunkou',
    regNo: '202503155H',
    paidUpCurrency: 'SGD',
    paidUpAmount: 1000,
    totalShares: 100,
    rorc: 'Li Cunkou',
    directors: ['Li Cunkou', 'Li Lu'],
    shareholders: ['Li Cunkou', 'Li Lu'],
    createdDate: '2026-01-20',
  },
  {
    name: 'Xin Zhongya Pte Ltd',
    member: 'Huang Xiaofeng',
    regNo: '202555883K',
    paidUpCurrency: 'SGD',
    paidUpAmount: 100000,
    totalShares: 100000,
    rorc: 'Huang Xiaofeng',
    directors: ['Xue Hongwei', 'Huang Xiaofeng'],
    shareholders: ['Xue Hongwei', 'Huang Xiaofeng'],
    createdDate: '2025-12-17',
  },
  {
    name: 'Neuraedge Technologies Pte Ltd',
    member: 'TAN YING YING',
    regNo: '202555225H',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Xue Hongwei',
    directors: ['Xue Hongwei'],
    shareholders: ['Xue Hongwei'],
    createdDate: '2025-12-17',
  },
  {
    name: 'Xin Huanyu Engineering Pte Ltd',
    member: 'Wen Hao',
    regNo: '202547920K',
    paidUpCurrency: 'SGD',
    paidUpAmount: 100000,
    totalShares: 100000,
    rorc: 'Wen Hao',
    directors: ['Xue Hongwei', 'Wen Hao'],
    shareholders: ['Xue Hongwei', 'Wen Hao'],
    createdDate: '2025-10-30',
  },
  {
    name: 'V7 Construction Pte Ltd',
    member: 'Wang Weixia',
    regNo: '202534302M',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 100,
    rorc: 'Wang Weixia',
    directors: ['Wang Weixia'],
    shareholders: ['Wang Weixia'],
    createdDate: '2025-10-15',
  },
  {
    name: 'Dexupay Global Pte Ltd',
    member: 'Feng Songtao',
    regNo: '202538521C',
    paidUpCurrency: 'SGD',
    paidUpAmount: 100,
    totalShares: 100,
    rorc: 'Feng Songtao',
    directors: ['Feng Songtao'],
    shareholders: ['Feng Songtao'],
    createdDate: '2025-10-07',
  },
];

const SEED_SECRETARY_COMPANIES_2: Array<{
  name: string;
  member: string;
  regNo: string;
  paidUpCurrency?: 'SGD';
  paidUpAmount?: number;
  totalShares?: number;
  rorc?: string;
  secretaries?: string[];
  directors?: string[];
  shareholders?: string[];
  createdDate: string;
}> = [
  {
    name: 'Homeiq Technology Pte Ltd',
    member: 'Zhang Chuanjiang',
    regNo: '202538403D',
    paidUpCurrency: 'SGD',
    paidUpAmount: 1000,
    totalShares: 1000,
    rorc: 'Zhang Chuanjiang',
    secretaries: ['Xue Hongwei'],
    directors: ['Zhang Chuanjiang', 'Xue Hongwei', 'Liu Xiangyu'],
    shareholders: ['Zhang Chuanjiang', 'Liu Xiangyu'],
    createdDate: '2025-08-29',
  },
  {
    name: 'Novalinke Pte Ltd',
    member: 'Li Xin',
    regNo: '202534542M',
    paidUpCurrency: 'SGD',
    paidUpAmount: 100000,
    totalShares: 100000,
    rorc: 'Luo Yanping',
    directors: ['Luo Yanping', 'Yao Jun', 'Xue Hongwei'],
    shareholders: ['Luo Yanping', 'Yao Jun'],
    createdDate: '2025-08-08',
  },
  {
    name: 'MK Engineering (S) Pte Ltd',
    member: 'Cai Xing',
    regNo: '202532813R',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Cai Xing',
    secretaries: ['Xue Hongwei'],
    directors: ['Cai Xing'],
    shareholders: ['Cai Xing'],
    createdDate: '2025-07-29',
  },
  {
    name: 'Lc Mcn Pte Ltd',
    member: 'Liu Shiyi',
    regNo: '202331409G',
    paidUpCurrency: 'SGD',
    paidUpAmount: 300000,
    totalShares: 300000,
    rorc: 'Liu Shiyi',
    directors: ['Tang Shun'],
    shareholders: ['Liu Shiyi'],
    createdDate: '2025-06-26',
  },
  {
    name: 'Yfyx Pte Ltd',
    member: 'Liu Shiyi',
    regNo: '202319583M',
    paidUpCurrency: 'SGD',
    paidUpAmount: 300000,
    totalShares: 300000,
    rorc: 'Liu Shiyi',
    directors: ['Sun Fang', 'Liu Shiyi'],
    shareholders: ['Sun Fang', 'Liu Shiyi'],
    createdDate: '2025-06-26',
  },
  {
    name: 'Hydor Capital Pte Ltd',
    member: 'Feng Songtao',
    regNo: '202520517E',
    paidUpCurrency: 'SGD',
    paidUpAmount: 1000,
    totalShares: 1000,
    rorc: 'Deepx Capital Ltd',
    directors: ['Feng Songtao'],
    shareholders: ['Deepx Capital Ltd'],
    createdDate: '2025-05-14',
  },
  {
    name: 'Ainest Technology Pte Ltd',
    member: 'Zhang Yang',
    regNo: '202515566C',
    paidUpCurrency: 'SGD',
    paidUpAmount: 1000000,
    totalShares: 1000000,
    rorc: 'Liang Mingfeng',
    directors: ['Zhang Yang'],
    shareholders: ['Liang Mingfeng', 'Zhang Yang'],
    createdDate: '2025-04-10',
  },
  {
    name: 'Guotai Consulting Pte Ltd',
    member: 'Wang Hongjun',
    regNo: '202515397W',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Wang Hongjun',
    directors: ['Dai Jinliang'],
    shareholders: ['Wang Hongjun'],
    createdDate: '2025-04-02',
  },
  {
    name: 'Byt Engineering Pte Ltd',
    member: 'Zhang Yiwen',
    regNo: '201229604E',
    paidUpCurrency: 'SGD',
    paidUpAmount: 1099403,
    totalShares: 350310,
    rorc: 'Byt Holdings Ltd.',
    directors: ['Zhang Yiwen', 'Ricky Ng See San'],
    createdDate: '2025-03-13',
  },
  {
    name: 'Byt Holdings Ltd.',
    member: 'Li Cunkou',
    regNo: 'T20UF3750K',
    createdDate: '2025-03-10',
  },
];

function normalizeNameLite(s: string) {
  return s.trim().replace(/\s+/g, ' ').toLowerCase();
}

function normalizeClientNameForMerge(s: string) {
  const lower = s.trim().toLowerCase();
  const noDots = lower.replace(/\./g, '');
  return noDots.replace(/\s+/g, ' ');
}

function safeFindClientByNameAndRegNo(db: Db, name: string, regNo?: string) {
  const nameKey = normalizeClientNameForMerge(name);
  const regNoKey = (regNo ?? '').trim();
  const regNoMatch = regNoKey
    ? db.clients.find((c) => !c.deletedAt && (c.companyRegistrationNo ?? '').trim() === regNoKey) ?? null
    : null;
  if (regNoMatch) return regNoMatch;
  const nameMatches = db.clients.filter((c) => !c.deletedAt && normalizeClientNameForMerge(String(c.name ?? '')) === nameKey);
  if (!nameMatches.length) return null;
  if (!regNoKey) return nameMatches[0];
  return nameMatches.find((c) => !(c.companyRegistrationNo ?? '').trim()) ?? null;
}

function looksLikeCompanyName(name: string) {
  return /\b(pte|ltd|limited|llp|llc|inc|corp|co|company|holdings)\b/i.test(name);
}

function parseMoneyText(input: string) {
  const s = input.trim();
  const m = s.match(/^(SGD|USD|CNY|MYR)\s+([0-9,]+(?:\.[0-9]+)?)$/i);
  if (m) {
    const currency = m[1].toUpperCase() as Currency;
    const amount = Number(m[2].replace(/,/g, ''));
    return { currency, amount: Number.isFinite(amount) ? amount : undefined };
  }
  const m2 = s.match(/^\$\s*([0-9,]+(?:\.[0-9]+)?)$/);
  if (m2) {
    const amount = Number(m2[1].replace(/,/g, ''));
    return { currency: 'USD' as Currency, amount: Number.isFinite(amount) ? amount : undefined };
  }
  return { currency: undefined, amount: undefined };
}

function dateToIso(dateYmd: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) return `${dateYmd}T00:00:00.000Z`;
  return nowIso();
}

function nextScCode(db: Db) {
  let max = 0;
  for (const c of db.clients) {
    const m = String(c.code ?? '').match(/^SC(\d{3})$/);
    if (!m) continue;
    max = Math.max(max, Number(m[1]));
  }
  return `SC${String(max + 1).padStart(3, '0')}`;
}

function computeShareAllocation(totalShares: number, names: string[]) {
  const counts = new Map<string, number>();
  const order: string[] = [];
  for (const n of names) {
    const k = n.trim();
    if (!k) continue;
    if (!counts.has(k)) order.push(k);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const weightTotal = order.reduce((sum, k) => sum + (counts.get(k) ?? 0), 0);
  if (!weightTotal) return new Map<string, number>();
  const base = Math.floor(totalShares / weightTotal);
  let rem = totalShares - base * weightTotal;
  const out = new Map<string, number>();
  for (const k of order) {
    const w = counts.get(k) ?? 0;
    const extra = Math.min(rem, w);
    rem -= extra;
    out.set(k, base * w + extra);
  }
  return out;
}

function seedIsActiveRole(r: { role: string; resignationDate?: string; toDate?: string }) {
  if (r.role === 'DIRECTOR' || r.role === 'SECRETARY') return !r.resignationDate;
  if (r.role === 'SHAREHOLDER' || r.role === 'RORC') return !r.toDate;
  return true;
}

function ensurePerson(db: Db, name: string, createdIso: string) {
  const key = normalizeNameLite(name);
  const hit = db.persons.find((p) => normalizeNameLite(p.fullName) === key) ?? null;
  if (hit) return hit;
  const person: Person = {
    id: newId('per'),
    fullName: name.trim(),
    createdAt: createdIso,
    updatedAt: createdIso,
  };
  db.persons.unshift(person);
  return person;
}

function ensurePartyForPerson(db: Db, person: Person, createdIso: string) {
  const hit = db.parties.find((p) => p.type === 'PERSON' && p.personId === person.id) ?? null;
  if (hit) return hit;
  const party: Party = {
    id: newId('pty'),
    type: 'PERSON',
    displayName: person.fullName,
    personId: person.id,
    createdAt: createdIso,
    updatedAt: createdIso,
  };
  db.parties.unshift(party);
  return party;
}

function ensureClientForCompanyName(db: Db, name: string, createdIso: string) {
  const key = normalizeClientNameForMerge(name);
  const hit = db.clients.find((c) => !c.deletedAt && normalizeClientNameForMerge(c.name) === key) ?? null;
  if (hit) return hit;
  const client: Client = {
    id: newId('cli'),
    code: nextScCode(db),
    name: name.trim(),
    tags: [],
    createdAt: createdIso,
  };
  db.clients.unshift(client);
  return client;
}

function ensurePartyForCompany(db: Db, client: Client, createdIso: string) {
  const hit = db.parties.find((p) => p.type === 'COMPANY' && p.clientId === client.id) ?? null;
  if (hit) return hit;
  const party: Party = {
    id: newId('pty'),
    type: 'COMPANY',
    displayName: client.name,
    clientId: client.id,
    createdAt: createdIso,
    updatedAt: createdIso,
  };
  db.parties.unshift(party);
  return party;
}

function upsertRole(db: Db, input: { clientId: string; partyId: string; role: ClientPartyRole['role']; createdIso: string; shares?: number }) {
  const active =
    db.clientPartyRoles.find(
      (r) => r.clientId === input.clientId && r.partyId === input.partyId && r.role === input.role && seedIsActiveRole(r),
    ) ?? null;
  if (active) {
    if (input.role === 'SHAREHOLDER' && typeof input.shares === 'number' && Number.isFinite(input.shares)) {
      if (active.shares !== input.shares) {
        active.shares = input.shares;
        active.updatedAt = nowIso();
      }
    }
    return;
  }

  const role: ClientPartyRole = {
    id: newId('cpr'),
    clientId: input.clientId,
    partyId: input.partyId,
    role: input.role,
    appointmentDate: input.role === 'DIRECTOR' || input.role === 'SECRETARY' ? input.createdIso.slice(0, 10) : undefined,
    fromDate: input.role === 'SHAREHOLDER' || input.role === 'RORC' ? input.createdIso.slice(0, 10) : undefined,
    shares: input.role === 'SHAREHOLDER' ? input.shares : undefined,
    createdAt: input.createdIso,
    updatedAt: input.createdIso,
  };
  db.clientPartyRoles.unshift(role);
}

function ensureOwnerHasSecretaryPermission(db: Db) {
  let changed = false;
  for (const u of db.users) {
    if (u.role !== 'owner') continue;
    if ((u.permissions as any).secretary) continue;
    (u.permissions as any).secretary = { viewAll: true, viewAssigned: true, create: true, update: true };
    changed = true;
  }
  return changed;
}

const SEED_SECRETARY_COMPANIES_3: Array<{
  name: string;
  member?: string;
  regNo?: string;
  paidUpCurrency?: Currency;
  paidUpAmount?: number;
  totalShares?: number;
  rorc?: string;
  secretaries?: string[];
  directors?: string[];
  shareholders?: string[];
  createdDate: string;
}> = [
  {
    name: 'Byt Singapore Pte Ltd',
    regNo: '202037640R',
    paidUpCurrency: 'SGD',
    paidUpAmount: 5000000,
    totalShares: 5000000,
    rorc: 'Byt Holdings Ltd.',
    directors: ['Li Cunkou', 'Zhang Yiwen'],
    shareholders: ['Byt Holdings Ltd.'],
    createdDate: '2025-03-10',
  },
  {
    name: 'Shuang Quan Construction Pte Ltd',
    member: 'Liu Shuang',
    regNo: '202503489N',
    paidUpCurrency: 'SGD',
    paidUpAmount: 100000,
    totalShares: 100000,
    rorc: 'Liu Shuang',
    directors: ['Liu Shuang'],
    shareholders: ['Wang Hongjun', 'Liu Shuang'],
    createdDate: '2025-01-22',
  },
  {
    name: 'Xgt Construction Pte Ltd',
    member: 'Cheow Fong Shian',
    regNo: '202501691R',
    paidUpCurrency: 'SGD',
    paidUpAmount: 100000,
    totalShares: 100000,
    rorc: 'Wang Hongjun',
    secretaries: ['Tan Sook Mei'],
    directors: ['Cheow Fong Shian'],
    shareholders: ['Cheow Fong Shian'],
    createdDate: '2025-01-13',
  },
  {
    name: 'Lyl Sds Holdings Pte Ltd',
    member: 'Yang Rui',
    regNo: '202450540W',
    paidUpCurrency: 'SGD',
    paidUpAmount: 100000,
    totalShares: 100000,
    rorc: 'Yang Rui',
    secretaries: ['Tan Sook Mei'],
    directors: ['Yang Rui'],
    shareholders: ['Yang Rui'],
    createdDate: '2024-12-17',
  },
  {
    name: 'Xjamjam Food Technology Pte Ltd',
    member: 'ZHOU ZHOU',
    regNo: '202447470W',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Liang Ming Feng',
    directors: ['Ning Zeyu'],
    shareholders: ['Ning Zeyu', 'Liang Mingfeng'],
    createdDate: '2024-11-13',
  },
  {
    name: 'Bitwise Asset Management Pte Ltd',
    member: 'Feng Songtao',
    regNo: '202444612D',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Feng Songtao',
    secretaries: ['Tan Sook Mei'],
    directors: ['Feng Songtao'],
    shareholders: ['Hydor Capital Pte Ltd'],
    createdDate: '2024-10-30',
  },
  {
    name: 'International Education And Study Abroad Service Centre Pte Ltd',
    member: 'Xu Jiageng',
    regNo: '202443403R',
    paidUpCurrency: 'SGD',
    paidUpAmount: 1,
    totalShares: 100,
    rorc: 'Xue Hongxing',
    secretaries: ['Xue Hongxing'],
    directors: ['Xu Jiageng'],
    shareholders: ['Xue Hongxing'],
    createdDate: '2024-10-29',
  },
  {
    name: 'Huamei Holidays Pte Ltd',
    member: 'You Meimei',
    regNo: '201436781E',
    paidUpCurrency: 'SGD',
    paidUpAmount: 396600,
    totalShares: 396600,
    rorc: 'You Meimei',
    secretaries: ['Tan Sook Mei'],
    directors: ['You Meimei'],
    shareholders: ['You Meimei'],
    createdDate: '2024-09-02',
  },
  {
    name: 'Huangwei Yijia Pte Ltd',
    member: 'Xu Jiageng',
    regNo: '202346124N',
    paidUpCurrency: 'SGD',
    paidUpAmount: 100000,
    totalShares: 100000,
    rorc: 'Zhang Qiuhong',
    directors: ['Zhou Xuecheng'],
    shareholders: ['Zhang Qiuhong'],
    createdDate: '2024-08-15',
  },
  {
    name: 'Huamra Tiande Pte Ltd',
    member: 'Xu Jiageng',
    regNo: '202346129H',
    paidUpCurrency: 'SGD',
    paidUpAmount: 100000,
    totalShares: 100000,
    rorc: 'Lu Chen',
    directors: ['Lu Chen', 'Song Huairui'],
    shareholders: ['Lu Chen', 'Song Huairui'],
    createdDate: '2024-08-15',
  },
  {
    name: 'Sg Nanyang Travel Pte Ltd',
    member: 'Zheng Kezhong',
    regNo: '202432166G',
    paidUpCurrency: 'SGD',
    paidUpAmount: 100000,
    totalShares: 100000,
    rorc: 'Zheng Kezhong',
    secretaries: ['Tan Sook Mei'],
    directors: ['Zheng Kezhong'],
    shareholders: ['Zheng Kezhong'],
    createdDate: '2024-08-07',
  },
  {
    name: 'Uniq Holidays Pte Ltd',
    member: 'Wang Juehong',
    regNo: '202415191D',
    paidUpCurrency: 'SGD',
    paidUpAmount: 100,
    totalShares: 100,
    rorc: 'Wang Juehong',
    secretaries: ['Tan Sook Mei'],
    directors: ['Wang Juehong'],
    shareholders: ['Wang Juehong'],
    createdDate: '2024-08-02',
  },
  {
    name: 'Beauty Orchid Pte Ltd',
    member: 'Soon Kek Yong',
    regNo: '202430748W',
    paidUpCurrency: 'SGD',
    paidUpAmount: 50000,
    totalShares: 50000,
    rorc: 'Soon Kek Yong',
    secretaries: ['Tan Sook Mei'],
    directors: ['Soon Kek Yong'],
    shareholders: ['Soon Kek Yong'],
    createdDate: '2024-07-29',
  },
  {
    name: 'Zhong Guangdian Energy Pte Ltd',
    member: 'Xu Jiageng',
    regNo: '202430423N',
    paidUpCurrency: 'SGD',
    paidUpAmount: 100000,
    totalShares: 100000,
    rorc: 'Yu Pengcheng',
    secretaries: ['Tan Sook Mei'],
    directors: ['Yu Pengcheng', 'Xu Jiageng'],
    shareholders: ['Yu Xuezhong'],
    createdDate: '2024-07-26',
  },
  {
    name: 'Illumia Pte Ltd',
    member: 'TAN YING YING',
    regNo: '202313094N',
    paidUpCurrency: 'SGD',
    paidUpAmount: 100000,
    totalShares: 100000,
    rorc: 'Lu Chunxia',
    secretaries: ['Tan Sook Mei'],
    directors: ['Lu Chunxia', 'Sim Yeow Meng'],
    shareholders: ['Lu Chunxia'],
    createdDate: '2024-07-12',
  },
  {
    name: 'Siga Hub Pte Ltd',
    member: 'Zhou Zhou',
    regNo: '202428252E',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Chen Xuejun',
    secretaries: ['Tan Chiew Beng'],
    directors: ['Chen Xuejun'],
    shareholders: ['Zhou Zhou'],
    createdDate: '2024-07-11',
  },
  {
    name: 'Bestop Trade Pte Ltd',
    member: 'Wang Hui',
    regNo: '202426523H',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Wang Hui',
    secretaries: ['Tan Sook Mei'],
    directors: ['Wang Hui'],
    shareholders: ['Wang Hui'],
    createdDate: '2024-07-02',
  },
  {
    name: 'Teamone Tech Pte Ltd',
    member: 'Zhan Weiyi',
    regNo: '202422961K',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Zhan Weiyi',
    secretaries: ['Tan Sook Mei'],
    directors: ['Zhan Weiyi'],
    shareholders: ['Zhan Weiyi'],
    createdDate: '2024-06-07',
  },
  {
    name: 'Suzhou Hondol New Material Co.,Ltd.',
    member: 'Wang Tongxin',
    regNo: '91320505MA273WWB4U',
    directors: ['Xu Jiageng', 'Wang Jinwei'],
    createdDate: '2024-05-10',
  },
  {
    name: 'Hondol New Material Sg Pte Ltd',
    member: 'Xu Jiageng',
    regNo: '202418769H',
    paidUpCurrency: 'SGD',
    paidUpAmount: 200000,
    totalShares: 200000,
    rorc: 'Suzhou Hondol New Material Co.,Ltd.',
    secretaries: ['Tan Sook Mei'],
    directors: ['Wang Tongxin'],
    shareholders: ['Suzhou Hondol New Material Co.,Ltd.'],
    createdDate: '2024-05-10',
  },
  {
    name: 'Inw Management Service Center Pte Ltd',
    member: 'Tao Wei',
    regNo: '202319768K',
    paidUpCurrency: 'SGD',
    paidUpAmount: 100000,
    totalShares: 500,
    rorc: 'Tao Wei',
    secretaries: ['Yu Kun'],
    directors: ['Tao Wei', 'Tao Junye', 'Tuo Yi'],
    shareholders: ['Tao Wei', 'Tuo Yi'],
    createdDate: '2024-05-08',
  },
  {
    name: 'New Space Cc Pte Ltd',
    member: 'Song Weiwei',
    regNo: '202301118K',
    paidUpCurrency: 'SGD',
    paidUpAmount: 300000,
    totalShares: 30000,
    rorc: 'Song Weiwei',
    secretaries: ['Tan Sook Mei'],
    directors: ['Song Weiwei'],
    shareholders: ['Zhao Huashan', 'Song Weiwei'],
    createdDate: '2024-04-24',
  },
  {
    name: 'Nourish Sunshine Pte Ltd',
    member: 'Tu Qiang',
    regNo: '202242896W',
    paidUpCurrency: 'SGD',
    paidUpAmount: 50000,
    totalShares: 50000,
    rorc: 'Tu Qiang',
    secretaries: ['Xue Hongwei'],
    directors: ['Tu Qiang'],
    shareholders: ['Tu Qiang'],
    createdDate: '2024-04-15',
  },
  {
    name: 'Stratustrade Pte Ltd',
    member: 'Rao Fujie',
    regNo: '202231574M',
    paidUpCurrency: 'SGD',
    paidUpAmount: 300000,
    totalShares: 300000,
    rorc: 'Rao Fujie',
    secretaries: ['Xue Hongwei'],
    directors: ['Rao Fujie'],
    shareholders: ['Xue Hongwei', 'Rao Fujie'],
    createdDate: '2024-04-05',
  },
  {
    name: 'Nature Light Pte Ltd',
    member: 'Xu Yuehong',
    regNo: '202409726D',
    paidUpCurrency: 'SGD',
    paidUpAmount: 50000,
    totalShares: 50000,
    rorc: 'Xu Yuehong',
    secretaries: ['Xu Yuehong'],
    directors: ['Xu Yuehong'],
    shareholders: ['Xu Yuehong'],
    createdDate: '2024-03-12',
  },
  {
    name: 'Huachang (Singapore) Technology Investment Pte Ltd',
    member: 'Zhang Jincong',
    regNo: '202409281M',
    paidUpCurrency: 'SGD',
    paidUpAmount: 100000,
    totalShares: 100000,
    rorc: 'Zhang Jincong',
    directors: ['Zhang Jincong'],
    shareholders: ['Zhang Jincong'],
    createdDate: '2024-03-08',
  },
  {
    name: 'Skillgreat Cultural Investment Pte Ltd',
    member: 'Yu Dong',
    regNo: '202408876E',
    paidUpCurrency: 'SGD',
    paidUpAmount: 100000,
    totalShares: 100000,
    rorc: 'Yu Dong',
    directors: ['Yu Dong'],
    shareholders: ['Yu Dong'],
    createdDate: '2024-03-06',
  },
  {
    name: 'Fingold Technologies Pte Ltd',
    regNo: '202406886C',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Xu Jing',
    secretaries: ['Xue Hongwei', 'Xu Jing'],
    directors: ['Zhu Ping'],
    shareholders: ['Zhu Ping'],
    createdDate: '2024-02-21',
  },
  {
    name: 'Decagold Pte Ltd',
    member: 'Zhu Ping',
    regNo: '202405039C',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Zhu Ping',
    directors: ['Zhu Ping'],
    shareholders: ['Zhu Ping'],
    createdDate: '2024-02-05',
  },
  {
    name: 'Xin Guotai Pte Ltd',
    member: 'Wang Hongjun',
    regNo: '202347052M',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 100000,
    rorc: 'Wang Hongjun',
    secretaries: ['Tan Sook Mei'],
    directors: ['Cheow Fong Shian', 'Wang Hongjun'],
    shareholders: ['Cheow Fong Shian', 'Wang Hongjun'],
    createdDate: '2024-01-19',
  },
  {
    name: 'Prd Holdings Inc.',
    member: 'Tan Tee Ween',
    regNo: 'T20UF0547L',
    directors: ['Tan Tee Ween', 'Li Cunkou'],
    createdDate: '2024-01-15',
  },
  {
    name: 'Tian Wang Resources Pte Ltd',
    member: 'Tan Tee Ween',
    regNo: '202402404D',
    paidUpCurrency: 'SGD',
    paidUpAmount: 1,
    totalShares: 1,
    rorc: 'Prd Holdings Inc.',
    directors: ['Tan Tee Ween', 'Li Cunkou'],
    shareholders: ['Prd Holdings Inc.'],
    createdDate: '2024-01-15',
  },
  {
    name: 'Qian He Jianxin Pte Ltd',
    regNo: '202401517C',
    paidUpCurrency: 'SGD',
    paidUpAmount: 200000,
    totalShares: 200000,
    rorc: 'Xu Jiageng',
    secretaries: ['Tan Sook Mei'],
    directors: ['Li Yanan'],
    shareholders: ['Li Yanan'],
    createdDate: '2024-01-10',
  },
  {
    name: 'Bona Film Group Co., Ltd',
    member: 'Yu Dong',
    regNo: 'T21UF1621A',
    createdDate: '2024-01-08',
  },
  {
    name: 'Bona Film Holdings Pte Ltd',
    member: 'Yu Dong',
    regNo: '202107026W',
    paidUpCurrency: 'SGD',
    paidUpAmount: 1,
    totalShares: 1,
    rorc: 'Bona Film Group Limited',
    secretaries: ['Yu Dong'],
    directors: ['Yu Dong'],
    shareholders: ['Bona Film Group Co., Ltd'],
    createdDate: '2024-01-08',
  },
  {
    name: 'Double Line Exchange Pte Ltd',
    regNo: '202350469D',
    paidUpCurrency: 'SGD',
    paidUpAmount: 200000,
    totalShares: 200000,
    rorc: 'Zhu Yi',
    secretaries: ['Zhou Xuecheng', 'Zhu Yi'],
    directors: ['Zhou Xuecheng'],
    shareholders: ['Zhou Xuecheng', 'Zhu Yi'],
    createdDate: '2024-01-08',
  },
  {
    name: 'Suzhou Xtong Photovoltaic Technologies Co., Ltd',
    member: 'Xu Jianfang',
    regNo: '913205006993080323',
    directors: ['Xu Jianfang', 'Tan Joo Siang'],
    shareholders: ['Suzhou Xtong Photovoltaic Technologies Co., Ltd'],
    createdDate: '2023-12-06',
  },
  {
    name: 'Xtong Tech Sg Pte Ltd',
    member: 'Tan Joo Siang',
    regNo: '202348055C',
    paidUpCurrency: 'SGD',
    paidUpAmount: 200000,
    totalShares: 200000,
    directors: ['Tan Joo Siang'],
    createdDate: '2023-12-06',
  },
  {
    name: 'Aspern Optoelectronic Pte Ltd',
    regNo: '202340698C',
    paidUpCurrency: 'SGD',
    paidUpAmount: 200000,
    totalShares: 200000,
    rorc: 'Shang Na',
    secretaries: ['Xu Jiageng'],
    directors: ['Xu Jiageng', 'Shang Na'],
    shareholders: ['Shang Na'],
    createdDate: '2023-12-05',
  },
  {
    name: 'Keung Aspern Pte Ltd',
    paidUpCurrency: 'SGD',
    paidUpAmount: 200000,
    totalShares: 200000,
    rorc: 'Shang Na',
    secretaries: ['Xu Jiageng'],
    directors: ['Shang Na', 'Xu Jiageng'],
    shareholders: ['Shang Na'],
    createdDate: '2023-11-24',
  },
  {
    name: 'Blackstone Z Trading Pte Ltd',
    member: 'Hu Xihua',
    regNo: '202345320D',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Hu Xihua',
    secretaries: ['Tan Sook Mei'],
    directors: ['Hu Xihua', 'Xue Hongwei'],
    shareholders: ['Hu Xihua'],
    createdDate: '2023-11-17',
  },
  {
    name: 'Gloria Technology Llc',
    member: 'Chen Kehuang',
    regNo: 'T23UF7374H',
    directors: ['Wang Yueru', 'Zhu Jing'],
    createdDate: '2023-10-26',
  },
  {
    name: 'Gloria Tech Holding Pte Ltd',
    member: 'Zhu Jing',
    regNo: '202342650R',
    paidUpCurrency: 'USD',
    paidUpAmount: 1000000,
    totalShares: 1000000,
    rorc: 'Gloria Technology Llc',
    directors: ['Wang Yueru', 'Zhu Jing'],
    shareholders: ['Gloria Technology Llc'],
    createdDate: '2023-10-26',
  },
  {
    name: 'Xin Qian United Pte Ltd',
    regNo: '202217387K',
    paidUpCurrency: 'SGD',
    paidUpAmount: 100000,
    totalShares: 100000,
    rorc: 'Xu Jiageng',
    secretaries: ['Tan Joo Siang'],
    directors: ['Xu Jiageng', 'Tan Joo Siang'],
    shareholders: ['Tan Joo Siang', 'Xu Jiageng'],
    createdDate: '2023-10-20',
  },
  {
    name: 'Hung Yuan Pte Ltd',
    member: 'Xu Jiageng',
    regNo: '202337096H',
    paidUpCurrency: 'SGD',
    paidUpAmount: 200000,
    totalShares: 200000,
    rorc: 'Xu Jiageng',
    secretaries: ['Song Huarui', 'Su Conghui'],
    directors: ['Song Huarui', 'Su Conghui'],
    shareholders: ['Song Huarui', 'Su Conghui'],
    createdDate: '2023-09-14',
  },
  {
    name: 'Hui Gu Academy Pte Ltd',
    member: 'Xu Jiageng',
    regNo: '202336316N',
    paidUpCurrency: 'SGD',
    paidUpAmount: 200000,
    totalShares: 200000,
    rorc: 'Xu Jiageng',
    secretaries: ['Xu Jiageng'],
    directors: ['Xu Jiageng'],
    shareholders: ['Xu Jiageng'],
    createdDate: '2023-09-08',
  },
  {
    name: 'Anext Technology Pte Ltd',
    member: 'Xu Jiageng',
    regNo: '202315331M',
    paidUpCurrency: 'SGD',
    paidUpAmount: 200000,
    totalShares: 200000,
    rorc: 'Shen Xi',
    directors: ['Xu Jiageng'],
    shareholders: ['Xu Jiageng', 'Shen Xi'],
    createdDate: '2023-09-08',
  },
  {
    name: 'Hengyu Medevice Pte Ltd',
    member: 'Cui Quan',
    regNo: '202333226D',
    paidUpCurrency: 'SGD',
    paidUpAmount: 50000,
    totalShares: 50000,
    rorc: 'Cui Quan',
    secretaries: ['Cui Quan'],
    directors: ['Cui Quan'],
    shareholders: ['Cui Quan'],
    createdDate: '2023-09-04',
  },
  {
    name: 'Tianmde Pte Ltd',
    member: 'Huang Zhihua',
    regNo: '202333716D',
    paidUpCurrency: 'SGD',
    paidUpAmount: 200000,
    totalShares: 200000,
    rorc: 'Xu Jiageng',
    secretaries: ['Huang Zhihua', 'Tan Soo Chuan Peter'],
    directors: ['Xu Jiageng'],
    shareholders: ['Huang Zhihua'],
    createdDate: '2023-08-21',
  },
  {
    name: 'Huamra Yong Pte Ltd',
    member: 'Huang Kaihua',
    regNo: '202333568Z',
    paidUpCurrency: 'SGD',
    paidUpAmount: 200000,
    totalShares: 200000,
    rorc: 'Xu Jiageng',
    secretaries: ['Huang Kaihua'],
    directors: ['Huang Kaihua'],
    shareholders: ['Huang Kaihua'],
    createdDate: '2023-08-18',
  },
];

function seedSecretaryCompaniesFromScreenshot3(db: Db) {
  if (!db.seed) db.seed = {};
  if (db.seed[SEED_KEY_SECRETARY_COMPANIES_SCREENSHOT_3]) return false;

  let changed = false;

  for (const row of SEED_SECRETARY_COMPANIES_3) {
    const createdIso = dateToIso(row.createdDate);
    const regNoKey = (row.regNo ?? '').trim();
    const nameKey = normalizeClientNameForMerge(row.name);

    const existing =
      (regNoKey
        ? db.clients.find((c) => !c.deletedAt && (c.companyRegistrationNo ?? '').trim() === regNoKey) ?? null
        : null) ??
      db.clients.find((c) => !c.deletedAt && normalizeClientNameForMerge((c.name ?? '').trim()) === nameKey) ??
      null;

    if (!existing) {
      const client: Client = {
        id: newId('cli'),
        code: nextScCode(db),
        name: row.name,
        companyRegistrationNo: regNoKey || undefined,
        contactPerson: row.member?.trim() || undefined,
        paidUpCapitalCurrency: row.paidUpCurrency,
        paidUpCapitalAmount: row.paidUpAmount,
        totalShares: row.totalShares,
        tags: [],
        createdAt: createdIso,
      };
      db.clients.unshift(client);
      changed = true;
    } else {
      if (regNoKey && existing.companyRegistrationNo !== regNoKey) {
        existing.companyRegistrationNo = regNoKey;
        changed = true;
      }
      if (row.member?.trim() && !existing.contactPerson) {
        existing.contactPerson = row.member.trim();
        changed = true;
      }
      if (row.paidUpCurrency && existing.paidUpCapitalCurrency !== row.paidUpCurrency) {
        existing.paidUpCapitalCurrency = row.paidUpCurrency;
        changed = true;
      }
      if (typeof row.paidUpAmount === 'number' && existing.paidUpCapitalAmount !== row.paidUpAmount) {
        existing.paidUpCapitalAmount = row.paidUpAmount;
        changed = true;
      }
      if (typeof row.totalShares === 'number' && existing.totalShares !== row.totalShares) {
        existing.totalShares = row.totalShares;
        changed = true;
      }
    }

    const target =
      (regNoKey
        ? db.clients.find((c) => !c.deletedAt && (c.companyRegistrationNo ?? '').trim() === regNoKey) ?? null
        : null) ??
      db.clients.find((c) => !c.deletedAt && normalizeClientNameForMerge((c.name ?? '').trim()) === nameKey) ??
      null;
    if (!target) continue;

    const rorcName = (row.rorc ?? '').trim();
    if (rorcName && rorcName !== '--') {
      if (looksLikeCompanyName(rorcName)) {
        const c = ensureClientForCompanyName(db, rorcName, createdIso);
        const pty = ensurePartyForCompany(db, c, createdIso);
        upsertRole(db, { clientId: target.id, partyId: pty.id, role: 'RORC', createdIso });
      } else {
        const p = ensurePerson(db, rorcName, createdIso);
        const pty = ensurePartyForPerson(db, p, createdIso);
        upsertRole(db, { clientId: target.id, partyId: pty.id, role: 'RORC', createdIso });
      }
      changed = true;
    }

    for (const sn of row.secretaries ?? []) {
      const name = sn.trim();
      if (!name) continue;
      const p = ensurePerson(db, name, createdIso);
      const pty = ensurePartyForPerson(db, p, createdIso);
      upsertRole(db, { clientId: target.id, partyId: pty.id, role: 'SECRETARY', createdIso });
      changed = true;
    }

    for (const dn of row.directors ?? []) {
      const name = dn.trim();
      if (!name) continue;
      const p = ensurePerson(db, name, createdIso);
      const pty = ensurePartyForPerson(db, p, createdIso);
      upsertRole(db, { clientId: target.id, partyId: pty.id, role: 'DIRECTOR', createdIso });
      changed = true;
    }

    if (typeof row.totalShares === 'number' && Array.isArray(row.shareholders) && row.shareholders.length) {
      const sharesByName = computeShareAllocation(row.totalShares, row.shareholders);
      for (const [nameRaw, shares] of sharesByName.entries()) {
        const name = nameRaw.trim();
        if (!name) continue;
        if (looksLikeCompanyName(name)) {
          const c = ensureClientForCompanyName(db, name, createdIso);
          const pty = ensurePartyForCompany(db, c, createdIso);
          upsertRole(db, { clientId: target.id, partyId: pty.id, role: 'SHAREHOLDER', createdIso, shares });
        } else {
          const p = ensurePerson(db, name, createdIso);
          const pty = ensurePartyForPerson(db, p, createdIso);
          upsertRole(db, { clientId: target.id, partyId: pty.id, role: 'SHAREHOLDER', createdIso, shares });
        }
        changed = true;
      }
    }
  }

  db.seed[SEED_KEY_SECRETARY_COMPANIES_SCREENSHOT_3] = true;
  return changed;
}

function seedSecretaryCompaniesFromScreenshot(db: Db) {
  if (!db.seed) db.seed = {};
  if (db.seed[SEED_KEY_SECRETARY_COMPANIES_SCREENSHOT]) return false;

  let changed = false;
  for (const row of SEED_SECRETARY_COMPANIES) {
    const createdIso = dateToIso(row.createdDate);
    const regNoKey = row.regNo.trim();
    const nameKey = normalizeNameLite(row.name);
    const client =
      db.clients.find((c) => !c.deletedAt && (c.companyRegistrationNo ?? '').trim() === regNoKey) ??
      db.clients.find((c) => !c.deletedAt && normalizeNameLite(c.name) === nameKey) ??
      null;

    if (!client) {
      const next: Client = {
        id: newId('cli'),
        code: nextScCode(db),
        name: row.name,
        companyRegistrationNo: row.regNo,
        contactPerson: row.member,
        paidUpCapitalCurrency: row.paidUpCurrency,
        paidUpCapitalAmount: row.paidUpAmount,
        totalShares: row.totalShares,
        tags: [],
        createdAt: createdIso,
      };
      db.clients.unshift(next);
      changed = true;
    } else {
      client.name = row.name;
      client.companyRegistrationNo = row.regNo;
      client.contactPerson = row.member;
      client.paidUpCapitalCurrency = row.paidUpCurrency;
      client.paidUpCapitalAmount = row.paidUpAmount;
      client.totalShares = row.totalShares;
      changed = true;
    }

    const theClient =
      db.clients.find((c) => !c.deletedAt && (c.companyRegistrationNo ?? '').trim() === regNoKey) ??
      db.clients.find((c) => !c.deletedAt && normalizeNameLite(c.name) === nameKey) ??
      null;
    if (!theClient) continue;

    const rorcPerson = ensurePerson(db, row.rorc, createdIso);
    const rorcParty = ensurePartyForPerson(db, rorcPerson, createdIso);
    upsertRole(db, { clientId: theClient.id, partyId: rorcParty.id, role: 'RORC', createdIso });
    changed = true;

    for (const dn of row.directors) {
      const p = ensurePerson(db, dn, createdIso);
      const party = ensurePartyForPerson(db, p, createdIso);
      upsertRole(db, { clientId: theClient.id, partyId: party.id, role: 'DIRECTOR', createdIso });
      changed = true;
    }

    const sharesByName = computeShareAllocation(row.totalShares, row.shareholders);
    for (const [sn, shares] of sharesByName.entries()) {
      const p = ensurePerson(db, sn, createdIso);
      const party = ensurePartyForPerson(db, p, createdIso);
      upsertRole(db, { clientId: theClient.id, partyId: party.id, role: 'SHAREHOLDER', createdIso, shares });
      changed = true;
    }
  }

  db.seed[SEED_KEY_SECRETARY_COMPANIES_SCREENSHOT] = true;
  return changed;
}

function seedSecretaryCompaniesFromScreenshot2(db: Db) {
  if (!db.seed) db.seed = {};
  if (db.seed[SEED_KEY_SECRETARY_COMPANIES_SCREENSHOT_2]) return false;

  let changed = false;
  for (const row of SEED_SECRETARY_COMPANIES_2) {
    const createdIso = dateToIso(row.createdDate);
    const regNoKey = row.regNo.trim();
    const nameKey = normalizeNameLite(row.name);
    const client =
      db.clients.find((c) => !c.deletedAt && (c.companyRegistrationNo ?? '').trim() === regNoKey) ??
      db.clients.find((c) => !c.deletedAt && normalizeNameLite(c.name) === nameKey) ??
      null;

    if (!client) {
      const next: Client = {
        id: newId('cli'),
        code: nextScCode(db),
        name: row.name,
        companyRegistrationNo: row.regNo,
        contactPerson: row.member,
        paidUpCapitalCurrency: row.paidUpCurrency,
        paidUpCapitalAmount: row.paidUpAmount,
        totalShares: row.totalShares,
        tags: [],
        createdAt: createdIso,
      };
      db.clients.unshift(next);
      changed = true;
    } else {
      client.name = row.name;
      client.companyRegistrationNo = row.regNo;
      client.contactPerson = row.member;
      if (row.paidUpCurrency) client.paidUpCapitalCurrency = row.paidUpCurrency;
      if (typeof row.paidUpAmount === 'number') client.paidUpCapitalAmount = row.paidUpAmount;
      if (typeof row.totalShares === 'number') client.totalShares = row.totalShares;
      changed = true;
    }

    const theClient =
      db.clients.find((c) => !c.deletedAt && (c.companyRegistrationNo ?? '').trim() === regNoKey) ??
      db.clients.find((c) => !c.deletedAt && normalizeNameLite(c.name) === nameKey) ??
      null;
    if (!theClient) continue;

    const rorcName = (row.rorc ?? '').trim();
    if (rorcName) {
      if (looksLikeCompanyName(rorcName)) {
        const c = ensureClientForCompanyName(db, rorcName, createdIso);
        const pty = ensurePartyForCompany(db, c, createdIso);
        upsertRole(db, { clientId: theClient.id, partyId: pty.id, role: 'RORC', createdIso });
      } else {
        const p = ensurePerson(db, rorcName, createdIso);
        const pty = ensurePartyForPerson(db, p, createdIso);
        upsertRole(db, { clientId: theClient.id, partyId: pty.id, role: 'RORC', createdIso });
      }
      changed = true;
    }

    for (const sn of row.secretaries ?? []) {
      const p = ensurePerson(db, sn, createdIso);
      const pty = ensurePartyForPerson(db, p, createdIso);
      upsertRole(db, { clientId: theClient.id, partyId: pty.id, role: 'SECRETARY', createdIso });
      changed = true;
    }

    for (const dn of row.directors ?? []) {
      const p = ensurePerson(db, dn, createdIso);
      const pty = ensurePartyForPerson(db, p, createdIso);
      upsertRole(db, { clientId: theClient.id, partyId: pty.id, role: 'DIRECTOR', createdIso });
      changed = true;
    }

    if (typeof row.totalShares === 'number' && Array.isArray(row.shareholders) && row.shareholders.length) {
      const sharesByName = computeShareAllocation(row.totalShares, row.shareholders);
      for (const [name, shares] of sharesByName.entries()) {
        if (looksLikeCompanyName(name)) {
          const c = ensureClientForCompanyName(db, name, createdIso);
          const pty = ensurePartyForCompany(db, c, createdIso);
          upsertRole(db, { clientId: theClient.id, partyId: pty.id, role: 'SHAREHOLDER', createdIso, shares });
        } else {
          const p = ensurePerson(db, name, createdIso);
          const pty = ensurePartyForPerson(db, p, createdIso);
          upsertRole(db, { clientId: theClient.id, partyId: pty.id, role: 'SHAREHOLDER', createdIso, shares });
        }
        changed = true;
      }
    }
  }

  db.seed[SEED_KEY_SECRETARY_COMPANIES_SCREENSHOT_2] = true;
  return changed;
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

const SEED_SECRETARY_COMPANIES_5: Array<{
  name: string;
  member?: string;
  regNo?: string;
  paidUpCurrency?: Currency;
  paidUpAmount?: number;
  totalShares?: number;
  rorc?: string;
  secretaries?: string[];
  directors?: string[];
  shareholders?: string[];
  createdDate: string;
}> = [
  {
    name: 'Sunny Faith Investment Pte Ltd',
    member: 'Wang Bin',
    regNo: '201302504G',
    paidUpCurrency: 'SGD',
    paidUpAmount: 100000,
    totalShares: 100000,
    rorc: 'Shao Hongxia',
    secretaries: ['Wang Bin'],
    directors: ['Shao Hongxia'],
    shareholders: ['Wang Bin'],
    createdDate: '2022-08-05',
  },
  {
    name: 'Jiangsu Royal Home Usa, Inc.',
    member: 'Kathy Overcash Dayvault',
    regNo: 'T22UF1455A',
    createdDate: '2022-08-05',
  },
  {
    name: 'Blue Ocean Textiles Pte Ltd',
    member: 'Kathy Overcash Dayvault',
    regNo: '202227392G',
    paidUpCurrency: 'SGD',
    paidUpAmount: 1000000,
    totalShares: 1000000,
    rorc: 'Huang Lei',
    secretaries: ['Kathy Overcash Dayvault'],
    directors: ['Xue Hongwei'],
    shareholders: ['Jiangsu Royal Home Usa, Inc.'],
    createdDate: '2022-08-05',
  },
  {
    name: 'Ego Medical Holdings Pte Ltd',
    member: 'Li Wenlong',
    regNo: '201414834Z',
    paidUpCurrency: 'SGD',
    paidUpAmount: 1284400,
    totalShares: 1284400,
    rorc: 'Li Wenlong',
    secretaries: ['Zhou Xichun'],
    directors: ['Li Wenlong', 'Zhou Xichun'],
    shareholders: ['Li Wenlong', 'Sim Seng Yan', 'Wang Mutong'],
    createdDate: '2022-07-28',
  },
  {
    name: 'Singkea E-commerce Pte Ltd',
    member: 'Li Yahui',
    regNo: '201428640D',
    paidUpCurrency: 'SGD',
    paidUpAmount: 5000,
    totalShares: 5000,
    rorc: 'Li Yahui',
    secretaries: ['Li Yahui'],
    directors: ['Li Yahui'],
    shareholders: ['Li Yahui'],
    createdDate: '2022-07-27',
  },
  {
    name: 'Sinde Grand Fortune Technology Pte Ltd',
    member: 'Pan Yueling',
    regNo: '201928963D',
    paidUpCurrency: 'SGD',
    paidUpAmount: 1000,
    totalShares: 1000,
    rorc: 'Li Gang',
    secretaries: ['Pan Yueling'],
    directors: ['Li Gang'],
    shareholders: ['Pan Yueling'],
    createdDate: '2022-07-20',
  },
  {
    name: 'Dpp Consulting Pte Ltd',
    member: 'Dominic Jude Christian Peters',
    regNo: '202215263N',
    paidUpCurrency: 'SGD',
    paidUpAmount: 1000,
    totalShares: 1000,
    rorc: 'Dominic Jude Christian Peters',
    secretaries: ['Dominic Jude Christian Peters'],
    directors: ['Dominic Jude Christian Peters'],
    shareholders: ['Dominic Jude Christian Peters'],
    createdDate: '2022-05-04',
  },
  {
    name: 'Alioth Development Pte Ltd',
    member: 'Feng Songtao',
    regNo: '202214214E',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Feng Songtao',
    secretaries: ['Feng Songtao'],
    directors: ['Zeng Xiaoliang'],
    shareholders: ['Feng Songtao'],
    createdDate: '2022-04-25',
  },
  {
    name: 'Fishtech Pte Ltd',
    regNo: '202201614R',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10,
    totalShares: 10,
    rorc: 'Cao Gaoqi',
    secretaries: ['Tan Sook Mei'],
    directors: ['Tan Sook Mei'],
    shareholders: ['Cao Gaoqi'],
    createdDate: '2022-03-18',
  },
  {
    name: 'Yimiao Tech Pte Ltd',
    member: 'Feng Songtao',
    regNo: '202144121C',
    paidUpCurrency: 'SGD',
    paidUpAmount: 100000,
    totalShares: 100000,
    rorc: 'Deng Xi',
    secretaries: ['Tan Sook Mei'],
    directors: ['Feng Songtao'],
    shareholders: ['Honfull Limited', 'Magicfinder Holdings Limited', 'First World Holdings Limited', 'Choo Capital Ltd', 'Deepx Capital Ltd'],
    createdDate: '2022-01-06',
  },
  {
    name: 'Asia-pacific Literature And Art Press Pte Ltd',
    member: 'Liu Caijie',
    regNo: '202143878G',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Liu Caijie',
    secretaries: ['Liu Caijie'],
    directors: ['Liu Caijie'],
    shareholders: ['Liu Caijie'],
    createdDate: '2021-12-20',
  },
  {
    name: 'Victoria World Academy Pte Ltd',
    member: 'Liu Lu',
    regNo: '201002730R',
    paidUpCurrency: 'SGD',
    paidUpAmount: 2000000,
    totalShares: 10000000,
    rorc: 'Liu Lu',
    secretaries: ['Liu Lu'],
    directors: ['Xu Jiageng'],
    shareholders: ['Liuli International Pte Ltd', 'Da Xi', 'Hong Liang'],
    createdDate: '2021-12-18',
  },
  {
    name: 'Guoneng International Publishing Pte Ltd',
    member: 'Wang Haiping',
    regNo: '202143049D',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Wang Haiping',
    secretaries: ['Li Xin'],
    directors: ['Wang Haiping'],
    shareholders: ['Wang Fan', 'Li Qian', 'Wang Haiping'],
    createdDate: '2021-12-13',
  },
  {
    name: 'Shun Yong Shipping Pte Ltd',
    member: 'Chun Wang',
    regNo: '202136640D',
    paidUpCurrency: 'SGD',
    paidUpAmount: 1000,
    totalShares: 10000,
    rorc: 'Chun Wang',
    secretaries: ['Chun Wang'],
    directors: ['Chun Wang'],
    shareholders: ['Chun Wang'],
    createdDate: '2021-10-20',
  },
  {
    name: 'Hai Ying Technology Pte Ltd',
    member: 'Wang Jinlong',
    regNo: '201813411C',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Weichen Tu',
    secretaries: ['Wang Jinlong'],
    directors: ['Weichen Tu'],
    shareholders: ['Weichen Tu'],
    createdDate: '2021-10-20',
  },
  {
    name: 'Magic Ananas Technology Pte Ltd',
    member: 'Man Chengcheng',
    regNo: '202131495R',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Man Chengcheng',
    secretaries: ['Man Chengcheng'],
    directors: ['Man Chengcheng'],
    shareholders: ['Man Chengcheng'],
    createdDate: '2021-09-30',
  },
  {
    name: 'A+ Capital Pte Ltd',
    regNo: '201542860Z',
    paidUpCurrency: 'SGD',
    paidUpAmount: 50000,
    totalShares: 50000,
    rorc: 'Yu Kun',
    secretaries: ['Yu Kun'],
    directors: ['Yu Kun'],
    shareholders: ['Yu Kun'],
    createdDate: '2021-09-07',
  },
  {
    name: 'Stargaze Wealth Limited',
    member: 'Zhou Pengwu',
    regNo: '1947261',
    createdDate: '2021-08-10',
  },
  {
    name: 'Bmc (Singapore) Biomedical Technology Pte Ltd',
    member: 'Zhou Pengwu',
    regNo: '201714271C',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10,
    totalShares: 10,
    rorc: 'Zhou Pengwu',
    secretaries: ['Zhou Pengwu'],
    directors: ['Zhou Pengwu'],
    shareholders: ['Zhou Pengwu'],
    createdDate: '2021-08-10',
  },
  {
    name: 'Simanin Pte Ltd',
    regNo: '202039907W',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Chen Lei',
    secretaries: ['Chen Lei'],
    directors: ['Chen Lei'],
    shareholders: ['Chen Lei'],
    createdDate: '2021-07-14',
  },
  {
    name: 'Germin Pte Ltd',
    regNo: '202039901M',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Chen Lei',
    secretaries: ['Chen Lei'],
    directors: ['Chen Lei'],
    shareholders: ['Chen Lei'],
    createdDate: '2021-07-14',
  },
  {
    name: 'Bluedale Pte Ltd',
    regNo: '202024888R',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Li Guohan',
    secretaries: ['Li Guohan'],
    directors: ['Li Guohan'],
    shareholders: ['Li Guohan'],
    createdDate: '2021-06-11',
  },
  {
    name: 'Bluelight Tech Pte Ltd',
    regNo: '202024880H',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Xu Weibin',
    secretaries: ['Xu Weibin'],
    directors: ['Xu Weibin'],
    shareholders: ['Xu Weibin'],
    createdDate: '2021-06-11',
  },
  {
    name: 'Bluescent Pte Ltd',
    member: 'Niu Gang',
    regNo: '202026890N',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Niu Gang',
    secretaries: ['Niu Gang'],
    directors: ['Niu Gang'],
    shareholders: ['Niu Gang'],
    createdDate: '2021-06-11',
  },
  {
    name: 'Winfeld Pte Ltd',
    regNo: '202029869H',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 20000,
    rorc: 'Zhang Shengjie',
    secretaries: ['Zhang Shengjie'],
    directors: ['Zhang Shengjie'],
    shareholders: ['Zhang Shengjie'],
    createdDate: '2021-06-11',
  },
  {
    name: 'Blueful Pte Ltd',
    regNo: '202029893R',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Luo Weiming',
    secretaries: ['Luo Weiming'],
    directors: ['Luo Weiming'],
    shareholders: ['Luo Weiming'],
    createdDate: '2021-06-11',
  },
  {
    name: 'Bluedent Pte Ltd',
    regNo: '202029892E',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Huang Huaijun',
    secretaries: ['Huang Huaijun'],
    directors: ['Huang Huaijun'],
    shareholders: ['Huang Huaijun'],
    createdDate: '2021-06-11',
  },
  {
    name: 'Jetpak Pte Ltd',
    regNo: '202038131W',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Dong Yuchao',
    secretaries: ['Dong Yuchao'],
    directors: ['Dong Yuchao'],
    shareholders: ['Dong Yuchao'],
    createdDate: '2021-06-11',
  },
  {
    name: 'Skfin Pte Ltd',
    regNo: '202038115R',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Yang Jun',
    secretaries: ['Yang Jun'],
    directors: ['Yang Jun'],
    shareholders: ['Yang Jun'],
    createdDate: '2021-06-11',
  },
  {
    name: 'Hlander Pte Ltd',
    regNo: '202038108R',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Yang Jun',
    secretaries: ['Yang Jun'],
    directors: ['Yang Jun'],
    shareholders: ['Yang Jun'],
    createdDate: '2021-06-11',
  },
  {
    name: 'Delanger Pte Ltd',
    regNo: '202038101Z',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Yang Jun',
    secretaries: ['Yang Jun'],
    directors: ['Yang Jun'],
    shareholders: ['Yang Jun'],
    createdDate: '2021-06-11',
  },
  {
    name: 'Ihappy Technology Pte Ltd',
    member: 'Ma Jianfei',
    regNo: '202002059R',
    paidUpCurrency: 'SGD',
    paidUpAmount: 50000,
    totalShares: 50000,
    rorc: 'Ma Jianfei',
    secretaries: ['Ma Jianfei'],
    directors: ['Ma Jianfei'],
    shareholders: ['Ma Jianfei', 'Peng Jing'],
    createdDate: '2021-06-10',
  },
  {
    name: 'Tito Associati Pte Ltd',
    member: 'Chuang Sain Keat',
    regNo: '202009659E',
    paidUpCurrency: 'SGD',
    paidUpAmount: 1000,
    totalShares: 1000,
    rorc: 'Chuang Sain Keat',
    secretaries: ['Chuang Sain Keat'],
    directors: ['Chuang Sain Keat'],
    shareholders: ['Chuang Sain Keat'],
    createdDate: '2021-05-04',
  },
  {
    name: 'Mindigital Capital Group',
    member: 'Li Yinghao',
    regNo: '370342',
    createdDate: '2021-04-27',
  },
  {
    name: 'Haz Apac Pte Ltd',
    regNo: '201702416W',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Xue Hongwei',
    secretaries: ['Xue Hongwei'],
    directors: ['Xue Hongwei'],
    shareholders: ['Xue Hongwei'],
    createdDate: '2021-04-20',
  },
  {
    name: 'Bitedu Foundation Ltd',
    member: 'Tian Rui',
    regNo: '201816201H',
    paidUpCurrency: 'SGD',
    paidUpAmount: 1,
    totalShares: 1,
    rorc: 'Li Xiaoguang',
    secretaries: ['Tian Rui'],
    directors: ['Tian Rui'],
    shareholders: ['Li Xiaoguang'],
    createdDate: '2021-03-26',
  },
  {
    name: 'Sinoculture Foundations Pte Ltd',
    member: 'Hu Yao Jerry',
    regNo: '202111719Z',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Hu Yao Jerry',
    secretaries: ['Xue Hongwei'],
    directors: ['Hu Yao Jerry'],
    shareholders: ['Yu Kun', 'Hu Yao Jerry'],
    createdDate: '2021-03-25',
  },
  {
    name: 'Nice Spa Pte Ltd',
    member: 'Soon Poh Shoon',
    regNo: '202107424N',
    paidUpCurrency: 'SGD',
    paidUpAmount: 50000,
    totalShares: 50000,
    rorc: 'Soon Poh Shoon',
    secretaries: ['Soon Poh Shoon'],
    directors: ['Soon Poh Shoon'],
    shareholders: ['Soon Poh Shoon'],
    createdDate: '2021-03-02',
  },
  {
    name: 'Gohan Pte Ltd',
    member: 'Ze Ying',
    regNo: '202038179D',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Ze Ying',
    secretaries: ['Ze Ying'],
    directors: ['Ze Ying'],
    shareholders: ['Ze Ying'],
    createdDate: '2021-02-09',
  },
  {
    name: 'Gohan Pte Ltd',
    member: 'Ze Ying',
    regNo: '202038137D',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Ze Ying',
    secretaries: ['Ze Ying'],
    directors: ['Ze Ying'],
    shareholders: ['Ze Ying'],
    createdDate: '2021-02-09',
  },
  {
    name: '3Tc Pte Ltd',
    member: 'Fan Mengying',
    regNo: '202102746D',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Fan Mengying',
    secretaries: ['Fan Mengying'],
    directors: ['Fan Mengying'],
    shareholders: ['Fan Mengying'],
    createdDate: '2021-01-21',
  },
  {
    name: 'Whioce Publishing Pte Ltd',
    member: 'Li Xiaofan',
    regNo: '201427293E',
    paidUpCurrency: 'SGD',
    paidUpAmount: 100000,
    totalShares: 10000000,
    rorc: 'Li Xiaofan',
    secretaries: ['Xue Hongwei'],
    directors: ['Li Xiaofan'],
    shareholders: ['Hu Chengshuo', 'Shen Zhenbin'],
    createdDate: '2021-01-19',
  },
  {
    name: 'Wah Tai Trading Pte Ltd',
    member: 'Wang Pei',
    regNo: '201312943Z',
    paidUpCurrency: 'SGD',
    paidUpAmount: 300000,
    totalShares: 30000000,
    rorc: 'Wang Pei',
    secretaries: ['Wang Pei'],
    directors: ['Wang Pei'],
    shareholders: ['Wang Pei'],
    createdDate: '2021-01-18',
  },
  {
    name: 'Africa Happy Technology Pte Ltd',
    member: 'Chen Yalin',
    regNo: '202012205E',
    paidUpCurrency: 'SGD',
    paidUpAmount: 21400,
    totalShares: 21400,
    rorc: 'Chen Yalin',
    secretaries: ['Wang Jinlong'],
    directors: ['Wang Jinlong'],
    shareholders: ['Chen Yalin'],
    createdDate: '2021-01-14',
  },
  {
    name: 'Alpha Antares Limited',
    member: 'Zhao Liang',
    regNo: '1993721',
    createdDate: '2020-12-22',
  },
  {
    name: 'Ai Club Asia Pte Ltd',
    member: 'Gao Bo',
    regNo: '202040860N',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Gao Bo',
    secretaries: ['Gao Bo'],
    directors: ['Gao Bo'],
    shareholders: ['Gao Bo'],
    createdDate: '2020-12-17',
  },
  {
    name: 'Enterasia Pte Ltd',
    member: 'Narendra Kumar',
    regNo: '202001964R',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Narendra Kumar',
    secretaries: ['Narendra Kumar'],
    directors: ['Narendra Kumar'],
    shareholders: ['Narendra Kumar'],
    createdDate: '2020-12-08',
  },
  {
    name: 'Merful Pte Ltd',
    regNo: '202032413Z',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Xiao Tianji',
    secretaries: ['Yu Kun'],
    directors: ['Xiao Tianji'],
    shareholders: ['Xiao Tianji'],
    createdDate: '2020-12-06',
  },
  {
    name: 'Merlingen Pte Ltd',
    regNo: '202022178H',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Xiao Tianji',
    secretaries: ['Yu Kun'],
    directors: ['Xiao Tianji'],
    shareholders: ['Xiao Tianji'],
    createdDate: '2020-12-06',
  },
  {
    name: 'Quantstack Pte Ltd',
    member: 'Baining Hu',
    regNo: '202037571K',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Baining Hu',
    secretaries: ['Baining Hu'],
    directors: ['Baining Hu'],
    shareholders: ['Baining Hu'],
    createdDate: '2020-11-20',
  },
];

function seedSecretaryCompaniesFromScreenshot5(db: Db) {
  if (!db.seed) db.seed = {};
  if (db.seed[SEED_KEY_SECRETARY_COMPANIES_SCREENSHOT_5]) return false;

  let changed = false;
  for (const row of SEED_SECRETARY_COMPANIES_5) {
    const createdIso = dateToIso(row.createdDate);
    const regNoKey = (row.regNo ?? '').trim() || undefined;
    const existing = safeFindClientByNameAndRegNo(db, row.name, regNoKey);

    if (!existing) {
      const client: Client = {
        id: newId('cli'),
        code: nextScCode(db),
        name: row.name,
        companyRegistrationNo: regNoKey,
        contactPerson: row.member?.trim() || undefined,
        paidUpCapitalCurrency: row.paidUpCurrency,
        paidUpCapitalAmount: row.paidUpAmount,
        totalShares: row.totalShares,
        tags: [],
        createdAt: createdIso,
      };
      db.clients.unshift(client);
      changed = true;
    } else {
      if (regNoKey && !existing.companyRegistrationNo) {
        existing.companyRegistrationNo = regNoKey;
        changed = true;
      }
      if (row.member?.trim() && !existing.contactPerson) {
        existing.contactPerson = row.member.trim();
        changed = true;
      }
      if (row.paidUpCurrency && existing.paidUpCapitalCurrency !== row.paidUpCurrency) {
        existing.paidUpCapitalCurrency = row.paidUpCurrency;
        changed = true;
      }
      if (typeof row.paidUpAmount === 'number' && existing.paidUpCapitalAmount !== row.paidUpAmount) {
        existing.paidUpCapitalAmount = row.paidUpAmount;
        changed = true;
      }
      if (typeof row.totalShares === 'number' && existing.totalShares !== row.totalShares) {
        existing.totalShares = row.totalShares;
        changed = true;
      }
    }

    const target = safeFindClientByNameAndRegNo(db, row.name, regNoKey);
    if (!target) continue;

    const rorcName = (row.rorc ?? '').trim();
    if (rorcName && rorcName !== '--') {
      if (looksLikeCompanyName(rorcName)) {
        const c = ensureClientForCompanyName(db, rorcName, createdIso);
        const pty = ensurePartyForCompany(db, c, createdIso);
        upsertRole(db, { clientId: target.id, partyId: pty.id, role: 'RORC', createdIso });
      } else {
        const p = ensurePerson(db, rorcName, createdIso);
        const pty = ensurePartyForPerson(db, p, createdIso);
        upsertRole(db, { clientId: target.id, partyId: pty.id, role: 'RORC', createdIso });
      }
      changed = true;
    }

    for (const sn of row.secretaries ?? []) {
      const name = sn.trim();
      if (!name) continue;
      const p = ensurePerson(db, name, createdIso);
      const pty = ensurePartyForPerson(db, p, createdIso);
      upsertRole(db, { clientId: target.id, partyId: pty.id, role: 'SECRETARY', createdIso });
      changed = true;
    }

    for (const dn of row.directors ?? []) {
      const name = dn.trim();
      if (!name) continue;
      const p = ensurePerson(db, name, createdIso);
      const pty = ensurePartyForPerson(db, p, createdIso);
      upsertRole(db, { clientId: target.id, partyId: pty.id, role: 'DIRECTOR', createdIso });
      changed = true;
    }

    if (typeof row.totalShares === 'number' && Array.isArray(row.shareholders) && row.shareholders.length) {
      const sharesByName = computeShareAllocation(row.totalShares, row.shareholders);
      for (const [nameRaw, shares] of sharesByName.entries()) {
        const name = nameRaw.trim();
        if (!name) continue;
        if (looksLikeCompanyName(name)) {
          const c = ensureClientForCompanyName(db, name, createdIso);
          const pty = ensurePartyForCompany(db, c, createdIso);
          upsertRole(db, { clientId: target.id, partyId: pty.id, role: 'SHAREHOLDER', createdIso, shares });
        } else {
          const p = ensurePerson(db, name, createdIso);
          const pty = ensurePartyForPerson(db, p, createdIso);
          upsertRole(db, { clientId: target.id, partyId: pty.id, role: 'SHAREHOLDER', createdIso, shares });
        }
        changed = true;
      }
    }
  }

  db.seed[SEED_KEY_SECRETARY_COMPANIES_SCREENSHOT_5] = true;
  return changed;
}

const SEED_SECRETARY_COMPANIES_6: Array<{
  name: string;
  member?: string;
  regNo?: string;
  paidUpCurrency?: Currency;
  paidUpAmount?: number;
  totalShares?: number;
  rorc?: string;
  secretaries?: string[];
  directors?: string[];
  shareholders?: string[];
  createdDate: string;
}> = [
  {
    name: 'Gohan Pte Ltd',
    member: 'Ze Ying',
    regNo: '202038137D',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Ze Ying',
    secretaries: ['Ze Ying'],
    directors: ['Ze Ying'],
    shareholders: ['Ze Ying'],
    createdDate: '2021-02-09',
  },
  {
    name: 'Jinmoon Chen Holdings Limited',
    member: 'Chen Wen',
    regNo: '1991196',
    createdDate: '2020-11-16',
  },
  {
    name: 'Linshichun Holdings Limited',
    member: 'Lin Shichun',
    regNo: '19990983',
    createdDate: 'Invalid Date',
  },
  {
    name: 'Sienna Hill Limited',
    member: 'Li Yinghao',
    regNo: '1993718',
    createdDate: '2020-11-12',
  },
  {
    name: 'Wisdom Lab Pte Ltd',
    member: 'Cao Gaoqi',
    regNo: '201819236K',
    paidUpCurrency: 'SGD',
    paidUpAmount: 100000,
    totalShares: 100000,
    rorc: 'Cao Gaoqi',
    secretaries: ['Yu Kun'],
    shareholders: ['Tan Sook Mei', 'Cao Gaoqi'],
    createdDate: '2020-10-26',
  },
  {
    name: 'Pindot Pte Ltd',
    regNo: '201606232M',
    paidUpCurrency: 'SGD',
    paidUpAmount: 1000,
    totalShares: 1000,
    rorc: 'Krishnamani Kannan',
    secretaries: ['Ricky Ng See San', 'Krishnamani Kannan'],
    shareholders: ['Ricky Ng See San', 'Krishnamani Kannan'],
    createdDate: '2020-10-16',
  },
  {
    name: 'Bby.sg Pte Ltd',
    member: 'Ding Meixia',
    regNo: '201608450W',
    paidUpCurrency: 'SGD',
    paidUpAmount: 50000,
    totalShares: 50000,
    rorc: 'Xue Hongwei',
    secretaries: ['Xue Hongwei', 'Tan Sook Mei', 'Ding Meixia'],
    shareholders: ['Tan Sook Mei', 'Xue Hongwei', 'Ding Meixia'],
    createdDate: '2020-10-05',
  },
  {
    name: 'Ascent Partners Group Limited',
    member: 'Mak Pui Lam',
    regNo: 'T12UF4400K',
    createdDate: '2020-10-02',
  },
  {
    name: 'Ascent Partners Valuation And Advisory Services Pte Limited',
    member: 'Mak Pui Lam',
    regNo: '201228655D',
    paidUpCurrency: 'SGD',
    paidUpAmount: 50000,
    totalShares: 50000,
    rorc: 'Ascent Partners Group Limited',
    secretaries: ['Mak Pui Lam', 'Wang Zhan'],
    shareholders: ['Ascent Partners Group Limited'],
    createdDate: '2020-10-02',
  },
  {
    name: 'S.A.C. (Pte) Ltd',
    member: 'Chng See Ann',
    regNo: '197900786N',
    paidUpCurrency: 'SGD',
    paidUpAmount: 2938000,
    totalShares: 2938000,
    rorc: 'Chng See Ann',
    secretaries: ['Lean Pek Kwan'],
    directors: ['Chng See Ann', 'Lean Pek Kwan'],
    shareholders: ['Chng See Ann', 'Lean Pek Kwan'],
    createdDate: '2020-10-02',
  },
  {
    name: 'Singapore Ak Intelligent Technology Pte Ltd',
    member: 'Zhang Yiwen',
    regNo: '202031230G',
    paidUpCurrency: 'SGD',
    paidUpAmount: 666000,
    totalShares: 666000,
    rorc: 'Yuan Yuan',
    secretaries: ['Xue Hongwei'],
    directors: ['Zhang Yiwen', 'Li Cunkou', 'Yuan Yuan'],
    shareholders: ['Zhang Yiwen', 'Li Cunkou', 'Yuan Yuan'],
    createdDate: '2020-09-28',
  },
  {
    name: 'Oceanpec (Singapore) Pte Ltd',
    member: 'Quan Feng',
    regNo: '201324813W',
    paidUpCurrency: 'SGD',
    paidUpAmount: 100,
    totalShares: 100,
    rorc: 'Jin Xiang',
    secretaries: ['Quan Feng', 'Jin Xiang'],
    shareholders: ['Jin Xiang', 'Quan Feng'],
    createdDate: '2020-09-23',
  },
  {
    name: 'Acai Capital',
    member: 'Li Yinghao',
    regNo: 'T19UF7704H',
    createdDate: '2020-09-22',
  },
  {
    name: 'Horae Infinity Private Ltd',
    member: 'Xu Yang',
    regNo: '201835187C',
    paidUpCurrency: 'SGD',
    paidUpAmount: 1000,
    totalShares: 1000,
    rorc: 'Li Yinghao',
    secretaries: ['Xu Yang', 'Liu Zhivu'],
    shareholders: ['Mint Capital Group'],
    createdDate: '2020-09-22',
  },
  {
    name: 'Jinweide (Singapore) Pte Ltd',
    regNo: '202026355E',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Xue Hongwei',
    secretaries: ['Xue Hongwei'],
    shareholders: ['Xue Hongwei'],
    createdDate: '2020-08-31',
  },
  {
    name: 'Relic Pte Ltd',
    member: 'Zheng Junhao',
    regNo: '202026322N',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Zheng Junhao',
    secretaries: ['Huang Yu'],
    directors: ['Zheng Junhao'],
    shareholders: ['Zheng Junhao', 'Huang Yu'],
    createdDate: '2020-08-27',
  },
  {
    name: 'Lima Mayer Far East Holdings Pte Ltd',
    member: 'Ho Lay Hong',
    regNo: '201612527K',
    paidUpCurrency: 'SGD',
    paidUpAmount: 200000,
    totalShares: 200000,
    rorc: 'Dennis Yun Guan Cheong',
    secretaries: ['Ho Lay Hong', 'Jiang Jun', 'Dennis Yun Guan Cheong'],
    directors: ['Ho Lay Hong', 'Jiang Jun', 'Dennis Yun Guan Cheong'],
    shareholders: ['Ho Lay Hong', 'Jiang Jun', 'Dennis Yun Guan Cheong'],
    createdDate: '2020-08-07',
  },
  {
    name: 'Ladys Group Pte Ltd',
    member: 'Thio Eng Huat',
    regNo: '201918981H',
    paidUpCurrency: 'SGD',
    paidUpAmount: 1000,
    totalShares: 1000,
    rorc: 'Thio Eng Huat',
    secretaries: ['Thio Eng Huat'],
    directors: ['Thio Eng Huat'],
    shareholders: ['Thio Eng Huat'],
    createdDate: '2020-08-06',
  },
  {
    name: '3il Consulting Pte Ltd',
    member: 'Fan Wenyuan',
    regNo: '201822521K',
    paidUpCurrency: 'SGD',
    paidUpAmount: 400000,
    totalShares: 400000,
    rorc: 'Fan Wenyuan',
    secretaries: ['Fan Wenyuan'],
    directors: ['Fan Wenyuan'],
    shareholders: ['Fan Wenyuan'],
    createdDate: '2020-08-06',
  },
  {
    name: 'Ka Toi Technology Group Holding Limited',
    member: 'Zhou Xichun',
    regNo: '353406_CAYMAN ISLANDS',
    createdDate: '2020-07-22',
  },
  {
    name: 'Ka Toi Technology Pte Ltd',
    member: 'Zhou Xichun',
    regNo: '202019635N',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    secretaries: ['Zhou Xichun', 'Zhou Pengwu'],
    directors: ['Zhou Xichun'],
    shareholders: ['Ka Toi Technology Group Holding Limited'],
    createdDate: '2020-07-22',
  },
  {
    name: 'Crown Healthcare Pte Ltd',
    member: 'Wu Jiaqin',
    regNo: '201927413K',
    paidUpCurrency: 'SGD',
    paidUpAmount: 100000,
    totalShares: 100000,
    rorc: 'Chua Lai Wong',
    secretaries: ['Chua Lai Wong'],
    directors: ['Chua Lai Wong'],
    shareholders: ['Chua Lai Wong'],
    createdDate: '2020-07-06',
  },
  {
    name: 'Tian Cai Xing Education Pte Ltd',
    member: 'Zhang Zhaoxin',
    regNo: '202019270M',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Zhang Zhaoxin',
    secretaries: ['Zhang Zhaoxin'],
    directors: ['Zhang Zhaoxin'],
    shareholders: ['Zhang Zhaoxin'],
    createdDate: '2020-07-05',
  },
  {
    name: 'Fusioncash Holdings Pte Ltd',
    member: 'Feng Songtao',
    regNo: '201904442M',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Feng Songtao',
    secretaries: ['Wang Hui'],
    directors: ['Feng Songtao'],
    shareholders: ['Feng Songtao'],
    createdDate: '2020-06-11',
  },
  {
    name: 'Infigo Technology Pte. Ltd',
    member: 'Zhang Tony',
    regNo: '202008189N',
    paidUpCurrency: 'SGD',
    paidUpAmount: 50000,
    totalShares: 50000,
    rorc: 'Zhang Tony',
    directors: ['Zhang Tony', 'Ricky Ng See San'],
    shareholders: ['Zhang Tony'],
    createdDate: '2020-06-09',
  },
  {
    name: 'Oriental Chinese Media Pte Ltd',
    member: 'Li Cunkou',
    regNo: '201800545K',
    paidUpCurrency: 'SGD',
    paidUpAmount: 480000,
    totalShares: 480000,
    rorc: 'Li Cunkou',
    secretaries: ['Tan Sook Mei'],
    directors: ['Li Cunkou'],
    shareholders: ['Li Cunkou'],
    createdDate: '2020-06-02',
  },
  {
    name: 'Bd Asia Consulting Pte Ltd',
    member: 'Gao Bo',
    regNo: '201907544W',
    paidUpCurrency: 'SGD',
    paidUpAmount: 100000,
    totalShares: 100000,
    rorc: 'Gao Bo',
    secretaries: ['Gao Bo'],
    directors: ['Gao Bo'],
    shareholders: ['Gao Bo'],
    createdDate: '2020-06-01',
  },
  {
    name: 'Healthu Pte Ltd',
    member: 'Gao Bo',
    regNo: '202015017W',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Gao Bo',
    secretaries: ['Gao Bo'],
    directors: ['Gao Bo'],
    shareholders: ['Gao Bo'],
    createdDate: '2020-06-01',
  },
  {
    name: 'Great Wall Of Sound Pte Ltd',
    member: 'Cai Yuan',
    regNo: '201803290E',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10,
    totalShares: 10,
    rorc: 'Cai Yuan',
    secretaries: ['Cai Yuan'],
    directors: ['Cai Yuan'],
    shareholders: ['Cai Yuan'],
    createdDate: '2020-05-15',
  },
  {
    name: 'Omniscient Pte Ltd',
    member: 'Wu Zhen',
    regNo: '201919391K',
    paidUpCurrency: 'SGD',
    paidUpAmount: 2,
    totalShares: 10000,
    rorc: 'Duan Zuojian',
    secretaries: ['Wu Zhen'],
    directors: ['Yang Fei'],
    shareholders: ['Wu Zhen', 'Duan Zuojian'],
    createdDate: '2020-05-09',
  },
  {
    name: 'Fuxin Global Pte Ltd',
    member: 'Yang Jun',
    regNo: '202006631D',
    paidUpCurrency: 'SGD',
    paidUpAmount: 600000,
    totalShares: 600000,
    rorc: 'Chen Ruizhong',
    secretaries: ['Yang Jun'],
    directors: ['Yang Jun'],
    shareholders: ['Chen Ruizhong', 'Xu Zhangtao', 'Yang Jun'],
    createdDate: '2020-05-04',
  },
  {
    name: 'Merling Pte Ltd',
    member: 'Huang Bin',
    regNo: '202007662H',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Huang Bin',
    secretaries: ['Sun Lichun'],
    shareholders: ['Huang Bin'],
    createdDate: '2020-04-30',
  },
  {
    name: 'Apac Literature And Art Press Pte Ltd',
    regNo: '202007496C',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Hu Yan',
    directors: ['Hu Yan'],
    shareholders: ['Xue Hongwei'],
    createdDate: '2020-04-30',
  },
  {
    name: 'Mindigital Technology Pte Ltd',
    member: 'Xu Yang',
    regNo: '202011686W',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Li Yinghao',
    directors: ['Xu Yang', 'Li Yinghao'],
    shareholders: ['Mindigital Capital Group'],
    createdDate: '2020-04-16',
  },
  {
    name: 'Liquid Star Technology Pte. Ltd.',
    member: 'Lin,guanhua',
    regNo: '201940829H',
    paidUpCurrency: 'SGD',
    paidUpAmount: 50000,
    totalShares: 50000,
    rorc: 'Erica Lanzavecchia',
    secretaries: ['Erica Lanzavecchia'],
    directors: ['Erica Lanzavecchia'],
    shareholders: ['Erica Lanzavecchia'],
    createdDate: '2020-04-15',
  },
  {
    name: 'Easytech 361 Degrees Cultural Media Pte. Ltd.',
    member: 'Zhang Wenzhi',
    regNo: '201937014C',
    paidUpCurrency: 'SGD',
    paidUpAmount: 1000,
    totalShares: 100000,
    rorc: 'Zhang Wenzhi',
    secretaries: ['Zhang Wenzhi'],
    directors: ['Zhang Wenzhi'],
    shareholders: ['Zhang Wenzhi'],
    createdDate: '2020-04-15',
  },
  {
    name: 'Becs Technology Pte Ltd',
    member: 'Yue Yan',
    regNo: '202001643R',
    createdDate: '2020-04-15',
  },
  {
    name: 'Blockseed Ventures Limited',
    member: 'Manmeet Singh',
    regNo: 'T18UF3905F',
    createdDate: '2020-04-15',
  },
  {
    name: 'Happy Growing Educational Institution',
    member: 'Yuan Zhi',
    regNo: 'T19UF1961J',
    createdDate: '2020-04-15',
  },
  {
    name: 'Singapore Kk Intelligent Technology Pte Ltd',
    member: 'Tan Tee Ween',
    regNo: '201841092W',
    paidUpCurrency: 'SGD',
    paidUpAmount: 100000,
    totalShares: 100000,
    rorc: 'Li Cunkou',
    secretaries: ['Li Cunkou', 'Zhang Yiwen', 'Yuan Yuan', 'Tan Tee Ween'],
    directors: ['Zhang Yiwen', 'Yuan Yuan', 'Tan Tee Ween'],
    shareholders: ['Li Cunkou', 'Zhang Yiwen', 'Yuan Yuan', 'Tan Tee Ween'],
    createdDate: '2020-03-20',
  },
  {
    name: 'Titane Design Consultant Pte Ltd',
    member: 'Chan Kim Loon',
    regNo: '200610145W',
    paidUpCurrency: 'SGD',
    paidUpAmount: 1000,
    totalShares: 1000,
    rorc: 'Chuang Sain Keat',
    secretaries: ['Chan Kim Loon'],
    directors: ['Chuang Sain Keat', 'Chan Kim Loon'],
    shareholders: ['Chan Kim Loon', 'Chuang Sain Keat'],
    createdDate: '2020-03-17',
  },
  {
    name: 'Liuli International Pte Ltd',
    member: 'Liu Lu',
    regNo: '201910642N',
    paidUpCurrency: 'SGD',
    paidUpAmount: 100000,
    totalShares: 100000,
    secretaries: ['Zhu Yimin'],
    directors: ['Xu Jiageng', 'Liu Lu'],
    shareholders: ['Happy Growing Educational Institution'],
    createdDate: '2020-03-16',
  },
  {
    name: 'Move Troopers Brothers Pte Ltd',
    member: 'Hu Ming',
    regNo: '201631205Z',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Hu Ming',
    directors: ['Hu Ming'],
    shareholders: ['Hu Ming'],
    createdDate: '2020-01-20',
  },
  {
    name: 'Move Troopers Pte Ltd',
    regNo: '201421566E',
    paidUpCurrency: 'SGD',
    paidUpAmount: 50000,
    totalShares: 50000,
    rorc: 'Hu Ming',
    directors: ['Hu Ming'],
    shareholders: ['Hu Ming'],
    createdDate: '2020-01-20',
  },
  {
    name: 'Datalander Technology Pte Ltd',
    member: 'Feng Songtao',
    regNo: '202001942H',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Feng Songtao',
    directors: ['Feng Songtao'],
    shareholders: ['Feng Songtao', 'Zhang Jie'],
    createdDate: '2020-01-15',
  },
  {
    name: 'Red Lion Group Pte Ltd',
    member: 'Li Xin',
    regNo: '201502105D',
    paidUpCurrency: 'SGD',
    paidUpAmount: 1000,
    totalShares: 1000,
    rorc: 'Bybridge director',
    secretaries: ['Li Xin'],
    directors: ['Li Xin'],
    shareholders: ['Li Xin'],
    createdDate: '2020-01-07',
  },
  {
    name: 'Eximchain Pte Ltd',
    member: 'Liu Xi',
    regNo: '201722775D',
    paidUpCurrency: 'SGD',
    paidUpAmount: 405986,
    totalShares: 125000,
    rorc: 'Liu Xi',
    directors: ['Liu Xi'],
    shareholders: ['Blockseed Ventures Limited', 'Liu Xi'],
    createdDate: '2020-01-06',
  },
];

function seedSecretaryCompaniesFromScreenshot6(db: Db) {
  if (!db.seed) db.seed = {};
  if (db.seed[SEED_KEY_SECRETARY_COMPANIES_SCREENSHOT_6]) return false;

  let changed = false;
  for (const row of SEED_SECRETARY_COMPANIES_6) {
    const createdIso = dateToIso(row.createdDate);
    const regNoKey = (row.regNo ?? '').trim() || undefined;
    const existing = safeFindClientByNameAndRegNo(db, row.name, regNoKey);

    if (!existing) {
      const client: Client = {
        id: newId('cli'),
        code: nextScCode(db),
        name: row.name,
        companyRegistrationNo: regNoKey,
        contactPerson: row.member?.trim() || undefined,
        paidUpCapitalCurrency: row.paidUpCurrency,
        paidUpCapitalAmount: row.paidUpAmount,
        totalShares: row.totalShares,
        tags: [],
        createdAt: createdIso,
      };
      db.clients.unshift(client);
      changed = true;
    } else {
      if (regNoKey && !existing.companyRegistrationNo) {
        existing.companyRegistrationNo = regNoKey;
        changed = true;
      }
      if (row.member?.trim() && !existing.contactPerson) {
        existing.contactPerson = row.member.trim();
        changed = true;
      }
      if (row.paidUpCurrency && existing.paidUpCapitalCurrency !== row.paidUpCurrency) {
        existing.paidUpCapitalCurrency = row.paidUpCurrency;
        changed = true;
      }
      if (typeof row.paidUpAmount === 'number' && existing.paidUpCapitalAmount !== row.paidUpAmount) {
        existing.paidUpCapitalAmount = row.paidUpAmount;
        changed = true;
      }
      if (typeof row.totalShares === 'number' && existing.totalShares !== row.totalShares) {
        existing.totalShares = row.totalShares;
        changed = true;
      }
    }

    const target = safeFindClientByNameAndRegNo(db, row.name, regNoKey);
    if (!target) continue;

    const rorcName = (row.rorc ?? '').trim();
    if (rorcName && rorcName !== '--') {
      if (looksLikeCompanyName(rorcName)) {
        const c = ensureClientForCompanyName(db, rorcName, createdIso);
        const pty = ensurePartyForCompany(db, c, createdIso);
        upsertRole(db, { clientId: target.id, partyId: pty.id, role: 'RORC', createdIso });
      } else {
        const p = ensurePerson(db, rorcName, createdIso);
        const pty = ensurePartyForPerson(db, p, createdIso);
        upsertRole(db, { clientId: target.id, partyId: pty.id, role: 'RORC', createdIso });
      }
      changed = true;
    }

    for (const sn of row.secretaries ?? []) {
      const name = sn.trim();
      if (!name) continue;
      const p = ensurePerson(db, name, createdIso);
      const pty = ensurePartyForPerson(db, p, createdIso);
      upsertRole(db, { clientId: target.id, partyId: pty.id, role: 'SECRETARY', createdIso });
      changed = true;
    }

    for (const dn of row.directors ?? []) {
      const name = dn.trim();
      if (!name || name === '—') continue;
      const p = ensurePerson(db, name, createdIso);
      const pty = ensurePartyForPerson(db, p, createdIso);
      upsertRole(db, { clientId: target.id, partyId: pty.id, role: 'DIRECTOR', createdIso });
      changed = true;
    }

    if (typeof row.totalShares === 'number' && Array.isArray(row.shareholders) && row.shareholders.length) {
      const sharesByName = computeShareAllocation(row.totalShares, row.shareholders);
      for (const [nameRaw, shares] of sharesByName.entries()) {
        const name = nameRaw.trim();
        if (!name || name === '—') continue;
        if (looksLikeCompanyName(name)) {
          const c = ensureClientForCompanyName(db, name, createdIso);
          const pty = ensurePartyForCompany(db, c, createdIso);
          upsertRole(db, { clientId: target.id, partyId: pty.id, role: 'SHAREHOLDER', createdIso, shares });
        } else {
          const p = ensurePerson(db, name, createdIso);
          const pty = ensurePartyForPerson(db, p, createdIso);
          upsertRole(db, { clientId: target.id, partyId: pty.id, role: 'SHAREHOLDER', createdIso, shares });
        }
        changed = true;
      }
    }
  }

  db.seed[SEED_KEY_SECRETARY_COMPANIES_SCREENSHOT_6] = true;
  return changed;
}

const SEED_SECRETARY_COMPANIES_7: Array<{
  name: string;
  member?: string;
  regNo?: string;
  paidUpCurrency?: Currency;
  paidUpAmount?: number;
  totalShares?: number;
  rorc?: string;
  secretaries?: string[];
  directors?: string[];
  shareholders?: string[];
  createdDate: string;
}> = [
  {
    name: 'Gohan Pte Ltd',
    member: 'Ze Ying',
    regNo: '202038137D',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Ze Ying',
    secretaries: ['Ze Ying'],
    directors: ['Ze Ying'],
    shareholders: ['Ze Ying'],
    createdDate: '2021-02-09',
  },
  {
    name: 'Chengkai Holdings Pte Ltd',
    member: 'Feng Songtao',
    regNo: '201923597E',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Hou Chuanbiao',
    secretaries: ['Feng Songtao'],
    directors: ['Yue Yan'],
    shareholders: ['Hou Chuanbiao', 'Xiang Peng', 'Zhang Qiaoli', 'Becs Technology Pte Ltd'],
    createdDate: '2019-12-25',
  },
  {
    name: 'Sinma Global Pte Ltd',
    member: 'Wang Yueru',
    regNo: '201413517C',
    paidUpCurrency: 'SGD',
    paidUpAmount: 100000,
    totalShares: 100000,
    rorc: 'Wang Yueru',
    secretaries: ['Wang Yueru'],
    directors: ['Zheng Jiayu'],
    shareholders: ['Wang Yueru'],
    createdDate: '2019-12-23',
  },
  {
    name: 'Sinlea Technology Pte. Ltd.',
    member: 'WANG DONG',
    regNo: '202000227Z',
    paidUpCurrency: 'SGD',
    paidUpAmount: 200000,
    totalShares: 200000,
    rorc: 'Li Dandan',
    secretaries: ['Li Dandan'],
    directors: ['Wang Dong'],
    shareholders: ['Wang Dong'],
    createdDate: '2019-12-23',
  },
  {
    name: 'Zu Yi Sheng Shou Zu Hu Li Pte Ltd',
    member: 'Chen Haiyan',
    regNo: '201832858G',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Chen Haiyan',
    secretaries: ['Chen Haiyan'],
    directors: ['Chen Haiyan'],
    shareholders: ['Chen Haiyan'],
    createdDate: '2019-12-18',
  },
  {
    name: 'Regal Aquafarm Pte Ltd',
    member: 'Zhao Xian',
    regNo: '201940825E',
    paidUpCurrency: 'SGD',
    paidUpAmount: 1000,
    totalShares: 1000,
    rorc: 'Zhao Xian',
    secretaries: ['Zhao Xian'],
    directors: ['Zhao Xian'],
    shareholders: ['Zhao Xian'],
    createdDate: '2019-12-02',
  },
  {
    name: 'Nissii Hash Tech Pte. Ltd.',
    member: 'Fan Mengying',
    regNo: '201932044W',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Fan Mengying',
    secretaries: ['Fan Mengying'],
    directors: ['Fan Mengying'],
    shareholders: ['Fan Mengying'],
    createdDate: '2019-11-28',
  },
  {
    name: 'Toyou Travel Pte. Ltd.',
    member: 'Huang Xiaohuan',
    regNo: '201409697D',
    paidUpCurrency: 'SGD',
    paidUpAmount: 100200,
    totalShares: 100200,
    rorc: 'Huang Xiaohuan',
    secretaries: ['Huang Xiaohuan'],
    directors: ['Huang Xiaohuan'],
    shareholders: ['Huang Xiaohuan'],
    createdDate: '2019-11-14',
  },
  {
    name: 'Aitime Holdings Pte. Ltd.',
    member: 'Cao Gaoqi',
    regNo: '201936638C',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Chen Lei',
    secretaries: ['Cao Gaoqi', 'Tan Sook Mei'],
    directors: ['Chen Lei'],
    shareholders: ['Cao Gaoqi'],
    createdDate: '2019-10-31',
  },
  {
    name: 'Finfab Holdings Pte. Ltd.',
    member: 'Wu Can',
    regNo: '201936621M',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Wu Can',
    secretaries: ['Wu Can'],
    directors: ['Wu Can'],
    shareholders: ['Wu Can', 'Chen Changhua'],
    createdDate: '2019-10-31',
  },
  {
    name: 'Central Media Pte. Ltd.',
    member: 'Wang Kai',
    regNo: '201211983K',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10,
    totalShares: 10,
    rorc: 'Yang Yong',
    secretaries: ['Wang Kai'],
    directors: ['Yang Yong'],
    shareholders: ['Yang Yong'],
    createdDate: '2019-10-18',
  },
  {
    name: 'Singapore Em Pte. Ltd.',
    member: 'Lin Cheng',
    regNo: '201623704R',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10,
    totalShares: 10,
    rorc: 'Lin Cheng',
    secretaries: ['Lin Cheng'],
    directors: ['Lin Cheng'],
    shareholders: ['Lin Cheng'],
    createdDate: '2019-10-18',
  },
  {
    name: 'Accscience Publishing Pte Ltd',
    member: 'Guo Feng',
    regNo: '201613066N',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Guo Feng',
    secretaries: ['Guo Feng'],
    directors: ['Guo Feng', 'Xue Hongwei'],
    shareholders: ['Guo Feng', 'Xue Hongwei'],
    createdDate: '2019-10-16',
  },
  {
    name: 'Yunan Pte. Ltd.',
    member: 'LIU QINGFA',
    regNo: '201829506N',
    paidUpCurrency: 'SGD',
    paidUpAmount: 50000,
    totalShares: 0,
    createdDate: '2019-10-14',
  },
  {
    name: 'Songning Pte. Ltd.',
    member: 'LIU QINGFA',
    regNo: '201831115E',
    paidUpCurrency: 'SGD',
    paidUpAmount: 50000,
    totalShares: 0,
    createdDate: '2019-10-14',
  },
  {
    name: 'Suxin Renovation Private Limited',
    member: 'LIU QINGFA',
    regNo: '201722871N',
    paidUpCurrency: 'SGD',
    paidUpAmount: 150000,
    totalShares: 150000,
    rorc: 'Liu Qingfa',
    secretaries: ['Liu Qingfa'],
    directors: ['Liu Qingfa'],
    shareholders: ['Liu Qingfa'],
    createdDate: '2019-10-14',
  },
  {
    name: 'Sinjin International Pte. Ltd.',
    member: 'LIU QINGFA',
    regNo: '201627613H',
    paidUpCurrency: 'SGD',
    paidUpAmount: 50000,
    totalShares: 50000,
    rorc: 'Gao Hongmei',
    secretaries: ['Gao Hongmei'],
    directors: ['Gao Hongmei'],
    shareholders: ['Gao Hongmei'],
    createdDate: '2019-10-14',
  },
  {
    name: 'We17 Pte. Ltd.',
    member: 'Chi Zhaofei',
    regNo: '201934905C',
    paidUpCurrency: 'SGD',
    paidUpAmount: 500000,
    totalShares: 500000,
    rorc: 'Wang Chenxi',
    secretaries: ['Chi Zhaofei'],
    directors: ['Wang Chenxi'],
    shareholders: ['Wang Chenxi'],
    createdDate: '2019-10-14',
  },
  {
    name: 'Luxegreen Wealth Academy Pte Ltd',
    member: 'Liu Wei',
    regNo: '201835209R',
    paidUpCurrency: 'SGD',
    paidUpAmount: 100,
    totalShares: 100,
    rorc: 'Liu Wei',
    secretaries: ['Liu Wei'],
    directors: ['Liu Wei'],
    shareholders: ['Liu Wei'],
    createdDate: '2019-10-14',
  },
  {
    name: 'Luxegreen Pte Ltd',
    member: 'Cindy Qi Xinyi',
    regNo: '201624542M',
    paidUpCurrency: 'SGD',
    paidUpAmount: 200000,
    totalShares: 200000,
    rorc: 'Cindy Qi Xinyi',
    secretaries: ['Liu Wei'],
    directors: ['Cindy Qi Xinyi'],
    shareholders: ['Cindy Qi Xinyi'],
    createdDate: '2019-10-14',
  },
  {
    name: 'Native Mandarin Services Pte Ltd',
    member: 'Li Yilin',
    regNo: '201728527K',
    paidUpCurrency: 'SGD',
    paidUpAmount: 1000,
    totalShares: 1000,
    rorc: 'Li Yilin',
    secretaries: ['Li Yilin'],
    directors: ['Shen Feifei', 'Sun Boyu'],
    shareholders: ['Li Yilin', 'Sun Boyu'],
    createdDate: '2019-10-14',
  },
  {
    name: 'Hong Valley Holdings Pte. Ltd.',
    regNo: '201512467D',
    paidUpCurrency: 'SGD',
    paidUpAmount: 200000,
    totalShares: 200000,
    rorc: 'Xu Jiageng',
    secretaries: ['Lim Kee Eng'],
    directors: ['Xu Jiageng', 'Wu Jing'],
    shareholders: ['Wu Jing', 'Xu Jiageng'],
    createdDate: '2019-10-13',
  },
  {
    name: 'Soon Da Pte Ltd',
    member: 'Tang Xiaojing',
    regNo: '201719408Z',
    paidUpCurrency: 'SGD',
    paidUpAmount: 200000,
    totalShares: 200000,
    rorc: 'Lim Kee Eng',
    secretaries: ['Lim Kee Eng'],
    directors: ['Lim Kee Eng'],
    shareholders: ['Tang Xiaojing'],
    createdDate: '2019-10-13',
  },
  {
    name: 'Express It Service Pte. Ltd.',
    member: 'Cao Zhanghua',
    regNo: '201530506N',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Cao Zhanghua',
    secretaries: ['Cao Zhanghua'],
    directors: ['Cao Zhanghua'],
    shareholders: ['Zhou Xichun', 'Chen Rongfang'],
    createdDate: '2019-10-13',
  },
  {
    name: 'Bybridge Consultancy Pte Ltd',
    regNo: '201523304N',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Chen Rongfang',
    secretaries: ['Chen Rongfang'],
    directors: ['Li Xin', 'Yu Kun', 'Ricky Ng See San'],
    shareholders: ['Li Cunkou', 'Yuen Shui Wai'],
    createdDate: '2019-10-11',
  },
  {
    name: 'Biliao Foundation Ltd',
    member: 'HUANG XIUYUAN',
    regNo: '201807815K',
    paidUpCurrency: 'SGD',
    paidUpAmount: 0,
    totalShares: 0,
    createdDate: '2019-10-11',
  },
  {
    name: 'Boston Medical Technology Health Management Pte Ltd',
    member: 'Zhou Pengwu',
    regNo: '201934915N',
    paidUpCurrency: 'SGD',
    paidUpAmount: 100,
    totalShares: 100,
    rorc: 'Xue Hongwei',
    secretaries: ['Zhou Pengwu'],
    directors: ['Zhou Pengwu'],
    shareholders: ['Zhou Pengwu'],
    createdDate: '2019-10-11',
  },
  {
    name: 'Bybridge Consulting Pte Ltd',
    regNo: '201118452Z',
    paidUpCurrency: 'SGD',
    paidUpAmount: 20000,
    totalShares: 20000,
    rorc: 'Cheng Ying',
    secretaries: ['Xue Hongwei'],
    directors: ['Chen Rongfang'],
    createdDate: '2019-10-11',
  },
  {
    name: 'You Lin Trading Company Ltd油鑫贸易有限公司_BVI公司',
    member: '隋永梅',
    regNo: '1998712',
    paidUpCurrency: 'SGD',
    paidUpAmount: 50000,
    totalShares: 0,
    rorc: 'Sui Yongmei',
    secretaries: ['Sui Yongmei'],
    directors: ['Sui Yongmei'],
    createdDate: '2019-10-11',
  },
  {
    name: 'Tuo Yan Education Technology Pte. Ltd.',
    member: 'Zhang Yiwen',
    regNo: '201826929C',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Zhang Yiwen',
    secretaries: ['Zhang Yiwen'],
    directors: ['Zhang Yiwen'],
    shareholders: ['Zheng Jiabao', 'Wang Shixian', 'Zhang Yiwen'],
    createdDate: '2019-10-10',
  },
];

function seedSecretaryCompaniesFromScreenshot7(db: Db) {
  if (!db.seed) db.seed = {};
  if (db.seed[SEED_KEY_SECRETARY_COMPANIES_SCREENSHOT_7]) return false;

  let changed = false;
  for (const row of SEED_SECRETARY_COMPANIES_7) {
    const createdIso = dateToIso(row.createdDate);
    const regNoKey = (row.regNo ?? '').trim() || undefined;
    const existing = safeFindClientByNameAndRegNo(db, row.name, regNoKey);

    if (!existing) {
      const client: Client = {
        id: newId('cli'),
        code: nextScCode(db),
        name: row.name,
        companyRegistrationNo: regNoKey,
        contactPerson: row.member?.trim() || undefined,
        paidUpCapitalCurrency: row.paidUpCurrency,
        paidUpCapitalAmount: row.paidUpAmount,
        totalShares: row.totalShares,
        tags: [],
        createdAt: createdIso,
      };
      db.clients.unshift(client);
      changed = true;
    } else {
      if (regNoKey && !existing.companyRegistrationNo) {
        existing.companyRegistrationNo = regNoKey;
        changed = true;
      }
      if (row.member?.trim() && !existing.contactPerson) {
        existing.contactPerson = row.member.trim();
        changed = true;
      }
      if (row.paidUpCurrency && existing.paidUpCapitalCurrency !== row.paidUpCurrency) {
        existing.paidUpCapitalCurrency = row.paidUpCurrency;
        changed = true;
      }
      if (typeof row.paidUpAmount === 'number' && existing.paidUpCapitalAmount !== row.paidUpAmount) {
        existing.paidUpCapitalAmount = row.paidUpAmount;
        changed = true;
      }
      if (typeof row.totalShares === 'number' && existing.totalShares !== row.totalShares) {
        existing.totalShares = row.totalShares;
        changed = true;
      }
    }

    const target = safeFindClientByNameAndRegNo(db, row.name, regNoKey);
    if (!target) continue;

    const rorcName = (row.rorc ?? '').trim();
    if (rorcName && rorcName !== '--') {
      if (looksLikeCompanyName(rorcName)) {
        const c = ensureClientForCompanyName(db, rorcName, createdIso);
        const pty = ensurePartyForCompany(db, c, createdIso);
        upsertRole(db, { clientId: target.id, partyId: pty.id, role: 'RORC', createdIso });
      } else {
        const p = ensurePerson(db, rorcName, createdIso);
        const pty = ensurePartyForPerson(db, p, createdIso);
        upsertRole(db, { clientId: target.id, partyId: pty.id, role: 'RORC', createdIso });
      }
      changed = true;
    }

    for (const sn of row.secretaries ?? []) {
      const name = sn.trim();
      if (!name) continue;
      const p = ensurePerson(db, name, createdIso);
      const pty = ensurePartyForPerson(db, p, createdIso);
      upsertRole(db, { clientId: target.id, partyId: pty.id, role: 'SECRETARY', createdIso });
      changed = true;
    }

    for (const dn of row.directors ?? []) {
      const name = dn.trim();
      if (!name || name === '—' || name === '无') continue;
      const p = ensurePerson(db, name, createdIso);
      const pty = ensurePartyForPerson(db, p, createdIso);
      upsertRole(db, { clientId: target.id, partyId: pty.id, role: 'DIRECTOR', createdIso });
      changed = true;
    }

    if (typeof row.totalShares === 'number' && Array.isArray(row.shareholders) && row.shareholders.length) {
      const sharesByName = computeShareAllocation(row.totalShares, row.shareholders);
      for (const [nameRaw, shares] of sharesByName.entries()) {
        const name = nameRaw.trim();
        if (!name || name === '—' || name === '无') continue;
        if (looksLikeCompanyName(name)) {
          const c = ensureClientForCompanyName(db, name, createdIso);
          const pty = ensurePartyForCompany(db, c, createdIso);
          upsertRole(db, { clientId: target.id, partyId: pty.id, role: 'SHAREHOLDER', createdIso, shares });
        } else {
          const p = ensurePerson(db, name, createdIso);
          const pty = ensurePartyForPerson(db, p, createdIso);
          upsertRole(db, { clientId: target.id, partyId: pty.id, role: 'SHAREHOLDER', createdIso, shares });
        }
        changed = true;
      }
    }
  }

  db.seed[SEED_KEY_SECRETARY_COMPANIES_SCREENSHOT_7] = true;
  return changed;
}

const SEED_SECRETARY_COMPANIES_4: Array<{
  name: string;
  member?: string;
  regNo?: string;
  paidUpCurrency?: Currency;
  paidUpAmount?: number;
  totalShares?: number;
  rorc?: string;
  secretaries?: string[];
  directors?: string[];
  shareholders?: string[];
  createdDate: string;
}> = [
  {
    name: 'Mighty Wisdom Pte Ltd',
    member: 'Xu Jiageng',
    regNo: '202333500R',
    paidUpCurrency: 'SGD',
    paidUpAmount: 200000,
    totalShares: 200000,
    rorc: 'Xu Jiageng',
    directors: ['Shi Yanping'],
    shareholders: ['Shi Yanping'],
    createdDate: '2023-08-18',
  },
  {
    name: 'Merits Shine Pte Ltd',
    regNo: '202333497M',
    paidUpCurrency: 'SGD',
    paidUpAmount: 200000,
    totalShares: 200000,
    rorc: 'Xu Jiageng',
    secretaries: ['Chen Sijing'],
    directors: ['Xu Jiageng'],
    shareholders: ['Xu Jiageng', 'Chen Sijing'],
    createdDate: '2023-08-18',
  },
  {
    name: 'Mighty Xq Pte Ltd',
    regNo: '202331194D',
    paidUpCurrency: 'SGD',
    paidUpAmount: 200000,
    totalShares: 200000,
    rorc: 'Xu Jiageng',
    directors: ['Xu Jiageng'],
    shareholders: ['Xu Jiageng', 'Zhao Qing'],
    createdDate: '2023-08-08',
  },
  {
    name: 'Ivolt Asia-Pacific Intelligent Power Pte Ltd',
    member: 'Xu Jiageng',
    regNo: '202331199W',
    paidUpCurrency: 'SGD',
    paidUpAmount: 200000,
    totalShares: 200000,
    rorc: 'Xu Jiageng',
    directors: ['Xu Jiageng'],
    shareholders: ['Xu Jiageng'],
    createdDate: '2023-08-08',
  },
  {
    name: 'Golden Bridge Global Business Pte Ltd',
    member: 'Huang Zhuohui',
    regNo: '202331278R',
    paidUpCurrency: 'SGD',
    paidUpAmount: 100000,
    totalShares: 100000,
    rorc: 'Huang Zhuohui',
    directors: ['Huang Zhuohui'],
    shareholders: ['Huang Zhuohui'],
    createdDate: '2023-08-04',
  },
  {
    name: 'Mighty Trade Warehousing Logistics Pte Ltd',
    regNo: '202329772R',
    paidUpCurrency: 'SGD',
    paidUpAmount: 200000,
    totalShares: 200000,
    rorc: 'Xu Jiageng',
    secretaries: ['Tan Sook Mei'],
    directors: ['Xu Jiageng', 'Chen Weidong'],
    shareholders: ['Xu Jiageng', 'Chen Weidong'],
    createdDate: '2023-08-03',
  },
  {
    name: 'Kpoint Pte Ltd',
    member: 'Liang Dayao',
    regNo: '202302559G',
    paidUpCurrency: 'SGD',
    paidUpAmount: 100000,
    totalShares: 100000,
    rorc: 'Liang Dayao',
    secretaries: ['Xue Hongwei'],
    directors: ['Liang Dayao'],
    shareholders: ['Liang Dayao'],
    createdDate: '2023-08-03',
  },
  {
    name: 'Luxegreen Advisory Pte Ltd',
    member: 'Liu Wei',
    regNo: '202328212K',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Liu Wei',
    secretaries: ['Liu Wei'],
    directors: ['Liu Wei'],
    shareholders: ['Liu Wei'],
    createdDate: '2023-07-14',
  },
  {
    name: 'Globasci Publishing House Pte Ltd',
    member: 'Yang Fei',
    regNo: '202325301M',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Qu YuanYuan',
    secretaries: ['Yang Fei'],
    directors: ['Yang Fei', 'Qu YuanYuan'],
    shareholders: ['Yang Fei', 'Qu YuanYuan'],
    createdDate: '2023-06-28',
  },
  {
    name: 'Cirpluz Pte Ltd',
    member: 'Lin Qinghui',
    regNo: '202324490N',
    paidUpCurrency: 'SGD',
    paidUpAmount: 1,
    totalShares: 1,
    rorc: 'Lin Qinghui',
    secretaries: ['Lin Qinghui'],
    directors: ['Lin Qinghui'],
    shareholders: ['Lin Qinghui'],
    createdDate: '2023-06-22',
  },
  {
    name: 'Self Aesthetics Pte Ltd',
    member: 'Li Wenlong',
    regNo: '202324333R',
    paidUpCurrency: 'SGD',
    paidUpAmount: 500000,
    totalShares: 500000,
    rorc: 'Li Wenlong',
    directors: ['Li Wenlong'],
    shareholders: ['Li Wenlong'],
    createdDate: '2023-06-22',
  },
  {
    name: 'Rising International Cultural Communications Pte Ltd',
    member: 'Diao Ruiling',
    regNo: '202324860N',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Diao Ruiling',
    secretaries: ['Fu Changji'],
    directors: ['Diao Ruiling'],
    shareholders: ['Diao Ruiling', 'Fu Changji'],
    createdDate: '2023-06-20',
  },
  {
    name: 'Merits Poh Holdings Pte Ltd',
    regNo: '202323764G',
    paidUpCurrency: 'SGD',
    paidUpAmount: 200000,
    totalShares: 200000,
    rorc: 'Ning Guangchao',
    secretaries: ['Xu Jiageng'],
    directors: ['Ning Guangchao'],
    shareholders: ['Xu Jiageng', 'Ning Guangchao'],
    createdDate: '2023-06-16',
  },
  {
    name: 'Jundo Pte Ltd',
    regNo: '202244987D',
    paidUpCurrency: 'SGD',
    paidUpAmount: 800000,
    totalShares: 800000,
    rorc: 'Lu Qianying',
    secretaries: ['Xue Hongwei'],
    directors: ['Xue Hongwei'],
    shareholders: ['Xue Hongwei'],
    createdDate: '2023-06-06',
  },
  {
    name: 'Beijing Xinchao Culture Media Co., Ltd',
    member: 'Zhang Jixue',
    regNo: '91110108MA002N5U8R',
    directors: ['Zhang Jixue', 'Wang Bin'],
    shareholders: ['Beijing Xinchao Culture Media Co., Ltd'],
    createdDate: '2023-06-06',
  },
  {
    name: 'Xinchao Media Pte Ltd',
    member: 'Wang Bin',
    regNo: '202322694N',
    paidUpCurrency: 'SGD',
    paidUpAmount: 1000000,
    totalShares: 1000000,
    rorc: 'Zhang Jixue',
    directors: ['Wang Bin'],
    createdDate: '2023-06-06',
  },
  {
    name: 'Forsta Biz (Singapore) Pte Ltd',
    regNo: '202321205R',
    paidUpCurrency: 'SGD',
    paidUpAmount: 50000,
    totalShares: 50000,
    rorc: 'Zhang Zhengbin',
    secretaries: ['Zhang Zhengbin'],
    directors: ['Zhang Zhengbin'],
    shareholders: ['Zhang Zhengbin'],
    createdDate: '2023-05-30',
  },
  {
    name: 'Merits Shan Pte Ltd',
    member: 'Xu Jiageng',
    regNo: '202320053M',
    paidUpCurrency: 'SGD',
    paidUpAmount: 200000,
    totalShares: 200000,
    rorc: 'Li Mei',
    secretaries: ['Li Mei'],
    directors: ['Xu Jiageng', 'Li Mei'],
    shareholders: ['Xu Jiageng'],
    createdDate: '2023-05-22',
  },
  {
    name: '1314 Mala Pte Ltd',
    regNo: '202314504Z',
    paidUpCurrency: 'SGD',
    paidUpAmount: 1000,
    totalShares: 1000,
    rorc: 'Zhang Zhihua',
    secretaries: ['Wang Yan'],
    directors: ['Zhang Zhihua', 'Wang Yan'],
    shareholders: ['Zhang Zhihua', 'Wang Yan'],
    createdDate: '2023-05-15',
  },
  {
    name: 'Poh Shun Wisdom Pte Ltd',
    member: 'Xu Jiageng',
    regNo: '202318499Z',
    paidUpCurrency: 'SGD',
    paidUpAmount: 100000,
    totalShares: 100000,
    rorc: 'Zhang Dongmei',
    secretaries: ['Zhang Dongmei'],
    directors: ['Xu Jiageng'],
    shareholders: ['Xu Jiageng'],
    createdDate: '2023-05-15',
  },
  {
    name: 'Liren Daren United Pte Ltd',
    member: 'Xu Jiageng',
    regNo: '202314158H',
    paidUpCurrency: 'SGD',
    paidUpAmount: 200000,
    totalShares: 200000,
    rorc: 'Zang Lilu',
    directors: ['Xu Jiageng'],
    shareholders: ['Zang Lilu', 'Xu Jiageng'],
    createdDate: '2023-04-13',
  },
  {
    name: 'Skin Journal Pte Ltd',
    regNo: '202314221H',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Steve Kum Whye Kit',
    directors: ['Steve Kum Whye Kit'],
    shareholders: ['Steve Kum Whye Kit'],
    createdDate: '2023-04-13',
  },
  {
    name: 'Deepx Capital Ltd',
    member: 'Zeng Xi',
    regNo: '2119814',
    createdDate: '2023-03-22',
  },
  {
    name: 'Choo Capital Ltd',
    member: 'Zhou Chunan',
    regNo: '2119421',
    shareholders: ['Lai Zhi Hao'],
    createdDate: '2023-03-22',
  },
  {
    name: 'Ego Medispa Pte Ltd',
    member: 'Li Wenlong',
    regNo: '202009371Z',
    paidUpCurrency: 'SGD',
    paidUpAmount: 500000,
    totalShares: 500000,
    rorc: 'Xue Wenxi',
    secretaries: ['Tan Sook Mei'],
    directors: ['Li Wenlong'],
    shareholders: ['Ego Medical Holdings Pte Ltd', 'Xue Wenxi'],
    createdDate: '2023-03-08',
  },
  {
    name: 'Asia Institute Of Integral Studies Pte Ltd',
    member: 'Liu Lu',
    regNo: '202312768R',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Liu Lu',
    directors: ['Liu Lu'],
    shareholders: ['Liu Lu'],
    createdDate: '2023-03-08',
  },
  {
    name: 'Changming International Centre Pte Ltd',
    member: 'Liu Lu',
    regNo: '202308612M',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Liu Lu',
    directors: ['Liu Lu'],
    shareholders: ['Liu Lu'],
    createdDate: '2023-03-08',
  },
  {
    name: 'Jinglin International Centre Pte Ltd',
    member: 'Liu Lu',
    regNo: '202308611C',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Liu Lu',
    directors: ['Liu Lu'],
    shareholders: ['Liu Lu'],
    createdDate: '2023-03-08',
  },
  {
    name: 'Zhonghui International Centre Pte Ltd',
    member: 'Liu Lu',
    regNo: '202308388D',
    paidUpCurrency: 'SGD',
    paidUpAmount: 100000,
    totalShares: 10000,
    rorc: 'Liu Lu',
    directors: ['Liu Lu'],
    shareholders: ['Victoria World Academy Pte Ltd'],
    createdDate: '2023-03-07',
  },
  {
    name: 'Themoonbeam.co Pte Ltd',
    member: 'Varden Toh En Cheng',
    regNo: '202307776K',
    paidUpCurrency: 'SGD',
    paidUpAmount: 1200,
    totalShares: 1200,
    rorc: 'Lim Jia Wei',
    secretaries: ['Xue Hongwei'],
    directors: ['Kong Qi Herng', 'Lim Jia Wei', 'Varden Toh En Cheng'],
    shareholders: ['Kong Qi Herng', 'Lim Jia Wei', 'Varden Toh En Cheng'],
    createdDate: '2023-02-28',
  },
  {
    name: 'Haittaw Pte Ltd',
    member: 'Yu Mingzhi',
    regNo: '202241973W',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Luo Haiqi',
    secretaries: ['Tan Sook Mei'],
    directors: ['Yu Mingzhi'],
    shareholders: ['Luo Haiqi'],
    createdDate: '2023-02-18',
  },
  {
    name: 'Legacy Growth Holdings Pte Ltd',
    member: 'Zhao Huashan',
    regNo: '20230500C',
    paidUpCurrency: 'SGD',
    paidUpAmount: 1000,
    totalShares: 1000,
    rorc: 'Zhao Huashan',
    directors: ['Zhao Huashan'],
    shareholders: ['Edge Point Limited'],
    createdDate: '2023-02-01',
  },
  {
    name: 'Edge Point Limited',
    member: 'Zhao Huashan',
    regNo: '1776537',
    createdDate: '2023-02-01',
  },
  {
    name: 'Legacy Growth Family Office Pte Ltd',
    member: 'Zhao Huashan',
    regNo: '202303499Z',
    paidUpCurrency: 'SGD',
    paidUpAmount: 250000,
    totalShares: 250000,
    rorc: 'Zhao Huashan',
    secretaries: ['Tan Sook Mei'],
    directors: ['Zhao Huashan'],
    shareholders: ['Edge Point Limited'],
    createdDate: '2023-02-01',
  },
  {
    name: 'West Creek Marketing Pte Ltd',
    member: 'Xu Yang',
    regNo: '202302430H',
    paidUpCurrency: 'SGD',
    paidUpAmount: 50000,
    totalShares: 50000,
    rorc: 'Li Yinghao',
    directors: ['Xu Yang'],
    shareholders: ['Mindigital Technology Pte Ltd', 'Zhang Yulin', 'Luo Huilin'],
    createdDate: '2023-01-17',
  },
  {
    name: 'Future Forge Tech Pte Ltd',
    paidUpCurrency: 'SGD',
    paidUpAmount: 50000,
    totalShares: 50000,
    rorc: 'Willbe Inc',
    directors: ['Wang Yuhang', 'Ji Chao', 'Zeng Pengxuan'],
    shareholders: ['Willbe Inc'],
    createdDate: '2022-12-12',
  },
  {
    name: 'Hoping Holding Pte Ltd',
    member: 'Ge Bingxiao',
    regNo: '202244131H',
    paidUpCurrency: 'SGD',
    paidUpAmount: 200000,
    totalShares: 200000,
    rorc: 'Ge Bingxiao',
    directors: ['Yue Tao', 'Ge Bingxiao'],
    shareholders: ['Ge Bingxiao', 'Ge Yunxia'],
    createdDate: '2022-11-21',
  },
  {
    name: 'Contemporary Amperex Technology (hong Kong) Limited',
    member: 'Chau Yiu Keung',
    regNo: '2354977',
    createdDate: '2022-11-15',
  },
  {
    name: 'Catl Investment Pte Ltd',
    member: 'Pan Jian',
    regNo: '202136458N',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Pan Jian',
    secretaries: ['Qian Wuquan'],
    directors: ['Pan Jian', 'Qian Wuquan'],
    shareholders: ['Contemporary Amperex Technology (hong Kong) Limited'],
    createdDate: '2022-11-15',
  },
  {
    name: 'Marina Cove Property Pte Ltd',
    member: 'Huang Jinghong',
    regNo: '202134938H',
    paidUpCurrency: 'SGD',
    paidUpAmount: 10000,
    totalShares: 10000,
    rorc: 'Huang Jinghong',
    directors: ['Huang Jinghong'],
    shareholders: ['Huang Jinghong'],
    createdDate: '2022-11-15',
  },
  {
    name: 'Yangyangyang E-commerce Pte Ltd',
    member: 'Yu Kun',
    regNo: '202240398N',
    paidUpCurrency: 'SGD',
    paidUpAmount: 1000000,
    totalShares: 1000000,
    rorc: 'Yang Weiqing',
    directors: ['Yang Weiqing'],
    shareholders: ['Yang Weiqing', 'Yu Kun'],
    createdDate: '2022-11-11',
  },
  {
    name: 'The Top Beauty Salon Pte Ltd',
    member: 'Feng Xiaogang',
    regNo: '202225410E',
    paidUpCurrency: 'SGD',
    paidUpAmount: 100000,
    totalShares: 100000,
    rorc: 'Yin Yali',
    secretaries: ['Tan Sook Mei'],
    directors: ['Feng Xiaogang'],
    shareholders: ['Zhang Weiwei'],
    createdDate: '2022-11-10',
  },
  {
    name: 'Dtc Builders Pte Ltd',
    member: 'Ke Jiayao',
    regNo: '201606290G',
    paidUpCurrency: 'SGD',
    paidUpAmount: 1000000,
    totalShares: 1000000,
    rorc: 'Ke Jiayao',
    directors: ['Lim Beng Hock', 'Ke Jiayao', 'Wu Chuanyong'],
    shareholders: ['Sun Jianxing', 'Wu Chuanyong', 'Ke Jiayao', 'Zhao Hongzhen'],
    createdDate: '2022-11-09',
  },
  {
    name: 'Decho Business Pte Ltd',
    member: 'Xu Jiageng',
    regNo: '202238710R',
    paidUpCurrency: 'SGD',
    paidUpAmount: 100000,
    totalShares: 100000,
    rorc: 'Yuan Jiang',
    secretaries: ['Liu Hanquan'],
    directors: ['Xu Jiageng'],
    shareholders: ['Xu Jiageng', 'Yuan Jiang', 'Liu Mingli'],
    createdDate: '2022-11-01',
  },
  {
    name: 'Asia Institute Of Integral Studies Pte Ltd',
    paidUpCurrency: 'SGD',
    paidUpAmount: 100000,
    totalShares: 100000,
    rorc: 'Liu Lu',
    secretaries: ['Liu Lu'],
    directors: ['Liu Lu'],
    shareholders: ['Liu Lu'],
    createdDate: '2022-09-13',
  },
  {
    name: 'Roxy Investment Management Pte Ltd',
    member: 'wangqianjin',
    paidUpCurrency: 'SGD',
    paidUpAmount: 1,
    totalShares: 1,
    rorc: 'Wangqianjin',
    directors: ['Wangqianjin'],
    shareholders: ['Wangqianjin'],
    createdDate: '2022-08-27',
  },
  {
    name: 'Mint Capital Group',
    member: 'Li Yinghao',
    regNo: '307986',
    createdDate: '2022-08-26',
  },
];

function seedSecretaryCompaniesFromScreenshot4(db: Db) {
  if (!db.seed) db.seed = {};
  if (db.seed[SEED_KEY_SECRETARY_COMPANIES_SCREENSHOT_4]) return false;

  let changed = false;
  for (const row of SEED_SECRETARY_COMPANIES_4) {
    const createdIso = dateToIso(row.createdDate);
    const regNoKey = (row.regNo ?? '').trim();
    const nameKey = normalizeClientNameForMerge(row.name);

    const existing =
      (regNoKey
        ? db.clients.find((c) => !c.deletedAt && (c.companyRegistrationNo ?? '').trim() === regNoKey) ?? null
        : null) ??
      db.clients.find((c) => !c.deletedAt && normalizeClientNameForMerge((c.name ?? '').trim()) === nameKey) ??
      null;

    if (!existing) {
      const client: Client = {
        id: newId('cli'),
        code: nextScCode(db),
        name: row.name,
        companyRegistrationNo: regNoKey || undefined,
        contactPerson: row.member?.trim() || undefined,
        paidUpCapitalCurrency: row.paidUpCurrency,
        paidUpCapitalAmount: row.paidUpAmount,
        totalShares: row.totalShares,
        tags: [],
        createdAt: createdIso,
      };
      db.clients.unshift(client);
      changed = true;
    } else {
      if (regNoKey && existing.companyRegistrationNo !== regNoKey) {
        existing.companyRegistrationNo = regNoKey;
        changed = true;
      }
      if (row.member?.trim() && !existing.contactPerson) {
        existing.contactPerson = row.member.trim();
        changed = true;
      }
      if (row.paidUpCurrency && existing.paidUpCapitalCurrency !== row.paidUpCurrency) {
        existing.paidUpCapitalCurrency = row.paidUpCurrency;
        changed = true;
      }
      if (typeof row.paidUpAmount === 'number' && existing.paidUpCapitalAmount !== row.paidUpAmount) {
        existing.paidUpCapitalAmount = row.paidUpAmount;
        changed = true;
      }
      if (typeof row.totalShares === 'number' && existing.totalShares !== row.totalShares) {
        existing.totalShares = row.totalShares;
        changed = true;
      }
    }

    const target =
      (regNoKey
        ? db.clients.find((c) => !c.deletedAt && (c.companyRegistrationNo ?? '').trim() === regNoKey) ?? null
        : null) ??
      db.clients.find((c) => !c.deletedAt && normalizeClientNameForMerge((c.name ?? '').trim()) === nameKey) ??
      null;
    if (!target) continue;

    const rorcName = (row.rorc ?? '').trim();
    if (rorcName && rorcName !== '--') {
      if (looksLikeCompanyName(rorcName)) {
        const c = ensureClientForCompanyName(db, rorcName, createdIso);
        const pty = ensurePartyForCompany(db, c, createdIso);
        upsertRole(db, { clientId: target.id, partyId: pty.id, role: 'RORC', createdIso });
      } else {
        const p = ensurePerson(db, rorcName, createdIso);
        const pty = ensurePartyForPerson(db, p, createdIso);
        upsertRole(db, { clientId: target.id, partyId: pty.id, role: 'RORC', createdIso });
      }
      changed = true;
    }

    for (const sn of row.secretaries ?? []) {
      const name = sn.trim();
      if (!name) continue;
      const p = ensurePerson(db, name, createdIso);
      const pty = ensurePartyForPerson(db, p, createdIso);
      upsertRole(db, { clientId: target.id, partyId: pty.id, role: 'SECRETARY', createdIso });
      changed = true;
    }

    for (const dn of row.directors ?? []) {
      const name = dn.trim();
      if (!name) continue;
      const p = ensurePerson(db, name, createdIso);
      const pty = ensurePartyForPerson(db, p, createdIso);
      upsertRole(db, { clientId: target.id, partyId: pty.id, role: 'DIRECTOR', createdIso });
      changed = true;
    }

    if (typeof row.totalShares === 'number' && Array.isArray(row.shareholders) && row.shareholders.length) {
      const sharesByName = computeShareAllocation(row.totalShares, row.shareholders);
      for (const [nameRaw, shares] of sharesByName.entries()) {
        const name = nameRaw.trim();
        if (!name) continue;
        if (looksLikeCompanyName(name)) {
          const c = ensureClientForCompanyName(db, name, createdIso);
          const pty = ensurePartyForCompany(db, c, createdIso);
          upsertRole(db, { clientId: target.id, partyId: pty.id, role: 'SHAREHOLDER', createdIso, shares });
        } else {
          const p = ensurePerson(db, name, createdIso);
          const pty = ensurePartyForPerson(db, p, createdIso);
          upsertRole(db, { clientId: target.id, partyId: pty.id, role: 'SHAREHOLDER', createdIso, shares });
        }
        changed = true;
      }
    }
  }

  db.seed[SEED_KEY_SECRETARY_COMPANIES_SCREENSHOT_4] = true;
  return changed;
}

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
  let db = await readDbRaw();
  let changed = false;

  if (migrateClientCodesV1(db)) changed = true;
  if (migrateClientCodesV2(db)) changed = true;
  if (migrateClientCodesV3(db)) changed = true;
  if (migrateClientCodesV4(db)) changed = true;
  if (migrateClientCodesV5(db)) changed = true;
  if (migrateClientCodesV6(db)) changed = true;
  if (migrateClientCodesV7(db)) changed = true;
  if (migrateClientCodesV8(db)) changed = true;
  if (cleanupClientNameStatusSuffixes(db)) changed = true;
  if (seedSecretaryCompaniesFromScreenshot(db)) changed = true;
  if (seedSecretaryCompaniesFromScreenshot2(db)) changed = true;
  if (seedSecretaryCompaniesFromScreenshot3(db)) changed = true;
  if (seedSecretaryCompaniesFromScreenshot4(db)) changed = true;
  if (seedSecretaryCompaniesFromScreenshot5(db)) changed = true;
  if (seedSecretaryCompaniesFromScreenshot6(db)) changed = true;
  if (seedSecretaryCompaniesFromScreenshot7(db)) changed = true;
  if (dedupeClientsByNormalizedNameAlways(db)) changed = true;
  if (ensureOwnerHasSecretaryPermission(db)) changed = true;

  if (db.users.length === 0) {
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
        secretary: { viewAll: true, viewAssigned: true, create: true, update: true },
      } as Permissions,
      passwordHash: lukePasswordHash,
      createdAt: nowIso(),
    };
    db = { ...db, users: [luke], reservedNames: ['luke'] };
    changed = true;
  }

  if (changed) await writeDbRaw(db);
  return db;
}

export async function writeDb(db: Db) {
  await writeDbRaw(db);
}

export async function appendAuditLog(entry: Omit<AuditLog, 'id' | 'createdAt'> & { createdAt?: string }) {
  const db = await readDb();
  const log: AuditLog = {
    id: newId('log'),
    createdAt: entry.createdAt ?? nowIso(),
    actorUserId: entry.actorUserId,
    actorName: entry.actorName,
    actorRole: entry.actorRole,
    area: entry.area,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    summary: entry.summary,
  };
  const prev = Array.isArray((db as unknown as { auditLogs?: unknown }).auditLogs) ? ((db as unknown as { auditLogs?: AuditLog[] }).auditLogs ?? []) : [];
  const next = [...prev, log];
  db.auditLogs = next.length > 5000 ? next.slice(-5000) : next;
  await writeDbRaw(db);
  return log;
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
  fka?: string;
  companyRegistrationNo?: string;
  fye?: string;
  contactPerson?: string;
  address?: string;
  phone?: string;
  email?: string;
  businessActivities?: string;
  ssicPrimaryCode?: string;
  ssicSecondaryCode?: string;
  paidUpCapitalCurrency?: Client['paidUpCapitalCurrency'];
  paidUpCapitalAmount?: Client['paidUpCapitalAmount'];
  totalShares?: Client['totalShares'];
  incorporationDate?: Client['incorporationDate'];
  registeredOfficeAddress?: Client['registeredOfficeAddress'];
  tags?: string[];
}) {
  const db = await readDb();
  const codeKey = input.code.trim().toLowerCase();
  const nameKey = normalizeClientNameForMerge(input.name);
  const regNoKey = (input.companyRegistrationNo ?? '').trim();
  if (!codeKey || !nameKey) throw new Error('INVALID_INPUT');
  if (db.clients.some((c) => !c.deletedAt && (c.code || '').trim().toLowerCase() === codeKey)) throw new Error('DUPLICATE_CODE');

  const existingByName = safeFindClientByNameAndRegNo(db, input.name, regNoKey || undefined);
  if (existingByName) {
    const patch: Partial<Client> = {};
    if (input.fka && !existingByName.fka) patch.fka = input.fka;
    if (regNoKey && !existingByName.companyRegistrationNo) patch.companyRegistrationNo = regNoKey;
    if (input.fye && !existingByName.fye) patch.fye = input.fye;
    if (input.contactPerson && !existingByName.contactPerson) patch.contactPerson = input.contactPerson;
    if (input.address && !existingByName.address) patch.address = input.address;
    if (input.phone && !existingByName.phone) patch.phone = input.phone;
    if (input.email && !existingByName.email) patch.email = input.email;
    if (input.businessActivities && !existingByName.businessActivities) patch.businessActivities = input.businessActivities;
    if (input.ssicPrimaryCode && !existingByName.ssicPrimaryCode) patch.ssicPrimaryCode = input.ssicPrimaryCode;
    if (input.ssicSecondaryCode && !existingByName.ssicSecondaryCode) patch.ssicSecondaryCode = input.ssicSecondaryCode;
    if (input.paidUpCapitalCurrency && !existingByName.paidUpCapitalCurrency) patch.paidUpCapitalCurrency = input.paidUpCapitalCurrency;
    if (typeof input.paidUpCapitalAmount === 'number' && existingByName.paidUpCapitalAmount === undefined)
      patch.paidUpCapitalAmount = input.paidUpCapitalAmount;
    if (typeof input.totalShares === 'number' && existingByName.totalShares === undefined) patch.totalShares = input.totalShares;
    if (input.incorporationDate && !existingByName.incorporationDate) patch.incorporationDate = input.incorporationDate;
    if (input.registeredOfficeAddress && !existingByName.registeredOfficeAddress) patch.registeredOfficeAddress = input.registeredOfficeAddress;
    if (Array.isArray(input.tags) && input.tags.length) {
      const merged = Array.from(new Set([...(existingByName.tags ?? []), ...input.tags].filter(Boolean)));
      patch.tags = merged;
    }
    if (Object.keys(patch).length) {
      const idx = db.clients.findIndex((c) => c.id === existingByName.id);
      if (idx >= 0) db.clients[idx] = { ...db.clients[idx], ...patch };
      await writeDb(db);
      return db.clients[idx];
    }
    await writeDb(db);
    return existingByName;
  }
  const client: Client = {
    id: newId('cli'),
    code: input.code,
    name: input.name,
    fka: input.fka,
    companyRegistrationNo: input.companyRegistrationNo,
    fye: input.fye,
    contactPerson: input.contactPerson,
    address: input.address,
    phone: input.phone,
    email: input.email,
    businessActivities: input.businessActivities,
    ssicPrimaryCode: input.ssicPrimaryCode,
    ssicSecondaryCode: input.ssicSecondaryCode,
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
      | 'fka'
      | 'companyRegistrationNo'
      | 'fye'
      | 'contactPerson'
      | 'address'
      | 'phone'
      | 'email'
      | 'businessActivities'
      | 'ssicPrimaryCode'
      | 'ssicSecondaryCode'
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

function normalizeDateYmd(input: string | undefined) {
  const s = (input ?? '').trim();
  if (!s) return undefined;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    const dd = dmy[1].padStart(2, '0');
    const mm = dmy[2].padStart(2, '0');
    return `${dmy[3]}-${mm}-${dd}`;
  }
  const fromIso = s.match(/^(\d{4})-(\d{2})-(\d{2})T/);
  if (fromIso) return `${fromIso[1]}-${fromIso[2]}-${fromIso[3]}`;

  const dMonY = s.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/);
  if (dMonY) {
    const dd = dMonY[1].padStart(2, '0');
    const monRaw = dMonY[2].toLowerCase();
    const yyyy = dMonY[3];
    const monMap: Record<string, string> = {
      jan: '01',
      january: '01',
      feb: '02',
      february: '02',
      mar: '03',
      march: '03',
      apr: '04',
      april: '04',
      may: '05',
      jun: '06',
      june: '06',
      jul: '07',
      july: '07',
      aug: '08',
      august: '08',
      sep: '09',
      sept: '09',
      september: '09',
      oct: '10',
      october: '10',
      nov: '11',
      november: '11',
      dec: '12',
      december: '12',
    };
    const mm = monMap[monRaw];
    if (mm) return `${yyyy}-${mm}-${dd}`;
  }
  return s;
}

function slugifyCompaniesSgName(name: string) {
  const s = String(name ?? '').trim();
  if (!s) return '';
  const noDots = s.replace(/\./g, '');
  const upper = noDots.toUpperCase();
  const slug = upper
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return slug ? `${slug}-` : '';
}

function stripTags(input: string) {
  return input
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#0*39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractMetaDescription(html: string) {
  const m = html.match(/<meta\s+name="description"\s+content="([^"]*)"/i);
  if (!m) return undefined;
  return stripTags(m[1]);
}

function extractIncorporationDateFromMeta(desc: string | undefined) {
  const s = (desc ?? '').trim();
  if (!s) return undefined;
  const m1 = s.match(/incorporated\s+on\s+(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})/i);
  if (m1) return normalizeDateYmd(m1[1]);
  const m2 = s.match(/incorporated\s+on\s+(\d{4}-\d{2}-\d{2})/i);
  if (m2) return normalizeDateYmd(m2[1]);
  return undefined;
}

function extractEntityStatusFromMeta(desc: string | undefined) {
  const s = (desc ?? '').trim();
  if (!s) return undefined;
  const m = s.match(/current\s+operating\s+status\s+is\s+([^\.]+)\./i);
  if (m) return m[1].trim();
  return undefined;
}

function normalizeSsicText(s: string) {
  return s
    .toLowerCase()
    .replace(/^\d+\s*-\s*/g, '')
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function findSsicCodeByDescription(desc: string | undefined) {
  const q = normalizeSsicText(desc ?? '');
  if (!q) return undefined;
  const exact = SSIC_ROWS.find((r) => normalizeSsicText(r.description) === q);
  if (exact) return exact.code;

  const hits = SSIC_ROWS.filter((r) => {
    const d = normalizeSsicText(r.description);
    return d.includes(q) || q.includes(d);
  });
  if (hits.length === 1) return hits[0].code;
  return undefined;
}

function stripCompanySuffixesForMatch(s: string) {
  return normalizeClientNameForMerge(s)
    .replace(/\b(private|pte|ltd|limited|company|co|inc|corp|corporation)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function namesLooselyMatch(a: string, b: string) {
  const aa = stripCompanySuffixesForMatch(a);
  const bb = stripCompanySuffixesForMatch(b);
  if (!aa || !bb) return false;
  if (aa === bb) return true;
  const minLen = 12;
  if (aa.length >= minLen && bb.length >= minLen) {
    if (aa.startsWith(bb) || bb.startsWith(aa)) return true;
    if (aa.includes(bb) || bb.includes(aa)) return true;
  }
  return false;
}

function titleCaseCompanyNameIfAllCaps(s: string) {
  const input = String(s ?? '').trim();
  if (!input) return input;
  if (/[a-z]/.test(input)) return input;
  const upperWords = new Set(['PTE', 'LTD', 'LLP', 'LLC', 'PLC', 'INC', 'CO', 'LP']);
  return input
    .split(/\s+/)
    .map((w) => {
      const clean = w.replace(/[^A-Z0-9.]/g, '');
      const bare = clean.replace(/\./g, '');
      if (upperWords.has(bare)) return w.toUpperCase();
      if (/^\d+$/.test(bare)) return w;
      const lower = w.toLowerCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

async function enrichOneClientFromCompaniesSg(db: Db, client: Client) {
  const uen = String(client.companyRegistrationNo ?? '').trim().toUpperCase();
  if (!uen) return { status: 'SKIP_NO_UEN' as const };

  const slug = slugifyCompaniesSgName(client.name) || 'x-';
  const url = `https://www.companies.sg/business/${encodeURIComponent(uen)}/${encodeURIComponent(slug)}`;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 10_000);
  const res = await fetch(url, {
    signal: controller.signal,
    headers: {
      'user-agent': 'Mozilla/5.0',
      accept: 'text/html,application/xhtml+xml',
    },
  }).finally(() => clearTimeout(t));

  if (!res.ok) {
    return {
      status: 'NOT_FOUND' as const,
      url,
      httpStatus: res.status,
    };
  }
  const html = await res.text();

  const foundName = extractCompaniesSgField(html, 'Entity Name');
  if (foundName) {
    const keyA = normalizeClientNameForMerge(foundName);
    const keyB = normalizeClientNameForMerge(client.name);
    const exactMatch = keyA && keyB && keyA === keyB;
    const looseMatch = namesLooselyMatch(foundName, client.name);
    if (!exactMatch && !looseMatch) {
      return { status: 'MISMATCH_NAME' as const, url, foundName };
    }
  }

  const metaDesc = extractMetaDescription(html);
  const incRaw =
    extractCompaniesSgField(html, 'Incorporated') ?? extractCompaniesSgValueAfterLabelContains(html, ['incorpor', 'date']);
  const incorp = normalizeDateYmd(incRaw) ?? extractIncorporationDateFromMeta(metaDesc);

  const statusRaw =
    extractCompaniesSgField(html, 'Entity Status Description') ??
    extractCompaniesSgField(html, 'Entity Status') ??
    extractEntityStatusFromMeta(metaDesc);
  const status = statusRaw ? statusRaw.trim() : undefined;
  const struckOff = status ? /struck\s*off/i.test(status) : false;

  const addrRaw = extractCompaniesSgField(html, 'Bussiness Address') ?? extractCompaniesSgField(html, 'Business Address');
  const addr = addrRaw ? addrRaw.replace(/\s*\n\s*/g, ', ').trim() : undefined;

  const primary =
    extractCompaniesSgField(html, 'Primary Ssic Description') ??
    extractCompaniesSgField(html, 'Primary SSIC Description') ??
    extractCompaniesSgValueAfterLabelContains(html, ['primary', 'ssic', 'description']) ??
    extractCompaniesSgValueAfterLabelContains(html, ['primary', 'activity']);
  const secondary =
    extractCompaniesSgField(html, 'Secondary Ssic Description') ??
    extractCompaniesSgField(html, 'Secondary SSIC Description') ??
    extractCompaniesSgValueAfterLabelContains(html, ['secondary', 'ssic', 'description']) ??
    extractCompaniesSgValueAfterLabelContains(html, ['secondary', 'activity']);

  const biz =
    primary && secondary
      ? `Primary: ${primary}; Secondary: ${secondary}`
      : primary
        ? primary
        : secondary
          ? secondary
          : undefined;

  const patch: Partial<Client> = {};
  if (foundName && normalizeClientNameForMerge(foundName) !== normalizeClientNameForMerge(client.name)) {
    patch.name = titleCaseCompanyNameIfAllCaps(foundName);
  }
  if (addr && !String(client.registeredOfficeAddress ?? '').trim()) patch.registeredOfficeAddress = addr;
  if (incorp && !String(client.incorporationDate ?? '').trim()) patch.incorporationDate = incorp;
  if (biz && !String(client.businessActivities ?? '').trim()) patch.businessActivities = biz;

  if (status && status !== String(client.entityStatus ?? '')) patch.entityStatus = status;
  if (status && struckOff !== Boolean(client.isStruckOff)) patch.isStruckOff = struckOff;

  const primaryCode = findSsicCodeByDescription(primary);
  if (primaryCode && !String(client.ssicPrimaryCode ?? '').trim()) patch.ssicPrimaryCode = primaryCode;

  const secondaryCode = findSsicCodeByDescription(secondary);
  if (secondaryCode && !String(client.ssicSecondaryCode ?? '').trim()) patch.ssicSecondaryCode = secondaryCode;

  if (Object.keys(patch).length === 0) return { status: 'NO_CHANGE' as const, url };

  const idx = db.clients.findIndex((x) => x.id === client.id);
  if (idx < 0) return { status: 'NOT_FOUND_LOCAL' as const };
  db.clients[idx] = { ...db.clients[idx], ...patch };
  return { status: 'UPDATED' as const, url };
}

export async function enrichClientFromCompaniesSgById(clientId: string) {
  const db = await readDb();
  const client = db.clients.find((c) => c.id === clientId) ?? null;
  if (!client || client.deletedAt) return { status: 'NOT_FOUND_LOCAL' as const };
  if (/^SC\d+$/i.test(String(client.code ?? ''))) return { status: 'SKIP_SC' as const };

  try {
    const res = await enrichOneClientFromCompaniesSg(db, client);
    if (res.status === 'UPDATED') await writeDb(db);
    return { ...res, clientId: client.id, code: client.code, name: client.name };
  } catch (e) {
    return {
      status: 'ERROR' as const,
      clientId: client.id,
      code: client.code,
      name: client.name,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

function extractCompaniesSgField(html: string, label: string) {
  const re = new RegExp(`${label}\\s*<\\/div>\\s*<div[^>]*profile-field-value[^>]*>([\\s\\S]*?)<\\/div>`, 'i');
  const m = html.match(re);
  if (!m) return undefined;
  const raw = m[1];
  const withNewlines = raw.replace(/<br\s*\/?>/gi, '\n');
  const text = stripTags(withNewlines);
  return text || undefined;
}

function extractCompaniesSgValueAfterLabelContains(html: string, contains: string[]) {
  const keys = contains.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const nameRe = keys.map((k) => `(?=[\\s\\S]*${k})`).join('');
  const re = new RegExp(
    `<div[^>]*profile-field-name[^>]*>${nameRe}[\\s\\S]*?<\\/div>\\s*<div[^>]*profile-field-value[^>]*>([\\s\\S]*?)<\\/div>`,
    'i',
  );
  const m = html.match(re);
  if (!m) return undefined;
  const raw = m[1];
  const withNewlines = raw.replace(/<br\s*\/?>/gi, '\n');
  const text = stripTags(withNewlines);
  return text || undefined;
}

export async function enrichClientsFromCompaniesSg(opts: { limit: number }) {
  const db = await readDb();
  const active = db.clients.filter((c) => !c.deletedAt);

  const candidates = active
    .filter((c) => !/^SC\d+$/i.test(String(c.code ?? '')))
    .filter((c) => String(c.companyRegistrationNo ?? '').trim())
    .filter((c) => {
      const needAddr = !String(c.registeredOfficeAddress ?? '').trim();
      const needDate = !String(c.incorporationDate ?? '').trim();
      const needBiz = !String(c.businessActivities ?? '').trim();
      return needAddr || needDate || needBiz;
    })
    .slice(0, Math.max(1, opts.limit));

  const updated: Array<{ id: string; code: string; name: string; uen: string }> = [];
  const mismatched: Array<{ id: string; code: string; name: string; uen: string; foundName?: string; url?: string }> = [];
  const notFound: Array<{ id: string; code: string; name: string; uen: string; url?: string; httpStatus?: number }> = [];
  const errors: Array<{ id: string; code: string; name: string; uen: string; error: string }> = [];

  const startedAt = Date.now();
  let changed = false;

  for (const c of candidates) {
    if (Date.now() - startedAt > 12_000) break;
    const uen = String(c.companyRegistrationNo ?? '').trim().toUpperCase();
    try {
      const res = await enrichOneClientFromCompaniesSg(db, c);
      if (res.status === 'UPDATED') {
        changed = true;
        updated.push({ id: c.id, code: c.code, name: c.name, uen });
      } else if (res.status === 'MISMATCH_NAME') {
        mismatched.push({ id: c.id, code: c.code, name: c.name, uen, foundName: res.foundName, url: res.url });
      } else if (res.status === 'NOT_FOUND') {
        notFound.push({ id: c.id, code: c.code, name: c.name, uen, url: res.url, httpStatus: res.httpStatus });
      }
    } catch (e) {
      errors.push({
        id: c.id,
        code: c.code,
        name: c.name,
        uen,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  if (changed) await writeDb(db);
  return {
    processed: candidates.length,
    updated,
    mismatched,
    notFound,
    errors,
  };
}

export async function enrichClientsFromCompaniesSgBatch(opts: { cursor: string | null; limit: number }) {
  const db = await readDb();
  const active = db.clients.filter((c) => !c.deletedAt);

  const shouldTry = (c: Client) => {
    const uen = String(c.companyRegistrationNo ?? '').trim();
    if (!uen) return false;
    const needAddr = !String(c.registeredOfficeAddress ?? '').trim();
    const needDate = !String(c.incorporationDate ?? '').trim();
    const needBiz = !String(c.businessActivities ?? '').trim();
    const needStatus = !String((c as unknown as { entityStatus?: string }).entityStatus ?? '').trim();
    const needStruckOff = typeof (c as unknown as { isStruckOff?: boolean }).isStruckOff !== 'boolean';
    return needAddr || needDate || needBiz || needStatus || needStruckOff;
  };

  const ordered = active
    .filter(shouldTry)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));

  let startIndex = 0;
  if (opts.cursor) {
    const idx = ordered.findIndex((c) => c.id === opts.cursor);
    if (idx >= 0) startIndex = idx + 1;
  }

  const batch = ordered.slice(startIndex, startIndex + Math.max(1, opts.limit));
  let changed = false;

  let updated = 0;
  let mismatched = 0;
  let notFound = 0;
  let errors = 0;

  let lastId: string | null = null;
  for (const c of batch) {
    lastId = c.id;
    try {
      const res = await enrichOneClientFromCompaniesSg(db, c);
      if (res.status === 'UPDATED') {
        changed = true;
        updated++;
      } else if (res.status === 'MISMATCH_NAME') {
        mismatched++;
      } else if (res.status === 'NOT_FOUND') {
        notFound++;
      }
    } catch {
      errors++;
    }
  }

  if (changed) await writeDb(db);

  const nextCursor = lastId;
  const done = startIndex + batch.length >= ordered.length;

  return {
    processed: batch.length,
    updated,
    mismatched,
    notFound,
    errors,
    nextCursor,
    done,
    remaining: Math.max(0, ordered.length - (startIndex + batch.length)),
  };
}

export async function bulkUpdateClientsByUen(
  updates: Array<{ uen: string; registeredOfficeAddress?: string; incorporationDate?: string; businessActivities?: string }>,
) {
  const db = await readDb();
  const active = db.clients.filter((c) => !c.deletedAt);

  const byUen = new Map<string, Client[]>();
  for (const c of active) {
    const uen = String(c.companyRegistrationNo ?? '').trim().toUpperCase();
    if (!uen) continue;
    const list = byUen.get(uen) ?? [];
    list.push(c);
    byUen.set(uen, list);
  }

  const updatedClients: Array<Pick<Client, 'id' | 'registeredOfficeAddress' | 'incorporationDate' | 'businessActivities'>> = [];
  const notFound: string[] = [];
  let skippedSc = 0;

  for (const u of updates) {
    const uenKey = u.uen.trim().toUpperCase();
    if (!uenKey) continue;
    const matches = (byUen.get(uenKey) ?? []).filter((c) => !/^SC\d+$/i.test(String(c.code ?? '')));
    if (matches.length === 0) {
      if ((byUen.get(uenKey) ?? []).length) skippedSc++;
      else notFound.push(uenKey);
      continue;
    }

    const target = choosePrimaryClientForMerge(db, matches);
    const idx = db.clients.findIndex((c) => c.id === target.id);
    if (idx < 0) continue;

    const current = db.clients[idx];
    const patch: Partial<Client> = {};

    const nextRegOffice = typeof u.registeredOfficeAddress === 'string' ? u.registeredOfficeAddress.trim() : '';
    if (nextRegOffice) patch.registeredOfficeAddress = nextRegOffice;

    const nextIncorp = normalizeDateYmd(u.incorporationDate);
    if (nextIncorp) patch.incorporationDate = nextIncorp;

    const nextBiz = typeof u.businessActivities === 'string' ? u.businessActivities.trim() : '';
    if (nextBiz) patch.businessActivities = nextBiz;

    if (Object.keys(patch).length === 0) continue;

    const next: Client = { ...current, ...patch };
    db.clients[idx] = next;
    updatedClients.push({
      id: next.id,
      registeredOfficeAddress: next.registeredOfficeAddress,
      incorporationDate: next.incorporationDate,
      businessActivities: next.businessActivities,
    });
  }

  if (updatedClients.length) await writeDb(db);

  return {
    updated: updatedClients.length,
    skippedSc,
    notFound,
    updatedClients,
  };
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
  return db.persons.filter((p) => !(p as Person).deletedAt);
}

export async function findPersonById(id: string) {
  const db = await readDb();
  return db.persons.find((p) => p.id === id) ?? null;
}

export async function deletePerson(personId: string) {
  const db = await readDb();
  const idx = db.persons.findIndex((p) => p.id === personId);
  if (idx < 0) return null;
  db.persons[idx] = { ...db.persons[idx], deletedAt: nowIso(), updatedAt: nowIso() };
  await writeDb(db);
  return db.persons[idx];
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
  const activePersons = db.persons.filter((p) => !(p as Person).deletedAt);
  const activePersonIdSet = new Set(activePersons.map((p) => p.id));
  const partyById = new Map(db.parties.map((p) => [p.id, p]));
  const clientById = new Map(db.clients.map((c) => [c.id, c]));

  const activeRoles = db.clientPartyRoles.filter((r) => {
    if (r.role === 'DIRECTOR' || r.role === 'SECRETARY') return !r.resignationDate;
    if (r.role === 'SHAREHOLDER' || r.role === 'RORC') return !r.toDate;
    return true;
  });

  const tagsByPersonId = new Map<string, Set<ClientPartyRole['role']>>();
  const clientIdsByPersonId = new Map<string, Set<string>>();
  const clientNamesByPersonId = new Map<string, Set<string>>();

  for (const r of activeRoles) {
    const party = partyById.get(r.partyId);
    if (!party || party.type !== 'PERSON' || !party.personId) continue;
    const personId = party.personId;
    if (!activePersonIdSet.has(personId)) continue;
    const t = tagsByPersonId.get(personId) ?? new Set<ClientPartyRole['role']>();
    t.add(r.role);
    tagsByPersonId.set(personId, t);
    const c = clientIdsByPersonId.get(personId) ?? new Set<string>();
    c.add(r.clientId);
    clientIdsByPersonId.set(personId, c);

    const client = clientById.get(r.clientId);
    if (client && !client.deletedAt) {
      const names = clientNamesByPersonId.get(personId) ?? new Set<string>();
      names.add(client.name);
      clientNamesByPersonId.set(personId, names);
    }
  }

  return activePersons.map((p) => ({
    person: p,
    roleTags: [...(tagsByPersonId.get(p.id) ?? new Set())],
    companyCount: (clientIdsByPersonId.get(p.id) ?? new Set()).size,
    companyNames: [...(clientNamesByPersonId.get(p.id) ?? new Set())].sort((a, b) => a.localeCompare(b)),
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

function shareSumForClient(db: Db, clientId: string, opts?: { excludeRoleId?: string }) {
  return db.clientPartyRoles
    .filter((r) => r.clientId === clientId && r.role === 'SHAREHOLDER')
    .filter((r) => !r.toDate)
    .filter((r) => (opts?.excludeRoleId ? r.id !== opts.excludeRoleId : true))
    .reduce((sum, r) => sum + (typeof r.shares === 'number' && Number.isFinite(r.shares) ? r.shares : 0), 0);
}

export async function addClientRole(input: {
  clientId: string;
  role: ClientPartyRole['role'];
  personId?: string;
  companyClientId?: string;
  shares?: number;
}) {
  const db = await readDb();
  const client = db.clients.find((c) => c.id === input.clientId) ?? null;
  if (!client || client.deletedAt) return { ok: false as const, error: 'NOT_FOUND' as const };

  const now = nowIso();
  let party: Party | null = null;
  if (input.personId) {
    const person = db.persons.find((p) => p.id === input.personId) ?? null;
    if (!person) return { ok: false as const, error: 'NOT_FOUND' as const };
    party = db.parties.find((p) => p.type === 'PERSON' && p.personId === input.personId) ?? null;
    if (!party) {
      party = {
        id: newId('pty'),
        type: 'PERSON',
        displayName: person.fullName,
        personId: person.id,
        createdAt: now,
        updatedAt: now,
      };
      db.parties.unshift(party);
    }
  } else if (input.companyClientId) {
    const c = db.clients.find((x) => x.id === input.companyClientId) ?? null;
    if (!c || c.deletedAt) return { ok: false as const, error: 'NOT_FOUND' as const };
    party = db.parties.find((p) => p.type === 'COMPANY' && p.clientId === input.companyClientId) ?? null;
    if (!party) {
      party = {
        id: newId('pty'),
        type: 'COMPANY',
        displayName: c.name,
        clientId: c.id,
        createdAt: now,
        updatedAt: now,
      };
      db.parties.unshift(party);
    }
  }

  if (!party) return { ok: false as const, error: 'INVALID_INPUT' as const };

  const exists = db.clientPartyRoles.some((r) => {
    if (r.clientId !== input.clientId) return false;
    if (r.partyId !== party!.id) return false;
    if (r.role !== input.role) return false;
    if (input.role === 'DIRECTOR' || input.role === 'SECRETARY') return !r.resignationDate;
    if (input.role === 'SHAREHOLDER' || input.role === 'RORC') return !r.toDate;
    return true;
  });
  if (exists) {
    await writeDb(db);
    return { ok: true as const };
  }

  const shares =
    input.role === 'SHAREHOLDER' && typeof input.shares === 'number' && Number.isFinite(input.shares) ? input.shares : undefined;
  if (input.role === 'SHAREHOLDER' && shares === undefined) {
    return { ok: false as const, error: 'INVALID_INPUT' as const };
  }

  if (input.role === 'SHAREHOLDER' && typeof client.totalShares === 'number' && Number.isFinite(client.totalShares)) {
    const nextSum = shareSumForClient(db, input.clientId) + (shares ?? 0);
    if (nextSum > client.totalShares) return { ok: false as const, error: 'SHARE_SUM_EXCEEDS_TOTAL' as const };
  }

  const role: ClientPartyRole = {
    id: newId('cpr'),
    clientId: input.clientId,
    partyId: party.id,
    role: input.role,
    appointmentDate: input.role === 'DIRECTOR' || input.role === 'SECRETARY' ? now.slice(0, 10) : undefined,
    fromDate: input.role === 'SHAREHOLDER' || input.role === 'RORC' ? now.slice(0, 10) : undefined,
    shares: input.role === 'SHAREHOLDER' ? shares : undefined,
    createdAt: now,
    updatedAt: now,
  };
  db.clientPartyRoles.unshift(role);
  await writeDb(db);
  return { ok: true as const, role };
}

export async function updateClientShareholderShares(input: { clientId: string; roleId: string; shares: number }) {
  const db = await readDb();
  const client = db.clients.find((c) => c.id === input.clientId) ?? null;
  if (!client || client.deletedAt) return { ok: false as const, error: 'NOT_FOUND' as const };
  const idx = db.clientPartyRoles.findIndex((r) => r.id === input.roleId && r.clientId === input.clientId && r.role === 'SHAREHOLDER');
  if (idx < 0) return { ok: false as const, error: 'NOT_FOUND' as const };
  const shares = Number(input.shares);
  if (!Number.isFinite(shares) || shares < 0) return { ok: false as const, error: 'INVALID_INPUT' as const };

  if (typeof client.totalShares === 'number' && Number.isFinite(client.totalShares)) {
    const current = db.clientPartyRoles[idx];
    const nextSum = shareSumForClient(db, input.clientId, { excludeRoleId: current.id }) + shares;
    if (nextSum > client.totalShares) return { ok: false as const, error: 'SHARE_SUM_EXCEEDS_TOTAL' as const };
  }

  db.clientPartyRoles[idx] = { ...db.clientPartyRoles[idx], shares, updatedAt: nowIso() };
  await writeDb(db);
  return { ok: true as const, role: db.clientPartyRoles[idx] };
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
