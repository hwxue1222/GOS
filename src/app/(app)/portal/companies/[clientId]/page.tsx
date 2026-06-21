import Link from 'next/link';
import { redirect } from 'next/navigation';

import FrontTopNavClient from '@/components/FrontTopNavClient';
import { getCurrentUser } from '@/lib/auth';
import { readDb } from '@/lib/db';
import ssic from '@/data/ssic.json';

type SsicRow = { code: string; description: string };
const SSIC_ROWS = (Array.isArray(ssic) ? ssic : []) as unknown as SsicRow[];
const SSIC_DESC_BY_CODE = new Map(SSIC_ROWS.map((r) => [String(r.code ?? '').trim().toLowerCase(), String(r.description ?? '').trim()]));

function isActiveDirector(r: { role: string; resignationDate?: string }) {
  return r.role === 'DIRECTOR' && !r.resignationDate;
}

function isActiveRole(r: { role: string; resignationDate?: string; toDate?: string }) {
  if (r.role === 'DIRECTOR' || r.role === 'SECRETARY') return !r.resignationDate;
  if (r.role === 'SHAREHOLDER' || r.role === 'RORC') return !r.toDate;
  return true;
}

function canAccessClient(db: Awaited<ReturnType<typeof readDb>>, user: { role: string; email: string }, clientId: string) {
  if (user.role !== 'client') return true;
  const emailKey = user.email.trim().toLowerCase();
  const partyById = new Map(db.parties.map((p) => [p.id, p]));
  const personById = new Map(db.persons.map((p) => [p.id, p]));
  for (const r of db.clientPartyRoles) {
    if (r.clientId !== clientId) continue;
    if (!isActiveDirector(r)) continue;
    const party = partyById.get(r.partyId);
    if (!party || party.type !== 'PERSON' || !party.personId) continue;
    const person = personById.get(party.personId);
    if (!person) continue;
    if ((person.email ?? '').trim().toLowerCase() !== emailKey) continue;
    return true;
  }
  return false;
}

