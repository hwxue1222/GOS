'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import DirectorChangeRequestForm from '@/app/(app)/secretary/companies/[clientId]/ui/DirectorChangeRequestForm';
import DirectorChangeRequestsHistory from '@/app/(app)/secretary/companies/[clientId]/ui/DirectorChangeRequestsHistory';

type RequestStatus =
  | 'DRAFT'
  | 'PENDING_SIGNATURES'
  | 'PENDING_REVIEW'
  | 'NEED_MORE_INFO'
  | 'APPROVED'
  | 'REJECTED';

export type DirectorChangeRequest = {
  id: string;
  clientId: string;
  createdByUserId: string;
  status: RequestStatus;
  effectiveDate: string;
  message?: string;
  removeDirectorRoleIds: string[];
  addDirectors: Array<{ fullName: string; email?: string }>;
  packetId: string;
  createdAt: string;
  signedAt?: string;
  decidedAt?: string;
  decidedByUserId?: string;
  decisionNote?: string;
};

export type SignatureRow = { email: string; status: string; signedAt?: string };

export type DirectorChangeRequestItem = {
  request: DirectorChangeRequest;
  signatures: SignatureRow[];
  signatureSummary: { total: number; signed: number };
};

type Props = {
  clientId: string;
  directors: Array<{ roleId: string; fullName: string; email?: string }>;
  canSubmit: boolean;
  canApprove: boolean;
};

export default function DirectorChangeRequestsPanel({ clientId, directors, canSubmit, canApprove }: Props) {
  const [items, setItems] = useState<DirectorChangeRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const directorByRoleId = useMemo(() => new Map(directors.map((d) => [d.roleId, d])), [directors]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/secretary/companies/${encodeURIComponent(clientId)}/director-change-requests`, { cache: 'no-store' }).catch(
        () => null,
      );
      const j = await res?.json().catch(() => null);
      if (!res?.ok) {
        setError(j?.error ?? `HTTP_${res?.status ?? 'NETWORK'}`);
        return;
      }
      setItems(Array.isArray(j?.items) ? (j.items as DirectorChangeRequestItem[]) : []);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function decide(requestId: string, decision: 'APPROVE' | 'REJECT', note?: string) {
    if (!canApprove) return;
    setError(null);
    const res = await fetch(
      `/api/secretary/companies/${encodeURIComponent(clientId)}/director-change-requests/${encodeURIComponent(requestId)}/decision`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision, note }),
      },
    ).catch(() => null);
    const j = await res?.json().catch(() => null);
    if (!res?.ok) {
      setError(j?.error ?? `HTTP_${res?.status ?? 'NETWORK'}`);
      return;
    }
    await refresh();
  }

  return (
    <div className="rounded-xl bg-white border border-black/5 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium">Change of Director Requests</div>
          <div className="mt-0.5 text-xs text-black/50">Submit → directors sign → back office approves → data updated.</div>
        </div>
        <button
          onClick={() => void refresh()}
          className="rounded-md bg-white border border-black/10 text-black/70 px-3 py-2 text-sm font-medium"
        >
          Refresh
        </button>
      </div>

      {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}

      {canSubmit ? (
        <div className="mt-4">
          <DirectorChangeRequestForm clientId={clientId} directors={directors} />
        </div>
      ) : null}

      <div className="mt-4">
        <DirectorChangeRequestsHistory
          items={items}
          directorByRoleId={directorByRoleId}
          loading={loading}
          canApprove={canApprove}
          onDecide={(requestId, decision) => {
            const noteRaw = window.prompt('Note (optional)');
            if (noteRaw === null) return;
            void decide(requestId, decision, noteRaw);
          }}
        />
      </div>
    </div>
  );
}
