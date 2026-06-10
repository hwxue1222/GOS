'use client';

import { useMemo, useState } from 'react';

export type SignatureRow = {
  documentTitle: string;
  signerName: string;
  signerRole: string;
  email: string;
  status: string;
  signedAt?: string;
};

export type DocumentRow = {
  documentId: string;
  title: string;
  signerCount: number;
};

function normalizeDocTitle(title: string) {
  return String(title ?? '').replaceAll('Board Resolution', 'Director Resolution');
}

function formatTs(ts?: string) {
  const s = String(ts ?? '').trim();
  if (!s) return '-';
  return s.slice(0, 19).replace('T', ' ');
}

function signatureStatusClass(status: string) {
  if (status === 'SIGNED') return 'bg-[#ecfdf5] text-[#047857] border-[#a7f3d0]';
  if (status === 'OTP_SENT') return 'bg-[#eff6ff] text-[#1d4ed8] border-[#bfdbfe]';
  if (status === 'EXPIRED') return 'bg-black/[0.02] text-black/70 border-black/10';
  if (status === 'REVOKED') return 'bg-[#fef2f2] text-[#b91c1c] border-[#fecaca]';
  return 'bg-[#fff7ed] text-[#c2410c] border-[#fed7aa]';
}

export default function SignaturesDocumentsCardClient(props: {
  signatureRows: SignatureRow[];
  documents: DocumentRow[];
}) {
  const [tab, setTab] = useState<'signatures' | 'documents'>('signatures');

  const signatureSummary = useMemo(() => {
    const signed = props.signatureRows.filter((r) => r.status === 'SIGNED').length;
    return { signed, total: props.signatureRows.length };
  }, [props.signatureRows]);

  return (
    <div className="rounded-xl bg-white border border-black/5 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium">Signatures & documents</div>
          <div className="mt-1 text-xs text-black/50">Unified view for signing and PDFs.</div>
        </div>
        <div className="text-xs text-black/50">
          Progress: {signatureSummary.signed}/{signatureSummary.total}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-lg bg-black/5 p-1">
        <button
          type="button"
          onClick={() => setTab('signatures')}
          className={`flex-1 rounded-md px-3 py-1.5 text-center text-xs font-medium ${
            tab === 'signatures' ? 'bg-white text-black shadow-sm' : 'text-black/60 hover:bg-white/60'
          }`}
        >
          Signatures ({props.signatureRows.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('documents')}
          className={`flex-1 rounded-md px-3 py-1.5 text-center text-xs font-medium ${
            tab === 'documents' ? 'bg-white text-black shadow-sm' : 'text-black/60 hover:bg-white/60'
          }`}
        >
          Documents ({props.documents.length})
        </button>
      </div>

      {tab === 'signatures' ? (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-black/60 bg-black/[0.02]">
              <tr className="border-b border-black/10">
                <th className="px-3 py-2 font-medium">Document</th>
                <th className="px-3 py-2 font-medium">Signer</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Time</th>
              </tr>
            </thead>
            <tbody>
              {props.signatureRows.map((r) => (
                <tr key={`${r.documentTitle}:${r.email}`} className="border-b border-black/5 hover:bg-black/[0.02]">
                  <td className="px-3 py-2 align-top text-xs text-black/70">{normalizeDocTitle(r.documentTitle)}</td>
                  <td className="px-3 py-2 align-top">
                    <div className="text-sm text-black/80">{r.signerName || r.email}</div>
                    <div className="text-xs text-black/50">
                      {r.signerRole ? `(${r.signerRole}) ` : ''}
                      {r.email}
                    </div>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${signatureStatusClass(r.status)}`}>{r.status}</span>
                  </td>
                  <td className="px-3 py-2 align-top text-xs text-black/60">{formatTs(r.signedAt)}</td>
                </tr>
              ))}
              {props.signatureRows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-black/40">
                    No signatures
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-black/60 bg-black/[0.02]">
              <tr className="border-b border-black/10">
                <th className="px-3 py-2 font-medium">Document</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {props.documents.map((d) => (
                <tr key={d.documentId} className="border-b border-black/5 hover:bg-black/[0.02]">
                  <td className="px-3 py-2 align-top">
                    <div className="text-sm text-black/80">{normalizeDocTitle(d.title)}</div>
                    <div className="text-xs text-black/50">Signers: {d.signerCount}</div>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={`/api/documents/${encodeURIComponent(d.documentId)}/pdf?disposition=inline`}
                        className="inline-flex items-center rounded-md bg-white border border-black/10 text-black/70 px-3 py-1.5 text-xs font-medium hover:bg-black/[0.02]"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Preview
                      </a>
                      <a
                        href={`/api/documents/${encodeURIComponent(d.documentId)}/pdf?download=1`}
                        className="inline-flex items-center rounded-md bg-white border border-black/10 text-black/70 px-3 py-1.5 text-xs font-medium hover:bg-black/[0.02]"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Download
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
              {props.documents.length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-3 py-8 text-center text-black/40">
                    No documents
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
