const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function nowIso() {
  return new Date().toISOString();
}

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(10).toString('hex')}`;
}

function normalizeName(s) {
  return String(s ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function parseMoney(input) {
  const s = String(input ?? '').trim();
  const m = s.match(/^(SGD|USD|CNY|MYR)\s+([0-9,]+(?:\.[0-9]+)?)$/i);
  if (!m) return { currency: undefined, amount: undefined };
  const currency = m[1].toUpperCase();
  const amount = Number(String(m[2]).replace(/,/g, ''));
  if (!Number.isFinite(amount)) return { currency: currency, amount: undefined };
  return { currency, amount };
}

function dateToIso(dateYmd) {
  const s = String(dateYmd ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return nowIso();
  return `${s}T00:00:00.000Z`;
}

function computeShareAllocation(totalShares, names) {
  const total = Number(totalShares);
  if (!Number.isFinite(total) || total <= 0) return new Map();

  const counts = new Map();
  const order = [];
  for (const n of names) {
    const key = String(n ?? '').trim();
    if (!key) continue;
    if (!counts.has(key)) order.push(key);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const totalWeights = order.reduce((sum, k) => sum + (counts.get(k) ?? 0), 0);
  if (!totalWeights) return new Map();

  const base = Math.floor(total / totalWeights);
  let remainder = total - base * totalWeights;

  const sharesByName = new Map();
  for (const k of order) {
    const w = counts.get(k) ?? 0;
    const extra = Math.min(remainder, w);
    remainder -= extra;
    sharesByName.set(k, base * w + extra);
  }
  return sharesByName;
}

function nextClientCode(existingCodes) {
  let max = 0;
  for (const c of existingCodes) {
    const m = String(c ?? '').match(/^SC(\d{3})$/);
    if (!m) continue;
    max = Math.max(max, Number(m[1]));
  }
  const n = max + 1;
  return `SC${String(n).padStart(3, '0')}`;
}

const INPUT = [
  {
    name: 'Liyang Engineering Pte Ltd',
    member: 'TAN YING YING',
    regNo: '202622672W',
    paidUpCapital: 'SGD 100,000.00',
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
    paidUpCapital: 'SGD 50,000.00',
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
    paidUpCapital: 'SGD 50,000.00',
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
    paidUpCapital: 'SGD 10,000.00',
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
    paidUpCapital: 'SGD 1,000.00',
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
    paidUpCapital: 'SGD 100,000.00',
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
    paidUpCapital: 'SGD 10,000.00',
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
    paidUpCapital: 'SGD 100,000.00',
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
    paidUpCapital: 'SGD 10,000.00',
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
    paidUpCapital: 'SGD 100.00',
    totalShares: 100,
    rorc: 'Feng Songtao',
    directors: ['Feng Songtao'],
    shareholders: ['Feng Songtao'],
    createdDate: '2025-10-07',
  },
];

function main() {
  const dbPath = path.join(process.cwd(), '.gos', 'db.json');
  if (!fs.existsSync(dbPath)) {
    console.error('DB not found:', dbPath);
    process.exit(1);
  }

  const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  if (!Array.isArray(db.clients)) db.clients = [];
  if (!Array.isArray(db.persons)) db.persons = [];
  if (!Array.isArray(db.parties)) db.parties = [];
  if (!Array.isArray(db.clientPartyRoles)) db.clientPartyRoles = [];

  const personsByName = new Map(db.persons.map((p) => [normalizeName(p.fullName), p]));
  const partiesByPersonId = new Map(db.parties.filter((p) => p.type === 'PERSON' && p.personId).map((p) => [p.personId, p]));

  const clientsByRegNo = new Map(
    db.clients
      .filter((c) => !c.deletedAt)
      .filter((c) => c.companyRegistrationNo)
      .map((c) => [String(c.companyRegistrationNo).trim(), c]),
  );
  const clientsByName = new Map(db.clients.filter((c) => !c.deletedAt).map((c) => [normalizeName(c.name), c]));

  function getOrCreatePerson(fullName, createdDate) {
    const key = normalizeName(fullName);
    if (!key) return null;
    const hit = personsByName.get(key);
    if (hit) return hit;
    const createdAt = dateToIso(createdDate);
    const person = {
      id: newId('per'),
      fullName: String(fullName).trim(),
      createdAt,
      updatedAt: createdAt,
    };
    db.persons.unshift(person);
    personsByName.set(key, person);
    return person;
  }

  function getOrCreatePartyForPerson(person, createdDate) {
    const hit = partiesByPersonId.get(person.id);
    if (hit) return hit;
    const createdAt = dateToIso(createdDate);
    const party = {
      id: newId('pty'),
      type: 'PERSON',
      displayName: person.fullName,
      personId: person.id,
      createdAt,
      updatedAt: createdAt,
    };
    db.parties.unshift(party);
    partiesByPersonId.set(person.id, party);
    return party;
  }

  function addOrUpdateRole({ clientId, partyId, role, date, shares }) {
    const active = db.clientPartyRoles.find(
      (r) =>
        r.clientId === clientId &&
        r.partyId === partyId &&
        r.role === role &&
        (role === 'DIRECTOR' || role === 'SECRETARY' ? !r.resignationDate : !r.toDate),
    );

    const iso = dateToIso(date);
    if (active) {
      if (role === 'SHAREHOLDER' && typeof shares === 'number' && Number.isFinite(shares) && active.shares !== shares) {
        active.shares = shares;
        active.updatedAt = nowIso();
      }
      return { created: false };
    }

    const roleRow = {
      id: newId('cpr'),
      clientId,
      partyId,
      role,
      appointmentDate: role === 'DIRECTOR' || role === 'SECRETARY' ? iso.slice(0, 10) : undefined,
      fromDate: role === 'SHAREHOLDER' || role === 'RORC' ? iso.slice(0, 10) : undefined,
      shares: role === 'SHAREHOLDER' && typeof shares === 'number' && Number.isFinite(shares) ? shares : undefined,
      createdAt: iso,
      updatedAt: iso,
    };
    db.clientPartyRoles.unshift(roleRow);
    return { created: true };
  }

  const existingCodes = db.clients.map((c) => c.code).filter(Boolean);
  let createdClients = 0;
  let updatedClients = 0;
  let createdPeople = 0;
  let createdRoles = 0;
  let updatedShareRoles = 0;

  for (const row of INPUT) {
    const name = String(row.name).trim();
    const regNo = String(row.regNo ?? '').trim() || undefined;
    const createdAt = dateToIso(row.createdDate);

    let client = (regNo ? clientsByRegNo.get(regNo) : null) ?? clientsByName.get(normalizeName(name)) ?? null;
    const { currency, amount } = parseMoney(row.paidUpCapital);

    if (!client) {
      const code = nextClientCode(existingCodes);
      existingCodes.push(code);
      client = {
        id: newId('cli'),
        code,
        name,
        companyRegistrationNo: regNo,
        contactPerson: row.member ? String(row.member).trim() : undefined,
        paidUpCapitalCurrency: currency,
        paidUpCapitalAmount: amount,
        totalShares: typeof row.totalShares === 'number' ? row.totalShares : undefined,
        tags: [],
        createdAt,
      };
      db.clients.unshift(client);
      createdClients++;
    } else {
      const before = JSON.stringify({
        name: client.name,
        companyRegistrationNo: client.companyRegistrationNo,
        contactPerson: client.contactPerson,
        paidUpCapitalCurrency: client.paidUpCapitalCurrency,
        paidUpCapitalAmount: client.paidUpCapitalAmount,
        totalShares: client.totalShares,
      });
      client.name = name;
      client.companyRegistrationNo = regNo;
      client.contactPerson = row.member ? String(row.member).trim() : client.contactPerson;
      client.paidUpCapitalCurrency = currency ?? client.paidUpCapitalCurrency;
      client.paidUpCapitalAmount = typeof amount === 'number' ? amount : client.paidUpCapitalAmount;
      client.totalShares = typeof row.totalShares === 'number' ? row.totalShares : client.totalShares;
      const after = JSON.stringify({
        name: client.name,
        companyRegistrationNo: client.companyRegistrationNo,
        contactPerson: client.contactPerson,
        paidUpCapitalCurrency: client.paidUpCapitalCurrency,
        paidUpCapitalAmount: client.paidUpCapitalAmount,
        totalShares: client.totalShares,
      });
      if (before !== after) updatedClients++;
    }

    if (regNo) clientsByRegNo.set(regNo, client);
    clientsByName.set(normalizeName(client.name), client);

    const peopleBefore = db.persons.length;
    const ensurePerson = (n) => getOrCreatePerson(n, row.createdDate);
    const ensureParty = (p) => getOrCreatePartyForPerson(p, row.createdDate);

    const rorcPerson = row.rorc ? ensurePerson(row.rorc) : null;
    if (rorcPerson) {
      const party = ensureParty(rorcPerson);
      const r = addOrUpdateRole({ clientId: client.id, partyId: party.id, role: 'RORC', date: row.createdDate });
      if (r.created) createdRoles++;
    }

    for (const dn of row.directors ?? []) {
      const p = ensurePerson(dn);
      if (!p) continue;
      const party = ensureParty(p);
      const r = addOrUpdateRole({ clientId: client.id, partyId: party.id, role: 'DIRECTOR', date: row.createdDate });
      if (r.created) createdRoles++;
    }

    const sharesByName = computeShareAllocation(client.totalShares, row.shareholders ?? []);
    for (const [sn, shares] of sharesByName.entries()) {
      const p = ensurePerson(sn);
      if (!p) continue;
      const party = ensureParty(p);
      const beforeShares = db.clientPartyRoles.find(
        (r) => r.clientId === client.id && r.partyId === party.id && r.role === 'SHAREHOLDER' && !r.toDate,
      )?.shares;
      const r = addOrUpdateRole({ clientId: client.id, partyId: party.id, role: 'SHAREHOLDER', date: row.createdDate, shares });
      if (r.created) createdRoles++;
      if (!r.created && beforeShares !== shares) updatedShareRoles++;
    }

    const peopleAfter = db.persons.length;
    createdPeople += Math.max(0, peopleAfter - peopleBefore);
  }

  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2) + '\n', 'utf8');
  console.log(
    JSON.stringify(
      {
        ok: true,
        createdClients,
        updatedClients,
        createdPeople,
        createdRoles,
        updatedShareRoles,
        clientsNow: db.clients.length,
        personsNow: db.persons.length,
        rolesNow: db.clientPartyRoles.length,
      },
      null,
      2,
    ),
  );
}

main();

