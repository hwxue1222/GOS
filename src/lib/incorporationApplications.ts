import type { Db, IncorporationApplication } from '@/lib/types';

export type IncorporationApplicationRow = {
  id: string;
  type: IncorporationApplication['type'];
  companyId?: string;
  companyName: string;
  applicationDate: string;
  editDate: string;
  status: IncorporationApplication['status'];
  sourceId: string;
};

function iso(s: string | undefined) {
  const v = String(s ?? '').trim();
  return v || new Date(0).toISOString();
}

export function buildIncorporationApplications(db: Db, allowedClientIds: Set<string> | null, createdByUserId: string | null) {
  const list = db.incorporationApplications ?? [];
  const rows: IncorporationApplicationRow[] = [];

  for (const a of list) {
    if (createdByUserId) {
      const isOwner = a.createdByUserId === createdByUserId;
      const isCompanyVisible = !!a.companyId && !!allowedClientIds && allowedClientIds.has(a.companyId);
      if (!isOwner && !isCompanyVisible) continue;
    }

    const companyName =
      a.type === 'TRANSFER_COMPANY_SECRETARY'
        ? String(a.companyName ?? '').trim() || (a.companyId ? a.companyId : '-')
        : String(a.companyName ?? '').trim() || (typeof (a.payload as Record<string, unknown>).companyName === 'string' ? String((a.payload as Record<string, unknown>).companyName) : '-');

    rows.push({
      id: `INC-${a.id}`,
      type: a.type,
      companyId: a.companyId,
      companyName,
      applicationDate: iso(a.submittedAt || a.createdAt),
      editDate: iso(a.updatedAt || a.createdAt),
      status: a.status,
      sourceId: a.id,
    });
  }

  rows.sort((a, b) => {
    if (a.editDate !== b.editDate) return b.editDate.localeCompare(a.editDate);
    return b.applicationDate.localeCompare(a.applicationDate);
  });

  return rows;
}
