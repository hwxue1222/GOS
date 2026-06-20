'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { ContractTemplate } from '@/lib/types';
import { DateInputYMD } from '@/components/DateInputYMD';

type Props = {
  initialTemplates: ContractTemplate[];
};

function escHtml(s: string) {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderPreview(templateHtml: string, map: Record<string, string>) {
  let html = templateHtml;
  for (const [k, v] of Object.entries(map)) {
    const safe = escHtml(String(v ?? '')).replaceAll('\n', '<br />');
    html = html.replaceAll(`{{${k}}}`, safe);
  }
  html = html.replaceAll(/\{\{\s*[a-zA-Z0-9_]+\s*\}\}/g, '');

  if (html.includes('NOMINEE SERVICES INDEMNITY AGREEMENT')) {
    html = html.replace(
      /(<p class="p(?:8|9)">\s*\d+\.\d[\s\S]*?<\/p>)(\s*)(<p class="p(?:8|9)">\s*\d+\.\d)/g,
      (_, a: string, ws: string, b: string) => {
        if (ws.includes('<p class="p10"><br></p>') || ws.includes('<p class="p4"><br></p>') || ws.includes('<p class="p3"><br></p>')) {
          return a + ws + b;
        }
        return `${a}\n<p class="p10"><br></p>\n${b}`;
      },
    );
  }
  return html;
}

export default function ContractNewClient({ initialTemplates }: Props) {
  const templates = initialTemplates;
  const router = useRouter();
  const searchParams = useSearchParams();
  const templateIdFromUrl = useMemo(() => {
    const v = String(searchParams?.get('templateId') ?? '').trim();
    return v;
  }, [searchParams]);

  const [templateId, setTemplateId] = useState<string>(() => {
    if (templateIdFromUrl && templates.some((t) => t.id === templateIdFromUrl)) return templateIdFromUrl;
    try {
      if (typeof window === 'undefined') return templates[0]?.id ?? '';
      const stored = String(window.localStorage.getItem('contracts.new.templateId') ?? '').trim();
      if (stored && templates.some((t) => t.id === stored)) return stored;
    } catch {}
    return templates[0]?.id ?? '';
  });
  const tpl = useMemo(() => templates.find((t) => t.id === templateId) ?? null, [templateId, templates]);

  const [fields, setFields] = useState<Record<string, string>>({
    date: new Date().toISOString().slice(0, 10),
  });

  const [annualFeeCurrency, setAnnualFeeCurrency] = useState<'SGD' | 'USD' | 'RMB'>('SGD');
  const [annualFeeAmount, setAnnualFeeAmount] = useState('');

  const [contractId, setContractId] = useState<string>('');
  const [contractNo, setContractNo] = useState<string>('');
  const [documentId, setDocumentId] = useState<string>('');
  const [documentSha, setDocumentSha] = useState<string>('');
  const [packetId, setPacketId] = useState<string>('');

  const [saving, setSaving] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [sending, setSending] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string>('');
  const [buildInfo, setBuildInfo] = useState<string>('');

  const clientNameKey = useMemo(() => {
    const keys = new Set((tpl?.placeholders ?? []).map((p) => p.key));
    if (keys.has('partyA_name')) return 'partyA_name';
    return 'client_name';
  }, [tpl]);

  const clientEmailKey = useMemo(() => {
    const keys = new Set((tpl?.placeholders ?? []).map((p) => p.key));
    if (keys.has('partyA_email')) return 'partyA_email';
    return 'client_email';
  }, [tpl]);

  const showClientBlock = useMemo(() => {
    const keys = new Set((tpl?.placeholders ?? []).map((p) => p.key));
    return keys.has('partyA_name') || keys.has('partyA_email') || keys.has('client_name') || keys.has('client_email');
  }, [tpl]);

  const showSigningBlock = useMemo(() => {
    const keys = new Set((tpl?.placeholders ?? []).map((p) => p.key));
    return Array.from(keys).some((k) => k.startsWith('signer_'));
  }, [tpl]);

  const requiredKeys = useMemo(() => {
    return new Set((tpl?.placeholders ?? []).filter((p) => p.required).map((p) => p.key));
  }, [tpl]);

  const editContractId = useMemo(() => {
    const v = String(searchParams?.get('contractId') ?? searchParams?.get('id') ?? '').trim();
    return v;
  }, [searchParams]);

  useEffect(() => {
    if (editContractId) return;
    if (!templateId) return;
    try {
      window.localStorage.setItem('contracts.new.templateId', templateId);
    } catch {}
  }, [editContractId, templateId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch('/api/debug/version', { cache: 'no-store' }).catch(() => null);
      const j = (await res?.json().catch(() => null)) as any;
      if (cancelled) return;
      if (!res?.ok || !j?.ok) {
        setBuildInfo('');
        return;
      }
      const sha = String(j.commitSha ?? '').trim();
      const dep = String(j.deploymentId ?? '').trim();
      setBuildInfo(`${sha ? sha.slice(0, 7) : 'local'}${dep ? ` • ${dep}` : ''}`);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!editContractId) return;
    (async () => {
      const res = await fetch(`/api/contracts/${encodeURIComponent(editContractId)}`, { method: 'GET' }).catch(() => null);
      const j = (await res?.json().catch(() => null)) as any;
      if (cancelled) return;
      if (!res?.ok || !j?.contract?.id) {
        setError(j?.error || `HTTP_${res?.status ?? 'NETWORK'}`);
        setErrorDetail(j?.message || (j ? JSON.stringify(j) : '') || 'NETWORK_ERROR');
        return;
      }
      const c = j.contract as {
        id: string;
        contractNo: string;
        templateId: string;
        clientName: string;
        clientEmail: string;
        fields?: Record<string, string>;
      };
      setContractId(String(c.id));
      setContractNo(String(c.contractNo ?? ''));
      setTemplateId(String(c.templateId ?? templateId));
      setFields((prev) => {
        const next = { ...(prev ?? {}) } as Record<string, string>;
        const base = (c.fields ?? {}) as Record<string, string>;
        for (const [k, v] of Object.entries(base)) next[k] = String(v ?? '');
        next[clientNameKey] = String(c.clientName ?? '');
        next[clientEmailKey] = String(c.clientEmail ?? '');
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [clientEmailKey, clientNameKey, editContractId, templateId]);

  const clientName = showClientBlock ? String(fields[clientNameKey] ?? '').trim() : String(fields.company ?? '').trim();
  const clientEmail = showClientBlock ? String(fields[clientEmailKey] ?? '').trim() : '';
  const signerEmail = String(fields.signer_email ?? '').trim();

  const pdfOpenUrl = contractId && contractNo ? `/api/contracts/${encodeURIComponent(contractId)}/pdf?disposition=inline` : '';

  const missingRequired = useMemo(() => {
    if (!tpl) return [] as { key: string; label: string }[];
    const ignoreKeys = new Set(['contract_no', 'client_name', 'client_email']);
    const required = (tpl.placeholders ?? []).filter((p) => p.required && !ignoreKeys.has(p.key));
    const missing = required.filter((p) => !String((fields as any)?.[p.key] ?? '').trim());
    return missing.map((p) => ({ key: p.key, label: p.label }));
  }, [fields, tpl]);

  const previewHtml = useMemo(() => {
    if (!tpl) return '';
    return renderPreview(tpl.templateHtml, {
      contract_no: contractNo || 'BBYYYYMM001X',
      client_name: clientName,
      client_email: clientEmail,
      partyA_name: clientName,
      partyA_email: clientEmail,
      ...fields,
    });
  }, [clientEmail, clientName, contractNo, fields, tpl]);

  const isNomineeTemplate = tpl?.name === 'Nominee Services Indemnity Agreement';
  const isProfessionalTemplate = tpl?.name === 'Professional Service Agreement';
  const clientOk = showClientBlock ? !!clientName && !!clientEmail : !!clientName;

  useEffect(() => {
    if (!isNomineeTemplate) return;
    const raw = String((fields as any).annual_fee ?? '').trim();
    if (!raw) return;

    const m = raw.match(/^(SGD|USD|RMB)\s+(.*)$/i);
    if (m) {
      const nextCurrency = m[1].toUpperCase() as 'SGD' | 'USD' | 'RMB';
      const nextAmount = String(m[2] ?? '').trim();
      setAnnualFeeCurrency(nextCurrency);
      setAnnualFeeAmount(nextAmount);
      return;
    }

    const sgdLike = raw.startsWith('S$') || raw.startsWith('$');
    if (sgdLike) {
      setAnnualFeeCurrency('SGD');
      setAnnualFeeAmount(raw.replace(/^S\$\s*/, '').replace(/^\$\s*/, '').trim());
    } else {
      setAnnualFeeAmount(raw);
    }
  }, [isNomineeTemplate, (fields as any).annual_fee]);

  useEffect(() => {
    if (!isProfessionalTemplate) return;
    setFields((prev) => {
      const next = { ...(prev ?? {}) } as Record<string, string>;
      if (!String(next.agreement_title ?? '').trim()) next.agreement_title = 'Professional Service Agreement';
      if (!String(next.service_count ?? '').trim()) next.service_count = '2';
      if (!String(next.service_title_1 ?? '').trim()) next.service_title_1 = 'CORPORATE SECRETARY SERVICE';
      if (!String(next.service_body_1 ?? '').trim()) {
        next.service_body_1 =
          'Corporate secretary services are included as below:\n\n' +
          '• Maintain various registers\n' +
          '• Appointment of local nominee director\n' +
          '• Update of changes filed with ACRA\n' +
          '• Provision of registered office address\n' +
          '• Prepare resolutions and ACRA filings\n' +
          '• Prepare AGM and minutes and submit annual return\n\n' +
          'Extra charges may apply for special transactions.';
      }
      if (!String(next.fee_standard_1 ?? '').trim()) {
        next.fee_standard_1 =
          'The fee standard is as follows:\n\n' +
          '• Corporate secretary fee (one-time)\n' +
          '• Local nominee director fee (per year)\n\n' +
          'Any additional services will be charged separately as agreed by both parties.';
      }

      if (!String(next.partyB_obligation_1 ?? '').trim()) {
        next.partyB_obligation_1 = 'Party B shall provide the required services in accordance with Party A\'s requirements.';
      }
      if (!String(next.partyB_obligation_2 ?? '').trim()) {
        next.partyB_obligation_2 =
          'Party B shall arrange for a local nominee director and comply with the relevant requirements of the Government of Singapore.';
      }
      if (!String(next.partyB_obligation_3 ?? '').trim()) {
        next.partyB_obligation_3 = 'Party B shall provide Party A with a registered address in Singapore.';
      }

      if (!String(next.partyA_obligation_1 ?? '').trim()) {
        next.partyA_obligation_1 =
          'Party A shall truthfully provide background information and supporting materials of the ultimate beneficial owner / actual controller, and confirm that there are no political exposure or prohibited risks.';
      }
      if (!String(next.partyA_obligation_2 ?? '').trim()) {
        next.partyA_obligation_2 = 'Party A shall comply with the laws and regulations of Singapore and operate the business in good faith.';
      }
      if (!String(next.partyA_obligation_3 ?? '').trim()) {
        next.partyA_obligation_3 =
          'Party A shall ensure that its business activities in its home country and in Singapore do not involve money laundering, terrorist financing or other illegal activities.';
      }

      if (!String(next.force_majeure_1 ?? '').trim()) {
        next.force_majeure_1 =
          'Force majeure refers to unforeseeable, unavoidable and insurmountable objective circumstances, such as major natural disasters, epidemics, war, riots, snowstorms, strikes, etc., as well as policy changes and changes in regulatory requirements beyond the control of both parties.';
      }
      if (!String(next.force_majeure_2 ?? '').trim()) {
        next.force_majeure_2 =
          'A party affected by force majeure shall promptly notify the other party, explaining the reason, nature and expected duration of the force majeure event and its impact on performance, and shall take reasonable measures during the event to mitigate the impact. The parties shall use best efforts to perform obligations not affected by force majeure.';
      }
      if (!String(next.force_majeure_3 ?? '').trim()) {
        next.force_majeure_3 =
          'During the force majeure period, the parties shall share the relevant losses and expenses fairly. After the force majeure is lifted, the parties shall resume performance of this Agreement as soon as practicable.';
      }

      if (!String(next.breach_1 ?? '').trim()) {
        next.breach_1 = 'Both parties shall strictly perform all terms of this Agreement. Any breach by either party shall bear corresponding liability for breach.';
      }
      if (!String(next.breach_2 ?? '').trim()) {
        next.breach_2 =
          'Any materials, drafts, templates or services provided by Party A to Party B for the purpose of this Agreement are non-refundable, and Party B shall not be liable. If Party A causes losses to Party B, Party A shall compensate Party B for all losses and expenses incurred as a result.';
      }

      if (!String(next.effective_1 ?? '').trim()) {
        next.effective_1 = 'This Agreement shall take effect from the date of signature by both Party A and Party B. Unless terminated earlier in accordance with this Agreement, the term shall be 24 months.';
      }
      if (!String(next.effective_2 ?? '').trim()) {
        next.effective_2 = 'If no written termination notice is given one month before expiry, this Agreement shall renew automatically.';
      }
      if (!String(next.effective_3 ?? '').trim()) {
        next.effective_3 = 'This Agreement is executed in two (2) originals, one for each party, and both originals have equal legal effect.';
      }

      if (!String(next.law_1 ?? '').trim()) {
        next.law_1 = 'The interpretation, termination and dispute resolution of this Agreement shall be governed by the laws of the Republic of Singapore.';
      }
      if (!String(next.law_2 ?? '').trim()) {
        next.law_2 =
          'If the matter cannot be resolved by mutual consultation, it shall be submitted to arbitration in Singapore and the arbitral award shall be final and binding.';
      }

      if (!String(next.signer_date ?? '').trim()) next.signer_date = String(next.date ?? '').trim() || new Date().toISOString().slice(0, 10);
      if (!String(next.signer_email ?? '').trim()) {
        const pe = String(next.partyA_email ?? '').trim();
        if (pe) next.signer_email = pe;
      }
      return next;
    });
  }, [isProfessionalTemplate]);


  async function saveDraft() {
    setError(null);
    setErrorDetail('');
    if (!tpl) {
      setError('TEMPLATE_REQUIRED');
      return null;
    }
    if (showClientBlock) {
      if (!clientName || !clientEmail) {
        setError('CLIENT_REQUIRED');
        setErrorDetail('请先填写甲方公司名称与甲方邮箱（用于生成合同与发送签署）。');
        return null;
      }
    } else {
      if (!clientName) {
        setError('CLIENT_REQUIRED');
        setErrorDetail('请先填写 Company。');
        return null;
      }
    }
    if (missingRequired.length > 0) {
      setError('MISSING_REQUIRED_FIELDS');
      setErrorDetail(missingRequired.map((x) => x.label).join('\n'));
      return null;
    }
    const payload = { templateId: tpl.id, clientName, clientEmail, fields };
    setSaving(true);
    try {
      if (!contractId) {
        const res = await fetch('/api/contracts', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        }).catch(() => null);
        const j = (await res?.json().catch(() => null)) as any;
        if (!res?.ok || !j?.contract?.id) {
          setError(j?.error || `HTTP_${res?.status ?? 'NETWORK'}`);
          setErrorDetail(j?.message || (j ? JSON.stringify(j) : '') || 'NETWORK_ERROR');
          return null;
        }
        setContractId(j.contract.id);
        setContractNo(j.contract.contractNo);
        return j.contract as { id: string };
      }

      const res = await fetch(`/api/contracts/${encodeURIComponent(contractId)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clientName, clientEmail, fields }),
      }).catch(() => null);
      const j = (await res?.json().catch(() => null)) as any;
      if (!res?.ok || !j?.contract?.id) {
        setError(j?.error || `HTTP_${res?.status ?? 'NETWORK'}`);
        setErrorDetail(j?.message || (j ? JSON.stringify(j) : '') || 'NETWORK_ERROR');
        return null;
      }
      return j.contract as { id: string };
    } finally {
      setSaving(false);
    }
  }

  async function generateDocument() {
    setError(null);
    setErrorDetail('');
    const c = await saveDraft();
    const id = contractId || (c as any)?.id;
    if (!id) return;

    setRendering(true);
    try {
      const res = await fetch(`/api/contracts/${encodeURIComponent(id)}/render`, { method: 'POST' }).catch(() => null);
      const j = (await res?.json().catch(() => null)) as any;
      if (!res?.ok || !j?.documentId) {
        setError(j?.error || `HTTP_${res?.status ?? 'NETWORK'}`);
        setErrorDetail(j?.message || (j ? JSON.stringify(j) : '') || 'NETWORK_ERROR');
        return;
      }
      setDocumentId(String(j.documentId));
      setDocumentSha(String(j.documentSha256 ?? ''));
      if (j?.contract?.contractNo) setContractNo(String(j.contract.contractNo));
    } finally {
      setRendering(false);
    }
  }

  async function sendForSigning() {
    setError(null);
    setErrorDetail('');
    const c = await saveDraft();
    const id = contractId || (c as any)?.id;
    if (!id) return;

    setSending(true);
    try {
      const nomineeEmails = isNomineeTemplate
        ? [String((fields as any).company_signatory_email ?? '').trim(), String((fields as any).principal_signatory_email ?? '').trim()].filter(
            (x) => !!x,
          )
        : [];

      if (isNomineeTemplate && nomineeEmails.length < 2) {
        setError('SIGNER_EMAIL_REQUIRED');
        setErrorDetail('请填写 Company signatory email 和 Principal signatory email。');
        return;
      }

      const res = await fetch(`/api/contracts/${encodeURIComponent(id)}/send-sign`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(isNomineeTemplate ? { emails: nomineeEmails } : { toEmail: signerEmail || undefined }),
      }).catch(() => null);
      const j = (await res?.json().catch(() => null)) as any;
      if (!res?.ok || !j?.packetId) {
        setError(j?.error || `HTTP_${res?.status ?? 'NETWORK'}`);
        if (j?.error === 'CONTRACT_NOT_GENERATED') {
          setErrorDetail('请先点击 Generate 生成合同（生成合同编号和文档）后再发送签署。');
        } else {
          setErrorDetail(j?.message || (j ? JSON.stringify(j) : '') || 'NETWORK_ERROR');
        }
        return;
      }
      setPacketId(String(j.packetId));
      if (j.contract?.documentId) setDocumentId(String(j.contract.documentId));
    } finally {
      setSending(false);
    }
  }

  async function deleteDraft() {
    if (!contractId) return;
    if (!confirm('Delete this draft?')) return;
    setError(null);
    setErrorDetail('');
    const res = await fetch(`/api/contracts/${encodeURIComponent(contractId)}`, { method: 'DELETE' }).catch(() => null);
    const j = (await res?.json().catch(() => null)) as any;
    if (!res?.ok || !j?.ok) {
      setError(j?.error || `HTTP_${res?.status ?? 'NETWORK'}`);
      setErrorDetail(j?.message || (j ? JSON.stringify(j) : '') || 'NETWORK_ERROR');
      return;
    }
    router.push('/contracts');
  }

  async function downloadPdf() {
    if (!pdfDownloadUrl) return;
    setError(null);
    setErrorDetail('');
    setDownloading(true);
    try {
      const res = await fetch(pdfDownloadUrl).catch(() => null);
      if (!res?.ok) {
        const j = (await res?.json().catch(() => null)) as any;
        setError(j?.error || `HTTP_${res?.status ?? 'NETWORK'}`);
        setErrorDetail(j?.message || (j ? JSON.stringify(j) : '') || 'NETWORK_ERROR');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = contractNo ? `Contract-${contractNo}.pdf` : 'Contract.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  

  const pdfDownloadUrl = contractId ? `/api/contracts/${encodeURIComponent(contractId)}/pdf?disposition=attachment` : '';

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 pb-28">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-lg font-semibold">{contractId ? 'Edit contract' : 'New contract'}</div>
          <div className="text-sm text-black/60 mt-1">Fill fields and generate the contract.</div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/contracts"
            className="h-10 px-4 rounded-lg border border-black/10 text-sm font-medium flex items-center hover:bg-black/[0.02] transition-colors"
          >
            Back
          </Link>
        </div>
      </div>

      {error ? <div className="mt-4 rounded-xl bg-red-50 border border-red-100 p-3 text-sm text-red-700">{error}</div> : null}
      {errorDetail ? (
        <pre className="mt-2 rounded-xl bg-white border border-black/5 p-3 text-xs text-black/70 overflow-auto">{errorDetail}</pre>
      ) : null}

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7">
          <div className="rounded-xl bg-white border border-black/5 p-4">
            <div className="text-sm font-semibold">Template</div>
            <div className="mt-2">
              <select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                className="h-10 w-full px-3 rounded-lg border border-black/10 text-sm outline-none focus:ring-2 focus:ring-black/10"
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {showClientBlock ? (
            <div className="mt-4 rounded-xl bg-white border border-black/5 p-4">
              <div className="text-sm font-semibold">
                {tpl?.placeholders?.some((p) => p.key === 'partyA_name') ? '客户信息（甲方） / Party A' : 'Client'}
              </div>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-1">
                <div className="text-xs font-medium text-black/60">
                  {tpl?.placeholders?.some((p) => p.key === 'partyA_name')
                    ? '甲方（公司名称） / Party A (Company Name)'
                    : 'Name'}
                  {requiredKeys.has(clientNameKey) ? ' *' : ''}
                </div>
                <input
                  value={fields[clientNameKey] ?? ''}
                  onChange={(e) => setFields((prev) => ({ ...prev, [clientNameKey]: e.target.value }))}
                  className="mt-1 h-10 w-full px-3 rounded-lg border border-black/10 text-sm outline-none focus:ring-2 focus:ring-black/10"
                />
              </div>
              <div className="md:col-span-1">
                <div className="text-xs font-medium text-black/60">
                  {tpl?.placeholders?.some((p) => p.key === 'partyA_email') ? '电邮地址 / Email' : 'Email'}
                  {requiredKeys.has(clientEmailKey) ? ' *' : ''}
                </div>
                <input
                  value={fields[clientEmailKey] ?? ''}
                  onChange={(e) => setFields((prev) => ({ ...prev, [clientEmailKey]: e.target.value }))}
                  className="mt-1 h-10 w-full px-3 rounded-lg border border-black/10 text-sm outline-none focus:ring-2 focus:ring-black/10"
                />
              </div>

              {tpl?.placeholders?.some((p) => p.key === 'partyA_uen') ? (
                <div className="md:col-span-1">
                  <div className="text-xs font-medium text-black/60">
                    UEN公司注册号 / UEN Registration No.
                    {requiredKeys.has('partyA_uen') ? ' *' : ''}
                  </div>
                  <input
                    value={fields.partyA_uen ?? ''}
                    onChange={(e) => setFields((prev) => ({ ...prev, partyA_uen: e.target.value }))}
                    className="mt-1 h-10 w-full px-3 rounded-lg border border-black/10 text-sm outline-none focus:ring-2 focus:ring-black/10"
                  />
                </div>
              ) : null}
              {tpl?.placeholders?.some((p) => p.key === 'partyA_contact') ? (
                <div className="md:col-span-1">
                  <div className="text-xs font-medium text-black/60">
                    联系电话 / Contact Number
                    {requiredKeys.has('partyA_contact') ? ' *' : ''}
                  </div>
                  <input
                    value={fields.partyA_contact ?? ''}
                    onChange={(e) => setFields((prev) => ({ ...prev, partyA_contact: e.target.value }))}
                    className="mt-1 h-10 w-full px-3 rounded-lg border border-black/10 text-sm outline-none focus:ring-2 focus:ring-black/10"
                  />
                </div>
              ) : null}

              {tpl?.placeholders?.some((p) => p.key === 'partyA_address') ? (
                <div className="md:col-span-2">
                  <div className="text-xs font-medium text-black/60">
                    联系地址 / Address
                    {requiredKeys.has('partyA_address') ? ' *' : ''}
                  </div>
                  <input
                    value={fields.partyA_address ?? ''}
                    onChange={(e) => setFields((prev) => ({ ...prev, partyA_address: e.target.value }))}
                    className="mt-1 h-10 w-full px-3 rounded-lg border border-black/10 text-sm outline-none focus:ring-2 focus:ring-black/10"
                  />
                </div>
              ) : null}
              </div>
            </div>
          ) : null}

          {showSigningBlock ? (
            <div className="mt-4 rounded-xl bg-white border border-black/5 p-4">
              <div className="text-sm font-semibold">签署信息 / Signing</div>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-1">
                <div className="text-xs font-medium text-black/60">
                  签署人姓名 / Signer name
                  {requiredKeys.has('signer_full_name') ? ' *' : ''}
                </div>
                <input
                  value={fields.signer_full_name ?? ''}
                  onChange={(e) => setFields((prev) => ({ ...prev, signer_full_name: e.target.value }))}
                  className="mt-1 h-10 w-full px-3 rounded-lg border border-black/10 text-sm outline-none focus:ring-2 focus:ring-black/10"
                />
              </div>
              <div className="md:col-span-1">
                <div className="text-xs font-medium text-black/60">
                  签署人职位 / Signer title
                  {requiredKeys.has('signer_title') ? ' *' : ''}
                </div>
                <input
                  value={fields.signer_title ?? ''}
                  onChange={(e) => setFields((prev) => ({ ...prev, signer_title: e.target.value }))}
                  className="mt-1 h-10 w-full px-3 rounded-lg border border-black/10 text-sm outline-none focus:ring-2 focus:ring-black/10"
                />
              </div>

              <div className="md:col-span-1">
                <div className="text-xs font-medium text-black/60">
                  签署日期 / Signer date
                  {requiredKeys.has('signer_date') ? ' *' : ''}
                </div>
                <DateInputYMD
                  value={fields.signer_date ?? ''}
                  onChange={(next) => setFields((prev) => ({ ...prev, signer_date: next }))}
                  inputClassName="mt-1 h-10 w-full px-3 rounded-lg border border-black/10 text-sm outline-none focus:ring-2 focus:ring-black/10"
                />
              </div>

              <div className="md:col-span-2">
                <div className="text-xs font-medium text-black/60">
                  签署邮箱 / Signing email
                  {requiredKeys.has('signer_email') ? ' *' : ''}
                </div>
                <input
                  value={fields.signer_email ?? ''}
                  onChange={(e) => setFields((prev) => ({ ...prev, signer_email: e.target.value }))}
                  placeholder="email@example.com"
                  className="mt-1 h-10 w-full px-3 rounded-lg border border-black/10 text-sm outline-none focus:ring-2 focus:ring-black/10"
                />
                <div className="mt-1 text-xs text-black/50">用于发送签署链接/OTP。</div>
              </div>
              </div>
            </div>
          ) : null}

          <div className="mt-4 rounded-xl bg-white border border-black/5 p-4">
            <div className="text-sm font-semibold">Fields</div>
            <div className="mt-3">
              {isProfessionalTemplate ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="md:col-span-1">
                      <div className="text-xs font-medium text-black/60">Agreement title（协议标题） *</div>
                      <input
                        value={fields.agreement_title ?? ''}
                        onChange={(e) => setFields((prev) => ({ ...prev, agreement_title: e.target.value }))}
                        className="mt-1 h-10 w-full px-3 rounded-lg border border-black/10 text-sm outline-none focus:ring-2 focus:ring-black/10"
                      />
                    </div>
                    <div className="md:col-span-1">
                      <div className="text-xs font-medium text-black/60">Date (YYYY-MM-DD)（日期） *</div>
                      <DateInputYMD
                        value={fields.date ?? ''}
                        onChange={(next) => setFields((prev) => ({ ...prev, date: next }))}
                        inputClassName="mt-1 h-10 w-full px-3 rounded-lg border border-black/10 text-sm outline-none focus:ring-2 focus:ring-black/10"
                      />
                    </div>
                  </div>

                  <div className="rounded-lg border border-black/10 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs font-semibold text-black/70">Services provided（服务内容）</div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setFields((prev) => {
                              const cur = Math.max(1, Math.min(4, Number(prev.service_count ?? '2') || 2));
                              const nextCount = Math.min(4, cur + 1);
                              return { ...prev, service_count: String(nextCount) };
                            })
                          }
                          className="h-8 px-3 rounded-md border border-black/10 text-xs font-medium hover:bg-black/[0.02]"
                        >
                          + Add
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setFields((prev) => {
                              const cur = Math.max(1, Math.min(4, Number(prev.service_count ?? '2') || 2));
                              const nextCount = Math.max(1, cur - 1);
                              const next = { ...prev, service_count: String(nextCount) } as Record<string, string>;
                              for (let i = nextCount + 1; i <= 4; i++) {
                                delete (next as any)[`service_title_${i}`];
                                delete (next as any)[`service_body_${i}`];
                              }
                              return next;
                            })
                          }
                          className="h-8 px-3 rounded-md border border-black/10 text-xs font-medium hover:bg-black/[0.02]"
                        >
                          − Remove
                        </button>
                      </div>
                    </div>

                    {Array.from({ length: Math.max(1, Math.min(4, Number(fields.service_count ?? '2') || 2)) }, (_, idx) => idx + 1).map(
                      (n) => (
                        <div key={n} className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="md:col-span-1">
                            <div className="text-xs font-medium text-black/60">({n}) Title{n === 1 ? ' *' : ''}</div>
                            <input
                              value={(fields as any)[`service_title_${n}`] ?? ''}
                              onChange={(e) =>
                                setFields((prev) => ({ ...prev, [`service_title_${n}`]: e.target.value }))
                              }
                              className="mt-1 h-10 w-full px-3 rounded-lg border border-black/10 text-sm outline-none focus:ring-2 focus:ring-black/10"
                            />
                          </div>
                          <div className="md:col-span-1">
                            <div className="text-xs font-medium text-black/60">({n}) Body{n === 1 ? ' *' : ''}</div>
                            <textarea
                              value={(fields as any)[`service_body_${n}`] ?? ''}
                              onChange={(e) =>
                                setFields((prev) => ({ ...prev, [`service_body_${n}`]: e.target.value }))
                              }
                              rows={5}
                              className="mt-1 w-full px-3 py-2 rounded-lg border border-black/10 text-sm outline-none focus:ring-2 focus:ring-black/10"
                            />
                          </div>
                        </div>
                      ),
                    )}
                  </div>

                  <div className="rounded-lg border border-black/10 p-3">
                    <div className="text-xs font-semibold text-black/70">Fee standard (1)（收费标准1） *</div>
                    <textarea
                      value={fields.fee_standard_1 ?? ''}
                      onChange={(e) => setFields((prev) => ({ ...prev, fee_standard_1: e.target.value }))}
                      rows={6}
                      className="mt-2 w-full px-3 py-2 rounded-lg border border-black/10 text-sm outline-none focus:ring-2 focus:ring-black/10"
                    />
                  </div>

                  <div className="rounded-lg border border-black/10 p-3">
                    <div className="text-xs font-semibold text-black/70">Party B obligations（乙方义务）</div>
                    {[1, 2, 3].map((n) => (
                      <div key={n} className="mt-3">
                        <div className="text-xs font-medium text-black/60">({n}) *</div>
                        <textarea
                          value={(fields as any)[`partyB_obligation_${n}`] ?? ''}
                          onChange={(e) =>
                            setFields((prev) => ({ ...prev, [`partyB_obligation_${n}`]: e.target.value }))
                          }
                          rows={2}
                          className="mt-1 w-full px-3 py-2 rounded-lg border border-black/10 text-sm outline-none focus:ring-2 focus:ring-black/10"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="rounded-lg border border-black/10 p-3">
                    <div className="text-xs font-semibold text-black/70">Party A obligations（甲方义务）</div>
                    {[1, 2, 3].map((n) => (
                      <div key={n} className="mt-3">
                        <div className="text-xs font-medium text-black/60">({n}) *</div>
                        <textarea
                          value={(fields as any)[`partyA_obligation_${n}`] ?? ''}
                          onChange={(e) =>
                            setFields((prev) => ({ ...prev, [`partyA_obligation_${n}`]: e.target.value }))
                          }
                          rows={2}
                          className="mt-1 w-full px-3 py-2 rounded-lg border border-black/10 text-sm outline-none focus:ring-2 focus:ring-black/10"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="rounded-lg border border-black/10 p-3">
                    <div className="text-xs font-semibold text-black/70">Force majeure（不可抗力）</div>
                    {[1, 2, 3].map((n) => (
                      <div key={n} className="mt-3">
                        <div className="text-xs font-medium text-black/60">({n}) *</div>
                        <textarea
                          value={(fields as any)[`force_majeure_${n}`] ?? ''}
                          onChange={(e) => setFields((prev) => ({ ...prev, [`force_majeure_${n}`]: e.target.value }))}
                          rows={3}
                          className="mt-1 w-full px-3 py-2 rounded-lg border border-black/10 text-sm outline-none focus:ring-2 focus:ring-black/10"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="rounded-lg border border-black/10 p-3">
                    <div className="text-xs font-semibold text-black/70">Breach（违约责任）</div>
                    {[1, 2].map((n) => (
                      <div key={n} className="mt-3">
                        <div className="text-xs font-medium text-black/60">({n}) *</div>
                        <textarea
                          value={(fields as any)[`breach_${n}`] ?? ''}
                          onChange={(e) => setFields((prev) => ({ ...prev, [`breach_${n}`]: e.target.value }))}
                          rows={3}
                          className="mt-1 w-full px-3 py-2 rounded-lg border border-black/10 text-sm outline-none focus:ring-2 focus:ring-black/10"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="rounded-lg border border-black/10 p-3">
                    <div className="text-xs font-semibold text-black/70">Effectiveness（生效条款）</div>
                    {[1, 2, 3].map((n) => (
                      <div key={n} className="mt-3">
                        <div className="text-xs font-medium text-black/60">({n}) *</div>
                        <textarea
                          value={(fields as any)[`effective_${n}`] ?? ''}
                          onChange={(e) => setFields((prev) => ({ ...prev, [`effective_${n}`]: e.target.value }))}
                          rows={2}
                          className="mt-1 w-full px-3 py-2 rounded-lg border border-black/10 text-sm outline-none focus:ring-2 focus:ring-black/10"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="rounded-lg border border-black/10 p-3">
                    <div className="text-xs font-semibold text-black/70">Governing law & dispute resolution（法律及争议解决）</div>
                    {[1, 2].map((n) => (
                      <div key={n} className="mt-3">
                        <div className="text-xs font-medium text-black/60">({n}) *</div>
                        <textarea
                          value={(fields as any)[`law_${n}`] ?? ''}
                          onChange={(e) => setFields((prev) => ({ ...prev, [`law_${n}`]: e.target.value }))}
                          rows={2}
                          className="mt-1 w-full px-3 py-2 rounded-lg border border-black/10 text-sm outline-none focus:ring-2 focus:ring-black/10"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {(() => {
                    const ps = (tpl?.placeholders ?? []).filter(
                      (p) =>
                        !p.key.startsWith('partyA_') &&
                        !p.key.startsWith('signer_') &&
                        p.key !== 'client_name' &&
                        p.key !== 'client_email',
                    );

                    const renderInput = (p: { key: string; label: string; required?: boolean }) => {
                      const isDateField =
                        /\bYYYY-MM-DD\b/i.test(p.label) ||
                        p.key === 'date' ||
                        p.key === 'dated' ||
                        p.key === 'agreement_date' ||
                        p.key.endsWith('_date');

                      if (isDateField) {
                        return (
                          <div key={p.key} className="md:col-span-1">
                            <div className="text-xs font-medium text-black/60">
                              {p.label}
                              {p.required ? ' *' : ''}
                            </div>
                            <DateInputYMD
                              value={fields[p.key] ?? ''}
                              onChange={(next) => setFields((prev) => ({ ...prev, [p.key]: next }))}
                              inputClassName="mt-1 h-10 w-full px-3 rounded-lg border border-black/10 text-sm outline-none focus:ring-2 focus:ring-black/10"
                            />
                          </div>
                        );
                      }

                      if (isNomineeTemplate && p.key === 'annual_fee') {
                        return (
                          <div key={p.key} className="md:col-span-1">
                            <div className="text-xs font-medium text-black/60">
                              {p.label}
                              {p.required ? ' *' : ''}
                            </div>
                            <div className="mt-1 grid grid-cols-12 gap-2">
                              <select
                                value={annualFeeCurrency}
                                onChange={(e) => {
                                  const nextCurrency = e.target.value as 'SGD' | 'USD' | 'RMB';
                                  setAnnualFeeCurrency(nextCurrency);
                                  const next = `${nextCurrency} ${annualFeeAmount}`.trim();
                                  setFields((prev) => ({ ...prev, annual_fee: next }));
                                }}
                                className="col-span-4 h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm"
                              >
                                <option value="SGD">SGD</option>
                                <option value="USD">USD</option>
                                <option value="RMB">RMB</option>
                              </select>
                              <input
                                value={annualFeeAmount}
                                onChange={(e) => {
                                  const nextAmount = e.target.value;
                                  setAnnualFeeAmount(nextAmount);
                                  const next = `${annualFeeCurrency} ${nextAmount}`.trim();
                                  setFields((prev) => ({ ...prev, annual_fee: next }));
                                }}
                                placeholder="e.g. 5,000"
                                className="col-span-8 h-10 w-full rounded-lg border border-black/10 px-3 text-sm outline-none focus:ring-2 focus:ring-black/10"
                              />
                            </div>
                          </div>
                        );
                      }

                      return (
                      <div key={p.key} className="md:col-span-1">
                        <div className="text-xs font-medium text-black/60">
                          {p.label}
                          {p.required ? ' *' : ''}
                        </div>
                        <input
                          type="text"
                          value={fields[p.key] ?? ''}
                          onChange={(e) => setFields((prev) => ({ ...prev, [p.key]: e.target.value }))}
                          className="mt-1 h-10 w-full px-3 rounded-lg border border-black/10 text-sm outline-none focus:ring-2 focus:ring-black/10"
                        />
                      </div>
                      );
                    };

                    if (!isNomineeTemplate) return ps.map(renderInput);

                    const companyPs = ps.filter(
                      (p) => p.key === 'company' || p.key === 'agreement_date' || p.key === 'annual_fee' || p.key.startsWith('company_'),
                    );
                    const principalPs = ps.filter((p) => p.key.startsWith('principal_'));

                    return (
                      <>
                        <div className="md:col-span-2 text-xs font-semibold text-black/70 mt-1">Company</div>
                        {companyPs.map(renderInput)}
                        <div className="md:col-span-2 text-xs font-semibold text-black/70 mt-2">Principal</div>
                        {principalPs.map(renderInput)}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>

          <div className="fixed bottom-0 left-0 right-0 z-40">
            <div className="max-w-6xl mx-auto px-4 pb-[env(safe-area-inset-bottom)]">
              <div className="rounded-xl bg-white border border-black/5 p-3 flex flex-wrap gap-2 shadow-sm">
              <button
                onClick={() => void saveDraft()}
                disabled={saving || rendering || sending || !clientOk || missingRequired.length > 0}
                className="h-10 px-4 rounded-lg border border-black/10 text-sm font-medium hover:bg-black/[0.02] disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save draft'}
              </button>
              <button
                onClick={() => void generateDocument()}
                disabled={saving || rendering || sending || !clientOk || missingRequired.length > 0}
                className="h-10 px-4 rounded-lg bg-black text-white text-sm font-medium hover:bg-black/90 disabled:opacity-50"
              >
                {rendering ? 'Generating…' : 'Generate'}
              </button>
              <button
                type="button"
                onClick={() => void downloadPdf()}
                disabled={!pdfDownloadUrl || downloading}
                className={`h-10 px-4 rounded-lg border border-black/10 text-sm font-medium flex items-center hover:bg-black/[0.02] ${
                  pdfDownloadUrl ? '' : 'pointer-events-none opacity-50'
                }`}
              >
                {downloading ? 'Downloading…' : 'Download PDF'}
              </button>
              {showSigningBlock || isNomineeTemplate ? (
                <button
                  onClick={() => void sendForSigning()}
                  disabled={saving || rendering || sending || !clientOk || missingRequired.length > 0}
                  className="h-10 px-4 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-600/90 disabled:opacity-50"
                >
                  {sending ? 'Sending…' : packetId ? 'Resend signing' : 'Send for signing'}
                </button>
              ) : null}
            </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-5">
          <div className="rounded-xl bg-white border border-black/5 overflow-hidden">
            <div className="px-4 py-3 border-b border-black/5">
              <div className="text-sm font-semibold">Preview</div>
              <div className="text-xs text-black/60 mt-1">
                {contractNo ? `Contract No: ${contractNo}` : 'Contract No will be generated after Generate'}
              </div>
              {documentSha ? <div className="text-xs text-black/60 mt-1">Document hash: {documentSha}</div> : null}
            </div>
            <div className="h-[70vh]">
              {previewHtml ? (
                <iframe title="preview" srcDoc={previewHtml} className="w-full h-full" scrolling="yes" />
              ) : (
                <div className="p-4 text-sm text-black/60">Select a template to preview.</div>
              )}
            </div>
            {pdfOpenUrl ? (
              <div className="px-4 py-3 border-t border-black/5">
                <a
                  href={pdfOpenUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="h-9 px-3 rounded-lg border border-black/10 text-sm font-medium inline-flex items-center hover:bg-black/[0.02]"
                >
                  Open PDF
                </a>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