function money(currency?: string, amount?: number) {
  if (!currency || typeof amount !== 'number' || !Number.isFinite(amount)) return '-';
  return `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function date10(value?: string) {
  const s = String(value ?? '').trim();
  return s ? s.slice(0, 10) : '-';
}

function DlRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-3 py-2 border-t border-black/5">
      <div className="text-sm text-black/50">{label}</div>
      <div className="sm:col-span-2 text-sm text-black">{value}</div>
    </div>
  );
}

function SsicValue({ code }: { code?: string }) {
  const s = String(code ?? '').trim();
  if (!s) return '-';
  const desc = SSIC_DESC_BY_CODE.get(s.toLowerCase()) ?? '';
  if (!desc) return s;
  return (
    <div className="min-w-0">
      <div>{s}</div>
      <div className="mt-0.5 text-xs text-black/50 break-words" title={desc}>
        {desc}
      </div>
    </div>
  );
}

export default async function PortalCompanyDetailPage({ params }: { params: Promise<{ clientId: string }> }) {
  const me = await getCurrentUser();
  if (!me) return null;
  if (me.role !== 'client') redirect('/portal/login');

  const { clientId } = await params;
  const db = await readDb();

  const emailKey = me.email.trim().toLowerCase();
  const partyByIdForAccess = new Map(db.parties.map((p) => [p.id, p]));
  const personByIdForAccess = new Map(db.persons.map((p) => [p.id, p]));
  const allowedCompanyIds = new Set<string>();
  for (const r of db.clientPartyRoles) {
    if (!isActiveDirector(r)) continue;
    const party = partyByIdForAccess.get(r.partyId);
    if (!party || party.type !== 'PERSON' || !party.personId) continue;
    const person = personByIdForAccess.get(party.personId);
    if (!person) continue;
    if ((person.email ?? '').trim().toLowerCase() !== emailKey) continue;
    allowedCompanyIds.add(r.clientId);
  }

  const companies = db.clients
    .filter((c) => !c.deletedAt)
    .filter((c) => allowedCompanyIds.has(c.id))
    .map((c) => ({ id: c.id, name: c.name, code: c.code, isStruckOff: (c as any).isStruckOff }))
    .sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? '')));
  const client = db.clients.find((c) => c.id === clientId && !c.deletedAt) ?? null;
  if (!client) {
    return (
      <div className="min-h-screen flex flex-col">
        <FrontTopNavClient active="dashboard" user={{ id: me.id, name: me.name, email: me.email, role: me.role }} companies={companies} />
        <div className="flex-1">
          <div className="max-w-6xl mx-auto px-4 py-6">
            <div className="rounded-xl bg-white border border-black/5 p-6 text-sm text-black/60">NOT_FOUND</div>
          </div>
        </div>
      </div>
    );
  }

  if (!canAccessClient(db, me, clientId)) {
    return (
      <div className="min-h-screen flex flex-col">
        <FrontTopNavClient active="dashboard" user={{ id: me.id, name: me.name, email: me.email, role: me.role }} companies={companies} />
        <div className="flex-1">
          <div className="max-w-6xl mx-auto px-4 py-6">
            <div className="rounded-xl bg-white border border-black/5 p-6 text-sm text-red-600">FORBIDDEN</div>
          </div>
        </div>
      </div>
    );
  }

  const partyById = new Map(db.parties.map((p) => [p.id, p]));
  const personById = new Map(db.persons.map((p) => [p.id, p]));
  const activeRoles = db.clientPartyRoles
    .filter((r) => r.clientId === clientId)
    .filter((r) => isActiveRole(r))
    .map((r) => {
      const party = partyById.get(r.partyId);
      if (!party) return null;
      if (party.type === 'PERSON' && party.personId) {
        const person = personById.get(party.personId);
        if (!person) return null;
        return { role: r.role, name: person.fullName, shares: r.shares };
      }
      if (party.type === 'COMPANY' && party.clientId) {
        const c = db.clients.find((x) => x.id === party.clientId);
        if (!c) return null;
        return { role: r.role, name: c.name, shares: r.shares };
      }
      return null;
    })
    .filter(Boolean) as Array<{ role: string; name: string; shares?: number }>;

  const byRole = (role: string) => activeRoles.filter((x) => x.role === role);
  const directors = byRole('DIRECTOR');
  const secretaries = byRole('SECRETARY');
  const shareholders = byRole('SHAREHOLDER');
  const rorc = byRole('RORC');

  return (
    <div className="min-h-screen flex flex-col">
      <FrontTopNavClient active="dashboard" user={{ id: me.id, name: me.name, email: me.email, role: me.role }} companies={companies} />
      <div className="flex-1">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="text-sm text-[#2f7bdc]">
            <Link href="/dashboard" className="hover:underline">
              Home
            </Link>
            <span className="mx-2 text-black/30">/</span>
            <span className="text-black/70">Company details</span>
          </div>
          <div className="mt-1 flex items-start justify-between gap-3">
            <div>
              <div className="text-2xl font-bold">Company details</div>
              <div className="mt-1 text-sm text-black/50">{client.code}</div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <div className="rounded-xl bg-white border border-black/5 p-5">
                <div className="flex items-center gap-2">
                  <div className="text-base font-semibold">{client.name}</div>
                  {client.isStruckOff ? (
                    <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">
                      Struck Off
                    </span>
                  ) : null}
                </div>

                <div className="mt-4">
                  <DlRow label="Company registration no." value={client.companyRegistrationNo ?? '-'} />
                  <DlRow label="FYE" value={client.fye ?? '-'} />
                  <DlRow label="Entity status" value={client.entityStatus ?? '-'} />
                  <DlRow label="Incorporation date" value={date10(client.incorporationDate)} />
                  <DlRow label="Registered office address" value={client.registeredOfficeAddress ?? '-'} />
                  <DlRow label="Paid-up capital" value={money(client.paidUpCapitalCurrency, client.paidUpCapitalAmount)} />
                  <DlRow label="Total shares" value={typeof client.totalShares === 'number' ? client.totalShares.toLocaleString() : '-'} />
                  <DlRow label="SSIC (Primary)" value={<SsicValue code={client.ssicPrimaryCode} />} />
                  <DlRow label="SSIC (Secondary)" value={<SsicValue code={client.ssicSecondaryCode} />} />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-xl bg-white border border-black/5 p-5">
                <div className="text-sm font-semibold">People & roles</div>
                <div className="mt-3 space-y-3 text-sm">
                  <div>
                    <div className="text-black/50">Directors</div>
                    <div className="mt-1 text-black">{directors.length ? directors.map((d) => d.name).join(', ') : '-'}</div>
                  </div>
                  <div>
                    <div className="text-black/50">Secretaries</div>
                    <div className="mt-1 text-black">{secretaries.length ? secretaries.map((d) => d.name).join(', ') : '-'}</div>
                  </div>
                  <div>
                    <div className="text-black/50">Shareholders</div>
                    <div className="mt-1 text-black">
                      {shareholders.length
                        ? shareholders
                            .map((s) => (typeof s.shares === 'number' ? `${s.name} (${s.shares.toLocaleString()})` : s.name))
                            .join(', ')
                        : '-'}
                    </div>
                  </div>
                  <div>
                    <div className="text-black/50">RORC</div>
                    <div className="mt-1 text-black">{rorc.length ? rorc.map((d) => d.name).join(', ') : '-'}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
