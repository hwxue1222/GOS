'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Contract, ContractStatus } from '@/lib/types';
import { formatDateDMY } from '@/lib/date';

type SigReq = { email: string; status: string; signedAt?: string };

type Props = {
  initialContract: Contract;
  templateName: string;
  templateHtml: string;
  documentSha256: string;
  signatureRequests: SigReq[];
};

function statusLabel(status: ContractStatus) {
  if (status === 'SIGNED') return { text: 'SIGNED', cls: 'bg-green-100 text-green-700' };
  if (status === 'SIGNING') return { text: 'SIGNING', cls: 'bg-blue-100 text-blue-700' };
  if (status === 'READY') return { text: 'READY', cls: 'bg-amber-100 text-amber-700' };
  if (status === 'VOID') return { text: 'VOID', cls: 'bg-black/10 text-black/70' };
  return { text: 'DRAFT', cls: 'bg-black/10 text-black/70' };
}

export default function ContractDetailClient({ initialContract, templateName, documentSha256, signatureRequests }: Props) {
  const [contract, setContract] = useState<Contract>(initialContract);
  const [error, setError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [sending, setSending] = useState(false);

  const st = statusLabel(contract.status);
  const pdfUrl = contract.documentId ? `/api/documents/${encodeURIComponent(contract.documentId)}/pdf?disposition=inline` : '';

  async function renderDoc() {
    setError(null);
    setRendering(true);
    try {
      const res = await fetch(`/api/contracts/${encodeURIComponent(contract.id)}/render`, { method: 'POST' }).catch(() => null);
      const j = (await res?.json().catch(() => null)) as any;
      if (!res?.ok || !j?.contract?.id) {
        setError(j?.error || 'FAILED');
        return;
      }
      setContract(j.contract as Contract);
    } finally {
      setRendering(false);
    }
  }

  async function sendSign() {
    setError(null);
    setSending(true);
    try {
      const res = await fetch(`/api/contracts/${encodeURIComponent(contract.id)}/send-sign`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }).catch(() => null);
      const j = (await res?.json().catch(() => null)) as any;
      if (!res?.ok || !j?.contract?.id) {
        setError(j?.error || 'FAILED');
        return;
      }
      setContract(j.contract as Contract);
    } finally {
      setSending(false);
    }
  }

  const reqs = useMemo(() => {
    return (signatureRequests ?? []).slice().sort((a, b) => a.email.localeCompare(b.email));
  }, [signatureRequests]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-lg font-semibold">{contract.contractNo}</div>
          <div className="text-sm text-black/60 mt-1">{contract.clientName} · {contract.clientEmail}</div>
          <div className="text-xs text-black/60 mt-1">Template: {templateName}</div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex px-2 py-1 rounded-md text-xs font-medium ${st.cls}`}>{st.text}</span>
          <Link
            href="/contracts"
            className="h-9 px-3 rounded-lg border border-black/10 text-sm font-medium flex items-center hover:bg-black/[0.02]"
          >
            Back
          </Link>
        </div>
      </div>

      {error ? <div className="mt-4 rounded-xl bg-red-50 border border-red-100 p-3 text-sm text-red-700">{error}</div> : null}

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-8">
          <div className="rounded-xl bg-white border border-black/5 p-4">
            <div className="text-sm font-semibold">Metadata</div>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs font-medium text-black/60">Created</div>
                <div className="mt-1">{formatDateDMY(contract.createdAt)}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-black/60">Status</div>
                <div className="mt-1">{st.text}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-black/60">Document</div>
                <div className="mt-1">{contract.documentId || '-'}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-black/60">Packet</div>
                <div className="mt-1">{contract.packetId || '-'}</div>
              </div>
            </div>
            {documentSha256 ? <div className="mt-3 text-xs text-black/60">Document hash: {documentSha256}</div> : null}
          </div>

          <div className="mt-4 rounded-xl bg-white border border-black/5 p-4">
            <div className="text-sm font-semibold">Signing</div>
            <div className="mt-3 rounded-lg border border-black/10 overflow-hidden">
              <div className="grid grid-cols-12 px-3 py-2 text-xs font-semibold text-black/60 border-b border-black/10">
                <div className="col-span-6">Email</div>
                <div className="col-span-3">Status</div>
                <div className="col-span-3">Signed at</div>
              </div>
              {reqs.length === 0 ? (
                <div className="px-3 py-3 text-sm text-black/60">No signing requests</div>
              ) : (
                reqs.map((r) => (
                  <div key={r.email} className="grid grid-cols-12 px-3 py-2 text-sm border-b border-black/10">
                    <div className="col-span-6 truncate">{r.email}</div>
                    <div className="col-span-3 truncate">{r.status}</div>
                    <div className="col-span-3 truncate">{r.signedAt ? formatDateDMY(r.signedAt) : '-'}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-4">
          <div className="rounded-xl bg-white border border-black/5 p-4 sticky top-6">
            <div className="text-sm font-semibold">Actions</div>
            <div className="mt-3 flex flex-col gap-2">
              <button
                onClick={() => void renderDoc()}
                disabled={rendering || sending}
                className="h-10 px-4 rounded-lg bg-black text-white text-sm font-medium hover:bg-black/90 disabled:opacity-50"
              >
                {rendering ? 'Rendering…' : 'Render document'}
              </button>
              <a
                href={pdfUrl}
                target="_blank"
                rel="noreferrer"
                className={`h-10 px-4 rounded-lg border border-black/10 text-sm font-medium flex items-center justify-center hover:bg-black/[0.02] ${
                  pdfUrl ? '' : 'pointer-events-none opacity-50'
                }`}
              >
                Download PDF
              </a>
              <button
                onClick={() => void sendSign()}
                disabled={rendering || sending}
                className="h-10 px-4 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-600/90 disabled:opacity-50"
              >
                {sending ? 'Sending…' : contract.packetId ? 'Resend signing' : 'Send for signing'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

