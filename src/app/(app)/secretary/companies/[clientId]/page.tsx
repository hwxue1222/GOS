import AppTopNav from '@/components/AppTopNav';
import SecretaryCompanyClient from '@/app/(app)/secretary/companies/[clientId]/ui/SecretaryCompanyClient';
import { getCurrentUser } from '@/lib/auth';
import { readDb } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';
import { buildSecretaryServiceApplications } from '@/lib/secretaryApplications';

function isActiveRole(r: { role: string; resignationDate?: string; toDate?: string }) {
  if (r.role === 'DIRECTOR' || r.role === 'SECRETARY') return !r.resignationDate;
  if (r.role === 'SHAREHOLDER' || r.role === 'RORC') return !r.toDate;
  return true;
}

async function canAccessClient(user: { role: string; email: string }, clientId: string) {
  if (user.role !== 'client') return true;
  const db = await readDb();
  const emailKey = user.email.trim().toLowerCase();
  const partyById = new Map(db.parties.map((p) => [p.id, p]));
  const personById = new Map(db.persons.map((p) => [p.id, p]));
  for (const r of db.clientPartyRoles) {
    if (r.clientId !== clientId) continue;
    if (!isActiveRole(r)) continue;
    const party = partyById.get(r.partyId);
    if (!party || party.type !== 'PERSON' || !party.personId) continue;
    const person = personById.get(party.personId);
    if (!person) continue;
    if ((person.email ?? '').trim().toLowerCase() !== emailKey) continue;
    return true;
  }
  return false;
}

