import AppTopNav from '@/components/AppTopNav';
import { getCurrentUser } from '@/lib/auth';
import { readDb } from '@/lib/db';
import DeleteActionClient from '@/components/DeleteActionClient';
import { getSignerIdentityForClient } from '@/lib/signerInfo';
import SignaturesDocumentsCardClient from './ui/SignaturesDocumentsCardClient';

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

  const packets = db.signaturePackets
    .filter((p) => p.relatedType === 'COMPANY_UPDATE' && p.relatedId === req.id)
    .slice()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const packetRows = packets
    .map((p) => {
      const document = db.documents.find((d) => d.id === p.documentId) ?? null;
      if (!document) return null;
      const signatures = db.signatureRequests
        .filter((r) => r.packetId === p.id)
        .sort((a, b) => a.email.localeCompare(b.email))
        .map((r) => ({ email: r.email, status: r.status, signedAt: r.signedAt }));
      return { packet: p, document, signatures };
    })
    .filter(Boolean) as Array<{
    packet: (typeof packets)[number];
    document: { id: string; title: string };
    signatures: Array<{ email: string; status: string; signedAt?: string }>;
  }>;

  const allSignatures = packetRows.flatMap((x) => x.signatures.map((s) => ({ ...s, packetId: x.packet.id, documentTitle: x.document.title })));
  const signatureSummary = {
    total: allSignatures.length,
    signed: allSignatures.filter((s) => s.status === 'SIGNED').length,
  };

  const signatureRows = allSignatures.map((s) => {
    const meta = getSignerIdentityForClient(db, req.clientId, s.email);
    return {
      documentTitle: s.documentTitle,
      signerName: meta.fullName,
      signerRole: meta.role,
      email: s.email,
      status: s.status,
    };
  });

  const documentRows = packetRows.map((row) => ({
    documentId: row.document.id,
    title: row.document.title,
    signerCount: row.signatures.length,
  }));

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
      const beforePrimary = String(payload.originalSsicPrimaryCode ?? company.ssicPrimaryCode ?? '-');
      const beforeSecondary = String(payload.originalSsicSecondaryCode ?? company.ssicSecondaryCode ?? '-');
      const afterPrimary = String(payload.ssicPrimaryCode ?? '');
      const afterSecondary = String(payload.ssicSecondaryCode ?? '') || '-';
      return [
        { k: 'SSIC (Primary)', before: beforePrimary || '-', after: afterPrimary || '-' },
        { k: 'SSIC (Secondary)', before: beforeSecondary || '-', after: afterSecondary || '-' },
      ].filter((x) => x.before !== x.after);
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
            <div className="lg:col-span-7 space-y-4">
              <div className="rounded-xl bg-white border border-black/5 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium">Overview</div>
                    <div className="mt-1 text-xs text-black/50">Quick summary of the application.</div>
                  </div>
                  <div className="text-xs text-black/50">Updated: {(req.updatedAt ?? req.createdAt).slice(0, 10)}</div>
                </div>

                <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-black/50">Company</dt>
                    <dd className="text-right text-black/80">{company?.name ?? req.clientId}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-black/50">Company code</dt>
                    <dd className="text-right text-black/80">{company?.code ?? req.clientId}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-black/50">Type</dt>
                    <dd className="text-right text-black/80">{label}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-black/50">Status</dt>
                    <dd className="text-right text-black/80">{req.status}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-black/50">Submitted</dt>
                    <dd className="text-right text-black/80">{(req.submittedAt ?? req.createdAt).slice(0, 10)}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-black/50">Signed</dt>
                    <dd className="text-right text-black/80">{req.signedAt ? req.signedAt.slice(0, 10) : '-'}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-black/50">Decided</dt>
                    <dd className="text-right text-black/80">{req.decidedAt ? req.decidedAt.slice(0, 10) : '-'}</dd>
                  </div>
                </dl>

                {req.decisionNote ? (
                  <div className="mt-4 rounded-lg border border-black/5 bg-black/[0.02] p-3">
                    <div className="text-xs font-medium text-black/70">Decision note</div>
                    <div className="mt-1 text-sm text-black/70 whitespace-pre-wrap">{req.decisionNote}</div>
                  </div>
                ) : null}
              </div>

              <div className="rounded-xl bg-white border border-black/5 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">Requested changes</div>
                    <div className="mt-1 text-xs text-black/50">Before → after preview for this request.</div>
                  </div>
                  <div className="text-xs text-black/50">Rows: {diffRows.length}</div>
                </div>
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="text-left text-black/60">
                      <tr className="border-b border-black/10">
                        <th className="px-3 py-2 font-medium">Field</th>
                        <th className="px-3 py-2 font-medium">Before</th>
                        <th className="px-3 py-2 font-medium">After</th>
                      </tr>
                    </thead>
                    <tbody>
                      {diffRows.map((r) => (
                        <tr key={r.k} className="border-b border-black/5">
                          <td className="px-3 py-2 align-top font-medium text-black/80">{r.k}</td>
                          <td className="px-3 py-2 align-top text-black/70 whitespace-pre-wrap">{r.before || '-'}</td>
                          <td className="px-3 py-2 align-top text-black/70 whitespace-pre-wrap">{r.after || '-'}</td>
                        </tr>
                      ))}
                      {diffRows.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-3 py-8 text-center text-black/40">
                            No preview available
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="lg:col-span-5">
              <div className="space-y-4 lg:sticky lg:top-20">
                <div className="rounded-xl bg-white border border-black/5 p-5">
                  <div className="text-sm font-medium">Progress</div>
                  <div className="mt-1 text-xs text-black/50">Signatures across all documents.</div>
                  <div className="mt-3 flex items-center justify-between">
                    <div className="text-sm text-black/70">Signed</div>
                    <div className="text-sm font-medium">{signatureSummary.signed}</div>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="text-sm text-black/70">Total</div>
                    <div className="text-sm font-medium">{signatureSummary.total}</div>
                  </div>
                </div>

                <SignaturesDocumentsCardClient signatureRows={signatureRows} documents={documentRows} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
