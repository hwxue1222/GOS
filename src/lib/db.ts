import { promises as fs } from 'fs';
import path from 'path';
import { createHash, randomBytes } from 'crypto';
import ssic from '@/data/ssic.json';
import { hashPassword } from '@/lib/password';
import { newId } from '@/lib/id';
import type {
  AnnualGeneralMeetingRequest,
  Client,
  ClientPartyRole,
  CompanyUpdateRequest,
  CompanyUpdateRequestType,
  CompanyRepresentative,
  Currency,
  Db,
  DirectorChangeRequest,
  DocumentType,
  Document,
  ExternalCompany,
  AuditLog,
  Invoice,
  InvoiceEmailHistory,
  IncorporationApplication,
  IncorporationApplicationEvent,
  IncorporationApplicationFile,
  IncorporationApplicationStatus,
  Job,
  JobTask,
  Party,
  Permissions,
  Person,
  RepresentativeDesignationRequest,
  Role,
  RorcDeclarationRequest,
  Session,
  ShareTransfer,
  SignaturePacket,
  SignaturePacketKind,
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
  return path.resolve('.gos', 'db.json');
}

const DB_FILE = getDbFilePath();

type DbCache = {
  db: Db;
  ts: number;
};

function getDbCacheTtlMs() {
  const v = Number(process.env.GOS_DB_CACHE_TTL_MS ?? '1000');
  if (!Number.isFinite(v) || v < 0) return 0;
  return v;
}

function getGlobalDbCache() {
  return globalThis as unknown as {
    __gosDbCache?: DbCache;
    __gosDbCachePromise?: Promise<Db>;
  };
}

function nowIso() {
  return new Date().toISOString();
}

function inferPersonIdTypeFromIdNo(idNo?: string | null) {
  const s = String(idNo ?? '').trim().toUpperCase();
  if (!s) return undefined;
  if (/^S\d{7}[A-Z]$/.test(s)) return 'NRIC' as const;
  if (/^G\d{7}[A-Z]$/.test(s)) return 'FIN' as const;
  return 'PASSPORT' as const;
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
    directorChangeRequests: [],
    companyUpdateRequests: [],
    rorcDeclarationRequests: [],
    annualGeneralMeetingRequests: [],
    incorporationApplications: [],
    incorporationApplicationEvents: [],
    incorporationApplicationFiles: [],
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
const SEED_KEY_CLIENT_COUNTRY_INCORP_V1 = 'clients.countryOfIncorporation.v1';

function isSingaporeCompanyRegistrationNo(regNo: string) {
  const v = String(regNo ?? '').trim();
  return /^\d{9}[A-Za-z]$/.test(v);
}

function migrateClientCountryOfIncorporationV1(db: Db) {
  if (!db.seed) db.seed = {};
  if (db.seed[SEED_KEY_CLIENT_COUNTRY_INCORP_V1]) return false;
  let changed = false;
  for (const c of db.clients) {
    if (!c || c.deletedAt) continue;
    const existing = String((c as any).countryOfIncorporation ?? '').trim();
    if (existing) {
      if (Object.prototype.hasOwnProperty.call(c as any, 'countryOfBusinessRegistration')) {
        delete (c as any).countryOfBusinessRegistration;
        changed = true;
      }
      continue;
    }

    const legacy = String((c as any).countryOfBusinessRegistration ?? '').trim();
    if (legacy) {
      (c as any).countryOfIncorporation = legacy;
      delete (c as any).countryOfBusinessRegistration;
      changed = true;
      continue;
    }
    const regNo = String((c as any).companyRegistrationNo ?? '').trim();
    if (!regNo) continue;
    if (!isSingaporeCompanyRegistrationNo(regNo)) continue;
    (c as any).countryOfIncorporation = 'Singapore';
    changed = true;
  }
  db.seed[SEED_KEY_CLIENT_COUNTRY_INCORP_V1] = true;
  return changed;
}

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

function inferMissingPersonIdTypesFromIdNo(db: Db) {
  let changed = false;
  const now = nowIso();
  for (let i = 0; i < db.persons.length; i++) {
    const p = db.persons[i];
    if (p.deletedAt) continue;
    if (p.idType) continue;
    const inferred = inferPersonIdTypeFromIdNo(p.idNo);
    if (!inferred) continue;
    db.persons[i] = { ...p, idType: inferred, updatedAt: now };
    changed = true;
  }
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
    countryOfIncorporation:
      (c as any).countryOfIncorporation ?? (c as any).countryOfBusinessRegistration,
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

  const rawDirectorChangeRequests = (parsed as unknown as { directorChangeRequests?: unknown }).directorChangeRequests;
  const directorChangeRequests: DirectorChangeRequest[] = Array.isArray(rawDirectorChangeRequests)
    ? (rawDirectorChangeRequests as unknown as DirectorChangeRequest[]).map((r) => ({
        id: String((r as DirectorChangeRequest).id ?? ''),
        clientId: String((r as DirectorChangeRequest).clientId ?? ''),
        createdByUserId: String((r as DirectorChangeRequest).createdByUserId ?? ''),
        status: (r as DirectorChangeRequest).status ?? 'DRAFT',
        effectiveDate: String((r as DirectorChangeRequest).effectiveDate ?? ''),
        message: typeof (r as DirectorChangeRequest).message === 'string' ? (r as DirectorChangeRequest).message : undefined,
        useByBridgeNomineeDirector:
          typeof (r as DirectorChangeRequest).useByBridgeNomineeDirector === 'boolean'
            ? (r as DirectorChangeRequest).useByBridgeNomineeDirector
            : undefined,
        removeDirectorRoleIds: Array.isArray((r as DirectorChangeRequest).removeDirectorRoleIds)
          ? (r as DirectorChangeRequest).removeDirectorRoleIds.map((x) => String(x)).filter(Boolean)
          : [],
        addDirectors: Array.isArray((r as DirectorChangeRequest).addDirectors)
          ? (r as DirectorChangeRequest).addDirectors
              .map((x) => ({
                fullName: typeof x?.fullName === 'string' ? x.fullName : '',
                email: typeof x?.email === 'string' ? x.email : '',
                idTypeLabel: typeof x?.idTypeLabel === 'string' ? x.idTypeLabel : undefined,
                idNo: typeof x?.idNo === 'string' ? x.idNo : undefined,
                nationality: typeof x?.nationality === 'string' ? x.nationality : undefined,
                dob: typeof x?.dob === 'string' ? x.dob : undefined,
                address: typeof x?.address === 'string' ? x.address : undefined,
                phone: typeof x?.phone === 'string' ? x.phone : undefined,
                isByBridgeNominee: typeof x?.isByBridgeNominee === 'boolean' ? x.isByBridgeNominee : undefined,
              }))
              .filter((x) => !!x.fullName)
          : [],
        packetId: String((r as DirectorChangeRequest).packetId ?? ''),
        createdAt: String((r as DirectorChangeRequest).createdAt ?? nowIso()),
        updatedAt: typeof (r as DirectorChangeRequest).updatedAt === 'string' ? (r as DirectorChangeRequest).updatedAt : undefined,
        submittedAt: typeof (r as DirectorChangeRequest).submittedAt === 'string' ? (r as DirectorChangeRequest).submittedAt : undefined,
        signedAt: typeof (r as DirectorChangeRequest).signedAt === 'string' ? (r as DirectorChangeRequest).signedAt : undefined,
        decidedAt: typeof (r as DirectorChangeRequest).decidedAt === 'string' ? (r as DirectorChangeRequest).decidedAt : undefined,
        decidedByUserId:
          typeof (r as DirectorChangeRequest).decidedByUserId === 'string' ? (r as DirectorChangeRequest).decidedByUserId : undefined,
        decisionNote: typeof (r as DirectorChangeRequest).decisionNote === 'string' ? (r as DirectorChangeRequest).decisionNote : undefined,
      }))
    : [];

  const rawCompanyUpdateRequests = (parsed as unknown as { companyUpdateRequests?: unknown }).companyUpdateRequests;
  const companyUpdateRequests: CompanyUpdateRequest[] = Array.isArray(rawCompanyUpdateRequests)
    ? (rawCompanyUpdateRequests as unknown as CompanyUpdateRequest[]).map((r) => ({
        id: String((r as CompanyUpdateRequest).id ?? ''),
        clientId: String((r as CompanyUpdateRequest).clientId ?? ''),
        type: (r as CompanyUpdateRequest).type,
        status: (r as CompanyUpdateRequest).status ?? 'PENDING_SIGNATURES',
        payload:
          typeof (r as CompanyUpdateRequest).payload === 'object' && (r as CompanyUpdateRequest).payload
            ? ((r as CompanyUpdateRequest).payload as Record<string, unknown>)
            : {},
        createdByUserId: String((r as CompanyUpdateRequest).createdByUserId ?? ''),
        packetId: String((r as CompanyUpdateRequest).packetId ?? ''),
        createdAt: String((r as CompanyUpdateRequest).createdAt ?? nowIso()),
        updatedAt: typeof (r as CompanyUpdateRequest).updatedAt === 'string' ? (r as CompanyUpdateRequest).updatedAt : undefined,
        submittedAt: typeof (r as CompanyUpdateRequest).submittedAt === 'string' ? (r as CompanyUpdateRequest).submittedAt : undefined,
        signedAt: typeof (r as CompanyUpdateRequest).signedAt === 'string' ? (r as CompanyUpdateRequest).signedAt : undefined,
        decidedAt: typeof (r as CompanyUpdateRequest).decidedAt === 'string' ? (r as CompanyUpdateRequest).decidedAt : undefined,
        decidedByUserId: typeof (r as CompanyUpdateRequest).decidedByUserId === 'string' ? (r as CompanyUpdateRequest).decidedByUserId : undefined,
        decisionNote: typeof (r as CompanyUpdateRequest).decisionNote === 'string' ? (r as CompanyUpdateRequest).decisionNote : undefined,
      }))
    : [];

  const rawRorcDeclarationRequests = (parsed as unknown as { rorcDeclarationRequests?: unknown }).rorcDeclarationRequests;
  const rorcDeclarationRequests: RorcDeclarationRequest[] = Array.isArray(rawRorcDeclarationRequests)
    ? (rawRorcDeclarationRequests as unknown as RorcDeclarationRequest[]).map((r) => ({
        id: String((r as RorcDeclarationRequest).id ?? ''),
        clientId: String((r as RorcDeclarationRequest).clientId ?? ''),
        status: (r as RorcDeclarationRequest).status ?? 'PENDING_SIGNATURES',
        effectiveDate: String((r as RorcDeclarationRequest).effectiveDate ?? ''),
        message: typeof (r as RorcDeclarationRequest).message === 'string' ? (r as RorcDeclarationRequest).message : undefined,
        removeRorcRoleIds: Array.isArray((r as RorcDeclarationRequest).removeRorcRoleIds)
          ? (r as RorcDeclarationRequest).removeRorcRoleIds.map((x) => String(x)).filter(Boolean)
          : [],
        addControllers: Array.isArray((r as RorcDeclarationRequest).addControllers)
          ? (r as RorcDeclarationRequest).addControllers
              .map((x) => ({
                fullName: typeof x?.fullName === 'string' ? x.fullName : '',
                email: typeof x?.email === 'string' ? x.email : undefined,
              }))
              .filter((x) => !!x.fullName)
          : [],
        createdByUserId: String((r as RorcDeclarationRequest).createdByUserId ?? ''),
        packetId: String((r as RorcDeclarationRequest).packetId ?? ''),
        createdAt: String((r as RorcDeclarationRequest).createdAt ?? nowIso()),
        updatedAt: typeof (r as RorcDeclarationRequest).updatedAt === 'string' ? (r as RorcDeclarationRequest).updatedAt : undefined,
        submittedAt: typeof (r as RorcDeclarationRequest).submittedAt === 'string' ? (r as RorcDeclarationRequest).submittedAt : undefined,
        signedAt: typeof (r as RorcDeclarationRequest).signedAt === 'string' ? (r as RorcDeclarationRequest).signedAt : undefined,
        decidedAt: typeof (r as RorcDeclarationRequest).decidedAt === 'string' ? (r as RorcDeclarationRequest).decidedAt : undefined,
        decidedByUserId: typeof (r as RorcDeclarationRequest).decidedByUserId === 'string' ? (r as RorcDeclarationRequest).decidedByUserId : undefined,
        decisionNote: typeof (r as RorcDeclarationRequest).decisionNote === 'string' ? (r as RorcDeclarationRequest).decisionNote : undefined,
      }))
    : [];

  const rawAnnualGeneralMeetingRequests = (parsed as unknown as { annualGeneralMeetingRequests?: unknown }).annualGeneralMeetingRequests;
  const annualGeneralMeetingRequests: AnnualGeneralMeetingRequest[] = Array.isArray(rawAnnualGeneralMeetingRequests)
    ? (rawAnnualGeneralMeetingRequests as unknown as AnnualGeneralMeetingRequest[]).map((r) => ({
        id: String((r as AnnualGeneralMeetingRequest).id ?? ''),
        clientId: String((r as AnnualGeneralMeetingRequest).clientId ?? ''),
        status: (r as AnnualGeneralMeetingRequest).status ?? 'PENDING_SIGNATURES',
        meetingDate: String((r as AnnualGeneralMeetingRequest).meetingDate ?? ''),
        meetingVenue: String((r as AnnualGeneralMeetingRequest).meetingVenue ?? ''),
        chairman: String((r as AnnualGeneralMeetingRequest).chairman ?? ''),
        agendaSummary: typeof (r as AnnualGeneralMeetingRequest).agendaSummary === 'string' ? (r as AnnualGeneralMeetingRequest).agendaSummary : undefined,
        createdByUserId: String((r as AnnualGeneralMeetingRequest).createdByUserId ?? ''),
        packetId: String((r as AnnualGeneralMeetingRequest).packetId ?? ''),
        createdAt: String((r as AnnualGeneralMeetingRequest).createdAt ?? nowIso()),
        updatedAt: typeof (r as AnnualGeneralMeetingRequest).updatedAt === 'string' ? (r as AnnualGeneralMeetingRequest).updatedAt : undefined,
        submittedAt: typeof (r as AnnualGeneralMeetingRequest).submittedAt === 'string' ? (r as AnnualGeneralMeetingRequest).submittedAt : undefined,
        signedAt: typeof (r as AnnualGeneralMeetingRequest).signedAt === 'string' ? (r as AnnualGeneralMeetingRequest).signedAt : undefined,
        decidedAt: typeof (r as AnnualGeneralMeetingRequest).decidedAt === 'string' ? (r as AnnualGeneralMeetingRequest).decidedAt : undefined,
        decidedByUserId: typeof (r as AnnualGeneralMeetingRequest).decidedByUserId === 'string' ? (r as AnnualGeneralMeetingRequest).decidedByUserId : undefined,
        decisionNote: typeof (r as AnnualGeneralMeetingRequest).decisionNote === 'string' ? (r as AnnualGeneralMeetingRequest).decisionNote : undefined,
      }))
    : [];

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

  const incorporationApplications: IncorporationApplication[] = Array.isArray(
    (parsed as unknown as { incorporationApplications?: unknown }).incorporationApplications,
  )
    ? (((parsed as unknown as { incorporationApplications?: IncorporationApplication[] }).incorporationApplications ?? []) as IncorporationApplication[])
    : [];
  const incorporationApplicationEvents: IncorporationApplicationEvent[] = Array.isArray(
    (parsed as unknown as { incorporationApplicationEvents?: unknown }).incorporationApplicationEvents,
  )
    ? (((parsed as unknown as { incorporationApplicationEvents?: IncorporationApplicationEvent[] }).incorporationApplicationEvents ?? []) as IncorporationApplicationEvent[])
    : [];
  const incorporationApplicationFiles: IncorporationApplicationFile[] = Array.isArray(
    (parsed as unknown as { incorporationApplicationFiles?: unknown }).incorporationApplicationFiles,
  )
    ? (((parsed as unknown as { incorporationApplicationFiles?: IncorporationApplicationFile[] }).incorporationApplicationFiles ?? []) as IncorporationApplicationFile[])
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
    directorChangeRequests,
    companyUpdateRequests,
    rorcDeclarationRequests,
    annualGeneralMeetingRequests,
    incorporationApplications,
    incorporationApplicationEvents,
    incorporationApplicationFiles,
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
    const g = getGlobalDbCache();
    g.__gosDbCache = { db, ts: Date.now() };
    return;
  }
  if (await hasRedis()) {
    const redis = await getRedisClient();
    await redis.set(KV_DB_KEY, JSON.stringify(db));
    const g = getGlobalDbCache();
    g.__gosDbCache = { db, ts: Date.now() };
    return;
  }
  await ensureDir();
  await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
  const g = getGlobalDbCache();
  g.__gosDbCache = { db, ts: Date.now() };
}

