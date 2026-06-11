import AppTopNav from '@/components/AppTopNav';
import { getCurrentUser } from '@/lib/auth';
import { readDb } from '@/lib/db';
import DeleteActionClient from '@/components/DeleteActionClient';
import { getSignerIdentityForClient } from '@/lib/signerInfo';
import ApplicationDetailShell from '@/app/(app)/corporate-secretary/applications/ui/ApplicationDetailShell';
import ActivityTimelineCard from '@/app/(app)/corporate-secretary/applications/ui/ActivityTimelineCard';
import KeyValueCard from '@/app/(app)/corporate-secretary/applications/ui/KeyValueCard';
import SectionCard from '@/app/(app)/corporate-secretary/applications/ui/SectionCard';
import SignaturesDocumentsCardClient, {
  type DocumentRow,
} from '@/app/(app)/corporate-secretary/applications/ui/SignaturesDocumentsCardClient';
import StatusBadge from '@/app/(app)/corporate-secretary/applications/ui/StatusBadge';
import { auditLogsToTimelineItems, signatureEventsToTimelineItems } from '@/app/(app)/corporate-secretary/applications/ui/timeline';

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
        <div className="flex-1 bg-[#f7f8fa]">
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
          <div className="flex-1 bg-[#f7f8fa]">
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

  const isDeprecatedCompanyNameDoc = (title: string) => {
    const t = String(title ?? '').trim();
    return (
      t.startsWith('Director Resolution - Change of Company Name -') ||
      t.startsWith('Notice of Extraordinary General Meeting - Change of Company Name -') ||
      t.startsWith('Minutes of Extraordinary General Meeting - Change of Company Name -')
    );
  };
  const packetRows = packets
    .map((p) => {
      const document = db.documents.find((d) => d.id === p.documentId) ?? null;
      if (!document) return null;
      if (req.type === 'CHANGE_COMPANY_NAME' && isDeprecatedCompanyNameDoc(document.title)) return null;
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
      signedAt: s.signedAt,
    };
  });

  const documentRows: DocumentRow[] = packetRows.map((row) => ({
    documentId: row.document.id,
    title: row.document.title,
    signerCount: row.signatures.length,
  }));

  if (req.type === 'CHANGE_COMPANY_NAME') {
    documentRows.push(
      {
        documentId: 'template_notice_egm_change_company_name',
        title: 'Notice of Extraordinary General Meeting',
        signerCount: 0,
        href: '/templates/notice-egm-authority-given-to-issue-new-shares.docx',
      },
      {
        documentId: 'template_minutes_egm_change_company_name',
        title: 'Minutes of Extraordinary General Meeting',
        signerCount: 0,
        href: '/templates/minutes-egm-change-of-company-name.docx',
      },
    );
  }

  const auditLogs = (db.auditLogs ?? [])
    .filter((l) => l.entityType === 'company_update_request' && l.entityId === req.id)
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const timelineItems = [
    ...auditLogsToTimelineItems({ logs: auditLogs }),
    ...signatureEventsToTimelineItems({ signatures: signatureRows }),
  ];

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

  const summaryRows = [
    { label: 'Company', value: company?.name ?? req.clientId },
    { label: 'Company code', value: company?.code ?? req.clientId },
    { label: 'Type', value: label },
    { label: 'Status', value: req.status },
    { label: 'Submitted', value: (req.submittedAt ?? req.createdAt).slice(0, 10) },
    { label: 'Signed', value: req.signedAt ? req.signedAt.slice(0, 10) : '-' },
    { label: 'Decided', value: req.decidedAt ? req.decidedAt.slice(0, 10) : '-' },
  ];

  return (
    <ApplicationDetailShell
      title={label}
      requestId={req.id}
      statusBadge={<StatusBadge status={req.status} />}
      left={
        <>
          <KeyValueCard title="Overview" subtitle="Quick summary of the application." rows={summaryRows} right={<div className="text-xs text-black/50">Updated: {(req.updatedAt ?? req.createdAt).slice(0, 10)}</div>} />
          {req.decisionNote ? (
            <SectionCard title="Decision note" subtitle="Reason or feedback from review.">
              <div className="text-sm text-black/70 whitespace-pre-wrap">{req.decisionNote}</div>
            </SectionCard>
          ) : null}
          <SectionCard title="Requested changes" subtitle="Before → after preview for this request." right={<div className="text-xs text-black/50">Rows: {diffRows.length}</div>}>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-black/60 bg-black/[0.02]">
                  <tr className="border-b border-black/10">
                    <th className="px-3 py-2 font-medium">Field</th>
                    <th className="px-3 py-2 font-medium">Before</th>
                    <th className="px-3 py-2 font-medium">After</th>
                  </tr>
                </thead>
                <tbody>
                  {diffRows.map((r) => (
                    <tr key={r.k} className="border-b border-black/5 hover:bg-black/[0.02]">
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
          </SectionCard>
          <ActivityTimelineCard items={timelineItems} />
        </>
      }
      right={
        <>
          <SignaturesDocumentsCardClient id="assets" signatureRows={signatureRows} documents={documentRows} />
        </>
      }
    />
  );
}
