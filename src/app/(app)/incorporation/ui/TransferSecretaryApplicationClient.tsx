'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

type CompanyOption = { id: string; name: string };

type Props = {
  companies: CompanyOption[];
  defaultCompanyId?: string;
};

function bytesToBase64(bytes: ArrayBuffer) {
  const u8 = new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < u8.length; i += 1) s += String.fromCharCode(u8[i]);
  return btoa(s);
}

export default function TransferSecretaryApplicationClient(props: Props) {
  const router = useRouter();
  const [companyId, setCompanyId] = useState(props.defaultCompanyId ?? props.companies[0]?.id ?? '');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [newSecretaryName, setNewSecretaryName] = useState('');
  const [newSecretaryEmail, setNewSecretaryEmail] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const companyName = useMemo(() => props.companies.find((c) => c.id === companyId)?.name ?? '', [companyId, props.companies]);
  const canSubmit = useMemo(() => !!companyId && newSecretaryName.trim().length > 0, [companyId, newSecretaryName]);

  async function uploadFiles(applicationId: string) {
    for (const f of files) {
      const buf = await f.arrayBuffer();
      const dataBase64 = bytesToBase64(buf);
      const res = await fetch(`/api/incorporation/applications/${encodeURIComponent(applicationId)}/files`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fileName: f.name, mimeType: f.type || 'application/octet-stream', dataBase64 }),
      }).catch(() => null);
      if (!res?.ok) {
        const j = await res?.json().catch(() => null);
        throw new Error(j?.error ?? `UPLOAD_HTTP_${res?.status ?? 'NETWORK'}`);
      }
    }
  }

  async function create(submit: boolean) {
    setError(null);
    setCreating(true);
    try {
      const payload = {
        companyId,
        companyName,
        effectiveDate: effectiveDate.trim() || undefined,
        newSecretaryName: newSecretaryName.trim(),
        newSecretaryEmail: newSecretaryEmail.trim() || undefined,
        reason: reason.trim() || undefined,
        notes: notes.trim() || undefined,
      };
      const res = await fetch('/api/incorporation/applications', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'TRANSFER_COMPANY_SECRETARY', companyId, payload, submit }),
      }).catch(() => null);
      const j = (await res?.json().catch(() => null)) as { application?: { id: string }; error?: string } | null;
      if (!res?.ok || !j?.application?.id) {
        setError(j?.error ?? `HTTP_${res?.status ?? 'NETWORK'}`);
        return;
      }
      const id = j.application.id;
      if (files.length) await uploadFiles(id);
      router.push(`/incorporation/applications/${encodeURIComponent(id)}`);
      router.refresh();
    } catch (e) {
      setError((e as Error).message || 'CREATE_FAILED');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="rounded-xl bg-white border border-black/5 p-4 sm:p-6">
      {error ? <div className="mb-3 text-sm text-red-600">{error}</div> : null}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="text-sm sm:col-span-2">
          <div className="text-black/60">Company</div>
          <select
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            className="mt-1 w-full rounded-md border border-black/10 bg-white px-3 py-2"
          >
            {props.companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <div className="text-black/60">Effective date (optional)</div>
          <input
            type="date"
            value={effectiveDate}
            onChange={(e) => setEffectiveDate(e.target.value)}
            className="mt-1 w-full rounded-md border border-black/10 px-3 py-2"
          />
        </label>
        <div />

        <label className="text-sm">
          <div className="text-black/60">New secretary name</div>
          <input
            value={newSecretaryName}
            onChange={(e) => setNewSecretaryName(e.target.value)}
            className="mt-1 w-full rounded-md border border-black/10 px-3 py-2"
            placeholder="Name"
          />
        </label>
        <label className="text-sm">
          <div className="text-black/60">New secretary email (optional)</div>
          <input
            value={newSecretaryEmail}
            onChange={(e) => setNewSecretaryEmail(e.target.value)}
            className="mt-1 w-full rounded-md border border-black/10 px-3 py-2"
            placeholder="email@example.com"
          />
        </label>
        <label className="text-sm sm:col-span-2">
          <div className="text-black/60">Reason (optional)</div>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="mt-1 w-full rounded-md border border-black/10 px-3 py-2 min-h-[96px]"
            placeholder="Reason for transfer"
          />
        </label>
        <label className="text-sm sm:col-span-2">
          <div className="text-black/60">Notes (optional)</div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-1 w-full rounded-md border border-black/10 px-3 py-2 min-h-[96px]"
            placeholder="Any additional information"
          />
        </label>
        <label className="text-sm sm:col-span-2">
          <div className="text-black/60">Materials (optional, max 2MB each)</div>
          <input type="file" multiple onChange={(e) => setFiles(Array.from(e.target.files ?? []))} className="mt-1 block w-full text-sm" />
          {files.length ? <div className="mt-2 text-xs text-black/50">{files.map((f) => f.name).join(', ')}</div> : null}
        </label>
      </div>

      <div className="mt-5 flex items-center justify-end gap-2">
        <button
          disabled={creating || !companyId}
          onClick={() => void create(false)}
          className="rounded-md bg-white border border-black/10 text-black/70 px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          Save draft
        </button>
        <button
          disabled={creating || !canSubmit}
          onClick={() => void create(true)}
          className="rounded-md bg-[#2f7bdc] text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {creating ? 'Submitting...' : 'Submit'}
        </button>
      </div>
    </div>
  );
}