export async function readDb(): Promise<Db> {
  const ttl = getDbCacheTtlMs();
  const g = getGlobalDbCache();
  const cached = g.__gosDbCache;
  if (cached && ttl > 0 && Date.now() - cached.ts < ttl) return cached.db;
  if (g.__gosDbCachePromise) return g.__gosDbCachePromise;

  g.__gosDbCachePromise = (async () => {
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
  if (migrateClientCountryOfIncorporationV1(db)) changed = true;
  if (cleanupClientNameStatusSuffixes(db)) changed = true;
  if (seedSecretaryCompaniesFromScreenshot(db)) changed = true;
  if (seedSecretaryCompaniesFromScreenshot2(db)) changed = true;
  if (seedSecretaryCompaniesFromScreenshot3(db)) changed = true;
  if (seedSecretaryCompaniesFromScreenshot4(db)) changed = true;
  if (seedSecretaryCompaniesFromScreenshot5(db)) changed = true;
  if (seedSecretaryCompaniesFromScreenshot6(db)) changed = true;
  if (seedSecretaryCompaniesFromScreenshot7(db)) changed = true;
  if (dedupeClientsByNormalizedNameAlways(db)) changed = true;
  if (inferMissingPersonIdTypesFromIdNo(db)) changed = true;
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
  g.__gosDbCache = { db, ts: Date.now() };
  return db;
  })();

  try {
    return await g.__gosDbCachePromise;
  } finally {
    g.__gosDbCachePromise = undefined;
  }
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
      | 'countryOfIncorporation'
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

  if (typeof patch.code === 'string') {
    const nextCode = patch.code.trim();
    const currentCode = String(current.code ?? '').trim();
    if (nextCode && nextCode !== currentCode) {
      const norm = nextCode.toLowerCase();
      const exists = db.clients.some((c) => c.id !== clientId && !c.deletedAt && String(c.code ?? '').trim().toLowerCase() === norm);
      if (exists) throw new Error('DUPLICATE_CLIENT_CODE');
    }
  }

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
  const rolesByPersonIdByClientId = new Map<string, Map<string, Set<ClientPartyRole['role']>>>();

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

      const m = rolesByPersonIdByClientId.get(personId) ?? new Map<string, Set<ClientPartyRole['role']>>();
      const set = m.get(client.id) ?? new Set<ClientPartyRole['role']>();
      set.add(r.role);
      m.set(client.id, set);
      rolesByPersonIdByClientId.set(personId, m);
    }
  }

  return activePersons.map((p) => ({
    person: p,
    roleTags: [...(tagsByPersonId.get(p.id) ?? new Set())],
    companyCount: (clientIdsByPersonId.get(p.id) ?? new Set()).size,
    companyNames: [...(clientNamesByPersonId.get(p.id) ?? new Set())].sort((a, b) => a.localeCompare(b)),
    companyRoles: (() => {
      const m = rolesByPersonIdByClientId.get(p.id);
      if (!m) return [];
      const rows = [...m.entries()]
        .map(([clientId, roles]) => {
          const client = clientById.get(clientId);
          if (!client || client.deletedAt) return null;
          return {
            clientId,
            clientName: client.name,
            roles: [...roles].sort((a, b) => a.localeCompare(b)),
          };
        })
        .filter(Boolean) as Array<{ clientId: string; clientName: string; roles: ClientPartyRole['role'][] }>;
      rows.sort((a, b) => a.clientName.localeCompare(b.clientName));
      return rows;
    })(),
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
  return '123456';
}

export async function touchPersonLastLoginDateByEmail(email: string) {
  const emailKey = email.trim().toLowerCase();
  if (!emailKey) return { ok: false as const, error: 'INVALID_INPUT' as const };
  const db = await readDb();
  const idx = db.persons.findIndex((p) => (p.email ?? '').trim().toLowerCase() === emailKey);
  if (idx < 0) return { ok: false as const, error: 'NOT_FOUND' as const };
  const now = nowIso();
  const prev = db.persons[idx];
  db.persons[idx] = { ...prev, lastLoginDate: now, updatedAt: now };
  await writeDb(db);
  return { ok: true as const };
}

export async function setClientPasswordForPerson(input: { personId: string; newPassword: string }) {
  const personId = input.personId.trim();
  const newPassword = input.newPassword;
  if (!personId || !newPassword) return { ok: false as const, error: 'INVALID_INPUT' as const };
  const db = await readDb();
  const person = db.persons.find((p) => p.id === personId) ?? null;
  const email = person?.email?.trim() ?? '';
  if (!person || !email) return { ok: false as const, error: 'NOT_FOUND' as const };
  if (!person.lastLoginDate) return { ok: false as const, error: 'NOT_LOGGED_IN' as const };
  const user = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null;
  if (!user || user.role !== 'client') return { ok: false as const, error: 'NO_LOGIN' as const };
  await setUserPassword(user.id, newPassword);
  return { ok: true as const };
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
  const expiresAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();

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
  const person = db.persons.find((p) => (p.email ?? '').trim().toLowerCase() === request.email.trim().toLowerCase()) ?? null;
  const rdr =
    packet.relatedType === 'RDR'
      ? (db.representativeDesignationRequests.find((x) => x.id === packet.relatedId) ?? null)
      : null;
  return { request, packet, document, rdr, person };
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
  if ((t as any).status === 'APPROVED' || (t as any).status === 'REJECTED') return;
  const sta = db.signaturePackets.find((p) => p.id === t.staPacketId) ?? null;
  const br = db.signaturePackets.find((p) => p.id === t.brPacketId) ?? null;
  if (!sta || !br) return;
  const csCertPackets = db.signaturePackets.filter(
    (p) => p.relatedType === 'SHARE_TRANSFER' && p.relatedId === t.id && p.kind === 'CS_CERT',
  );
  const csOk = csCertPackets.length === 0 || csCertPackets.every((p) => p.status === 'SIGNED');
  if (sta.status === 'SIGNED' && br.status === 'SIGNED' && csOk) {
    db.shareTransfers[idx] = { ...t, status: 'PENDING_REVIEW', updatedAt: nowIso(), blockingRdrIds: undefined };
  }
}

async function finalizeDirectorChangeIfReady(db: Db, packet: SignaturePacket) {
  if (packet.relatedType !== 'DIRECTOR_CHANGE') return;
  if (packet.status !== 'SIGNED') return;

  const packets = db.signaturePackets.filter((p) => p.relatedType === 'DIRECTOR_CHANGE' && p.relatedId === packet.relatedId);
  if (!packets.length) return;
  if (!packets.every((p) => p.status === 'SIGNED')) return;

  const list = Array.isArray((db as unknown as { directorChangeRequests?: unknown }).directorChangeRequests)
    ? (((db as unknown as { directorChangeRequests?: DirectorChangeRequest[] }).directorChangeRequests ?? []) as DirectorChangeRequest[])
    : [];
  const idx = list.findIndex((r) => r.id === packet.relatedId);
  if (idx < 0) return;
  const r = list[idx];
  if (r.status !== 'PENDING_SIGNATURES') return;
  const now = nowIso();
  list[idx] = { ...r, status: 'PENDING_REVIEW', signedAt: now, updatedAt: now };
  (db as unknown as { directorChangeRequests?: DirectorChangeRequest[] }).directorChangeRequests = list;
}

async function finalizeCompanyUpdateIfReady(db: Db, packet: SignaturePacket) {
  if (packet.relatedType !== 'COMPANY_UPDATE') return;
  if (packet.status !== 'SIGNED') return;

  const packets = db.signaturePackets.filter((p) => p.relatedType === 'COMPANY_UPDATE' && p.relatedId === packet.relatedId);
  if (!packets.length) return;
  if (!packets.every((p) => p.status === 'SIGNED')) return;

  const list = getCompanyUpdateRequestList(db);
  const idx = list.findIndex((r) => r.id === packet.relatedId);
  if (idx < 0) return;
  const r = list[idx];
  if (r.status !== 'PENDING_SIGNATURES') return;
  const now = nowIso();
  list[idx] = { ...r, status: 'PENDING_REVIEW', signedAt: now, updatedAt: now };
  (db as unknown as { companyUpdateRequests?: CompanyUpdateRequest[] }).companyUpdateRequests = list;
}

async function finalizeRorcDeclarationIfReady(db: Db, packet: SignaturePacket) {
  if (packet.relatedType !== 'RORC_DECLARATION') return;
  if (packet.status !== 'SIGNED') return;

  const packets = db.signaturePackets.filter((p) => p.relatedType === 'RORC_DECLARATION' && p.relatedId === packet.relatedId);
  if (!packets.length) return;
  if (!packets.every((p) => p.status === 'SIGNED')) return;

  const list = Array.isArray((db as unknown as { rorcDeclarationRequests?: unknown }).rorcDeclarationRequests)
    ? (((db as unknown as { rorcDeclarationRequests?: RorcDeclarationRequest[] }).rorcDeclarationRequests ?? []) as RorcDeclarationRequest[])
    : [];
  const idx = list.findIndex((r) => r.id === packet.relatedId);
  if (idx < 0) return;
  const r = list[idx];
  if (r.status !== 'PENDING_SIGNATURES') return;
  const now = nowIso();
  list[idx] = { ...r, status: 'PENDING_REVIEW', signedAt: now, updatedAt: now };
  (db as unknown as { rorcDeclarationRequests?: RorcDeclarationRequest[] }).rorcDeclarationRequests = list;
}

async function finalizeAgmIfReady(db: Db, packet: SignaturePacket) {
  if (packet.relatedType !== 'ANNUAL_GENERAL_MEETING') return;
  if (packet.status !== 'SIGNED') return;

  const packets = db.signaturePackets.filter((p) => p.relatedType === 'ANNUAL_GENERAL_MEETING' && p.relatedId === packet.relatedId);
  if (!packets.length) return;
  if (!packets.every((p) => p.status === 'SIGNED')) return;

  const list = Array.isArray((db as unknown as { annualGeneralMeetingRequests?: unknown }).annualGeneralMeetingRequests)
    ? (((db as unknown as { annualGeneralMeetingRequests?: AnnualGeneralMeetingRequest[] }).annualGeneralMeetingRequests ?? []) as AnnualGeneralMeetingRequest[])
    : [];
  const idx = list.findIndex((r) => r.id === packet.relatedId);
  if (idx < 0) return;
  const r = list[idx];
  if (r.status !== 'PENDING_SIGNATURES') return;
  const now = nowIso();
  list[idx] = { ...r, status: 'PENDING_REVIEW', signedAt: now, updatedAt: now };
  (db as unknown as { annualGeneralMeetingRequests?: AnnualGeneralMeetingRequest[] }).annualGeneralMeetingRequests = list;
}

export async function signByToken(input: {
  token: string;
  otp: string;
  ip?: string;
  userAgent?: string;
  rdrRepresentativeName?: string;
  rdrRepresentativeEmail?: string;
  signerFullName?: string;
  signerTitle?: string;
  signerIdType?: string;
  signerIdNo?: string;
  signerPhone?: string;
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

  if (packet.relatedType === 'RORC_DECLARATION') {
    const knownPerson = db.persons.find((p) => (p.email ?? '').trim().toLowerCase() === req.email.trim().toLowerCase()) ?? null;
    if (!knownPerson) {
      const fullName = String(input.signerFullName ?? '').trim();
      const title = String(input.signerTitle ?? '').trim();
      const idType = String(input.signerIdType ?? '').trim().toUpperCase();
      const idNo = String(input.signerIdNo ?? '').trim();
      const phone = String(input.signerPhone ?? '').trim();
      if (!fullName || !title || !idNo || !phone) return { ok: false as const, error: 'SIGNER_PROFILE_REQUIRED' as const };
      if (idType !== 'NRIC' && idType !== 'FIN' && idType !== 'PASSPORT' && idType !== 'IC' && idType !== 'OTHER') {
        return { ok: false as const, error: 'INVALID_INPUT' as const };
      }
      nextReq.signerFullName = fullName;
      nextReq.signerTitle = title;
      nextReq.signerIdType = idType as any;
      nextReq.signerIdNo = idNo;
      nextReq.signerPhone = phone;
    }
  }

  db.signatureRequests[reqIdx] = nextReq;

  const all = db.signatureRequests.filter((r) => r.packetId === packet.id);
  if (all.length > 0 && all.every((r) => r.status === 'SIGNED')) {
    db.signaturePackets[packetIdx] = { ...packet, status: 'SIGNED', updatedAt: now };
    await finalizeRdrIfReady(db, db.signaturePackets[packetIdx]);
    await maybeFinalizeShareTransferIfReady(db, db.signaturePackets[packetIdx]);
    await finalizeDirectorChangeIfReady(db, db.signaturePackets[packetIdx]);
    await finalizeCompanyUpdateIfReady(db, db.signaturePackets[packetIdx]);
    await finalizeRorcDeclarationIfReady(db, db.signaturePackets[packetIdx]);
    await finalizeAgmIfReady(db, db.signaturePackets[packetIdx]);
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
    | { kind: 'EXISTING_PARTY'; partyId: string; representativePersonId?: string }
    | { kind: 'PERSON'; fullName: string; email: string }
    | { kind: 'COMPANY_CLIENT'; clientId: string };
  transferee:
    | { kind: 'EXISTING_PARTY'; partyId: string }
    | { kind: 'PERSON'; fullName: string; email: string }
    | {
        kind: 'NEW_PERSON';
        fullName: string;
        idType: string;
        idNo: string;
        dob: string;
        email: string;
        phone: string;
        nationality: string;
        address: string;
      }
    | {
        kind: 'NEW_COMPANY';
        companyName: string;
        registrationNo: string;
        countryOfIncorporation?: string;
        address: string;
        email?: string;
        phone?: string;
        corporateRepresentativeName?: string;
        corporateRepresentativeEmail?: string;
        directorSignerName?: string;
        directorSignerEmail?: string;
      }
    | { kind: 'COMPANY_CLIENT'; clientId: string; representativePersonId?: string };
  shares: number;
  valueSgd?: number;
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
  const valueSgd = Number(input.valueSgd);
  if (!Number.isFinite(valueSgd) || valueSgd < 0) return { ok: false as const, error: 'INVALID_INPUT' as const };

  const normalizeIdNo = (s: string) => String(s ?? '').trim().replace(/\s+/g, '').toLowerCase();

  const makePersonParty = (fullNameRaw: string, emailRaw: string, patch?: Partial<Pick<Person, 'phone' | 'idType' | 'idNo' | 'nationality' | 'dob' | 'address'>>) => {
    const fullName = fullNameRaw.trim();
    const email = emailRaw.trim();
    if (!fullName || !email) return null;
    const person: Person = {
      id: newId('per'),
      fullName,
      email,
      phone: patch?.phone,
      idType: patch?.idType as any,
      idNo: patch?.idNo,
      nationality: patch?.nationality,
      dob: patch?.dob,
      address: patch?.address,
      createdAt: now,
      updatedAt: now,
    };
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

  const ensureCompanyRepresentativeIfNeeded = (companyParty: Party, personIdRaw: string) => {
    const personId = String(personIdRaw ?? '').trim();
    if (!personId) return { ok: false as const };
    if (!companyParty.clientId) return { ok: false as const };

    const activeRep = db.companyRepresentatives
      .filter((r) => r.companyPartyId === companyParty.id && r.scope === 'GLOBAL')
      .find((r) => !r.effectiveTo);
    const now = nowIso();
    if (activeRep) {
      if (activeRep.representativePersonId === personId) return { ok: true as const, personId: activeRep.representativePersonId };
      const i = db.companyRepresentatives.findIndex((r) => r.id === activeRep.id);
      if (i >= 0) db.companyRepresentatives[i] = { ...db.companyRepresentatives[i], effectiveTo: now, updatedAt: now };
    }

    const person = db.persons.find((p) => p.id === personId) ?? null;
    if (!person || !(person.email ?? '').trim()) return { ok: false as const };

    const isDirector = db.clientPartyRoles.some((r) => {
      if (r.clientId !== companyParty.clientId) return false;
      if (r.role !== 'DIRECTOR' || r.resignationDate) return false;
      const party = db.parties.find((p) => p.id === r.partyId) ?? null;
      return !!party && party.type === 'PERSON' && party.personId === personId;
    });
    if (!isDirector) return { ok: false as const };

    const rep: CompanyRepresentative = {
      id: newId('rep'),
      companyPartyId: companyParty.id,
      representativePersonId: personId,
      scope: 'GLOBAL',
      effectiveFrom: now,
      createdAt: now,
      updatedAt: now,
    };
    db.companyRepresentatives.unshift(rep);
    return { ok: true as const, personId };
  };

  const ensureExternalCompanyParty = (data: {
    name: string;
    registrationNo?: string;
    jurisdiction?: string;
    address?: string;
    email?: string;
    phone?: string;
  }) => {
    const regKey = normalizeIdNo(String(data.registrationNo ?? ''));
    const existing =
      regKey ? db.externalCompanies.find((c) => normalizeIdNo(String(c.registrationNo ?? '')) === regKey) ?? null : null;
    const ext: ExternalCompany = existing
      ? { ...existing, name: data.name.trim() || existing.name, address: data.address, email: data.email, phone: data.phone, updatedAt: now }
      : {
          id: newId('exc'),
          name: data.name.trim(),
          registrationNo: data.registrationNo?.trim() || undefined,
          jurisdiction: data.jurisdiction?.trim() || undefined,
          address: data.address?.trim() || undefined,
          email: data.email?.trim() || undefined,
          phone: data.phone?.trim() || undefined,
          createdAt: now,
          updatedAt: now,
        };
    if (existing) {
      const i = db.externalCompanies.findIndex((c) => c.id === existing.id);
      if (i >= 0) db.externalCompanies[i] = ext;
    } else {
      db.externalCompanies.unshift(ext);
    }

    const partyExisting = db.parties.find((p) => p.type === 'COMPANY' && p.externalCompanyId === ext.id) ?? null;
    const party: Party = partyExisting
      ? { ...partyExisting, displayName: ext.name, updatedAt: now }
      : {
          id: newId('pty'),
          type: 'COMPANY',
          displayName: ext.name,
          externalCompanyId: ext.id,
          createdAt: now,
          updatedAt: now,
        };
    if (partyExisting) {
      const i = db.parties.findIndex((p) => p.id === partyExisting.id);
      if (i >= 0) db.parties[i] = party;
    } else {
      db.parties.unshift(party);
    }
    return { externalCompany: ext, party };
  };

  const ensureExistingShareholderParty = (partyId: string) => {
    const pid = String(partyId ?? '').trim();
    if (!pid) return null;
    const party = db.parties.find((p) => p.id === pid) ?? null;
    if (!party) return null;
    const active = db.clientPartyRoles.some(
      (r) => r.clientId === client.id && r.partyId === pid && r.role === 'SHAREHOLDER' && !r.toDate,
    );
    if (!active) return null;
    return { party };
  };

  const transferor =
    input.transferor.kind === 'EXISTING_PARTY'
      ? ensureExistingShareholderParty(input.transferor.partyId)
      : input.transferor.kind === 'PERSON'
        ? makePersonParty(input.transferor.fullName, input.transferor.email)
        : ensureCompanyParty(input.transferor.clientId);
  if (!transferor) return { ok: false as const, error: 'INVALID_INPUT' as const };

  if (input.transferor.kind === 'EXISTING_PARTY' && input.transferor.representativePersonId) {
    const companyParty = transferor.party;
    if (companyParty.type === 'COMPANY' && companyParty.clientId) {
      const ensured = ensureCompanyRepresentativeIfNeeded(companyParty, input.transferor.representativePersonId);
      if (!ensured.ok) return { ok: false as const, error: 'INVALID_INPUT' as const };
    }
  }
  const transferee =
    input.transferee.kind === 'EXISTING_PARTY'
      ? ensureExistingShareholderParty(input.transferee.partyId)
      : input.transferee.kind === 'NEW_PERSON'
        ? (() => {
            const idNoKey = normalizeIdNo(input.transferee.idNo);
            if (!idNoKey) return null;
            const existingPerson = db.persons.find((p) => normalizeIdNo(String(p.idNo ?? '')) === idNoKey) ?? null;
            if (existingPerson) {
              const party = db.parties.find((x) => x.type === 'PERSON' && x.personId === existingPerson.id) ?? null;
              if (party) return { party };
            }
            return makePersonParty(input.transferee.fullName, input.transferee.email, {
              phone: input.transferee.phone,
              idType: input.transferee.idType as any,
              idNo: input.transferee.idNo,
              nationality: input.transferee.nationality,
              dob: input.transferee.dob,
              address: input.transferee.address,
            });
          })()
        : input.transferee.kind === 'NEW_COMPANY'
          ? (() => {
              const regKey = normalizeIdNo(input.transferee.registrationNo);
              const hit = db.clients.find((c) => normalizeIdNo(c.companyRegistrationNo ?? '') === regKey && !c.deletedAt) ?? null;
              if (hit) return ensureCompanyParty(hit.id);

              if (!input.transferee.companyName?.trim() || !input.transferee.registrationNo?.trim() || !input.transferee.address?.trim()) {
                return null;
              }
              return ensureExternalCompanyParty({
                name: input.transferee.companyName,
                registrationNo: input.transferee.registrationNo,
                jurisdiction: String((input.transferee as any).countryOfIncorporation ?? (input.transferee as any).registrationCountry ?? '').trim() || undefined,
                address: input.transferee.address,
                email: input.transferee.email,
                phone: input.transferee.phone,
              });
            })()
          : input.transferee.kind === 'PERSON'
            ? makePersonParty(input.transferee.fullName, input.transferee.email)
            : ensureCompanyParty(input.transferee.clientId);
  if (!transferee) return { ok: false as const, error: 'INVALID_INPUT' as const };

  if (input.transferee.kind === 'COMPANY_CLIENT' && input.transferee.representativePersonId) {
    const companyParty = transferee.party;
    if (companyParty.type === 'COMPANY' && companyParty.clientId) {
      const ensured = ensureCompanyRepresentativeIfNeeded(companyParty, input.transferee.representativePersonId);
      if (!ensured.ok) return { ok: false as const, error: 'INVALID_INPUT' as const };
    }
  }

  const externalRdrConfigByPartyId = new Map<
    string,
    { companyName: string; repName: string; repEmail: string; signerEmail: string }
  >();
  if (input.transferee.kind === 'NEW_COMPANY') {
    const party = transferee.party;
    if (party.type === 'COMPANY' && party.externalCompanyId) {
      const repName = String(input.transferee.corporateRepresentativeName ?? '').trim();
      const repEmail = String(input.transferee.corporateRepresentativeEmail ?? '').trim();
      const signerEmail = String(input.transferee.directorSignerEmail ?? '').trim();
      if (!repName || !repEmail || !signerEmail) return { ok: false as const, error: 'INVALID_INPUT' as const };
      externalRdrConfigByPartyId.set(party.id, {
        companyName: party.displayName,
        repName,
        repEmail,
        signerEmail,
      });
    }
  }

  const transferorPartyId = transferor.party.id;
  const transfereePartyId = transferee.party.id;
  if (transferorPartyId === transfereePartyId) return { ok: false as const, error: 'INVALID_INPUT' as const };

  const transferorName = transferor.party.displayName;
  const transfereeName = transferee.party.displayName;

  const formatPersonIdTypeLabel = (t?: string | null, idNo?: string | null) => {
    const inferred = inferPersonIdTypeFromIdNo(idNo);
    const v = String(t ?? inferred ?? '').trim().toUpperCase();
    if (v === 'FIN') return 'FIN';
    if (v === 'NRIC') return 'NRIC';
    if (v === 'IC') return 'IC';
    if (v === 'PASSPORT') return 'Passport';
    if (!v) return undefined;
    return v;
  };

  const getPartyIdentityForDoc = (party: Party) => {
    if (party.type === 'PERSON') {
      const person = party.personId ? db.persons.find((p) => p.id === party.personId) ?? null : null;
      return {
        kind: 'PERSON' as const,
        name: party.displayName,
        idTypeLabel: formatPersonIdTypeLabel(person?.idType, person?.idNo),
        idNo: person?.idNo,
        nationality: person?.nationality,
      };
    }

    const companyRegNo = party.clientId
      ? db.clients.find((c) => c.id === party.clientId)?.companyRegistrationNo
      : party.externalCompanyId
        ? db.externalCompanies.find((c) => c.id === party.externalCompanyId)?.registrationNo
        : undefined;
    return {
      kind: 'COMPANY' as const,
      name: party.displayName,
      companyRegistrationNo: companyRegNo,
    };
  };

  const getSignerNameForParty = (party: Party) => {
    if (party.type === 'PERSON') return party.displayName;
    if (party.type === 'COMPANY') {
      const activeRep = db.companyRepresentatives
        .filter((r) => r.companyPartyId === party.id && r.scope === 'GLOBAL')
        .find((r) => !r.effectiveTo);
      if (!activeRep) return undefined;
      const person = db.persons.find((p) => p.id === activeRep.representativePersonId) ?? null;
      return person?.fullName;
    }
    return undefined;
  };

  const transferId = newId('stf');

  const staDoc: Document = {
    id: newId('doc'),
    type: 'STA',
    title: `Share Transfer Form - ${client.name}`,
    html: '',
    sha256: '',
    createdAt: now,
  };
  const brDoc: Document = {
    id: newId('doc'),
    type: 'BR',
    title: `Director Resolution - ${client.name}`,
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

  const directors = db.clientPartyRoles
    .filter((r) => r.clientId === client.id && r.role === 'DIRECTOR' && !r.resignationDate)
    .map((r) => db.parties.find((p) => p.id === r.partyId) ?? null)
    .filter((p): p is Party => !!p && p.type === 'PERSON' && !!p.personId)
    .map((p) => db.persons.find((x) => x.id === p.personId!) ?? null)
    .filter((p): p is Person => !!p);

  const staHtml = (await import('@/lib/docTemplates')).renderShareTransferAgreementHtml({
    targetCompanyName: client.name,
    transferor: getPartyIdentityForDoc(transferor.party),
    transferee: getPartyIdentityForDoc(transferee.party),
    transferorSignerName: getSignerNameForParty(transferor.party),
    transfereeSignerName: getSignerNameForParty(transferee.party),
    shares,
    valueSgd,
    shareClass,
    dateYmd: now.slice(0, 10),
  });
  const brHtml = (await import('@/lib/docTemplates')).renderShareTransferDirectorsResolutionHtml({
    companyName: client.name,
    companyRegistrationNo: client.companyRegistrationNo,
    considerationSgd: valueSgd,
    transferorName,
    transfereeName,
    shares,
    dateYmd: now.slice(0, 10),
    directors: directors.map((d) => d.fullName),
  });

  const staSha = sha256Hex(staHtml);
  const brSha = sha256Hex(brHtml);
  const staIdx = db.documents.findIndex((d) => d.id === staDoc.id);
  const brIdx = db.documents.findIndex((d) => d.id === brDoc.id);
  if (staIdx >= 0) db.documents[staIdx] = { ...db.documents[staIdx], html: staHtml, sha256: staSha };
  if (brIdx >= 0) db.documents[brIdx] = { ...db.documents[brIdx], html: brHtml, sha256: brSha };

  const directorEmails = directors.map((d) => d.email).filter((e): e is string => !!e && !!e.trim());
  if (directorEmails.length !== directors.length) return { ok: false as const, error: 'MISSING_SIGNER_EMAIL' as const };

  const brLinks: Array<{ email: string; url: string; signerRole: string; documentTitle: string }> = [];
  for (const email of directorEmails) {
    const token = newToken();
    const req: SignatureRequest = {
      id: newId('sgr'),
      packetId: brPacket.id,
      email,
      tokenHash: sha256Hex(token),
      expiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'PENDING',
      createdAt: now,
      updatedAt: now,
    };
    db.signatureRequests.unshift(req);
    brLinks.push({ email, url: `/sign/${token}`, signerRole: 'Director', documentTitle: brDoc.title });
  }

  const blockingRdrIds: string[] = [];
  const staSignerEmails: string[] = [];
  const rdrLinks: Array<{ email: string; url: string; signerRole: string; documentTitle: string }> = [];
  const csCertLinks: Array<{ email: string; url: string; signerRole: string; documentTitle: string }> = [];

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

  const isNonSingaporeClient = (clientId: string) => {
    const c = db.clients.find((x) => x.id === clientId) ?? null;
    if (!c || c.deletedAt) return false;
    const country = String((c as Client).countryOfIncorporation ?? '').trim().toLowerCase();
    if (!country) return false;
    return country !== 'singapore';
  };

  const ensureAutoRdr = async (companyParty: Party) => {
    const companyClientId = companyParty.clientId;
    if (!companyClientId && companyParty.externalCompanyId) {
      const cfg = externalRdrConfigByPartyId.get(companyParty.id) ?? null;
      if (!cfg) return null;

      const rdrId = newId('rdr');
      const html = (await import('@/lib/docTemplates')).renderRdrAuthorizationHtml({
        companyName: cfg.companyName,
        representativeName: cfg.repName,
        purpose: `Appoint a GLOBAL corporate representative for signing documents (Share Transfer).`,
        dateYmd: effectiveDate,
      });
      const doc: Document = {
        id: newId('doc'),
        type: 'RDR_AUTH',
        title: `Corporate Representative - ${cfg.companyName}`,
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
        representativeName: cfg.repName,
        representativeEmail: cfg.repEmail,
        packetId: packet.id,
        status: 'SIGNING',
        createdAt: now,
        updatedAt: now,
      };
      db.representativeDesignationRequests.unshift(rdr);

      const token = newToken();
      const req: SignatureRequest = {
        id: newId('sgr'),
        packetId: packet.id,
        email: cfg.signerEmail,
        tokenHash: sha256Hex(token),
        expiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'PENDING',
        createdAt: now,
        updatedAt: now,
      };
      db.signatureRequests.unshift(req);
      return { rdrId, links: [{ email: cfg.signerEmail, url: `/sign/${token}` }] };
    }
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
        expiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'PENDING',
        createdAt: now,
        updatedAt: now,
      };
      db.signatureRequests.unshift(req);
      links.push({ email, url: `/sign/${token}` });
    }

    return { rdrId, links };
  };

  const staSignerPairs: Array<{ email: string; signerRole: string }> = [];
  for (const party of [transferor.party, transferee.party]) {
    const email = resolveStaEmail(party);
    if (email) {
      const roleLabel =
        party.id === transferor.party.id
          ? party.type === 'COMPANY'
            ? 'Corporate Representative (Transferor)'
            : 'Transferor'
          : party.type === 'COMPANY'
            ? 'Corporate Representative (Transferee)'
            : 'Transferee';
      staSignerPairs.push({ email, signerRole: roleLabel });
      staSignerEmails.push(email);
      continue;
    }
    if (party.type === 'COMPANY') {
      const created = await ensureAutoRdr(party);
      if (!created) return { ok: false as const, error: 'MISSING_REPRESENTATIVE' as const };
      blockingRdrIds.push(created.rdrId);
      rdrLinks.push(
        ...created.links.map((l) => ({ ...l, signerRole: 'Director', documentTitle: `Corporate Representative - ${party.displayName}` })),
      );
      continue;
    }
    return { ok: false as const, error: 'MISSING_SIGNER_EMAIL' as const };
  }

  const documents: { shareTransferFormDocumentId: string; directorsResolutionDocumentId: string; corporateSecretaryCertificateDocumentId?: string } = {
    shareTransferFormDocumentId: staDoc.id,
    directorsResolutionDocumentId: brDoc.id,
  };

  if (transferee.party.type === 'COMPANY' && transferee.party.clientId && isNonSingaporeClient(transferee.party.clientId)) {
    const repEmail = resolveStaEmail(transferee.party);
    if (!repEmail) return { ok: false as const, error: 'MISSING_REPRESENTATIVE' as const };
    const repName = getSignerNameForParty(transferee.party);
    if (!repName) return { ok: false as const, error: 'MISSING_REPRESENTATIVE' as const };

    const foreignClient = db.clients.find((c) => c.id === transferee.party.clientId) ?? null;
    if (!foreignClient || foreignClient.deletedAt) return { ok: false as const, error: 'NOT_FOUND' as const };

    const foreignDirectors = db.clientPartyRoles
      .filter((r) => r.clientId === foreignClient.id && r.role === 'DIRECTOR' && !r.resignationDate)
      .map((r) => db.parties.find((p) => p.id === r.partyId) ?? null)
      .filter((p): p is Party => !!p && p.type === 'PERSON' && !!p.personId)
      .map((p) => db.persons.find((x) => x.id === p.personId!) ?? null)
      .filter((p): p is Person => !!p);

    const foreignDirectorEmails = foreignDirectors.map((d) => d.email).filter((e): e is string => !!e && !!e.trim());
    if (!foreignDirectorEmails.length) return { ok: false as const, error: 'MISSING_SIGNER_EMAIL' as const };

    const byBridgeCorporateSecretaryName = 'Bybridge Consultancy Pte Ltd';
    const country = String((foreignClient as Client).countryOfIncorporation ?? '').trim();
    const csHtml = (await import('@/lib/docTemplates')).renderCertificateOfAppointmentOfCorporateSecretaryHtml({
      companyName: foreignClient.name,
      companyRegistrationNo: foreignClient.companyRegistrationNo,
      countryOfIncorporation: country,
      corporateSecretaryName: byBridgeCorporateSecretaryName,
      corporateRepresentativeName: repName,
      directorNames: foreignDirectors.map((d) => d.fullName),
      dateYmd: now.slice(0, 10),
    });

    const csDoc: Document = {
      id: newId('doc'),
      type: 'CS_CERT',
      title: `Certificate of Appointment of Corporate Secretary - ${foreignClient.name}`,
      html: csHtml,
      sha256: sha256Hex(csHtml),
      createdAt: now,
    };
    db.documents.unshift(csDoc);

    const packet: SignaturePacket = {
      id: newId('spk'),
      kind: 'CS_CERT',
      relatedType: 'SHARE_TRANSFER',
      relatedId: transferId,
      documentId: csDoc.id,
      status: 'SIGNING',
      createdAt: now,
      updatedAt: now,
    };
    db.signaturePackets.unshift(packet);

    const uniqueEmails = Array.from(new Set([...foreignDirectorEmails, repEmail].map((e) => e.trim().toLowerCase()).filter(Boolean)));
    for (const email of uniqueEmails) {
      const token = newToken();
      const req: SignatureRequest = {
        id: newId('sgr'),
        packetId: packet.id,
        email,
        tokenHash: sha256Hex(token),
        expiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'PENDING',
        createdAt: now,
        updatedAt: now,
      };
      db.signatureRequests.unshift(req);
      csCertLinks.push({
        email,
        url: `/sign/${token}`,
        signerRole: email === repEmail.trim().toLowerCase() ? 'Corporate Representative' : 'Director',
        documentTitle: csDoc.title,
      });
    }

    documents.corporateSecretaryCertificateDocumentId = csDoc.id;
  }

  const staLinks: Array<{ email: string; url: string; signerRole: string; documentTitle: string }> = [];
  if (blockingRdrIds.length === 0) {
    (staPacket as unknown as { status: SignaturePacket['status'] }).status = 'SIGNING';
    const uniqueStaEmails = Array.from(new Set(staSignerEmails.map((e) => e.trim().toLowerCase()).filter(Boolean)));
    for (const emailKey of uniqueStaEmails) {
      const token = newToken();
      const req: SignatureRequest = {
        id: newId('sgr'),
        packetId: staPacket.id,
        email: emailKey,
        tokenHash: sha256Hex(token),
        expiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'PENDING',
        createdAt: now,
        updatedAt: now,
      };
      db.signatureRequests.unshift(req);
      const role =
        staSignerPairs
          .filter((p) => p.email.trim().toLowerCase() === emailKey)
          .map((p) => p.signerRole)
          .filter(Boolean);
      const signerRole = role.length ? Array.from(new Set(role)).join(' & ') : 'Signatory';
      staLinks.push({ email: emailKey, url: `/sign/${token}`, signerRole, documentTitle: staDoc.title });
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
    valueSgd,
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
  return {
    ok: true as const,
    transfer,
    documents,
    signLinks: { br: brLinks, sta: staLinks, rdr: rdrLinks, cs: csCertLinks },
  };
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

  const uniqueEmails = Array.from(new Set((emails as string[]).map((e) => e.trim().toLowerCase()).filter(Boolean)));

  const now = nowIso();
  const links: Array<{ email: string; url: string }> = [];
  for (const email of uniqueEmails) {
    const exists = db.signatureRequests.some(
      (r) => r.packetId === staPacket.id && r.email.trim().toLowerCase() === email && r.status !== 'REVOKED' && r.status !== 'EXPIRED',
    );
    if (exists) continue;
    const token = newToken();
    const req: SignatureRequest = {
      id: newId('sgr'),
      packetId: staPacket.id,
      email,
      tokenHash: sha256Hex(token),
      expiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
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

export async function decideShareTransfer(input: {
  transferId: string;
  decidedByUserId: string;
  decision: 'APPROVE' | 'REJECT' | 'NEED_MORE_INFO';
  note?: string;
}) {
  const db = await readDb();
  const idx = db.shareTransfers.findIndex((t) => t.id === input.transferId);
  if (idx < 0) return { ok: false as const, error: 'NOT_FOUND' as const };
  const t = db.shareTransfers[idx];
  const st = String((t as any).status ?? '');
  if (st === 'APPLIED' || st === 'APPROVED' || st === 'REJECTED') return { ok: false as const, error: 'INVALID_STATE' as const };

  const now = nowIso();
  const nextStatus: ShareTransfer['status'] =
    input.decision === 'APPROVE' ? 'APPROVED' : input.decision === 'REJECT' ? 'REJECTED' : 'NEED_MORE_INFO';

  const packets = db.signaturePackets.filter((p) => p.relatedType === 'SHARE_TRANSFER' && p.relatedId === t.id);
  const allSigned = packets.length > 0 && packets.every((p) => p.status === 'SIGNED');
  if (input.decision === 'APPROVE') {
    if (st !== 'SIGNING' && st !== 'PENDING_REVIEW' && st !== 'SIGNED') return { ok: false as const, error: 'INVALID_STATE' as const };

    const applyYmd = now.slice(0, 10);
    const transferorRole =
      db.clientPartyRoles.find(
        (r) => r.clientId === t.clientId && r.partyId === t.transferorPartyId && r.role === 'SHAREHOLDER' && seedIsActiveRole(r),
      ) ?? null;
    if (!transferorRole || typeof transferorRole.shares !== 'number' || !Number.isFinite(transferorRole.shares)) {
      return { ok: false as const, error: 'INVALID_STATE' as const };
    }
    if (transferorRole.shares < t.shares) return { ok: false as const, error: 'INVALID_INPUT' as const };

    const newTransferorShares = transferorRole.shares - t.shares;
    transferorRole.shares = newTransferorShares;
    if (t.shareClass && !transferorRole.shareClass) transferorRole.shareClass = t.shareClass;
    if (newTransferorShares <= 0) transferorRole.toDate = applyYmd;
    transferorRole.updatedAt = now;

    const transfereeActive =
      db.clientPartyRoles.find(
        (r) => r.clientId === t.clientId && r.partyId === t.transfereePartyId && r.role === 'SHAREHOLDER' && seedIsActiveRole(r),
      ) ?? null;
    if (transfereeActive) {
      const prev = Number(transfereeActive.shares ?? 0);
      transfereeActive.shares = Number.isFinite(prev) ? prev + t.shares : t.shares;
      if (t.shareClass && !transfereeActive.shareClass) transfereeActive.shareClass = t.shareClass;
      transfereeActive.updatedAt = now;
    } else {
      const role: ClientPartyRole = {
        id: newId('cpr'),
        clientId: t.clientId,
        partyId: t.transfereePartyId,
        role: 'SHAREHOLDER',
        shareClass: t.shareClass,
        shares: t.shares,
        fromDate: applyYmd,
        createdAt: now,
        updatedAt: now,
      };
      db.clientPartyRoles.unshift(role);
    }
  } else {
    if (st !== 'SIGNING' && st !== 'PENDING_REVIEW' && st !== 'SIGNED') return { ok: false as const, error: 'INVALID_STATE' as const };
  }

  db.shareTransfers[idx] = {
    ...t,
    status: nextStatus,
    decidedAt: now,
    decidedByUserId: input.decidedByUserId,
    decisionNote: typeof input.note === 'string' ? input.note : undefined,
    updatedAt: now,
  };
  await writeDb(db);
  return { ok: true as const, transfer: db.shareTransfers[idx] };
}

export async function listDirectorChangeRequestsByClient(clientId: string) {
  const db = await readDb();
  const list = Array.isArray((db as unknown as { directorChangeRequests?: unknown }).directorChangeRequests)
    ? (((db as unknown as { directorChangeRequests?: DirectorChangeRequest[] }).directorChangeRequests ?? []) as DirectorChangeRequest[])
    : [];
  return list
    .filter((r) => r.clientId === clientId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getDirectorChangeRequestContext(requestId: string) {
  const db = await readDb();
  const list = Array.isArray((db as unknown as { directorChangeRequests?: unknown }).directorChangeRequests)
    ? (((db as unknown as { directorChangeRequests?: DirectorChangeRequest[] }).directorChangeRequests ?? []) as DirectorChangeRequest[])
    : [];
  const request = list.find((r) => r.id === requestId) ?? null;
  if (!request) return null;

  const packets = db.signaturePackets
    .filter((p) => p.relatedType === 'DIRECTOR_CHANGE' && p.relatedId === requestId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (!packets.length) return null;

  const docsById = new Map(db.documents.map((d) => [d.id, d]));
  const documents = packets.map((p) => docsById.get(p.documentId)).filter(Boolean) as Document[];
  if (!documents.length) return null;

  const packetIds = new Set(packets.map((p) => p.id));
  const signatures = db.signatureRequests
    .filter((r) => packetIds.has(r.packetId))
    .sort((a, b) => (a.packetId !== b.packetId ? a.packetId.localeCompare(b.packetId) : a.email.localeCompare(b.email)));

  return { request, packets, documents, signatures };
}

export async function createDirectorChangeRequest(input: {
  clientId: string;
  createdByUserId: string;
  effectiveDate: string;
  resignationDateYmd?: string;
  message?: string;
  useByBridgeNomineeDirector?: boolean;
  removeDirectorRoleIds: string[];
  addDirectors: Array<{
    fullName: string;
    email: string;
    idTypeLabel?: 'Passport No.' | 'NRIC No.' | 'FIN No.' | 'IC No.' | 'ID No.';
    idNo?: string;
    nationality?: string;
    dob?: string;
    address?: string;
    phone?: string;
    isByBridgeNominee?: boolean;
  }>;
}) {
  const db = await readDb();
  const client = db.clients.find((c) => c.id === input.clientId) ?? null;
  if (!client || client.deletedAt) return { ok: false as const, error: 'NOT_FOUND' as const };

  const effectiveDate = input.effectiveDate.trim();
  if (!effectiveDate) return { ok: false as const, error: 'INVALID_INPUT' as const };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) return { ok: false as const, error: 'INVALID_INPUT' as const };
  {
    const now = nowIso().slice(0, 10);
    const d = new Date(`${now}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() - 14);
    const min = d.toISOString().slice(0, 10);
    if (effectiveDate < min || effectiveDate > now) return { ok: false as const, error: 'INVALID_INPUT' as const };
  }

  const resignationDateYmd = String(input.resignationDateYmd ?? '').trim();
  if (input.removeDirectorRoleIds.length && !resignationDateYmd) return { ok: false as const, error: 'INVALID_INPUT' as const };
  if (resignationDateYmd) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(resignationDateYmd)) return { ok: false as const, error: 'INVALID_INPUT' as const };
    const now = nowIso().slice(0, 10);
    const d = new Date(`${now}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() - 14);
    const min = d.toISOString().slice(0, 10);
    if (resignationDateYmd < min || resignationDateYmd > now) return { ok: false as const, error: 'INVALID_INPUT' as const };
  }

  const removeDirectorRoleIds = Array.isArray(input.removeDirectorRoleIds)
    ? input.removeDirectorRoleIds.map((x) => String(x).trim()).filter(Boolean)
    : [];

  const byBridgeNomineeDirector = {
    fullName: 'Xue Hongwei',
    email: 'hwxue1222@gmail.com',
    idTypeLabel: 'NRIC No.' as const,
    idNo: 'S7864540G',
    nationality: 'Singapore PR',
    dob: '1978-12-22',
    address: 'BLK 842',
    phone: '+6590888596',
    isByBridgeNominee: true,
  };

  const addDirectorsRaw = Array.isArray(input.addDirectors) ? input.addDirectors : [];
  const addDirectors = addDirectorsRaw
    .map((x) => ({
      fullName: String(x?.fullName ?? '').trim(),
      email: String(x?.email ?? '').trim().toLowerCase(),
      idTypeLabel: typeof x?.idTypeLabel === 'string' ? (x.idTypeLabel as any) : undefined,
      idNo: typeof x?.idNo === 'string' ? x.idNo.trim() : undefined,
      nationality: typeof x?.nationality === 'string' ? x.nationality.trim() : undefined,
      dob: typeof x?.dob === 'string' ? x.dob.trim() : undefined,
      address: typeof x?.address === 'string' ? x.address.trim() : undefined,
      phone: typeof x?.phone === 'string' ? x.phone.trim() : undefined,
      isByBridgeNominee: typeof x?.isByBridgeNominee === 'boolean' ? x.isByBridgeNominee : undefined,
    }))
    .filter((x) => !!x.fullName);

  const useByBridgeNomineeDirector = !!input.useByBridgeNomineeDirector;
  const cleanedAdd = useByBridgeNomineeDirector
    ? [
        byBridgeNomineeDirector,
        ...addDirectors.filter((d) => d.email && d.email !== byBridgeNomineeDirector.email && !d.isByBridgeNominee),
      ]
    : addDirectors;

  if (!removeDirectorRoleIds.length && !cleanedAdd.length) return { ok: false as const, error: 'INVALID_INPUT' as const };

  const directors = await listClientDirectors(input.clientId);

  const isLocalDirector = (v: unknown) => {
    const s = String(v ?? '').trim().toLowerCase();
    if (!s) return false;
    if (s === 'singapore') return true;
    if (s.includes('singapore') && s.includes('pr')) return true;
    if (s === 'ep' || s.includes('employment pass')) return true;
    return false;
  };

  const existingLocal = directors.filter((d) => isLocalDirector(d.person.nationality)).length;
  const removedLocal = directors.filter((d) => removeDirectorRoleIds.includes(d.role.id)).filter((d) => isLocalDirector(d.person.nationality)).length;
  const addedLocal = cleanedAdd.filter((d) => isLocalDirector(d.nationality)).length;
  const remainingLocal = existingLocal - removedLocal + addedLocal;
  if (remainingLocal < 1) return { ok: false as const, error: 'NEED_LOCAL_DIRECTOR' as const };
  const activeDirectorRoleIds = new Set(directors.map((d) => d.role.id));
  if (removeDirectorRoleIds.some((id) => !activeDirectorRoleIds.has(id))) {
    return { ok: false as const, error: 'INVALID_INPUT' as const };
  }

  const signerEmails = Array.from(
    new Set(
      directors
        .map((d) => (d.person.email ?? '').trim())
        .filter(Boolean)
        .map((e) => e.toLowerCase()),
    ),
  );
  if (signerEmails.length !== directors.length) return { ok: false as const, error: 'MISSING_SIGNER_EMAIL' as const };

  const emailSet = new Set<string>();
  for (const d of cleanedAdd) {
    if (!d.email) return { ok: false as const, error: 'MISSING_SIGNER_EMAIL' as const };
    if (emailSet.has(d.email)) return { ok: false as const, error: 'INVALID_INPUT' as const };
    emailSet.add(d.email);
    if (!d.idNo || !d.nationality || !d.dob || !d.address) return { ok: false as const, error: 'INVALID_INPUT' as const };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.dob)) return { ok: false as const, error: 'INVALID_INPUT' as const };
  }

  const now = nowIso();
  const id = newId('dcr');

  const templates = await import('@/lib/docTemplates');

  const toIdTypeLabel = (idTypeRaw: unknown, idNoRaw: unknown) => {
    const idType = String(idTypeRaw ?? '').trim();
    if (idType === 'PASSPORT') return 'Passport No.' as const;
    if (idType === 'NRIC') return 'NRIC No.' as const;
    if (idType === 'FIN') return 'FIN No.' as const;
    if (idType === 'IC') return 'IC No.' as const;
    const idNo = String(idNoRaw ?? '').trim();
    const first = idNo ? idNo[0]?.toUpperCase() : '';
    if (first === 'F' || first === 'G') return 'FIN No.' as const;
    if (first === 'S' || first === 'T') return 'NRIC No.' as const;
    return 'ID No.' as const;
  };

  const resignedDirectors = directors
    .filter((d) => removeDirectorRoleIds.includes(d.role.id))
    .map((d) => ({
      fullName: d.person.fullName,
      idNo: String((d.person as any).idNo ?? '').trim() || undefined,
      idTypeLabel: toIdTypeLabel((d.person as any).idType, (d.person as any).idNo),
    }));

  const resignedSignerRows = directors.filter((d) => removeDirectorRoleIds.includes(d.role.id));
  if (resignedSignerRows.some((d) => !String(d.person.email ?? '').trim())) {
    return { ok: false as const, error: 'MISSING_SIGNER_EMAIL' as const };
  }

  const appointedDirectors = cleanedAdd.map((d) => ({
    fullName: d.fullName,
    idNo: d.idNo,
    idTypeLabel: (d.idTypeLabel as any) || toIdTypeLabel(undefined, d.idNo),
  }));

  const resolutionHtml = templates.renderChangeDirectorResolutionHtml({
    companyName: client.name,
    companyRegistrationNo: client.companyRegistrationNo,
    directors: directors.map((d) => ({ fullName: d.person.fullName, email: d.person.email })),
    resolutionDateYmd: now.slice(0, 10),
    effectiveDateYmd: effectiveDate,
    resignationDateYmd: input.resignationDateYmd ?? undefined,
    appointedDirectors,
    resignedDirectors,
  });

  const doc: Document = {
    id: newId('doc'),
    type: 'DIR_CHG',
    title: `Director Resolution - Change of Director - ${client.name}`,
    html: resolutionHtml,
    sha256: sha256Hex(resolutionHtml),
    createdAt: now,
  };
  db.documents.unshift(doc);

  const packet: SignaturePacket = {
    id: newId('spk'),
    kind: 'DIR_CHG',
    relatedType: 'DIRECTOR_CHANGE',
    relatedId: id,
    documentId: doc.id,
    status: 'SIGNING',
    createdAt: now,
    updatedAt: now,
  };
  db.signaturePackets.unshift(packet);

  const expiresAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
  const signLinks: Array<{ email: string; url: string; title?: string }> = [];
  for (const emailKey of signerEmails) {
    const token = newToken();
    const req: SignatureRequest = {
      id: newId('sgr'),
      packetId: packet.id,
      email: emailKey,
      tokenHash: sha256Hex(token),
      expiresAt,
      status: 'PENDING',
      createdAt: now,
      updatedAt: now,
    };
    db.signatureRequests.unshift(req);
    signLinks.push({ email: emailKey, url: `/sign/${token}`, title: `change of director - ${client.name}` });
  }

  for (const d of cleanedAdd) {
    const consentHtml = templates.renderDirectorConsentToActHtml({
      companyName: client.name,
      companyRegistrationNo: client.companyRegistrationNo,
      director: {
        fullName: d.fullName,
        email: d.email,
        address: d.address ?? '',
        nationality: d.nationality ?? '',
        idNo: d.idNo ?? '',
        idTypeLabel: (d.idTypeLabel as any) || toIdTypeLabel(undefined, d.idNo),
        dobYmd: d.dob ?? '',
        effectiveDateYmd: effectiveDate,
      },
      signedDateYmd: now.slice(0, 10),
    });

    const consentDoc: Document = {
      id: newId('doc'),
      type: 'DIR_CHG',
      title: `Consent to Act as Director - ${client.name} - ${d.fullName}`,
      html: consentHtml,
      sha256: sha256Hex(consentHtml),
      createdAt: now,
    };
    db.documents.unshift(consentDoc);

    const consentPacket: SignaturePacket = {
      id: newId('spk'),
      kind: 'DIR_CHG',
      relatedType: 'DIRECTOR_CHANGE',
      relatedId: id,
      documentId: consentDoc.id,
      status: 'SIGNING',
      createdAt: now,
      updatedAt: now,
    };
    db.signaturePackets.unshift(consentPacket);

    const token = newToken();
    const req: SignatureRequest = {
      id: newId('sgr'),
      packetId: consentPacket.id,
      email: d.email,
      tokenHash: sha256Hex(token),
      expiresAt,
      status: 'PENDING',
      createdAt: now,
      updatedAt: now,
    };
    db.signatureRequests.unshift(req);
    signLinks.push({ email: d.email, url: `/sign/${token}`, title: `consent to act as director - ${client.name}` });
  }

  for (const resigned of resignedSignerRows) {
    const letterHtml = templates.renderDirectorResignationLetterHtml({
      companyName: client.name,
      resignedDirector: { fullName: resigned.person.fullName, email: resigned.person.email },
      dateYmd: now.slice(0, 10),
      resignationDateYmd: resignationDateYmd || undefined,
    });

    const letterDoc: Document = {
      id: newId('doc'),
      type: 'DIR_CHG',
      title: `Resignation Letter - Director - ${client.name} - ${resigned.person.fullName}`,
      html: letterHtml,
      sha256: sha256Hex(letterHtml),
      createdAt: now,
    };
    db.documents.unshift(letterDoc);

    const letterPacket: SignaturePacket = {
      id: newId('spk'),
      kind: 'DIR_CHG',
      relatedType: 'DIRECTOR_CHANGE',
      relatedId: id,
      documentId: letterDoc.id,
      status: 'SIGNING',
      createdAt: now,
      updatedAt: now,
    };
    db.signaturePackets.unshift(letterPacket);

    const token = newToken();
    const req: SignatureRequest = {
      id: newId('sgr'),
      packetId: letterPacket.id,
      email: String(resigned.person.email).trim().toLowerCase(),
      tokenHash: sha256Hex(token),
      expiresAt,
      status: 'PENDING',
      createdAt: now,
      updatedAt: now,
    };
    db.signatureRequests.unshift(req);
    signLinks.push({ email: req.email, url: `/sign/${token}`, title: `resignation letter - director - ${client.name}` });
  }

  const request: DirectorChangeRequest = {
    id,
    clientId: input.clientId,
    createdByUserId: input.createdByUserId,
    status: 'PENDING_SIGNATURES',
    effectiveDate,
    resignationDateYmd: resignationDateYmd || undefined,
    message: typeof input.message === 'string' ? input.message : undefined,
    useByBridgeNomineeDirector,
    removeDirectorRoleIds,
    addDirectors: cleanedAdd,
    packetId: packet.id,
    createdAt: now,
    updatedAt: now,
    submittedAt: now,
  };
  const list = Array.isArray((db as unknown as { directorChangeRequests?: unknown }).directorChangeRequests)
    ? (((db as unknown as { directorChangeRequests?: DirectorChangeRequest[] }).directorChangeRequests ?? []) as DirectorChangeRequest[])
    : [];
  list.unshift(request);
  (db as unknown as { directorChangeRequests?: DirectorChangeRequest[] }).directorChangeRequests = list;

  await writeDb(db);
  return { ok: true as const, request, packetId: packet.id, signLinks };
}

export async function decideDirectorChangeRequest(input: {
  requestId: string;
  decidedByUserId: string;
  decision: 'APPROVE' | 'REJECT' | 'NEED_MORE_INFO';
  note?: string;
}) {
  const db = await readDb();
  const list = Array.isArray((db as unknown as { directorChangeRequests?: unknown }).directorChangeRequests)
    ? (((db as unknown as { directorChangeRequests?: DirectorChangeRequest[] }).directorChangeRequests ?? []) as DirectorChangeRequest[])
    : [];
  const idx = list.findIndex((r) => r.id === input.requestId);
  if (idx < 0) return { ok: false as const, error: 'NOT_FOUND' as const };

  const r = list[idx];
  const packets = db.signaturePackets.filter((p) => p.relatedType === 'DIRECTOR_CHANGE' && p.relatedId === r.id);

  const now = nowIso();
  const note = typeof input.note === 'string' ? input.note.trim() || undefined : undefined;

  if (input.decision === 'APPROVE') {
    if (r.status !== 'PENDING_REVIEW' && r.status !== 'PENDING_SIGNATURES') return { ok: false as const, error: 'INVALID_STATE' as const };

    for (const roleId of r.removeDirectorRoleIds) {
      const roleIdx = db.clientPartyRoles.findIndex((x) => x.id === roleId && x.clientId === r.clientId && x.role === 'DIRECTOR');
      if (roleIdx >= 0) {
        db.clientPartyRoles[roleIdx] = {
          ...db.clientPartyRoles[roleIdx],
          resignationDate: (r as { resignationDateYmd?: string }).resignationDateYmd ?? r.effectiveDate,
          updatedAt: now,
        };
      }
    }

    const toPersonIdType = (labelRaw: unknown) => {
      const label = String(labelRaw ?? '').trim();
      if (label === 'NRIC No.') return 'NRIC' as const;
      if (label === 'Passport No.') return 'PASSPORT' as const;
      return 'OTHER' as const;
    };

    for (const d of r.addDirectors) {
      const fullName = d.fullName.trim();
      if (!fullName) continue;
      const email = String(d.email ?? '').trim() || undefined;
      const person: Person = {
        id: newId('per'),
        fullName,
        email,
        phone: typeof d.phone === 'string' ? d.phone.trim() || undefined : undefined,
        idType: toPersonIdType(d.idTypeLabel),
        idNo: typeof d.idNo === 'string' ? d.idNo.trim() || undefined : undefined,
        nationality: typeof d.nationality === 'string' ? d.nationality.trim() || undefined : undefined,
        dob: typeof d.dob === 'string' ? d.dob.trim() || undefined : undefined,
        address: typeof d.address === 'string' ? d.address.trim() || undefined : undefined,
        createdAt: now,
        updatedAt: now,
      };
      const party: Party = { id: newId('pty'), type: 'PERSON', displayName: fullName, personId: person.id, createdAt: now, updatedAt: now };
      const role: ClientPartyRole = {
        id: newId('cpr'),
        clientId: r.clientId,
        partyId: party.id,
        role: 'DIRECTOR',
        appointmentDate: r.effectiveDate,
        createdAt: now,
        updatedAt: now,
      };
      db.persons.unshift(person);
      db.parties.unshift(party);
      db.clientPartyRoles.unshift(role);
    }

    list[idx] = {
      ...r,
      status: 'APPROVED',
      decidedAt: now,
      decidedByUserId: input.decidedByUserId,
      decisionNote: note,
      updatedAt: now,
    };
  } else if (input.decision === 'NEED_MORE_INFO') {
    if (r.status !== 'PENDING_REVIEW' && r.status !== 'PENDING_SIGNATURES') return { ok: false as const, error: 'INVALID_STATE' as const };
    list[idx] = { ...r, status: 'NEED_MORE_INFO', decidedAt: now, decidedByUserId: input.decidedByUserId, decisionNote: note, updatedAt: now };
  } else {
    if (r.status !== 'PENDING_REVIEW' && r.status !== 'PENDING_SIGNATURES') return { ok: false as const, error: 'INVALID_STATE' as const };
    list[idx] = { ...r, status: 'REJECTED', decidedAt: now, decidedByUserId: input.decidedByUserId, decisionNote: note, updatedAt: now };
  }

  (db as unknown as { directorChangeRequests?: DirectorChangeRequest[] }).directorChangeRequests = list;
  await writeDb(db);
  return { ok: true as const, request: list[idx] };
}

function getCompanyUpdateRequestList(db: Db) {
  return Array.isArray((db as unknown as { companyUpdateRequests?: unknown }).companyUpdateRequests)
    ? (((db as unknown as { companyUpdateRequests?: CompanyUpdateRequest[] }).companyUpdateRequests ?? []) as CompanyUpdateRequest[])
    : [];
}

function deleteSignaturePacketCascade(db: Db, packetId: string) {
  const packetIdx = db.signaturePackets.findIndex((p) => p.id === packetId);
  if (packetIdx < 0) return;
  const packet = db.signaturePackets[packetIdx];
  const documentId = packet.documentId;
  db.signaturePackets.splice(packetIdx, 1);
  db.signatureRequests = db.signatureRequests.filter((r) => r.packetId !== packetId);
  if (documentId) {
    const stillUsed = db.signaturePackets.some((p) => p.documentId === documentId);
    if (!stillUsed) {
      db.documents = db.documents.filter((d) => d.id !== documentId);
    }
  }
}

export async function deleteCompanyUpdateRequest(input: { requestId: string; deletedByUserId: string }) {
  const db = await readDb();
  const list = getCompanyUpdateRequestList(db);
  const idx = list.findIndex((r) => r.id === input.requestId);
  if (idx < 0) return { ok: false as const, error: 'NOT_FOUND' as const };

  const r = list[idx];
  if (r.createdByUserId !== input.deletedByUserId) return { ok: false as const, error: 'FORBIDDEN' as const };
  if (r.status !== 'PENDING_SIGNATURES') return { ok: false as const, error: 'INVALID_STATE' as const };

  deleteSignaturePacketCascade(db, r.packetId);
  list.splice(idx, 1);
  (db as unknown as { companyUpdateRequests?: CompanyUpdateRequest[] }).companyUpdateRequests = list;
  await writeDb(db);
  return { ok: true as const, request: r };
}

export async function deleteDirectorChangeRequest(input: { requestId: string; deletedByUserId: string }) {
  const db = await readDb();
  const list = Array.isArray((db as unknown as { directorChangeRequests?: unknown }).directorChangeRequests)
    ? (((db as unknown as { directorChangeRequests?: DirectorChangeRequest[] }).directorChangeRequests ?? []) as DirectorChangeRequest[])
    : [];
  const idx = list.findIndex((r) => r.id === input.requestId);
  if (idx < 0) return { ok: false as const, error: 'NOT_FOUND' as const };

  const r = list[idx];
  if (r.createdByUserId !== input.deletedByUserId) return { ok: false as const, error: 'FORBIDDEN' as const };
  if (r.status !== 'PENDING_SIGNATURES') return { ok: false as const, error: 'INVALID_STATE' as const };

  const packets = db.signaturePackets.filter((p) => p.relatedType === 'DIRECTOR_CHANGE' && p.relatedId === r.id);
  if (packets.length) {
    for (const p of packets) deleteSignaturePacketCascade(db, p.id);
  } else {
    deleteSignaturePacketCascade(db, r.packetId);
  }
  list.splice(idx, 1);
  (db as unknown as { directorChangeRequests?: DirectorChangeRequest[] }).directorChangeRequests = list;
  await writeDb(db);
  return { ok: true as const, request: r };
}

export async function deleteRorcDeclarationRequest(input: { requestId: string; deletedByUserId: string }) {
  const db = await readDb();
  const list = Array.isArray((db as unknown as { rorcDeclarationRequests?: unknown }).rorcDeclarationRequests)
    ? (((db as unknown as { rorcDeclarationRequests?: RorcDeclarationRequest[] }).rorcDeclarationRequests ?? []) as RorcDeclarationRequest[])
    : [];
  const idx = list.findIndex((r) => r.id === input.requestId);
  if (idx < 0) return { ok: false as const, error: 'NOT_FOUND' as const };

  const r = list[idx];
  if (r.createdByUserId !== input.deletedByUserId) return { ok: false as const, error: 'FORBIDDEN' as const };
  if (r.status !== 'PENDING_SIGNATURES') return { ok: false as const, error: 'INVALID_STATE' as const };

  deleteSignaturePacketCascade(db, r.packetId);
  list.splice(idx, 1);
  (db as unknown as { rorcDeclarationRequests?: RorcDeclarationRequest[] }).rorcDeclarationRequests = list;
  await writeDb(db);
  return { ok: true as const, request: r };
}

export async function deleteAnnualGeneralMeetingRequest(input: { requestId: string; deletedByUserId: string }) {
  const db = await readDb();
  const list = Array.isArray((db as unknown as { annualGeneralMeetingRequests?: unknown }).annualGeneralMeetingRequests)
    ? (((db as unknown as { annualGeneralMeetingRequests?: AnnualGeneralMeetingRequest[] }).annualGeneralMeetingRequests ?? []) as AnnualGeneralMeetingRequest[])
    : [];
  const idx = list.findIndex((r) => r.id === input.requestId);
  if (idx < 0) return { ok: false as const, error: 'NOT_FOUND' as const };

  const r = list[idx];
  if (r.createdByUserId !== input.deletedByUserId) return { ok: false as const, error: 'FORBIDDEN' as const };
  if (r.status !== 'PENDING_SIGNATURES') return { ok: false as const, error: 'INVALID_STATE' as const };

  deleteSignaturePacketCascade(db, r.packetId);
  list.splice(idx, 1);
  (db as unknown as { annualGeneralMeetingRequests?: AnnualGeneralMeetingRequest[] }).annualGeneralMeetingRequests = list;
  await writeDb(db);
  return { ok: true as const, request: r };
}

export async function deleteShareTransfer(input: { transferId: string }) {
  const db = await readDb();
  const idx = db.shareTransfers.findIndex((t) => t.id === input.transferId);
  if (idx < 0) return { ok: false as const, error: 'NOT_FOUND' as const };
  const t = db.shareTransfers[idx];

  const st = String((t as any).status ?? '');
  if (st !== 'SIGNING') return { ok: false as const, error: 'INVALID_STATE' as const };

  const packets = db.signaturePackets.filter((p) => p.relatedType === 'SHARE_TRANSFER' && p.relatedId === t.id);
  for (const p of packets) deleteSignaturePacketCascade(db, p.id);
  if (Array.isArray((t as any).blockingRdrIds)) {
    for (const id of (t as any).blockingRdrIds as string[]) {
      deleteSignaturePacketCascade(db, id);
    }
  }

  db.shareTransfers.splice(idx, 1);
  db.auditLogs = (db.auditLogs ?? []).filter((a) => !(a.entityType === 'share_transfer' && a.entityId === t.id));
  await writeDb(db);
  return { ok: true as const, transfer: t };
}

export async function listCompanyUpdateRequestsByClient(clientId: string) {
  const db = await readDb();
  const list = getCompanyUpdateRequestList(db);
  return list.filter((r) => r.clientId === clientId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getCompanyUpdateRequestById(requestId: string) {
  const db = await readDb();
  const list = getCompanyUpdateRequestList(db);
  return list.find((r) => r.id === requestId) ?? null;
}

export async function createCompanyUpdateRequest(input: {
  clientId: string;
  type: CompanyUpdateRequestType;
  payload: Record<string, unknown>;
  createdByUserId: string;
}) {
  const db = await readDb();
  const client = db.clients.find((c) => c.id === input.clientId) ?? null;
  if (!client || client.deletedAt) return { ok: false as const, error: 'NOT_FOUND' as const };

  const directors = await listClientDirectors(input.clientId);
  const signerEmails =
    input.type === 'CHANGE_COMPANY_NAME'
      ? []
      : Array.from(
          new Set(
            directors
              .map((d) => (d.person.email ?? '').trim())
              .filter(Boolean)
              .map((e) => e.toLowerCase()),
          ),
        );
  if (input.type !== 'CHANGE_COMPANY_NAME' && signerEmails.length !== directors.length) {
    return { ok: false as const, error: 'MISSING_SIGNER_EMAIL' as const };
  }

  const type = input.type;
  const p = input.payload ?? {};
  const now = nowIso();

  const isYmd = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
  const ymdToday = () => now.slice(0, 10);
  const ymdNDaysAgo = (days: number) => {
    const d = new Date(`${ymdToday()}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() - days);
    return d.toISOString().slice(0, 10);
  };
  const isYmdWithinPastDays = (ymd: string, days: number) => {
    const v = String(ymd ?? '').trim();
    if (!isYmd(v)) return false;
    const min = ymdNDaysAgo(days);
    const max = ymdToday();
    return v >= min && v <= max;
  };

  const companyName = client.name;

  if (type === 'CHANGE_COMPANY_NAME') {
    const newCompanyName = String(p.newCompanyName ?? '').trim();
    const chairman = String(p.chairman ?? '').trim();
    const directorSendingNotice = String(
      (p as { directorSendingNotice?: unknown; noticeSigner?: unknown }).directorSendingNotice ??
        (p as { directorSendingNotice?: unknown; noticeSigner?: unknown }).noticeSigner ??
        '',
    ).trim();
    const meetingDate = String(p.meetingDate ?? p.startDate ?? '').trim();
    const noticeDateYmd = String(p.noticeDateYmd ?? p.noticeDate ?? '').trim();
    const meetingVenue = String(p.meetingVenue ?? '').trim();
    if (!newCompanyName || !chairman || !meetingDate || !noticeDateYmd || !meetingVenue) {
      return { ok: false as const, error: 'INVALID_INPUT' as const };
    }
    if (!isYmd(meetingDate) || !isYmd(noticeDateYmd)) return { ok: false as const, error: 'INVALID_INPUT' as const };
    {
      const md = new Date(`${meetingDate}T00:00:00.000Z`);
      const nd = new Date(`${noticeDateYmd}T00:00:00.000Z`);
      const min = new Date(md);
      min.setUTCDate(min.getUTCDate() - 14);
      if (!(nd.getTime() <= min.getTime())) return { ok: false as const, error: 'INVALID_INPUT' as const };
    }
  } else if (type === 'CHANGE_FINANCIAL_YEAR_END') {
    const newFye = String(p.newFye ?? '').trim();
    if (!newFye) return { ok: false as const, error: 'INVALID_INPUT' as const };
  } else if (type === 'CHANGE_REGISTERED_OFFICE_ADDRESS') {
    const newRegisteredOfficeAddress = String(p.newRegisteredOfficeAddress ?? '').trim();
    if (!newRegisteredOfficeAddress) return { ok: false as const, error: 'INVALID_INPUT' as const };
  } else if (type === 'CHANGE_BUSINESS_ACTIVITIES') {
    const hasPrimary = Object.prototype.hasOwnProperty.call(p as any, 'ssicPrimaryCode');
    const hasSecondary = Object.prototype.hasOwnProperty.call(p as any, 'ssicSecondaryCode');

    const primaryIn = hasPrimary ? (p as any).ssicPrimaryCode : undefined;
    const secondaryIn = hasSecondary ? (p as any).ssicSecondaryCode : undefined;

    const originalPrimary = String(client.ssicPrimaryCode ?? '').trim();
    const originalSecondary = String(client.ssicSecondaryCode ?? '').trim();

    const nextPrimary = primaryIn === null ? '' : typeof primaryIn === 'string' ? primaryIn.trim() : '';
    let finalPrimary = hasPrimary ? nextPrimary : originalPrimary;

    let finalSecondary = (() => {
      if (!hasSecondary) return originalSecondary;
      if (secondaryIn === null) return '';
      const v = typeof secondaryIn === 'string' ? secondaryIn.trim() : '';
      return v;
    })();

    if (typeof primaryIn === 'string') {
      const v = primaryIn.trim();
      if (v && v !== originalPrimary && originalSecondary && v === originalSecondary) return { ok: false as const, error: 'INVALID_INPUT' as const };
    }
    if (typeof secondaryIn === 'string') {
      const v = secondaryIn.trim();
      if (v && v !== originalSecondary && originalPrimary && v === originalPrimary) return { ok: false as const, error: 'INVALID_INPUT' as const };
    }

    if (!finalPrimary && finalSecondary) {
      finalPrimary = finalSecondary;
      finalSecondary = '';
    }

    if (!finalPrimary) return { ok: false as const, error: 'INVALID_INPUT' as const };

    if (finalSecondary && finalSecondary === finalPrimary) return { ok: false as const, error: 'INVALID_INPUT' as const };
    if (finalPrimary === originalPrimary && finalSecondary === originalSecondary) return { ok: false as const, error: 'INVALID_INPUT' as const };

    (p as Record<string, unknown>).originalSsicPrimaryCode = originalPrimary;
    (p as Record<string, unknown>).originalSsicSecondaryCode = originalSecondary;
    (p as Record<string, unknown>).ssicPrimaryCode = finalPrimary;
    if (finalSecondary) (p as Record<string, unknown>).ssicSecondaryCode = finalSecondary;
    else delete (p as Record<string, unknown>).ssicSecondaryCode;
  } else if (type === 'CHANGE_SECRETARY') {
    const removeSecretaryRoleId = String(p.removeSecretaryRoleId ?? '').trim();
    const useByBridge = Boolean((p as { useByBridgeCompanySecretary?: unknown }).useByBridgeCompanySecretary);

    const normalizeIdNo = (v: unknown) => String(v ?? '').trim().replace(/\s+/g, '').toLowerCase();
    const byBridgeIdNo = 's7864540g';

    const byBridgePerson = db.persons.find((x) => normalizeIdNo((x as { idNo?: unknown }).idNo) === byBridgeIdNo) ?? null;
    const byBridgeFullName = byBridgePerson?.fullName ?? 'Xue Hongwei';
    const byBridgeEmail = String(byBridgePerson?.email ?? 'hwxue1222@gmail.com').trim();
    const byBridgeNationality = String(byBridgePerson?.nationality ?? 'Singapore').trim() || 'Singapore';
    const byBridgeAddress = String(byBridgePerson?.address ?? client.registeredOfficeAddress ?? '').trim();

    const byBridgeSecretaryRow: Record<string, unknown> = {
      fullName: byBridgeFullName,
      email: byBridgeEmail,
      idNo: 'S7864540G',
      idTypeLabel: 'NRIC No.',
      nationality: byBridgeNationality,
      dob: String(byBridgePerson?.dob ?? '').trim(),
      joinDate: now.slice(0, 10),
      address: byBridgeAddress,
      declarationQualifications: ['i'],
    };

    const addSecretaries = Array.isArray(p.addSecretaries) ? (p.addSecretaries as Array<Record<string, unknown>>) : [];
    if (useByBridge) {
      const hasByBridge = addSecretaries.some((x) => normalizeIdNo(x.idNo) === byBridgeIdNo);
      if (!hasByBridge) addSecretaries.unshift(byBridgeSecretaryRow);
      (p as Record<string, unknown>).addSecretaries = addSecretaries;
    }

    const hasAdd = addSecretaries.some((x) => String((x as { fullName?: unknown }).fullName ?? '').trim());
    if (!removeSecretaryRoleId && !hasAdd) return { ok: false as const, error: 'INVALID_INPUT' as const };

    const addRows = addSecretaries as Array<Record<string, unknown>>;
    for (const s of addRows) {
      const fullName = String(s.fullName ?? '').trim();
      if (!fullName) continue;
      const email = String(s.email ?? '').trim();
      const idNo = String(s.idNo ?? '').trim();
      const idTypeLabel = String(s.idTypeLabel ?? '').trim();
      const nationality = String(s.nationality ?? '').trim();
      const dob = String(s.dob ?? '').trim();
      const joinDate = String(s.joinDate ?? '').trim();
      const address = String(s.address ?? '').trim();
      const decl = Array.isArray(s.declarationQualifications) ? (s.declarationQualifications as unknown[]) : [];
      const isByBridgeRow = normalizeIdNo(idNo) === byBridgeIdNo;
      if (!email || !idNo || !idTypeLabel || !nationality || !joinDate || !address || decl.length === 0) {
        return { ok: false as const, error: 'INVALID_INPUT' as const };
      }
      if (!isByBridgeRow && !dob) {
        return { ok: false as const, error: 'INVALID_INPUT' as const };
      }
      if (!isYmdWithinPastDays(joinDate, 14)) {
        return { ok: false as const, error: 'INVALID_INPUT' as const };
      }
    }

    if (removeSecretaryRoleId) {
      const role = db.clientPartyRoles.find((r) => r.id === removeSecretaryRoleId && r.clientId === input.clientId && r.role === 'SECRETARY') ?? null;
      if (!role) return { ok: false as const, error: 'INVALID_INPUT' as const };
      const party = db.parties.find((x) => x.id === role.partyId) ?? null;
      if (!party || party.type !== 'PERSON' || !party.personId) return { ok: false as const, error: 'INVALID_INPUT' as const };
      const person = db.persons.find((x) => x.id === party.personId) ?? null;
      if (!person) return { ok: false as const, error: 'INVALID_INPUT' as const };
      const idType = String((person as { idType?: unknown }).idType ?? '').trim();
      const idNoRaw = String((person as { idNo?: unknown }).idNo ?? '').trim();
      const first = idNoRaw ? idNoRaw[0].toUpperCase() : '';
      const inferred = first === 'F' || first === 'G' ? 'FIN No.' : first === 'S' || first === 'T' ? 'NRIC No.' : 'ID No.';
      const idTypeLabel = idType === 'PASSPORT' ? 'Passport No.' : idType === 'NRIC' ? 'NRIC No.' : inferred;
      (p as Record<string, unknown>).resignedSecretaryName = person.fullName;
      (p as Record<string, unknown>).resignedSecretaryEmail = person.email ?? '';
      (p as Record<string, unknown>).resignedSecretaryIdNo = (person as unknown as { idNo?: unknown }).idNo ?? '';
      (p as Record<string, unknown>).resignedSecretaryIdTypeLabel = idTypeLabel;
    }
  } else if (type === 'TRANSFER_COMPANY_SECRETARY') {
    const newSecretaryName = String(p.newSecretaryName ?? '').trim();
    if (!newSecretaryName) return { ok: false as const, error: 'INVALID_INPUT' as const };
  } else {
    return { ok: false as const, error: 'INVALID_INPUT' as const };
  }

  const id = newId('cur');
  const applicationName =
    type === 'CHANGE_COMPANY_NAME'
      ? 'change of company name'
      : type === 'CHANGE_FINANCIAL_YEAR_END'
        ? 'change of financial year end (FYE)'
        : type === 'CHANGE_REGISTERED_OFFICE_ADDRESS'
          ? 'change of registered office address'
          : type === 'CHANGE_BUSINESS_ACTIVITIES'
            ? 'change of business activities'
            : type === 'CHANGE_SECRETARY'
              ? 'change of secretary'
              : type === 'TRANSFER_COMPANY_SECRETARY'
                ? 'transfer of company secretary'
                : String(type).toLowerCase();
  const titlePrefix =
    type === 'CHANGE_COMPANY_NAME'
      ? 'Director Resolution - Change of Company Name'
      : type === 'CHANGE_FINANCIAL_YEAR_END'
        ? 'Director Resolution - Change of Financial Year End (FYE)'
        : type === 'CHANGE_REGISTERED_OFFICE_ADDRESS'
          ? 'Director Resolution - Change of Registered Office Address'
          : type === 'CHANGE_BUSINESS_ACTIVITIES'
            ? 'Director Resolution - Change of Business Activities'
            : type === 'CHANGE_SECRETARY'
              ? 'Director Resolution - Change of Secretary'
            : type === 'TRANSFER_COMPANY_SECRETARY'
              ? 'Director Resolution - Transfer of Company Secretary'
              : type;

  const templates = await import('@/lib/docTemplates');

  const commonTplInput = {
    companyName,
    companyRegistrationNo: client.companyRegistrationNo,
    directors: directors.map((d) => ({ fullName: d.person.fullName, email: d.person.email })),
    resolutionDateYmd: now.slice(0, 10),
    type,
    original: {
      fye: client.fye ?? undefined,
      registeredOfficeAddress: client.registeredOfficeAddress ?? undefined,
      ssicPrimaryCode: client.ssicPrimaryCode ?? undefined,
      ssicSecondaryCode: client.ssicSecondaryCode ?? undefined,
    },
    payload: p,
  };

  const expiresAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
  const signLinks: Array<{ email: string; url: string; title?: string }> = [];

  let primaryPacketId = '';
  let requestStatus: CompanyUpdateRequest['status'] = 'PENDING_SIGNATURES';
  let signedAt: string | undefined = undefined;

  if (type === 'CHANGE_COMPANY_NAME') {
    const newCompanyName = String(p.newCompanyName ?? '').trim();
    const chairman = String(p.chairman ?? '').trim();
    const directorSendingNotice = String(
      (p as { directorSendingNotice?: unknown; noticeSigner?: unknown }).directorSendingNotice ??
        (p as { directorSendingNotice?: unknown; noticeSigner?: unknown }).noticeSigner ??
        '',
    ).trim();
    const meetingDateYmd = String(p.meetingDate ?? p.startDate ?? '').trim();
    const noticeDateYmd = String(p.noticeDateYmd ?? p.noticeDate ?? '').trim();
    const meetingVenue = String(p.meetingVenue ?? '').trim();

    const corporateReps = Array.isArray((p as { corporateRepresentatives?: unknown }).corporateRepresentatives)
      ? ((p as { corporateRepresentatives: any[] }).corporateRepresentatives
          .map((x) => ({
            shareholderCompanyClientId: String(x?.shareholderCompanyClientId ?? '').trim(),
            representativeName: String(x?.representativeName ?? '').trim(),
            representativeIdType: String(x?.representativeIdType ?? '').trim(),
            representativeIdNo: String(x?.representativeIdNo ?? '').trim(),
            representativeAddress: String(x?.representativeAddress ?? '').trim(),
            representativeEmail: String(x?.representativeEmail ?? '').trim(),
            representativePhone: String(x?.representativePhone ?? '').trim(),
          }))
          .filter((x) => !!x.shareholderCompanyClientId))
      : [];
    const corporateRepByCompanyId = new Map(corporateReps.map((x) => [x.shareholderCompanyClientId, x]));

    const partyById = new Map(db.parties.map((x) => [x.id, x]));
    const personById = new Map(db.persons.map((x) => [x.id, x]));
    const shareholderRoles = db.clientPartyRoles
      .filter((r) => r.clientId === input.clientId)
      .filter((r) => r.role === 'SHAREHOLDER')
      .filter((r) => !r.toDate)
      .slice();

    const minutesSigners: Array<{ fullName: string; email: string }> = [];
    const minutesSignerEmails = new Set<string>();
    const personShareholderNames = new Set<string>();

    for (const r of shareholderRoles) {
      const party = partyById.get(r.partyId);
      if (!party) continue;
      if (party.type === 'PERSON' && party.personId) {
        const sp = personById.get(party.personId);
        if (!sp) continue;
        personShareholderNames.add(sp.fullName.trim());
        const email = String(sp.email ?? '').trim().toLowerCase();
        if (!email) return { ok: false as const, error: 'MISSING_SIGNER_EMAIL' as const };
        if (!minutesSignerEmails.has(email)) {
          minutesSignerEmails.add(email);
          minutesSigners.push({ fullName: sp.fullName, email });
        }
        continue;
      }

      if (party.type === 'COMPANY' && party.clientId) {
        const shareholderClientId = party.clientId;
        const shareholderClient = db.clients.find((c) => c.id === shareholderClientId) ?? null;
        const shareholderCompanyName = shareholderClient?.name ?? party.displayName;
        const shareholderCompanyRegistrationNo = shareholderClient?.companyRegistrationNo;

        const rep = corporateRepByCompanyId.get(shareholderClientId) ?? null;
        if (!rep) return { ok: false as const, error: 'INVALID_INPUT' as const };
        if (
          !rep.representativeName ||
          !rep.representativeIdType ||
          !rep.representativeIdNo ||
          !rep.representativeAddress ||
          !rep.representativeEmail
        ) {
          return { ok: false as const, error: 'INVALID_INPUT' as const };
        }
        const repEmail = rep.representativeEmail.trim().toLowerCase();
        if (!repEmail) return { ok: false as const, error: 'MISSING_SIGNER_EMAIL' as const };

        if (!minutesSignerEmails.has(repEmail)) {
          minutesSignerEmails.add(repEmail);
          minutesSigners.push({ fullName: `${rep.representativeName} (on behalf of ${shareholderCompanyName})`, email: repEmail });
        }

        const shareholderDirectors = db.clientPartyRoles
          .filter((x) => x.clientId === shareholderClientId)
          .filter((x) => x.role === 'DIRECTOR')
          .filter((x) => !x.toDate)
          .map((x) => {
            const pty = partyById.get(x.partyId);
            if (!pty || pty.type !== 'PERSON' || !pty.personId) return null;
            const person = personById.get(pty.personId) ?? null;
            if (!person) return null;
            const email = String(person.email ?? '').trim().toLowerCase();
            if (!email) return null;
            return { fullName: person.fullName, email };
          })
          .filter(Boolean) as Array<{ fullName: string; email: string }>;

        const directorSigner = shareholderDirectors[0] ?? null;
        if (!directorSigner) return { ok: false as const, error: 'MISSING_SIGNER_EMAIL' as const };

        const shareholderCompanyAddress =
          (shareholderClient?.registeredOfficeAddress ?? shareholderClient?.address ?? '').trim() || '______________________________';

        const idTypeLabel =
          rep.representativeIdType === 'NRIC'
            ? 'NRIC'
            : rep.representativeIdType === 'FIN'
              ? 'FIN'
              : rep.representativeIdType === 'IC'
                ? 'IC'
                : 'Passport';
        const certHtml = templates.renderCertificateOfAppointmentOfCorporateRepresentativeHtml({
          shareholderCompanyName,
          shareholderCompanyRegistrationNo,
          shareholderCompanyAddress,
          targetCompanyName: companyName,
          representativeName: rep.representativeName,
          representativeAddress: rep.representativeAddress,
          witnessIdTypeLabel: idTypeLabel,
          witnessIdNo: rep.representativeIdNo,
          witnessPhone: rep.representativePhone,
          witnessEmail: repEmail,
          directorSignerName: directorSigner.fullName,
          directorSignerEmail: directorSigner.email,
          dateYmd: noticeDateYmd || now.slice(0, 10),
        });
        const certDoc: Document = {
          id: newId('doc'),
          type: 'CO_UPD',
          title: `Certificate of Appointment of Corporate Representative - ${shareholderCompanyName}`,
          html: certHtml,
          sha256: sha256Hex(certHtml),
          createdAt: now,
        };
        db.documents.unshift(certDoc);

        const certPacket: SignaturePacket = {
          id: newId('spk'),
          kind: 'CO_UPD',
          relatedType: 'COMPANY_UPDATE',
          relatedId: id,
          documentId: certDoc.id,
          status: 'SIGNING',
          createdAt: now,
          updatedAt: now,
        };
        db.signaturePackets.unshift(certPacket);

        for (const dir of shareholderDirectors) {
          const token = newToken();
          const req: SignatureRequest = {
            id: newId('sgr'),
            packetId: certPacket.id,
            email: dir.email,
            tokenHash: sha256Hex(token),
            expiresAt,
            status: 'PENDING',
            createdAt: now,
            updatedAt: now,
          };
          db.signatureRequests.unshift(req);
          signLinks.push({ email: req.email, url: `/sign/${token}`, title: `corporate representative certificate - ${shareholderCompanyName}` });
        }
      }
    }

    if (!personShareholderNames.has(chairman)) return { ok: false as const, error: 'INVALID_INPUT' as const };

    const noticeSignerEmail =
      (directorSendingNotice
        ? directors.find((d) => d.person.fullName.trim() === directorSendingNotice && (d.person.email ?? '').trim())?.person.email
        : undefined) ??
      directors.find((d) => (d.person.email ?? '').trim())?.person.email ??
      '';
    const noticeSignerName =
      (directorSendingNotice ? directors.find((d) => d.person.fullName.trim() === directorSendingNotice)?.person.fullName : undefined) ??
      directors[0]?.person.fullName ??
      '';
    if (!noticeSignerEmail) return { ok: false as const, error: 'MISSING_SIGNER_EMAIL' as const };

    const noticeHtml = templates.renderNoticeOfExtraordinaryGeneralMeetingChangeCompanyNameHtml({
      companyName,
      companyRegistrationNo: client.companyRegistrationNo,
      noticeDateYmd,
      meetingDateYmd,
      meetingVenue,
      chairman: noticeSignerName,
      chairmanEmail: noticeSignerEmail,
      newCompanyName,
    });
    const noticeDoc: Document = {
      id: newId('doc'),
      type: 'CO_UPD',
      title: 'Notice of Extraordinary General Meeting',
      html: noticeHtml,
      sha256: sha256Hex(noticeHtml),
      createdAt: now,
    };
    db.documents.unshift(noticeDoc);
    const noticePacketId = newId('spk');
    const noticePacket: SignaturePacket = {
      id: noticePacketId,
      kind: 'CO_UPD',
      relatedType: 'COMPANY_UPDATE',
      relatedId: id,
      documentId: noticeDoc.id,
      status: 'SIGNING',
      createdAt: now,
      updatedAt: now,
    };
    db.signaturePackets.unshift(noticePacket);

    {
      const token = newToken();
      const req: SignatureRequest = {
        id: newId('sgr'),
        packetId: noticePacket.id,
        email: noticeSignerEmail.trim().toLowerCase(),
        tokenHash: sha256Hex(token),
        expiresAt,
        status: 'PENDING',
        createdAt: now,
        updatedAt: now,
      };
      db.signatureRequests.unshift(req);
      signLinks.push({ email: req.email, url: `/sign/${token}`, title: `${applicationName} - ${companyName}` });
    }

    const minutesHtml = templates.renderMinutesOfExtraordinaryGeneralMeetingChangeCompanyNameHtml({
      companyName,
      companyRegistrationNo: client.companyRegistrationNo,
      meetingDateYmd,
      meetingVenue,
      chairman,
      oldCompanyName: companyName,
      newCompanyName,
      shareholders: minutesSigners,
    });
    const minutesDoc: Document = {
      id: newId('doc'),
      type: 'CO_UPD',
      title: 'Minutes of Extraordinary General Meeting',
      html: minutesHtml,
      sha256: sha256Hex(minutesHtml),
      createdAt: now,
    };
    db.documents.unshift(minutesDoc);

    const minutesPacketId = newId('spk');
    primaryPacketId = minutesPacketId;
    const minutesPacket: SignaturePacket = {
      id: minutesPacketId,
      kind: 'CO_UPD',
      relatedType: 'COMPANY_UPDATE',
      relatedId: id,
      documentId: minutesDoc.id,
      status: minutesSignerEmails.size ? 'SIGNING' : 'SIGNED',
      createdAt: now,
      updatedAt: now,
    };
    db.signaturePackets.unshift(minutesPacket);

    if (minutesSignerEmails.size) {
      for (const emailKey of Array.from(minutesSignerEmails)) {
        const token = newToken();
        const req: SignatureRequest = {
          id: newId('sgr'),
          packetId: minutesPacket.id,
          email: emailKey,
          tokenHash: sha256Hex(token),
          expiresAt,
          status: 'PENDING',
          createdAt: now,
          updatedAt: now,
        };
        db.signatureRequests.unshift(req);
        signLinks.push({ email: emailKey, url: `/sign/${token}`, title: `${applicationName} - ${companyName}` });
      }
    }
  } else {
    const html = templates.renderCompanyUpdateRequestHtml(commonTplInput);

    const doc: Document = {
      id: newId('doc'),
      type: 'CO_UPD',
      title: `${titlePrefix} - ${client.name}`,
      html,
      sha256: sha256Hex(html),
      createdAt: now,
    };
    db.documents.unshift(doc);

    const packet: SignaturePacket = {
      id: newId('spk'),
      kind: 'CO_UPD',
      relatedType: 'COMPANY_UPDATE',
      relatedId: id,
      documentId: doc.id,
      status: 'SIGNING',
      createdAt: now,
      updatedAt: now,
    };
    db.signaturePackets.unshift(packet);
    primaryPacketId = packet.id;

    for (const emailKey of signerEmails) {
      const token = newToken();
      const req: SignatureRequest = {
        id: newId('sgr'),
        packetId: packet.id,
        email: emailKey,
        tokenHash: sha256Hex(token),
        expiresAt,
        status: 'PENDING',
        createdAt: now,
        updatedAt: now,
      };
      db.signatureRequests.unshift(req);
      signLinks.push({ email: emailKey, url: `/sign/${token}`, title: `${applicationName} - ${companyName}` });
    }
  }

  if (type === 'CHANGE_SECRETARY') {
    const payload = p as {
      addSecretaries?: unknown;
      removeSecretaryRoleId?: unknown;
      resignedSecretaryEmail?: unknown;
      resignedSecretaryName?: unknown;
      resignedSecretaryIdNo?: unknown;
    };

    const addRows = Array.isArray(payload.addSecretaries) ? (payload.addSecretaries as Array<Record<string, unknown>>) : [];
    for (const s of addRows) {
      const fullName = String(s.fullName ?? '').trim();
      if (!fullName) continue;
      const email = String(s.email ?? '').trim().toLowerCase();
      if (!email) return { ok: false as const, error: 'MISSING_SIGNER_EMAIL' as const };

      const consentHtml = templates.renderSecretaryConsentToActHtml({
        companyName,
        companyRegistrationNo: client.companyRegistrationNo,
        secretary: {
          fullName,
          email,
          address: String(s.address ?? '').trim(),
          nationality: String(s.nationality ?? '').trim(),
          idNo: String(s.idNo ?? '').trim(),
          effectiveDateYmd: String(s.joinDate ?? '').trim() || now.slice(0, 10),
          declarationQualifications: (Array.isArray(s.declarationQualifications)
            ? (s.declarationQualifications as Array<'i' | 'ii' | 'iii' | 'iv' | 'v' | 'vi' | 'vii'>)
            : []) as Array<'i' | 'ii' | 'iii' | 'iv' | 'v' | 'vi' | 'vii'>,
        },
        signedDateYmd: now.slice(0, 10),
      });

      const consentDoc: Document = {
        id: newId('doc'),
        type: 'CO_UPD',
        title: `Consent to Act as Secretary - ${companyName}`,
        html: consentHtml,
        sha256: sha256Hex(consentHtml),
        createdAt: now,
      };
      db.documents.unshift(consentDoc);

      const consentPacket: SignaturePacket = {
        id: newId('spk'),
        kind: 'CO_UPD',
        relatedType: 'COMPANY_UPDATE',
        relatedId: id,
        documentId: consentDoc.id,
        status: 'SIGNING',
        createdAt: now,
        updatedAt: now,
      };
      db.signaturePackets.unshift(consentPacket);

      const token = newToken();
      const req: SignatureRequest = {
        id: newId('sgr'),
        packetId: consentPacket.id,
        email,
        tokenHash: sha256Hex(token),
        expiresAt,
        status: 'PENDING',
        createdAt: now,
        updatedAt: now,
      };
      db.signatureRequests.unshift(req);
      signLinks.push({ email, url: `/sign/${token}`, title: `consent to act as secretary - ${companyName}` });
    }

    const resignedEmail = String(payload.resignedSecretaryEmail ?? '').trim().toLowerCase();
    const resignedName = String(payload.resignedSecretaryName ?? '').trim();
    if (resignedName) {
      if (!resignedEmail) return { ok: false as const, error: 'MISSING_SIGNER_EMAIL' as const };
      const resignHtml = templates.renderSecretaryResignationLetterHtml({
        companyName,
        resignedSecretary: { fullName: resignedName, email: resignedEmail },
        dateYmd: now.slice(0, 10),
      });
      const resignDoc: Document = {
        id: newId('doc'),
        type: 'CO_UPD',
        title: `Resignation Letter - Secretary - ${companyName}`,
        html: resignHtml,
        sha256: sha256Hex(resignHtml),
        createdAt: now,
      };
      db.documents.unshift(resignDoc);
      const resignPacket: SignaturePacket = {
        id: newId('spk'),
        kind: 'CO_UPD',
        relatedType: 'COMPANY_UPDATE',
        relatedId: id,
        documentId: resignDoc.id,
        status: 'SIGNING',
        createdAt: now,
        updatedAt: now,
      };
      db.signaturePackets.unshift(resignPacket);
      const token = newToken();
      const req: SignatureRequest = {
        id: newId('sgr'),
        packetId: resignPacket.id,
        email: resignedEmail,
        tokenHash: sha256Hex(token),
        expiresAt,
        status: 'PENDING',
        createdAt: now,
        updatedAt: now,
      };
      db.signatureRequests.unshift(req);
      signLinks.push({ email: resignedEmail, url: `/sign/${token}`, title: `resignation of secretary - ${companyName}` });
    }
  }

  const request: CompanyUpdateRequest = {
    id,
    clientId: input.clientId,
    type,
    status: requestStatus,
    payload: p,
    createdByUserId: input.createdByUserId,
    packetId: primaryPacketId,
    createdAt: now,
    updatedAt: now,
    submittedAt: now,
    signedAt,
  };

  const list = getCompanyUpdateRequestList(db);
  list.unshift(request);
  (db as unknown as { companyUpdateRequests?: CompanyUpdateRequest[] }).companyUpdateRequests = list;
  await writeDb(db);
  return { ok: true as const, request, signLinks };
}

export async function decideCompanyUpdateRequest(input: {
  requestId: string;
  decidedByUserId: string;
  decision: 'APPROVE' | 'REJECT' | 'NEED_MORE_INFO';
  note?: string;
}) {
  const db = await readDb();
  const list = getCompanyUpdateRequestList(db);
  const idx = list.findIndex((r) => r.id === input.requestId);
  if (idx < 0) return { ok: false as const, error: 'NOT_FOUND' as const };

  const r = list[idx];
  if (r.status === 'REJECTED' || r.status === 'COMPLETE') return { ok: false as const, error: 'INVALID_STATE' as const };

  const packets = db.signaturePackets.filter((p) => p.relatedType === 'COMPANY_UPDATE' && p.relatedId === r.id);
  if (!packets.length) return { ok: false as const, error: 'NOT_FOUND' as const };

  const now = nowIso();
  const note = typeof input.note === 'string' ? input.note.trim() || undefined : undefined;

  if (input.decision === 'NEED_MORE_INFO') {
    list[idx] = { ...r, status: 'NEED_MORE_INFO', decidedAt: now, decidedByUserId: input.decidedByUserId, decisionNote: note, updatedAt: now };
    (db as unknown as { companyUpdateRequests?: CompanyUpdateRequest[] }).companyUpdateRequests = list;
    await writeDb(db);
    return { ok: true as const, request: list[idx] };
  }

  if (input.decision === 'REJECT') {
    list[idx] = { ...r, status: 'REJECTED', decidedAt: now, decidedByUserId: input.decidedByUserId, decisionNote: note, updatedAt: now };
    (db as unknown as { companyUpdateRequests?: CompanyUpdateRequest[] }).companyUpdateRequests = list;
    await writeDb(db);
    return { ok: true as const, request: list[idx] };
  }

  if (r.status !== 'PENDING_REVIEW' && r.status !== 'PENDING_SIGNATURES') return { ok: false as const, error: 'INVALID_STATE' as const };

  const clientIdx = db.clients.findIndex((c) => c.id === r.clientId);
  if (clientIdx < 0) return { ok: false as const, error: 'NOT_FOUND' as const };
  const client = db.clients[clientIdx];
  if (client.deletedAt) return { ok: false as const, error: 'NOT_FOUND' as const };

  const p = r.payload ?? {};
  if (r.type === 'CHANGE_COMPANY_NAME') {
    const newCompanyName = String((p as { newCompanyName?: unknown }).newCompanyName ?? '').trim();
    if (!newCompanyName) return { ok: false as const, error: 'INVALID_INPUT' as const };
    const nextFka = client.name.trim() && client.name.trim() !== newCompanyName ? client.name : client.fka;
    db.clients[clientIdx] = { ...client, name: newCompanyName, fka: nextFka };
  } else if (r.type === 'CHANGE_FINANCIAL_YEAR_END') {
    const newFye = String((p as { newFye?: unknown }).newFye ?? '').trim();
    if (!newFye) return { ok: false as const, error: 'INVALID_INPUT' as const };
    db.clients[clientIdx] = { ...client, fye: newFye };
  } else if (r.type === 'CHANGE_REGISTERED_OFFICE_ADDRESS') {
    const newRegisteredOfficeAddress = String((p as { newRegisteredOfficeAddress?: unknown }).newRegisteredOfficeAddress ?? '').trim();
    if (!newRegisteredOfficeAddress) return { ok: false as const, error: 'INVALID_INPUT' as const };
    db.clients[clientIdx] = { ...client, registeredOfficeAddress: newRegisteredOfficeAddress };
  } else if (r.type === 'CHANGE_BUSINESS_ACTIVITIES') {
    const ssicPrimaryCode = String((p as { ssicPrimaryCode?: unknown }).ssicPrimaryCode ?? '').trim();
    const ssicSecondaryCode = String((p as { ssicSecondaryCode?: unknown }).ssicSecondaryCode ?? '').trim() || undefined;
    if (!ssicPrimaryCode) return { ok: false as const, error: 'INVALID_INPUT' as const };
    if (ssicSecondaryCode && ssicSecondaryCode === ssicPrimaryCode) return { ok: false as const, error: 'INVALID_INPUT' as const };
    db.clients[clientIdx] = { ...client, ssicPrimaryCode, ssicSecondaryCode };
  } else if (r.type === 'CHANGE_SECRETARY') {
    const payload = p as {
      removeSecretaryRoleId?: unknown;
      addSecretaries?: unknown;
    };
    const removeSecretaryRoleId = String(payload.removeSecretaryRoleId ?? '').trim();
    if (removeSecretaryRoleId) {
      const roleIdx = db.clientPartyRoles.findIndex((x) => x.id === removeSecretaryRoleId && x.clientId === r.clientId && x.role === 'SECRETARY');
      if (roleIdx >= 0 && !db.clientPartyRoles[roleIdx].resignationDate) {
        db.clientPartyRoles[roleIdx] = { ...db.clientPartyRoles[roleIdx], resignationDate: now.slice(0, 10), updatedAt: now };
      }
    }

    const addSecretaries = Array.isArray(payload.addSecretaries) ? (payload.addSecretaries as Array<Record<string, unknown>>) : [];
    for (const s of addSecretaries) {
      const fullName = String(s.fullName ?? '').trim();
      if (!fullName) continue;
      const email = typeof s.email === 'string' ? s.email.trim() || undefined : undefined;
      const phone = typeof s.phone === 'string' ? s.phone.trim() || undefined : undefined;
      const person: Person = { id: newId('per'), fullName, email, phone, createdAt: now, updatedAt: now };
      const party: Party = { id: newId('pty'), type: 'PERSON', displayName: fullName, personId: person.id, createdAt: now, updatedAt: now };
      const role: ClientPartyRole = {
        id: newId('cpr'),
        clientId: r.clientId,
        partyId: party.id,
        role: 'SECRETARY',
        appointmentDate: now.slice(0, 10),
        createdAt: now,
        updatedAt: now,
      };
      db.persons.unshift(person);
      db.parties.unshift(party);
      db.clientPartyRoles.unshift(role);
    }
  } else if (r.type === 'TRANSFER_COMPANY_SECRETARY') {
    const payload = p as {
      effectiveDate?: unknown;
      newSecretaryName?: unknown;
      newSecretaryEmail?: unknown;
    };
    const effectiveDate = String(payload.effectiveDate ?? '').trim() || now.slice(0, 10);
    const newSecretaryName = String(payload.newSecretaryName ?? '').trim();
    if (!newSecretaryName) return { ok: false as const, error: 'INVALID_INPUT' as const };
    const newSecretaryEmail = typeof payload.newSecretaryEmail === 'string' ? payload.newSecretaryEmail.trim() || undefined : undefined;

    for (let i = 0; i < db.clientPartyRoles.length; i += 1) {
      const role = db.clientPartyRoles[i];
      if (role.clientId !== r.clientId) continue;
      if (role.role !== 'SECRETARY') continue;
      if (role.resignationDate) continue;
      db.clientPartyRoles[i] = { ...role, resignationDate: effectiveDate, updatedAt: now };
    }

    const person: Person = { id: newId('per'), fullName: newSecretaryName, email: newSecretaryEmail, createdAt: now, updatedAt: now };
    const party: Party = {
      id: newId('pty'),
      type: 'PERSON',
      displayName: newSecretaryName,
      personId: person.id,
      createdAt: now,
      updatedAt: now,
    };
    const role: ClientPartyRole = {
      id: newId('cpr'),
      clientId: r.clientId,
      partyId: party.id,
      role: 'SECRETARY',
      appointmentDate: effectiveDate,
      createdAt: now,
      updatedAt: now,
    };
    db.persons.unshift(person);
    db.parties.unshift(party);
    db.clientPartyRoles.unshift(role);
  } else {
    return { ok: false as const, error: 'INVALID_INPUT' as const };
  }

  list[idx] = { ...r, status: 'COMPLETE', decidedAt: now, decidedByUserId: input.decidedByUserId, decisionNote: note, updatedAt: now };
  (db as unknown as { companyUpdateRequests?: CompanyUpdateRequest[] }).companyUpdateRequests = list;
  await writeDb(db);
  return { ok: true as const, request: list[idx] };
}

function getRorcDeclarationRequestList(db: Db) {
  return Array.isArray((db as unknown as { rorcDeclarationRequests?: unknown }).rorcDeclarationRequests)
    ? (((db as unknown as { rorcDeclarationRequests?: RorcDeclarationRequest[] }).rorcDeclarationRequests ?? []) as RorcDeclarationRequest[])
    : [];
}

export async function listRorcDeclarationRequestsByClient(clientId: string) {
  const db = await readDb();
  return getRorcDeclarationRequestList(db)
    .filter((r) => r.clientId === clientId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getRorcDeclarationRequestContext(requestId: string) {
  const db = await readDb();
  const request = getRorcDeclarationRequestList(db).find((r) => r.id === requestId) ?? null;
  if (!request) return null;

  const packetIds = Array.isArray((request as any).packetIds) && (request as any).packetIds.length ? ((request as any).packetIds as string[]) : [request.packetId];
  const packets = db.signaturePackets.filter((p) => packetIds.includes(p.id));
  if (!packets.length) return null;
  const documents = packets
    .map((p) => db.documents.find((d) => d.id === p.documentId) ?? null)
    .filter(Boolean) as Document[];
  if (!documents.length) return null;
  const signatures = db.signatureRequests
    .filter((r) => packetIds.includes(r.packetId))
    .slice()
    .sort((a, b) => a.packetId !== b.packetId ? a.packetId.localeCompare(b.packetId) : a.email.localeCompare(b.email));
  return { request, packets, documents, signatures };
}

export async function createRorcDeclarationRequest(input: {
  clientId: string;
  createdByUserId: string;
  effectiveDate: string;
  message?: string;
  removeRorcRoleIds?: string[];
  addControllers?: Array<{ fullName: string; email?: string }>;
  controllerType?: 'PERSON' | 'COMPANY';
  controllerPerson?: {
    fullName: string;
    idType?: string;
    idNo?: string;
    dateOfBirth?: string;
    email?: string;
    nationality?: string;
    phone?: string;
    address?: string;
    ccName?: string;
    ccTitle?: string;
    ccPhone?: string;
    ccEmailAddress?: string;
    useCcEmailInstead?: boolean;
  };
  controllerCompany?: {
    companyName: string;
    registerNumber?: string;
    countryOfIncorporation?: string;
    legalForm?: string;
    governedByLawAndJurisdiction?: string;
    registerOfCompanies?: string;
    companyAddress?: string;
    ccName?: string;
    ccTitle?: string;
    ccPhone?: string;
    ccEmailAddress?: string;
    useCcEmailInstead?: boolean;
  };
}) {
  const db = await readDb();
  const client = db.clients.find((c) => c.id === input.clientId) ?? null;
  if (!client || client.deletedAt) return { ok: false as const, error: 'NOT_FOUND' as const };

  const effectiveDate = input.effectiveDate.trim();
  if (!effectiveDate) return { ok: false as const, error: 'INVALID_INPUT' as const };

  let controllerType = input.controllerType;
  if (!controllerType) {
    if (input.controllerPerson && String((input.controllerPerson as any)?.fullName ?? '').trim()) controllerType = 'PERSON';
    else if (input.controllerCompany && String((input.controllerCompany as any)?.companyName ?? '').trim()) controllerType = 'COMPANY';
  }

  const removeRorcRoleIds = Array.isArray(input.removeRorcRoleIds)
    ? input.removeRorcRoleIds.map((x) => String(x).trim()).filter(Boolean)
    : [];
  const addControllers = Array.isArray(input.addControllers)
    ? input.addControllers
        .map((x) => ({
          fullName: String(x?.fullName ?? '').trim(),
          email: typeof x?.email === 'string' ? x.email.trim() || undefined : undefined,
        }))
        .filter((x) => !!x.fullName)
    : [];

  if (controllerType === 'PERSON') {
    const p = input.controllerPerson;
    if (!p?.fullName?.trim() || !String(p.idType ?? '').trim() || !String(p.idNo ?? '').trim()) {
      return { ok: false as const, error: 'INVALID_INPUT' as const };
    }
    if (!String(p.dateOfBirth ?? '').trim() || !String(p.email ?? '').trim()) {
      return { ok: false as const, error: 'INVALID_INPUT' as const };
    }
    if (!String(p.nationality ?? '').trim() || !String(p.phone ?? '').trim() || !String(p.address ?? '').trim()) {
      return { ok: false as const, error: 'INVALID_INPUT' as const };
    }
    if (String(p.ccEmailAddress ?? '').trim()) {
      if (!String(p.ccName ?? '').trim() || !String(p.ccTitle ?? '').trim() || !String(p.ccPhone ?? '').trim()) {
        return { ok: false as const, error: 'INVALID_INPUT' as const };
      }
    }
  } else if (controllerType === 'COMPANY') {
    const c = input.controllerCompany;
    if (!c?.companyName?.trim() || !String(c.registerNumber ?? '').trim() || !String(c.legalForm ?? '').trim()) {
      return { ok: false as const, error: 'INVALID_INPUT' as const };
    }
    if (!String(c.countryOfIncorporation ?? '').trim()) {
      return { ok: false as const, error: 'INVALID_INPUT' as const };
    }
    if (!String(c.governedByLawAndJurisdiction ?? '').trim() || !String(c.companyAddress ?? '').trim()) {
      return { ok: false as const, error: 'INVALID_INPUT' as const };
    }
    if (c.useCcEmailInstead && !String(c.ccEmailAddress ?? '').trim()) {
      return { ok: false as const, error: 'INVALID_INPUT' as const };
    }
    if (String(c.ccEmailAddress ?? '').trim()) {
      if (!String(c.ccName ?? '').trim() || !String(c.ccTitle ?? '').trim() || !String(c.ccPhone ?? '').trim()) {
        return { ok: false as const, error: 'INVALID_INPUT' as const };
      }
    }
  } else {
    if (!removeRorcRoleIds.length && !addControllers.length) return { ok: false as const, error: 'INVALID_INPUT' as const };
  }

  const directors = await listClientDirectors(input.clientId);
  const signerEmails = Array.from(
    new Set(
      directors
        .map((d) => (d.person.email ?? '').trim())
        .filter(Boolean)
        .map((e) => e.toLowerCase()),
    ),
  );
  if (signerEmails.length !== directors.length) return { ok: false as const, error: 'MISSING_SIGNER_EMAIL' as const };

  const ccEmailRaw =
    controllerType === 'PERSON'
      ? String(input.controllerPerson?.ccEmailAddress ?? '').trim()
      : controllerType === 'COMPANY'
        ? String(input.controllerCompany?.ccEmailAddress ?? '').trim()
        : '';
  const ccEmail = ccEmailRaw ? ccEmailRaw.toLowerCase() : '';

  const ccNameRaw =
    controllerType === 'PERSON'
      ? String(input.controllerPerson?.ccName ?? '').trim()
      : controllerType === 'COMPANY'
        ? String(input.controllerCompany?.ccName ?? '').trim()
        : '';
  const ccTitleRaw =
    controllerType === 'PERSON'
      ? String(input.controllerPerson?.ccTitle ?? '').trim()
      : controllerType === 'COMPANY'
        ? String(input.controllerCompany?.ccTitle ?? '').trim()
        : '';
  const ccPhoneRaw =
    controllerType === 'PERSON'
      ? String(input.controllerPerson?.ccPhone ?? '').trim()
      : controllerType === 'COMPANY'
        ? String(input.controllerCompany?.ccPhone ?? '').trim()
        : '';

  const partyById = new Map(db.parties.map((p) => [p.id, p]));
  const personById = new Map(db.persons.map((p) => [p.id, p]));
  const clientById = new Map(db.clients.map((c) => [c.id, c]));
  const activeControllers = db.clientPartyRoles
    .filter((r) => r.clientId === input.clientId)
    .filter((r) => r.role === 'RORC' && !r.toDate)
    .map((r) => {
      const party = partyById.get(r.partyId);
      if (!party) return null;
      if (party.type === 'PERSON' && party.personId) {
        const person = personById.get(party.personId);
        if (!person) return null;
        return { roleId: r.id, fullName: person.fullName, email: person.email };
      }
      if (party.type === 'COMPANY' && party.clientId) {
        const c = clientById.get(party.clientId);
        if (!c || c.deletedAt) return null;
        return { roleId: r.id, fullName: c.name };
      }
      if (party.type === 'COMPANY' && party.externalCompanyId) {
        const c = (db.externalCompanies ?? []).find((x) => x.id === party.externalCompanyId) ?? null;
        if (!c) return null;
        return { roleId: r.id, fullName: c.name };
      }
      return null;
    })
    .filter(Boolean) as Array<{ roleId: string; fullName: string; email?: string }>;

  const activeRoleIds = new Set(activeControllers.map((x) => x.roleId));
  if (removeRorcRoleIds.some((id) => !activeRoleIds.has(id))) return { ok: false as const, error: 'INVALID_INPUT' as const };
  const removed = activeControllers.filter((x) => removeRorcRoleIds.includes(x.roleId)).map((x) => ({ fullName: x.fullName, email: x.email }));

  if (controllerType === 'PERSON' || controllerType === 'COMPANY') {
    removeRorcRoleIds.length = 0;
    removeRorcRoleIds.push(...activeControllers.map((x) => x.roleId));
  }

  const now = nowIso();
  const id = newId('rrc');

  const expiresAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
  const templates = await import('@/lib/docTemplates');

  const signerPairs: Array<{ email: string; role: string; signatoryName?: string; signatoryTitle?: string; signatoryPhone?: string }> = [
    ...directors.map((d) => ({
      email: (d.person.email ?? '').trim().toLowerCase(),
      role: 'Director',
      signatoryName: d.person.fullName,
    })),
    ...(ccEmail
      ? [
          {
            email: ccEmail,
            role: ccTitleRaw ? `CC (${ccTitleRaw})` : 'CC',
            signatoryName: ccNameRaw || undefined,
            signatoryTitle: ccTitleRaw || undefined,
            signatoryPhone: ccPhoneRaw || undefined,
          },
        ]
      : []),
  ].filter((x) => !!x.email);

  const uniqueSignerPairs = Array.from(
    new Map(signerPairs.map((p) => [p.email.trim().toLowerCase(), { ...p, email: p.email.trim().toLowerCase() }])).values(),
  );

  if (!uniqueSignerPairs.length) return { ok: false as const, error: 'MISSING_SIGNER_EMAIL' as const };

  const signLinks: Array<{ email: string; url: string; signerRole: string; documentTitle: string }> = [];
  const packetIds: string[] = [];
  for (const signer of uniqueSignerPairs) {
    const html =
      controllerType === 'PERSON' || controllerType === 'COMPANY'
        ? templates.renderRorcControllerDeclarationHtml({
            companyName: client.name,
            companyRegistrationNo: client.companyRegistrationNo,
            controllerType,
            effectiveDate,
            signedDateYmd: now.slice(0, 10),
            signatoryName: signer.signatoryName,
            signatoryTitle: signer.signatoryTitle,
            controllerPerson: input.controllerPerson,
            controllerCompany: input.controllerCompany,
          })
        : templates.renderRorcDeclarationHtml({
            companyName: client.name,
            effectiveDate,
            message: input.message,
            addControllers,
            removeControllers: removed,
          });

    const doc: Document = {
      id: newId('doc'),
      type: 'RORC_DECL',
      title: `RORC Declaration - ${client.name} - ${signer.email}`,
      html,
      sha256: sha256Hex(html),
      createdAt: now,
    };
    db.documents.unshift(doc);

    const packet: SignaturePacket = {
      id: newId('spk'),
      kind: 'RORC_DECL',
      relatedType: 'RORC_DECLARATION',
      relatedId: id,
      documentId: doc.id,
      status: 'SIGNING',
      createdAt: now,
      updatedAt: now,
    };
    db.signaturePackets.unshift(packet);
    packetIds.push(packet.id);

    const token = newToken();
    const req: SignatureRequest = {
      id: newId('sgr'),
      packetId: packet.id,
      email: signer.email,
      tokenHash: sha256Hex(token),
      expiresAt,
      status: 'PENDING',
      signerFullName: signer.signatoryName,
      signerTitle: signer.signatoryTitle,
      signerPhone: signer.signatoryPhone,
      createdAt: now,
      updatedAt: now,
    };
    db.signatureRequests.unshift(req);
    signLinks.push({ email: signer.email, url: `/sign/${token}`, signerRole: signer.role, documentTitle: doc.title });
  }

  const request: RorcDeclarationRequest = {
    id,
    clientId: input.clientId,
    status: 'PENDING_SIGNATURES',
    effectiveDate,
    controllerType,
    controllerPerson: input.controllerPerson,
    controllerCompany: input.controllerCompany,
    message: typeof input.message === 'string' ? input.message.trim() || undefined : undefined,
    removeRorcRoleIds,
    addControllers,
    createdByUserId: input.createdByUserId,
    packetId: packetIds[0],
    packetIds,
    createdAt: now,
    updatedAt: now,
    submittedAt: now,
  };

  const list = getRorcDeclarationRequestList(db);
  list.unshift(request);
  (db as unknown as { rorcDeclarationRequests?: RorcDeclarationRequest[] }).rorcDeclarationRequests = list;
  await writeDb(db);
  return { ok: true as const, request, signLinks };
}

export async function decideRorcDeclarationRequest(input: {
  requestId: string;
  decidedByUserId: string;
  decision: 'APPROVE' | 'REJECT' | 'NEED_MORE_INFO';
  note?: string;
}) {
  const db = await readDb();
  const list = getRorcDeclarationRequestList(db);
  const idx = list.findIndex((r) => r.id === input.requestId);
  if (idx < 0) return { ok: false as const, error: 'NOT_FOUND' as const };

  const r = list[idx];
  if (r.status === 'REJECTED' || r.status === 'COMPLETE') return { ok: false as const, error: 'INVALID_STATE' as const };
  const packetIds = Array.isArray((r as any).packetIds) && (r as any).packetIds.length ? ((r as any).packetIds as string[]) : [r.packetId];
  const packets = db.signaturePackets.filter((p) => packetIds.includes(p.id));
  if (!packets.length) return { ok: false as const, error: 'NOT_FOUND' as const };

  const now = nowIso();
  const note = typeof input.note === 'string' ? input.note.trim() || undefined : undefined;

  if (input.decision === 'NEED_MORE_INFO') {
    list[idx] = { ...r, status: 'NEED_MORE_INFO', decidedAt: now, decidedByUserId: input.decidedByUserId, decisionNote: note, updatedAt: now };
    (db as unknown as { rorcDeclarationRequests?: RorcDeclarationRequest[] }).rorcDeclarationRequests = list;
    await writeDb(db);
    return { ok: true as const, request: list[idx] };
  }

  if (input.decision === 'REJECT') {
    list[idx] = { ...r, status: 'REJECTED', decidedAt: now, decidedByUserId: input.decidedByUserId, decisionNote: note, updatedAt: now };
    (db as unknown as { rorcDeclarationRequests?: RorcDeclarationRequest[] }).rorcDeclarationRequests = list;
    await writeDb(db);
    return { ok: true as const, request: list[idx] };
  }

  if (r.status !== 'PENDING_REVIEW' && r.status !== 'PENDING_SIGNATURES') return { ok: false as const, error: 'INVALID_STATE' as const };

  for (let i = 0; i < db.clientPartyRoles.length; i++) {
    const role = db.clientPartyRoles[i];
    if (role.clientId !== r.clientId) continue;
    if (role.role !== 'RORC') continue;
    if (role.toDate) continue;
    db.clientPartyRoles[i] = { ...role, toDate: r.effectiveDate, updatedAt: now };
  }

  if (r.controllerType === 'PERSON' && r.controllerPerson?.fullName?.trim()) {
    const fullName = r.controllerPerson.fullName.trim();
    const email = typeof r.controllerPerson.email === 'string' ? r.controllerPerson.email.trim() || undefined : undefined;
    const person: Person = { id: newId('per'), fullName, email, createdAt: now, updatedAt: now };
    const party: Party = { id: newId('pty'), type: 'PERSON', displayName: fullName, personId: person.id, createdAt: now, updatedAt: now };
    const role: ClientPartyRole = {
      id: newId('cpr'),
      clientId: r.clientId,
      partyId: party.id,
      role: 'RORC',
      fromDate: r.effectiveDate,
      createdAt: now,
      updatedAt: now,
    };
    db.persons.unshift(person);
    db.parties.unshift(party);
    db.clientPartyRoles.unshift(role);
  }

  if (r.controllerType === 'COMPANY' && r.controllerCompany?.companyName?.trim()) {
    const companyName = r.controllerCompany.companyName.trim();
    const regNo = String(r.controllerCompany.registerNumber ?? '').trim();
    const regKey = String(regNo ?? '')
      .trim()
      .replace(/\s+/g, '')
      .toLowerCase();
    const linkedClient =
      regKey
        ? db.clients.find((c) => String(c.companyRegistrationNo ?? '').trim().replace(/\s+/g, '').toLowerCase() === regKey && !c.deletedAt) ?? null
        : null;

    const party = (() => {
      if (linkedClient) {
        const existingParty = db.parties.find((p) => p.type === 'COMPANY' && p.clientId === linkedClient.id) ?? null;
        if (existingParty) return existingParty;
        const next: Party = {
          id: newId('pty'),
          type: 'COMPANY',
          displayName: linkedClient.name,
          clientId: linkedClient.id,
          createdAt: now,
          updatedAt: now,
        };
        db.parties.unshift(next);
        return next;
      }

      const extKey = regKey;
      const existingExt =
        extKey ? db.externalCompanies.find((c) => String(c.registrationNo ?? '').trim().replace(/\s+/g, '').toLowerCase() === extKey) ?? null : null;
      const ext = existingExt
        ? {
            ...existingExt,
            name: companyName || existingExt.name,
            jurisdiction: String(r.controllerCompany?.countryOfIncorporation ?? '').trim() || existingExt.jurisdiction,
            address: String(r.controllerCompany?.companyAddress ?? '').trim() || existingExt.address,
            updatedAt: now,
          }
        : {
            id: newId('exc'),
            name: companyName,
            registrationNo: regNo || undefined,
            jurisdiction: String(r.controllerCompany?.countryOfIncorporation ?? '').trim() || undefined,
            address: String(r.controllerCompany?.companyAddress ?? '').trim() || undefined,
            createdAt: now,
            updatedAt: now,
          };
      if (existingExt) {
        const i = db.externalCompanies.findIndex((c) => c.id === existingExt.id);
        if (i >= 0) db.externalCompanies[i] = ext;
      } else {
        db.externalCompanies.unshift(ext);
      }

      const existingParty = db.parties.find((p) => p.type === 'COMPANY' && p.externalCompanyId === ext.id) ?? null;
      if (existingParty) {
        const i = db.parties.findIndex((p) => p.id === existingParty.id);
        const updated: Party = { ...existingParty, displayName: ext.name, updatedAt: now };
        if (i >= 0) db.parties[i] = updated;
        return updated;
      }
      const next: Party = {
        id: newId('pty'),
        type: 'COMPANY',
        displayName: ext.name,
        externalCompanyId: ext.id,
        createdAt: now,
        updatedAt: now,
      };
      db.parties.unshift(next);
      return next;
    })();

    const role: ClientPartyRole = {
      id: newId('cpr'),
      clientId: r.clientId,
      partyId: party.id,
      role: 'RORC',
      fromDate: r.effectiveDate,
      createdAt: now,
      updatedAt: now,
    };
    db.clientPartyRoles.unshift(role);
  }

  // overwrite previous controllers; explicit removals no longer needed

  for (const c of r.addControllers) {
    const fullName = c.fullName.trim();
    if (!fullName) continue;
    const email = typeof c.email === 'string' ? c.email.trim() || undefined : undefined;
    const person: Person = { id: newId('per'), fullName, email, createdAt: now, updatedAt: now };
    const party: Party = { id: newId('pty'), type: 'PERSON', displayName: fullName, personId: person.id, createdAt: now, updatedAt: now };
    const role: ClientPartyRole = {
      id: newId('cpr'),
      clientId: r.clientId,
      partyId: party.id,
      role: 'RORC',
      fromDate: r.effectiveDate,
      createdAt: now,
      updatedAt: now,
    };
    db.persons.unshift(person);
    db.parties.unshift(party);
    db.clientPartyRoles.unshift(role);
  }

  list[idx] = { ...r, status: 'COMPLETE', decidedAt: now, decidedByUserId: input.decidedByUserId, decisionNote: note, updatedAt: now };
  (db as unknown as { rorcDeclarationRequests?: RorcDeclarationRequest[] }).rorcDeclarationRequests = list;
  await writeDb(db);
  return { ok: true as const, request: list[idx] };
}

function getAnnualGeneralMeetingRequestList(db: Db) {
  return Array.isArray((db as unknown as { annualGeneralMeetingRequests?: unknown }).annualGeneralMeetingRequests)
    ? (((db as unknown as { annualGeneralMeetingRequests?: AnnualGeneralMeetingRequest[] }).annualGeneralMeetingRequests ??
        []) as AnnualGeneralMeetingRequest[])
    : [];
}

export async function listAnnualGeneralMeetingRequestsByClient(clientId: string) {
  const db = await readDb();
  return getAnnualGeneralMeetingRequestList(db)
    .filter((r) => r.clientId === clientId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getAnnualGeneralMeetingRequestContext(requestId: string) {
  const db = await readDb();
  const request = getAnnualGeneralMeetingRequestList(db).find((r) => r.id === requestId) ?? null;
  if (!request) return null;

  const packetIds = (request.packetIds ?? []).length ? (request.packetIds ?? []) : [request.packetId];
  const assets = packetIds
    .map((packetId) => {
      const packet = db.signaturePackets.find((p) => p.id === packetId) ?? null;
      if (!packet) return null;
      const document = db.documents.find((d) => d.id === packet.documentId) ?? null;
      if (!document) return null;
      const signatures = db.signatureRequests
        .filter((r) => r.packetId === packet.id)
        .sort((a, b) => a.email.localeCompare(b.email));
      return { packet, document, signatures };
    })
    .filter((x): x is { packet: SignaturePacket; document: Document; signatures: SignatureRequest[] } => x !== null);
  if (!assets.length) return null;
  return { request, assets };
}

export async function createAnnualGeneralMeetingRequest(input: {
  clientId: string;
  createdByUserId: string;
  meetingDate: string;
  meetingTime?: string;
  meetingVenue: string;
  chairman: string;
  noticeDirector: string;
  companyCategory?: string;
  fiscalYearReport: string;
  useByBridgeRegisteredOfficeAddress?: boolean;
}) {
  const db = await readDb();
  const client = db.clients.find((c) => c.id === input.clientId) ?? null;
  if (!client || client.deletedAt) return { ok: false as const, error: 'NOT_FOUND' as const };

  const meetingDate = input.meetingDate.trim();
  const meetingTime = typeof input.meetingTime === 'string' ? input.meetingTime.trim() || undefined : undefined;
  const meetingVenue = input.meetingVenue.trim();
  const chairman = input.chairman.trim();
  const noticeDirector = input.noticeDirector.trim();
  const fiscalYearReport = input.fiscalYearReport.trim();
  const companyCategory = typeof input.companyCategory === 'string' ? input.companyCategory.trim() || undefined : undefined;
  const useByBridgeRegisteredOfficeAddress = !!input.useByBridgeRegisteredOfficeAddress;
  if (!meetingDate || !meetingVenue || !chairman || !noticeDirector || !fiscalYearReport) {
    return { ok: false as const, error: 'INVALID_INPUT' as const };
  }

  const directors = await listClientDirectors(input.clientId);
  const directorsByName = new Map(directors.map((d) => [d.person.fullName.trim(), d.person]));
  const signerEmails = Array.from(
    new Set(
      directors
        .map((d) => (d.person.email ?? '').trim())
        .filter(Boolean)
        .map((e) => e.toLowerCase()),
    ),
  );
  if (signerEmails.length !== directors.length) return { ok: false as const, error: 'MISSING_SIGNER_EMAIL' as const };

  const noticeSigner = directorsByName.get(noticeDirector) ?? null;
  if (!noticeSigner?.email?.trim()) return { ok: false as const, error: 'MISSING_SIGNER_EMAIL' as const };
  const chairmanSigner = directorsByName.get(chairman) ?? noticeSigner;

  const partyById = new Map(db.parties.map((p) => [p.id, p]));
  const personById = new Map(db.persons.map((p) => [p.id, p]));
  const registrableControllerNames = db.clientPartyRoles
    .filter((r) => r.clientId === input.clientId && r.role === 'RORC' && !r.toDate)
    .map((r) => {
      const party = partyById.get(r.partyId);
      if (!party || party.type !== 'PERSON' || !party.personId) return null;
      const p = personById.get(party.personId);
      return p?.fullName ?? null;
    })
    .filter((x): x is string => !!x)
    .map((x) => x.trim())
    .filter(Boolean);

  const fiscalYearEndYmd = (() => {
    const year = fiscalYearReport.trim();
    if (!/^\d{4}$/.test(year)) return '';
    const fye = String(client.fye ?? '').trim();
    const m = fye.match(/^(\d{2})\/(\d{2})$/);
    if (!m) return '';
    return `${year}-${m[1]}-${m[2]}`;
  })();

  const now = nowIso();
  const id = newId('agm');

  const templates = await import('@/lib/docTemplates');
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const signLinks: Array<{ email: string; url: string; documentTitle: string }> = [];
  const packetIds: string[] = [];

  async function createDocAndPacket(args: {
    kind: SignaturePacketKind;
    documentType: DocumentType;
    title: string;
    html: string;
    signerEmails: string[];
  }) {
    const doc: Document = {
      id: newId('doc'),
      type: args.documentType,
      title: args.title,
      html: args.html,
      sha256: sha256Hex(args.html),
      createdAt: now,
    };
    db.documents.unshift(doc);

    const packet: SignaturePacket = {
      id: newId('spk'),
      kind: args.kind,
      relatedType: 'ANNUAL_GENERAL_MEETING',
      relatedId: id,
      documentId: doc.id,
      status: 'SIGNING',
      createdAt: now,
      updatedAt: now,
    };
    db.signaturePackets.unshift(packet);
    packetIds.push(packet.id);

    for (const emailKey of args.signerEmails) {
      const token = newToken();
      const req: SignatureRequest = {
        id: newId('sgr'),
        packetId: packet.id,
        email: emailKey,
        tokenHash: sha256Hex(token),
        expiresAt,
        status: 'PENDING',
        createdAt: now,
        updatedAt: now,
      };
      db.signatureRequests.unshift(req);
      signLinks.push({ email: emailKey, url: `/sign/${token}`, documentTitle: args.title });
    }
    return { doc, packet };
  }

  const noticeHtml = templates.renderAnnualGeneralMeetingNoticeHtml({
    companyName: client.name,
    companyRegistrationNo: client.companyRegistrationNo,
    meetingDateYmd: meetingDate,
    meetingTime,
    meetingVenue,
    noticeDateYmd: now.slice(0, 10),
    companyCategory,
    fiscalYearEndYmd: fiscalYearEndYmd || undefined,
    signer: { fullName: noticeSigner.fullName, email: noticeSigner.email },
  });
  await createDocAndPacket({
    kind: 'AGM_NOTICE',
    documentType: 'AGM_NOTICE',
    title: `AGM Notice - ${client.name}`,
    html: noticeHtml,
    signerEmails: [noticeSigner.email.trim().toLowerCase()],
  });

  const minutesHtml = templates.renderAnnualGeneralMeetingMinutesHtml({
    companyName: client.name,
    companyRegistrationNo: client.companyRegistrationNo,
    meetingDateYmd: meetingDate,
    meetingTime,
    meetingVenue,
    chairmanName: chairman,
    companyCategory,
    fiscalYearEndYmd: fiscalYearEndYmd || undefined,
    registrableControllerNames,
    signer: { fullName: chairmanSigner.fullName, email: chairmanSigner.email },
  });
  const minutesPacket = await createDocAndPacket({
    kind: 'AGM_MIN',
    documentType: 'AGM_MIN',
    title: `AGM Minutes - ${client.name}`,
    html: minutesHtml,
    signerEmails: [String(chairmanSigner.email).trim().toLowerCase()],
  });

  const dirStmtHtml = templates.renderAnnualGeneralMeetingDirectorStatementHtml({
    companyName: client.name,
    companyRegistrationNo: client.companyRegistrationNo,
    dateYmd: now.slice(0, 10),
    companyCategory,
    signers: [{ fullName: chairmanSigner.fullName, email: chairmanSigner.email }],
  });
  await createDocAndPacket({
    kind: 'AGM_DIR_STMT',
    documentType: 'AGM_DIR_STMT',
    title: `AGM Director Statement - ${client.name}`,
    html: dirStmtHtml,
    signerEmails: [String(chairmanSigner.email).trim().toLowerCase()],
  });

  const request: AnnualGeneralMeetingRequest = {
    id,
    clientId: input.clientId,
    status: 'PENDING_SIGNATURES',
    meetingDate,
    meetingTime,
    meetingVenue,
    chairman,
    directorSendingNotice: noticeDirector,
    fiscalYearReport,
    companyCategory,
    useByBridgeRegisteredOfficeAddress,
    createdByUserId: input.createdByUserId,
    packetId: minutesPacket.packet.id,
    packetIds,
    createdAt: now,
    updatedAt: now,
    submittedAt: now,
  };

  const list = getAnnualGeneralMeetingRequestList(db);
  list.unshift(request);
  (db as unknown as { annualGeneralMeetingRequests?: AnnualGeneralMeetingRequest[] }).annualGeneralMeetingRequests = list;
  await writeDb(db);
  return { ok: true as const, request, signLinks };
}

export async function decideAnnualGeneralMeetingRequest(input: {
  requestId: string;
  decidedByUserId: string;
  decision: 'APPROVE' | 'REJECT' | 'NEED_MORE_INFO';
  note?: string;
}) {
  const db = await readDb();
  const list = getAnnualGeneralMeetingRequestList(db);
  const idx = list.findIndex((r) => r.id === input.requestId);
  if (idx < 0) return { ok: false as const, error: 'NOT_FOUND' as const };

  const r = list[idx];
  if (r.status === 'REJECTED' || r.status === 'COMPLETE') return { ok: false as const, error: 'INVALID_STATE' as const };
  const packetIds = (r.packetIds ?? []).length ? (r.packetIds ?? []) : [r.packetId];
  const packets = packetIds.map((id) => db.signaturePackets.find((p) => p.id === id) ?? null);
  if (packets.some((p) => !p)) return { ok: false as const, error: 'NOT_FOUND' as const };

  const now = nowIso();
  const note = typeof input.note === 'string' ? input.note.trim() || undefined : undefined;

  if (input.decision === 'NEED_MORE_INFO') {
    list[idx] = { ...r, status: 'NEED_MORE_INFO', decidedAt: now, decidedByUserId: input.decidedByUserId, decisionNote: note, updatedAt: now };
    (db as unknown as { annualGeneralMeetingRequests?: AnnualGeneralMeetingRequest[] }).annualGeneralMeetingRequests = list;
    await writeDb(db);
    return { ok: true as const, request: list[idx] };
  }

  if (input.decision === 'REJECT') {
    list[idx] = { ...r, status: 'REJECTED', decidedAt: now, decidedByUserId: input.decidedByUserId, decisionNote: note, updatedAt: now };
    (db as unknown as { annualGeneralMeetingRequests?: AnnualGeneralMeetingRequest[] }).annualGeneralMeetingRequests = list;
    await writeDb(db);
    return { ok: true as const, request: list[idx] };
  }

  if (r.status !== 'PENDING_REVIEW' && r.status !== 'PENDING_SIGNATURES') return { ok: false as const, error: 'INVALID_STATE' as const };

  const clientIdx = db.clients.findIndex((c) => c.id === r.clientId);
  if (clientIdx >= 0) {
    db.clients[clientIdx] = { ...db.clients[clientIdx], latestAgmDate: r.meetingDate };
  }

  list[idx] = { ...r, status: 'COMPLETE', decidedAt: now, decidedByUserId: input.decidedByUserId, decisionNote: note, updatedAt: now };
  (db as unknown as { annualGeneralMeetingRequests?: AnnualGeneralMeetingRequest[] }).annualGeneralMeetingRequests = list;
  await writeDb(db);
  return { ok: true as const, request: list[idx] };
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

export async function listIncorporationApplications() {
  const db = await readDb();
  return db.incorporationApplications ?? [];
}

export async function findIncorporationApplicationById(applicationId: string) {
  const db = await readDb();
  const list = db.incorporationApplications ?? [];
  return list.find((a) => a.id === applicationId) ?? null;
}

export async function listIncorporationApplicationEvents(applicationId: string) {
  const db = await readDb();
  const list = db.incorporationApplicationEvents ?? [];
  return list
    .filter((e) => e.applicationId === applicationId)
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
}

export async function listIncorporationApplicationFiles(applicationId: string) {
  const db = await readDb();
  const list = db.incorporationApplicationFiles ?? [];
  return list
    .filter((f) => f.applicationId === applicationId)
    .sort((a, b) => (b.uploadedAt ?? '').localeCompare(a.uploadedAt ?? ''));
}

export async function getIncorporationApplicationDetail(applicationId: string) {
  const db = await readDb();
  const application = (db.incorporationApplications ?? []).find((a) => a.id === applicationId) ?? null;
  if (!application) return null;
  const events = (db.incorporationApplicationEvents ?? [])
    .filter((e) => e.applicationId === applicationId)
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  const files = (db.incorporationApplicationFiles ?? [])
    .filter((f) => f.applicationId === applicationId)
    .sort((a, b) => (b.uploadedAt ?? '').localeCompare(a.uploadedAt ?? ''));
  return { application, events, files };
}

export async function createIncorporationApplication(input: {
  type: 'REGISTER_COMPANY' | 'TRANSFER_COMPANY_SECRETARY';
  status: 'DRAFT' | 'SUBMITTED';
  title: string;
  companyId?: string;
  companyName?: string;
  payload: Record<string, unknown>;
  createdByUserId: string;
  assignedToUserId?: string;
  actor: { id: string; name: string; role: Role };
  note?: string;
}) {
  const db = await readDb();
  if (!db.incorporationApplications) db.incorporationApplications = [];
  if (!db.incorporationApplicationEvents) db.incorporationApplicationEvents = [];

  const now = nowIso();
  const appId = newId('inc');
  const application: IncorporationApplication = {
    id: appId,
    type: input.type,
    status: input.status,
    title: input.title,
    companyId: input.companyId,
    companyName: input.companyName,
    payload: input.payload,
    createdByUserId: input.createdByUserId,
    assignedToUserId: input.assignedToUserId,
    createdAt: now,
    updatedAt: now,
    submittedAt: input.status === 'SUBMITTED' ? now : undefined,
  };
  db.incorporationApplications.unshift(application);

  const ev: IncorporationApplicationEvent = {
    id: newId('incev'),
    applicationId: appId,
    toStatus: input.status,
    note: input.note,
    actorUserId: input.actor.id,
    actorName: input.actor.name,
    actorRole: input.actor.role,
    createdAt: now,
  };
  db.incorporationApplicationEvents.unshift(ev);

  await writeDb(db);
  return application;
}

export async function updateIncorporationApplication(applicationId: string, patch: Partial<IncorporationApplication>) {
  const db = await readDb();
  const list = db.incorporationApplications ?? [];
  const idx = list.findIndex((a) => a.id === applicationId);
  if (idx < 0) return null;
  const now = nowIso();
  const prev = list[idx];
  const next: IncorporationApplication = {
    ...prev,
    ...patch,
    id: prev.id,
    createdAt: prev.createdAt,
    createdByUserId: prev.createdByUserId,
    updatedAt: now,
  };
  list[idx] = next;
  db.incorporationApplications = list;
  await writeDb(db);
  return next;
}

export async function transitionIncorporationApplicationStatus(input: {
  applicationId: string;
  toStatus: IncorporationApplicationStatus;
  actor: { id: string; name: string; role: Role };
  note?: string;
  decided?: boolean;
}) {
  const db = await readDb();
  if (!db.incorporationApplicationEvents) db.incorporationApplicationEvents = [];
  const list = db.incorporationApplications ?? [];
  const idx = list.findIndex((a) => a.id === input.applicationId);
  if (idx < 0) return null;
  const prev = list[idx];
  const now = nowIso();

  const next: IncorporationApplication = {
    ...prev,
    status: input.toStatus,
    updatedAt: now,
    submittedAt: input.toStatus === 'SUBMITTED' ? (prev.submittedAt ?? now) : prev.submittedAt,
    decidedAt: input.decided ? now : prev.decidedAt,
    decidedByUserId: input.decided ? input.actor.id : prev.decidedByUserId,
    decisionNote: input.decided ? input.note : prev.decisionNote,
  };
  list[idx] = next;
  db.incorporationApplications = list;

  const ev: IncorporationApplicationEvent = {
    id: newId('incev'),
    applicationId: input.applicationId,
    fromStatus: prev.status,
    toStatus: input.toStatus,
    note: input.note,
    actorUserId: input.actor.id,
    actorName: input.actor.name,
    actorRole: input.actor.role,
    createdAt: now,
  };
  db.incorporationApplicationEvents.unshift(ev);

  await writeDb(db);
  return next;
}

export async function addIncorporationApplicationFile(input: {
  applicationId: string;
  fileName: string;
  mimeType: string;
  size: number;
  dataBase64: string;
  uploadedBy: { id: string; name: string };
}) {
  const db = await readDb();
  if (!db.incorporationApplicationFiles) db.incorporationApplicationFiles = [];
  const now = nowIso();
  const f: IncorporationApplicationFile = {
    id: newId('incf'),
    applicationId: input.applicationId,
    fileName: input.fileName,
    mimeType: input.mimeType,
    size: input.size,
    dataBase64: input.dataBase64,
    uploadedByUserId: input.uploadedBy.id,
    uploadedByName: input.uploadedBy.name,
    uploadedAt: now,
  };
  db.incorporationApplicationFiles.unshift(f);
  await writeDb(db);
  return f;
}

export async function findIncorporationApplicationFileById(fileId: string) {
  const db = await readDb();
  return (db.incorporationApplicationFiles ?? []).find((f) => f.id === fileId) ?? null;
}
