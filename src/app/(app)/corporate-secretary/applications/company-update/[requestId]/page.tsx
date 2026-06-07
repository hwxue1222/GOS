import AppTopNav from '@/components/AppTopNav';
import { getCurrentUser } from '@/lib/auth';
import { readDb } from '@/lib/db';
import DeleteActionClient from '@/components/DeleteActionClient';

function isActiveRole(r: { role: string; resignationDate?: string; toDate?: string }) {
  if (r.role === 'DIRECTOR' || r.role === 'SECRETARY') return !r.resignationDate;
  if (r.role === 'SHAREHOLDER' || r.role === 'RORC') return !r.toDate;
  return true;
}

function typeLabel(t: string) {
  if (t === 'CHANGE_COMPANY_NAME') return 'Change of Company Name';
  if (t === 'CHANGE_FINANCIAL_YEAR_END') return 'Change of Financial Year End (FYE)';
  if (t === 'CHANGE_REGISTERED_OFFICE_ADDRESS') return 'Change of Registered Office Address';
  if (t === 'CHANGE_BUSINESS_ACTIVITIES') return 'Change of Business Activities';
  if (t === 'CHANGE_SECRETARY') return 'Change of Secretary';
  if (t === 'TRANSFER_COMPANY_SECRETARY') return 'Transfer of Company Secretary';
  return t;
}

function normalizeFyeDdMm(input: string) {
  const s = String(input ?? '').trim();
  if (!s) return '';
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (m1) {
    const dd = String(Number(m1[1])).padStart(2, '0');
    const mm = String(Number(m1[2])).padStart(2, '0');
    return `${dd}/${mm}`;
  }
  const m2 = s.match(/^(\d{1,2})-(\d{1,2})$/);
  if (m2) {
    const a = Number(m2[1]);
    const b = Number(m2[2]);
    const aa = String(a).padStart(2, '0');
    const bb = String(b).padStart(2, '0');
    if (a > 12) return `${aa}/${bb}`;
    if (b > 12) return `${bb}/${aa}`;
    return `${bb}/${aa}`;
  }
  const m3 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m3) return `${m3[3]}/${m3[2]}`;
  return s;
}

