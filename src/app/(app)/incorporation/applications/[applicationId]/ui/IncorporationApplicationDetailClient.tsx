'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import IncorporationDetailsSection from '@/app/(app)/incorporation/applications/[applicationId]/ui/IncorporationDetailsSection';
import IncorporationMaterialsSection from '@/app/(app)/incorporation/applications/[applicationId]/ui/IncorporationMaterialsSection';
import IncorporationTimelineSection from '@/app/(app)/incorporation/applications/[applicationId]/ui/IncorporationTimelineSection';
import RegisterCompanyDetailsSection from '@/app/(app)/incorporation/applications/[applicationId]/ui/RegisterCompanyDetailsSection';

type Application = {
  id: string;
  type: 'REGISTER_COMPANY' | 'TRANSFER_COMPANY_SECRETARY';
  status: 'DRAFT' | 'SUBMITTED' | 'PROCESSING' | 'NEED_MORE_INFO' | 'COMPLETED' | 'REJECTED' | 'CANCELLED';
  title: string;
  companyId?: string;
  companyName?: string;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt?: string;
  submittedAt?: string;
  assignedToUserId?: string;
};

type EventRow = {
  id: string;
  fromStatus?: string;
  toStatus: string;
  note?: string;
  actorName: string;
  actorRole: string;
  createdAt: string;
};

type FileRow = {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedByName: string;
  uploadedAt: string;
};

type Props = {
  meRole: 'owner' | 'manager' | 'staff' | 'client';
  canReview: boolean;
  application: Application;
  events: EventRow[];
  files: FileRow[];
};

function bytesToBase64(bytes: ArrayBuffer) {
  const u8 = new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < u8.length; i += 1) s += String.fromCharCode(u8[i]);
  return btoa(s);
}

function statusClass(status: string) {
  if (status === 'REJECTED') return 'text-red-600';
  if (status === 'NEED_MORE_INFO') return 'text-[#d97706]';
  if (status === 'DRAFT') return 'text-black/60';
  if (status === 'CANCELLED') return 'text-black/60';
  return 'text-[#16a34a]';
}

