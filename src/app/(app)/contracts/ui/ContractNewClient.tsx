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
  const [templateId, setTemplateId] = useState<string>(templates[0]?.id ?? '');
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
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
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