export default async function SecretaryCompanyPage({ params }: { params: Promise<{ clientId: string }> }) {
  const me = await getCurrentUser();
  if (!me) return null;

  const { clientId } = await params;
  if (!hasPermission(me, 'secretary', 'viewAll') && !hasPermission(me, 'secretary', 'viewAssigned')) {
    return (
      <div className="min-h-screen flex flex-col">
        <AppTopNav active="secretary" />
        <div className="flex-1">
          <div className="max-w-6xl mx-auto px-4 py-6">
            <div className="rounded-xl bg-white border border-black/5 p-6 text-sm text-red-600">FORBIDDEN</div>
          </div>
        </div>
      </div>
    );
  }
  if (!(await canAccessClient(me, clientId))) {
    return (
      <div className="min-h-screen flex flex-col">
        <AppTopNav active="secretary" />
        <div className="flex-1">
          <div className="max-w-6xl mx-auto px-4 py-6">
            <div className="rounded-xl bg-white border border-black/5 p-6 text-sm text-red-600">FORBIDDEN</div>
          </div>
        </div>
      </div>
    );
  }

  const db = await readDb();
  const client = db.clients.find((c) => c.id === clientId && !c.deletedAt) ?? null;
  if (!client) return null;

  const canEditCompany = hasPermission(me, 'secretary', 'update');
  const canEditRoles = canEditCompany && me.role !== 'client';

  const partyById = new Map(db.parties.map((p) => [p.id, p]));
  const personById = new Map(db.persons.map((p) => [p.id, p]));
  const clientById = new Map(db.clients.map((c) => [c.id, c]));
  const portalUsers = (db as unknown as { portalUsers?: Array<{ id: string; email: string }> }).portalUsers ?? [];
  const userByEmail = new Map((portalUsers as any[]).map((u) => [String(u.email ?? '').trim().toLowerCase(), u]));
  const userById = new Map((portalUsers as any[]).map((u) => [String(u.id ?? ''), u]));

  const rows = db.clientPartyRoles
    .filter((r) => r.clientId === clientId)
    .filter((r) => isActiveRole(r))
    .map((r) => {
      const party = partyById.get(r.partyId);
      if (!party) return null;
      if (party.type === 'PERSON' && party.personId) {
        const person = personById.get(party.personId);
        if (!person) return null;
        const loginUser =
          (person as any).portalUserId
            ? userById.get(String((person as any).portalUserId)) ?? null
            : (() => {
                const emailKey = (person.email ?? '').trim().toLowerCase();
                return emailKey ? userByEmail.get(emailKey) ?? null : null;
              })();
        return { role: r, entity: { type: 'PERSON', person: { id: person.id, fullName: person.fullName, email: person.email, phone: person.phone, hasLogin: !!loginUser } } };
      }
      if (party.type === 'COMPANY' && party.clientId) {
        const c = clientById.get(party.clientId);
        if (!c || c.deletedAt) return null;
        return { role: r, entity: { type: 'COMPANY', company: { id: c.id, code: c.code, name: c.name } } };
      }
      return null;
    })
    .filter(Boolean) as Array<any>;

  const byRole = (role: string) => rows.filter((x) => x.role.role === role);
  const safeName = (v: unknown) => {
    const s = typeof v === 'string' ? v.trim() : '';
    return s || '(No name)';
  };
  const peopleOptions = db.persons
    .map((p) => ({ id: p.id, fullName: safeName((p as unknown as { fullName?: unknown }).fullName), email: p.email }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));

  const companyOptions = db.clients
    .filter((c) => !c.deletedAt)
    .filter((c) => c.id !== clientId)
    .map((c) => ({ id: c.id, code: c.code, name: safeName(c.name) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const labelForCompanyUpdateType = (t: string) => {
    if (t === 'CHANGE_COMPANY_NAME') return 'Change of Company Name';
    if (t === 'CHANGE_FINANCIAL_YEAR_END') return 'Change of Financial Year End (FYE)';
    if (t === 'CHANGE_REGISTERED_OFFICE_ADDRESS') return 'Change of Registered Office Address';
    if (t === 'CHANGE_BUSINESS_ACTIVITIES') return 'Change of Business Activities';
    if (t === 'CHANGE_SECRETARY') return 'Change of Secretary';
    if (t === 'TRANSFER_COMPANY_SECRETARY') return 'Transfer of Company Secretary';
    return 'Company Update';
  };

  const applications = buildSecretaryServiceApplications(db, new Set([clientId]))
    .filter((r) => r.companyId === clientId)
    .filter((r) => r.status !== 'DRAFT')
    .map((r) => {
      const map = (() => {
        if (r.type === 'DIRECTOR_CHANGE') {
          return {
            id: `DCR-${r.source.id}`,
            typeLabel: 'Change of Director',
            detailsHref: `/corporate-secretary/applications/director-change/${encodeURIComponent(r.source.id)}`,
          };
        }
        if (r.type === 'RORC_DECLARATION') {
          return {
            id: `RORC-${r.source.id}`,
            typeLabel: 'Declaration of Company Controller (RORC)',
            detailsHref: `/corporate-secretary/applications/rorc/${encodeURIComponent(r.source.id)}`,
          };
        }
        if (r.type === 'ANNUAL_GENERAL_MEETING') {
          return {
            id: `AGM-${r.source.id}`,
            typeLabel: 'Annual General Meeting',
            detailsHref: `/corporate-secretary/applications/agm/${encodeURIComponent(r.source.id)}`,
          };
        }
        if (r.type === 'SHARE_TRANSFER') {
          return {
            id: `ST-${r.source.id}`,
            typeLabel: 'Transfer of Shares',
            detailsHref: `/corporate-secretary/applications/share-transfer/${encodeURIComponent(r.source.id)}`,
          };
        }
        return {
          id: `CUR-${r.source.id}`,
          typeLabel: labelForCompanyUpdateType(r.type),
          detailsHref: `/corporate-secretary/applications/company-update/${encodeURIComponent(r.source.id)}`,
        };
      })();

      return {
        id: map.id,
        typeLabel: map.typeLabel,
        applicationDate: r.applicationDate,
        editDate: r.editDate,
        status: r.status,
        detailsHref: map.detailsHref,
      };
    })
    .sort((a, b) => (b.editDate ?? '').localeCompare(a.editDate ?? '') || (b.applicationDate ?? '').localeCompare(a.applicationDate ?? ''));

  return (
    <div className="min-h-screen flex flex-col">
      <AppTopNav active="secretary" />
      <div className="flex-1">
        <SecretaryCompanyClient
          initialClient={client}
          initialRoles={{
            directors: byRole('DIRECTOR'),
            shareholders: byRole('SHAREHOLDER'),
            rorc: byRole('RORC'),
            secretaries: byRole('SECRETARY'),
          }}
          peopleOptions={peopleOptions}
          companyOptions={companyOptions}
          applicationHistoryRows={applications}
          canEditCompany={canEditCompany}
          canEditRoles={canEditRoles}
          isClientUser={me.role === 'client'}
        />
      </div>
    </div>
  );
}