export default function IncorporationApplicationDetailClient(props: Props) {
  const router = useRouter();
  const [app, setApp] = useState<Application>(props.application);
  const [files, setFiles] = useState<FileRow[]>(props.files);
  const [events, setEvents] = useState<EventRow[]>(props.events);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const canClientEdit = useMemo(
    () => props.meRole === 'client' && (app.status === 'DRAFT' || app.status === 'NEED_MORE_INFO' || app.status === 'SUBMITTED'),
    [app.status, props.meRole],
  );

  async function refresh() {
    const res = await fetch(`/api/incorporation/applications/${encodeURIComponent(app.id)}`, { cache: 'no-store' }).catch(() => null);
    const j = (await res?.json().catch(() => null)) as { application?: Application; events?: EventRow[]; files?: Array<FileRow & { dataBase64?: unknown }>; error?: string } | null;
    if (!res?.ok || !j?.application) {
      setError(j?.error ?? `HTTP_${res?.status ?? 'NETWORK'}`);
      return;
    }
    setApp(j.application);
    setEvents(Array.isArray(j.events) ? j.events : []);
    const safeFiles = Array.isArray(j.files) ? j.files.map((f) => ({ id: f.id, fileName: f.fileName, mimeType: f.mimeType, size: f.size, uploadedByName: f.uploadedByName, uploadedAt: f.uploadedAt })) : [];
    setFiles(safeFiles);
  }

  async function savePatch(patch: { companyName?: string; payload?: Record<string, unknown> }) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/incorporation/applications/${encodeURIComponent(app.id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      }).catch(() => null);
      const j = (await res?.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res?.ok || !j?.ok) {
        setError(j?.error ?? `HTTP_${res?.status ?? 'NETWORK'}`);
        return;
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/incorporation/applications/${encodeURIComponent(app.id)}/submit`, { method: 'POST' }).catch(() => null);
      const j = (await res?.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res?.ok || !j?.ok) {
        setError(j?.error ?? `HTTP_${res?.status ?? 'NETWORK'}`);
        return;
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(toStatus: 'PROCESSING' | 'NEED_MORE_INFO' | 'COMPLETED' | 'REJECTED') {
    setError(null);
    setBusy(true);
    try {
      const note = window.prompt('Note (optional)') ?? '';
      const res = await fetch(`/api/incorporation/applications/${encodeURIComponent(app.id)}/status`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ toStatus, note, assignToMe: true }),
      }).catch(() => null);
      const j = (await res?.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res?.ok || !j?.ok) {
        setError(j?.error ?? `HTTP_${res?.status ?? 'NETWORK'}`);
        return;
      }
      await refresh();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function onUpload(selected: FileList | null) {
    if (!selected?.length) return;
    setError(null);
    setUploading(true);
    try {
      for (const f of Array.from(selected)) {
        const buf = await f.arrayBuffer();
        const dataBase64 = bytesToBase64(buf);
        const res = await fetch(`/api/incorporation/applications/${encodeURIComponent(app.id)}/files`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ fileName: f.name, mimeType: f.type || 'application/octet-stream', dataBase64 }),
        }).catch(() => null);
        const j = (await res?.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
        if (!res?.ok || !j?.ok) {
          setError(j?.error ?? `HTTP_${res?.status ?? 'NETWORK'}`);
          return;
        }
      }
      await refresh();
    } finally {
      setUploading(false);
    }
  }

  const typeLabel = app.type === 'REGISTER_COMPANY' ? 'Register Company' : 'Transfer of Company Secretary';

  return (
    <div className="space-y-4">
      {error ? <div className="rounded-xl bg-white border border-black/5 p-4 text-sm text-red-600">{error}</div> : null}

      <div className="rounded-xl bg-white border border-black/5 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">{typeLabel}</div>
            <div className="mt-1 text-sm text-black/60">Application ID: {app.id}</div>
          </div>
          <button
            type="button"
            onClick={() => router.push(props.meRole === 'client' ? '/dashboard' : '/jobs')}
            className="text-sm text-[#2f7bdc] hover:underline"
          >
            Back
          </button>
        </div>

        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div>
            <div className="text-black/50">Status</div>
            <div className={['mt-1 font-medium', statusClass(app.status)].join(' ')}>{app.status}</div>
          </div>
          <div>
            <div className="text-black/50">Created</div>
            <div className="mt-1 font-medium">{app.createdAt.slice(0, 19).replace('T', ' ')}</div>
          </div>
          <div>
            <div className="text-black/50">Updated</div>
            <div className="mt-1 font-medium">{(app.updatedAt ?? app.createdAt).slice(0, 19).replace('T', ' ')}</div>
          </div>
        </div>
      </div>

      {app.type === 'REGISTER_COMPANY' ? (
        <RegisterCompanyDetailsSection
          applicationId={app.id}
          status={app.status}
          payload={app.payload}
          canEdit={canClientEdit}
          onUpdated={() => void refresh()}
        />
      ) : (
        <IncorporationDetailsSection
          application={app}
          canClientEdit={canClientEdit}
          busy={busy}
          onChangeApplication={setApp}
          onSave={() => void savePatch({ payload: app.payload })}
          onSubmit={() => void submit()}
        />
      )}

      <IncorporationMaterialsSection
        files={files}
        uploading={uploading}
        onUpload={(fl) => void onUpload(fl)}
        showRegisterCompanyRequirements={app.type === 'REGISTER_COMPANY'}
        hasCorporateShareholder={
          app.type === 'REGISTER_COMPANY' &&
          Array.isArray((app.payload as { shareholders?: Array<{ kind?: string }> } | null)?.shareholders)
            ? (app.payload as { shareholders?: Array<{ kind?: string }> }).shareholders!.some((s) => s?.kind === 'COMPANY')
            : false
        }
      />

      <IncorporationTimelineSection events={events} busy={busy} canReview={props.canReview} onSetStatus={(s) => void setStatus(s)} />
    </div>
  );
}