export default async function CompanyUpdateApplicationDetailPage({ params }: { params: Promise<{ requestId: string }> }) {
  const me = await getCurrentUser();
  if (!me) return null;
  const { requestId } = await params;

  const db = await readDb();
  const req = (db.companyUpdateRequests ?? []).find((r) => r.id === requestId) ?? null;
  if (!req) {
    return (
      <div className="min-h-screen flex flex-col">
        <AppTopNav active="corporate-secretary" />
        <div className="flex-1">
          <div className="max-w-6xl mx-auto px-4 py-6">
            <div className="rounded-xl bg-white border border-black/5 p-6 text-sm text-red-600">NOT_FOUND</div>
          </div>
        </div>
      </div>
    );
  }

  if (me.role === 'client') {
    const emailKey = me.email.trim().toLowerCase();
    const partyById = new Map(db.parties.map((p) => [p.id, p]));
    const personById = new Map(db.persons.map((p) => [p.id, p]));
    let allowed = false;
    for (const r of db.clientPartyRoles) {
      if (r.clientId !== req.clientId) continue;
      if (!isActiveRole(r)) continue;
      const party = partyById.get(r.partyId);
      if (!party || party.type !== 'PERSON' || !party.personId) continue;
      const person = personById.get(party.personId);
      if (!person) continue;
      if ((person.email ?? '').trim().toLowerCase() !== emailKey) continue;
      allowed = true;
      break;
    }
    if (!allowed) {
      return (
        <div className="min-h-screen flex flex-col">
          <AppTopNav active="corporate-secretary" />
          <div className="flex-1">
            <div className="max-w-6xl mx-auto px-4 py-6">
              <div className="rounded-xl bg-white border border-black/5 p-6 text-sm text-red-600">FORBIDDEN</div>
            </div>
          </div>
        </div>
      );
    }
  }

  const company = db.clients.find((c) => c.id === req.clientId && !c.deletedAt) ?? null;
  const payload = req.payload as Record<string, unknown>;
  const label = typeLabel(req.type);

  const packet = db.signaturePackets.find((p) => p.id === (req as unknown as { packetId?: string }).packetId) ?? null;
  const document = packet ? db.documents.find((d) => d.id === packet.documentId) ?? null : null;
  const signatures = packet
    ? db.signatureRequests
        .filter((r) => r.packetId === packet.id)
        .sort((a, b) => a.email.localeCompare(b.email))
        .map((r) => ({ email: r.email, status: r.status, signedAt: r.signedAt }))
    : [];
  const signatureSummary = {
    total: signatures.length,
    signed: signatures.filter((s) => s.status === 'SIGNED').length,
  };

  const diffRows = (() => {
    if (!company) return [] as Array<{ k: string; before: string; after: string }>;
    if (req.type === 'CHANGE_COMPANY_NAME') {
      return [
        {
          k: 'Company name',
          before: company.name,
          after: String(payload.newCompanyName ?? ''),
        },
      ];
    }
    if (req.type === 'CHANGE_FINANCIAL_YEAR_END') {
      const before = normalizeFyeDdMm(company.fye ?? '-') || (company.fye ?? '-');
      const afterRaw = String(payload.newFye ?? '');
      const after = normalizeFyeDdMm(afterRaw) || afterRaw;
      return [
        {
          k: 'FYE',
          before,
          after,
        },
      ];
    }
    if (req.type === 'CHANGE_REGISTERED_OFFICE_ADDRESS') {
      return [
        {
          k: 'Registered office address',
          before: company.registeredOfficeAddress ?? '-',
          after: String(payload.newRegisteredOfficeAddress ?? ''),
        },
      ];
    }
    if (req.type === 'CHANGE_BUSINESS_ACTIVITIES') {
      return [
        {
          k: 'SSIC (Primary)',
          before: company.ssicPrimaryCode ?? '-',
          after: String(payload.ssicPrimaryCode ?? ''),
        },
        {
          k: 'SSIC (Secondary)',
          before: company.ssicSecondaryCode ?? '-',
          after: String(payload.ssicSecondaryCode ?? '-') || '-',
        },
      ];
    }
    if (req.type === 'CHANGE_SECRETARY') {
      const add = Array.isArray(payload.addSecretaries) ? (payload.addSecretaries as Array<Record<string, unknown>>) : [];
      const addNames = add.map((x) => String(x.fullName ?? '').trim()).filter(Boolean).join(', ') || '-';
      const removeId = String(payload.removeSecretaryRoleId ?? '').trim();
      const secRole = removeId ? db.clientPartyRoles.find((x) => x.id === removeId) ?? null : null;
      const partyById = new Map(db.parties.map((p) => [p.id, p]));
      const personById = new Map(db.persons.map((p) => [p.id, p]));
      const removedName = secRole ? partyById.get(secRole.partyId)?.personId ? personById.get(partyById.get(secRole.partyId)!.personId!)?.fullName ?? '-' : '-' : '-';
      return [
        { k: 'Add secretaries', before: '-', after: addNames },
        { k: 'Delete secretary', before: removedName, after: '-' },
      ];
    }
    return [] as Array<{ k: string; before: string; after: string }>;
  })();

  return (
    <div className="min-h-screen flex flex-col">
      <AppTopNav active="corporate-secretary" />
      <div className="flex-1">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold">{label}</h1>
              <div className="mt-1 text-sm text-black/60">ID: {req.id}</div>
            </div>
            <div className="flex items-center gap-3">
              {me.role === 'client' && req.status === 'PENDING_SIGNATURES' && req.createdByUserId === me.id ? (
                <DeleteActionClient
                  deleteUrl={`/api/secretary/companies/${encodeURIComponent(req.clientId)}/company-update-requests/${encodeURIComponent(req.id)}`}
                  confirmText="Delete this application?"
                  label="Delete"
                  className="rounded-md bg-white border border-red-200 text-red-700 px-3 py-2 text-sm font-medium hover:bg-red-50 disabled:opacity-60"
                  onDoneHref={`/corporate-secretary/applications?companyId=${encodeURIComponent(req.clientId)}`}
                />
              ) : null}
              <div className="text-sm">
                <span className="text-black/60">Status:</span> <span className="font-medium">{req.status}</span>
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-5 rounded-xl bg-white border border-black/5 p-4">
              <div className="text-sm font-medium">Company</div>
              <div className="mt-2 text-sm text-black/70">
                <div>Name: {company?.name ?? req.clientId}</div>
                <div className="mt-1">Company code: {company?.code ?? req.clientId}</div>
              </div>
              <div className="mt-4 text-sm font-medium">Timeline</div>
              <div className="mt-2 text-sm text-black/70">
                <div>Submitted: {(req.submittedAt ?? req.createdAt).slice(0, 10)}</div>
                {req.signedAt ? <div className="mt-1">Signed: {req.signedAt.slice(0, 10)}</div> : null}
                {req.decidedAt ? <div className="mt-1">Decided: {req.decidedAt.slice(0, 10)}</div> : null}
              </div>

              <div className="mt-4">
                <div className="text-sm font-medium">Signatures</div>
                <div className="mt-2 text-sm text-black/70">
                  <div>
                    Progress: {signatureSummary.signed}/{signatureSummary.total}
                  </div>
                  {signatures.length ? (
                    <div className="mt-2 space-y-1">
                      {signatures.map((s) => (
                        <div key={s.email} className="flex items-center justify-between gap-3">
                          <div className="truncate">{s.email}</div>
                          <div className="shrink-0 text-black/60">{s.status}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-2 text-black/40">No signatures</div>
                  )}
                </div>
              </div>

              <div id="documents" className="mt-4">
                <div className="text-sm font-medium">Documents</div>
                <div className="mt-2 text-sm">
                  {document ? (
                    <div className="flex items-center gap-2">
                      <a
                        href={`/api/documents/${encodeURIComponent(document.id)}/pdf?disposition=inline`}
                        className="inline-flex items-center rounded-md bg-white border border-black/10 text-black/70 px-3 py-1.5 text-sm font-medium"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Preview
                      </a>
                      <a
                        href={`/api/documents/${encodeURIComponent(document.id)}/pdf?download=1`}
                        className="inline-flex items-center rounded-md bg-white border border-black/10 text-black/70 px-3 py-1.5 text-sm font-medium"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Download PDF
                      </a>
                    </div>
                  ) : (
                    <div className="text-black/40">No documents</div>
                  )}
                </div>
              </div>
              {req.decisionNote ? (
                <div className="mt-4">
                  <div className="text-sm font-medium">Decision note</div>
                  <div className="mt-2 text-sm text-black/70 whitespace-pre-wrap">{req.decisionNote}</div>
                </div>
              ) : null}
            </div>

            <div className="lg:col-span-7 rounded-xl bg-white border border-black/5 p-4">
              <div className="text-sm font-medium">Requested changes</div>
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-left text-black/60">
                    <tr className="border-b border-black/5">
                      <th className="px-3 py-2 font-medium">Field</th>
                      <th className="px-3 py-2 font-medium">Before</th>
                      <th className="px-3 py-2 font-medium">After</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diffRows.map((r) => (
                      <tr key={r.k} className="border-b border-black/5">
                        <td className="px-3 py-2">{r.k}</td>
                        <td className="px-3 py-2 text-black/70 whitespace-pre-wrap">{r.before}</td>
                        <td className="px-3 py-2 text-black/70 whitespace-pre-wrap">{r.after}</td>
                      </tr>
                    ))}
                    {diffRows.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-3 py-8 text-center text-black/40">
                          No preview
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
