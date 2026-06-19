'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { ContractTemplate } from '@/lib/types';

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
  return html;
}

export default function ContractNewClient({ initialTemplates }: Props) {
  const templates = initialTemplates;
  const [templateId, setTemplateId] = useState<string>(templates[0]?.id ?? '');
  const tpl = useMemo(() => templates.find((t) => t.id === templateId) ?? null, [templateId, templates]);

  const [fields, setFields] = useState<Record<string, string>>({
    date: new Date().toISOString().slice(0, 10),
  });

  const [contractId, setContractId] = useState<string>('');
  const [contractNo, setContractNo] = useState<string>('');
  const [documentId, setDocumentId] = useState<string>('');
  const [documentSha, setDocumentSha] = useState<string>('');
  const [packetId, setPacketId] = useState<string>('');

  const [saving, setSaving] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const clientName = String(fields[clientNameKey] ?? '').trim();
  const clientEmail = String(fields[clientEmailKey] ?? '').trim();
  const signerEmail = String(fields.signer_email ?? '').trim();

  const previewHtml = useMemo(() => {
    if (!tpl) return '';
    return renderPreview(tpl.templateHtml, {
      contract_no: contractNo || 'BBY-YYYY-MM-001-0000',
      client_name: clientName,
      client_email: clientEmail,
      partyA_name: clientName,
      partyA_email: clientEmail,
      ...fields,
    });
  }, [clientEmail, clientName, contractNo, fields, tpl]);


  async function saveDraft() {
    setError(null);
    if (!tpl) {
      setError('TEMPLATE_REQUIRED');
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
          setError(j?.error || 'FAILED');
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
        setError(j?.error || 'FAILED');
        return null;
      }
      return j.contract as { id: string };
    } finally {
      setSaving(false);
    }
  }

  async function generateDocument() {
    setError(null);
    const c = await saveDraft();
    const id = contractId || (c as any)?.id;
    if (!id) return;

    setRendering(true);
    try {
      const res = await fetch(`/api/contracts/${encodeURIComponent(id)}/render`, { method: 'POST' }).catch(() => null);
      const j = (await res?.json().catch(() => null)) as any;
      if (!res?.ok || !j?.documentId) {
        setError(j?.error || 'FAILED');
        return;
      }
      setDocumentId(String(j.documentId));
      setDocumentSha(String(j.documentSha256 ?? ''));
    } finally {
      setRendering(false);
    }
  }

  async function sendForSigning() {
    setError(null);
    const c = await saveDraft();
    const id = contractId || (c as any)?.id;
    if (!id) return;

    setSending(true);
    try {
      const res = await fetch(`/api/contracts/${encodeURIComponent(id)}/send-sign`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ toEmail: signerEmail || undefined }),
      }).catch(() => null);
      const j = (await res?.json().catch(() => null)) as any;
      if (!res?.ok || !j?.packetId) {
        setError(j?.error || 'FAILED');
        return;
      }
      setPacketId(String(j.packetId));
      if (j.contract?.documentId) setDocumentId(String(j.contract.documentId));
    } finally {
      setSending(false);
    }
  }

  const pdfUrl = contractId ? `/api/contracts/${encodeURIComponent(contractId)}/pdf?disposition=inline` : '';

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-lg font-semibold">New contract</div>
          <div className="text-sm text-black/60 mt-1">Fill fields, render document, download PDF, or send for signing.</div>
        </div>
        {contractId ? (
          <Link
            href={`/contracts/${encodeURIComponent(contractId)}`}
            className="h-10 px-4 rounded-lg border border-black/10 text-sm font-medium flex items-center hover:bg-black/[0.02] transition-colors"
          >
            View detail
          </Link>
        ) : null}
      </div>

      {error ? <div className="mt-4 rounded-xl bg-red-50 border border-red-100 p-3 text-sm text-red-700">{error}</div> : null}

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
                </div>
                <input
                  value={fields[clientEmailKey] ?? ''}
                  onChange={(e) => setFields((prev) => ({ ...prev, [clientEmailKey]: e.target.value }))}
                  className="mt-1 h-10 w-full px-3 rounded-lg border border-black/10 text-sm outline-none focus:ring-2 focus:ring-black/10"
                />
              </div>

              {tpl?.placeholders?.some((p) => p.key === 'partyA_uen') ? (
                <div className="md:col-span-1">
                  <div className="text-xs font-medium text-black/60">UEN公司注册号 / UEN Registration No.</div>
                  <input
                    value={fields.partyA_uen ?? ''}
                    onChange={(e) => setFields((prev) => ({ ...prev, partyA_uen: e.target.value }))}
                    className="mt-1 h-10 w-full px-3 rounded-lg border border-black/10 text-sm outline-none focus:ring-2 focus:ring-black/10"
                  />
                </div>
              ) : null}
              {tpl?.placeholders?.some((p) => p.key === 'partyA_contact') ? (
                <div className="md:col-span-1">
                  <div className="text-xs font-medium text-black/60">联系电话 / Contact Number</div>
                  <input
                    value={fields.partyA_contact ?? ''}
                    onChange={(e) => setFields((prev) => ({ ...prev, partyA_contact: e.target.value }))}
                    className="mt-1 h-10 w-full px-3 rounded-lg border border-black/10 text-sm outline-none focus:ring-2 focus:ring-black/10"
                  />
                </div>
              ) : null}

              {tpl?.placeholders?.some((p) => p.key === 'partyA_address') ? (
                <div className="md:col-span-2">
                  <div className="text-xs font-medium text-black/60">联系地址 / Address</div>
                  <input
                    value={fields.partyA_address ?? ''}
                    onChange={(e) => setFields((prev) => ({ ...prev, partyA_address: e.target.value }))}
                    className="mt-1 h-10 w-full px-3 rounded-lg border border-black/10 text-sm outline-none focus:ring-2 focus:ring-black/10"
                  />
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-4 rounded-xl bg-white border border-black/5 p-4">
            <div className="text-sm font-semibold">签署信息 / Signing</div>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <div className="text-xs font-medium text-black/60">签署邮箱 / Signing email</div>
                <input
                  value={fields.signer_email ?? ''}
                  onChange={(e) => setFields((prev) => ({ ...prev, signer_email: e.target.value }))}
                  placeholder="(Optional) 留空则使用上面的 Email"
                  className="mt-1 h-10 w-full px-3 rounded-lg border border-black/10 text-sm outline-none focus:ring-2 focus:ring-black/10"
                />
                <div className="mt-1 text-xs text-black/50">用于发送签署链接/OTP，可能与甲方联系邮箱不同。</div>
              </div>

              <div className="md:col-span-1">
                <div className="text-xs font-medium text-black/60">签署人姓名 / Signer name</div>
                <input
                  value={fields.signer_full_name ?? ''}
                  onChange={(e) => setFields((prev) => ({ ...prev, signer_full_name: e.target.value }))}
                  className="mt-1 h-10 w-full px-3 rounded-lg border border-black/10 text-sm outline-none focus:ring-2 focus:ring-black/10"
                />
              </div>
              <div className="md:col-span-1">
                <div className="text-xs font-medium text-black/60">签署人职位 / Signer title</div>
                <input
                  value={fields.signer_title ?? ''}
                  onChange={(e) => setFields((prev) => ({ ...prev, signer_title: e.target.value }))}
                  className="mt-1 h-10 w-full px-3 rounded-lg border border-black/10 text-sm outline-none focus:ring-2 focus:ring-black/10"
                />
              </div>
              <div className="md:col-span-2">
                <div className="text-xs font-medium text-black/60">签署日期(YYYY-MM-DD) / Signing date</div>
                <input
                  value={fields.signer_signed_date ?? fields.date ?? ''}
                  onChange={(e) => setFields((prev) => ({ ...prev, signer_signed_date: e.target.value }))}
                  placeholder="YYYY-MM-DD"
                  className="mt-1 h-10 w-full px-3 rounded-lg border border-black/10 text-sm outline-none focus:ring-2 focus:ring-black/10"
                />
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-xl bg-white border border-black/5 p-4">
            <div className="text-sm font-semibold">Fields</div>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              {(tpl?.placeholders ?? [])
                .filter(
                  (p) =>
                    !p.key.startsWith('partyA_') &&
                    !p.key.startsWith('signer_') &&
                    p.key !== 'client_name' &&
                    p.key !== 'client_email',
                )
                .map((p) => (
                <div key={p.key} className="md:col-span-1">
                  <div className="text-xs font-medium text-black/60">{p.label}{p.required ? ' *' : ''}</div>
                  <input
                    value={fields[p.key] ?? ''}
                    onChange={(e) => setFields((prev) => ({ ...prev, [p.key]: e.target.value }))}
                    className="mt-1 h-10 w-full px-3 rounded-lg border border-black/10 text-sm outline-none focus:ring-2 focus:ring-black/10"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 sticky bottom-4">
            <div className="rounded-xl bg-white border border-black/5 p-3 flex flex-wrap gap-2">
              <button
                onClick={() => void saveDraft()}
                disabled={saving || rendering || sending}
                className="h-10 px-4 rounded-lg border border-black/10 text-sm font-medium hover:bg-black/[0.02] disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save draft'}
              </button>
              <button
                onClick={() => void generateDocument()}
                disabled={saving || rendering || sending}
                className="h-10 px-4 rounded-lg bg-black text-white text-sm font-medium hover:bg-black/90 disabled:opacity-50"
              >
                {rendering ? 'Rendering…' : 'Render document'}
              </button>
              <a
                href={pdfUrl}
                target="_blank"
                rel="noreferrer"
                className={`h-10 px-4 rounded-lg border border-black/10 text-sm font-medium flex items-center hover:bg-black/[0.02] ${
                  pdfUrl ? '' : 'pointer-events-none opacity-50'
                }`}
              >
                Download PDF
              </a>
              <button
                onClick={() => void sendForSigning()}
                disabled={saving || rendering || sending}
                className="h-10 px-4 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-600/90 disabled:opacity-50"
              >
                {sending ? 'Sending…' : packetId ? 'Resend signing' : 'Send for signing'}
              </button>
            </div>
          </div>
        </div>

        <div className="lg:col-span-5">
          <div className="rounded-xl bg-white border border-black/5 overflow-hidden">
            <div className="px-4 py-3 border-b border-black/5">
              <div className="text-sm font-semibold">Preview</div>
              <div className="text-xs text-black/60 mt-1">
                {contractNo ? `Contract No: ${contractNo}` : 'Contract No will be generated after save'}
              </div>
              {documentSha ? <div className="text-xs text-black/60 mt-1">Document hash: {documentSha}</div> : null}
            </div>
            <div className="h-[70vh]">
              {contractId ? (
                <iframe title="preview" src={pdfUrl} className="w-full h-full" />
              ) : previewHtml ? (
                <iframe title="preview" srcDoc={previewHtml} className="w-full h-full" />
              ) : (
                <div className="p-4 text-sm text-black/60">Select a template to preview.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
