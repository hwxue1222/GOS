import type {
  AnnualGeneralMeetingRequest,
  CompanyUpdateRequest,
  Db,
  DirectorChangeRequest,
  RorcDeclarationRequest,
  SecretaryServiceApplicationRow,
  ShareTransfer,
} from '@/lib/types';

function iso(s: string | undefined) {
  const v = String(s ?? '').trim();
  return v || new Date(0).toISOString();
}

function statusFromDirectorChange(r: DirectorChangeRequest): SecretaryServiceApplicationRow['status'] {
  if (r.status === 'DRAFT') return 'DRAFT';
  if (r.status === 'PENDING_SIGNATURES') return 'SIGNING';
  if (r.status === 'PENDING_REVIEW') return 'PENDING_REVIEW';
  if (r.status === 'NEED_MORE_INFO') return 'NEED_MORE_INFO';
  if (r.status === 'APPROVED') return 'APPROVED';
  if (r.status === 'REJECTED') return 'REJECTED';
  return 'PROCESSING';
}

function statusFromShareTransfer(t: ShareTransfer): SecretaryServiceApplicationRow['status'] {
  const st = String((t as any).status ?? '');
  if (st === 'SIGNING') return 'SIGNING';
  if (st === 'BLOCKED_REPRESENTATIVE') return 'NEED_MORE_INFO';
  if (st === 'NEED_MORE_INFO') return 'NEED_MORE_INFO';
  if (st === 'PENDING_REVIEW') return 'PENDING_REVIEW';
  if (st === 'SIGNED') return 'PENDING_REVIEW';
  if (st === 'APPROVED') return 'APPROVED';
  if (st === 'REJECTED') return 'REJECTED';
  if (st === 'APPLIED') return 'COMPLETE';
  return 'PROCESSING';
}

function statusFromCompanyUpdateRequest(r: CompanyUpdateRequest): SecretaryServiceApplicationRow['status'] {
  if (r.status === 'PENDING_SIGNATURES') return 'SIGNING';
  if (r.status === 'PENDING_REVIEW') return 'PENDING_REVIEW';
  if (r.status === 'NEED_MORE_INFO') return 'NEED_MORE_INFO';
  if (r.status === 'REJECTED') return 'REJECTED';
  if (r.status === 'COMPLETE') return 'COMPLETE';
  return 'PROCESSING';
}

function statusFromRorcDeclaration(r: RorcDeclarationRequest): SecretaryServiceApplicationRow['status'] {
  if (r.status === 'PENDING_SIGNATURES') return 'SIGNING';
  if (r.status === 'PENDING_REVIEW') return 'PENDING_REVIEW';
  if (r.status === 'NEED_MORE_INFO') return 'NEED_MORE_INFO';
  if (r.status === 'REJECTED') return 'REJECTED';
  if (r.status === 'COMPLETE') return 'COMPLETE';
  return 'PROCESSING';
}

function statusFromAgm(r: AnnualGeneralMeetingRequest): SecretaryServiceApplicationRow['status'] {
  if (r.status === 'PENDING_SIGNATURES') return 'SIGNING';
  if (r.status === 'PENDING_REVIEW') return 'PENDING_REVIEW';
  if (r.status === 'NEED_MORE_INFO') return 'NEED_MORE_INFO';
  if (r.status === 'REJECTED') return 'REJECTED';
  if (r.status === 'COMPLETE') return 'COMPLETE';
  return 'PROCESSING';
}

export function buildSecretaryServiceApplications(db: Db, allowedClientIds: Set<string> | null) {
  const clientById = new Map(db.clients.map((c) => [c.id, c]));
  const userById = new Map((db.users ?? []).map((u) => [u.id, u]));
  const rows: SecretaryServiceApplicationRow[] = [];

  const dcrs = db.directorChangeRequests ?? [];
  for (const r of dcrs) {
    const client = clientById.get(r.clientId);
    if (!client || client.deletedAt) continue;
    if (allowedClientIds && !allowedClientIds.has(r.clientId)) continue;
    const applicationDate = iso(r.submittedAt || r.createdAt);
    const editDate = iso(r.updatedAt || r.createdAt);
    rows.push({
      id: `DCR-${r.id}`,
      type: 'DIRECTOR_CHANGE',
      companyId: r.clientId,
      companyName: client.name,
      applicationDate,
      editDate,
      status: statusFromDirectorChange(r),
      source: { kind: 'DIRECTOR_CHANGE_REQUEST', id: r.id },
    });
  }

  for (const t of db.shareTransfers) {
    const client = clientById.get(t.clientId);
    if (!client || client.deletedAt) continue;
    if (allowedClientIds && !allowedClientIds.has(t.clientId)) continue;
    const applicationDate = iso(t.createdAt);
    const editDate = iso(t.updatedAt || t.createdAt);
    rows.push({
      id: `ST-${t.id}`,
      type: 'SHARE_TRANSFER',
      companyId: t.clientId,
      companyName: client.name,
      applicationDate,
      editDate,
      status: statusFromShareTransfer(t),
      source: { kind: 'SHARE_TRANSFER', id: t.id },
    });
  }

  for (const r of db.companyUpdateRequests ?? []) {
    const client = clientById.get(r.clientId);
    if (!client || client.deletedAt) continue;
    if (allowedClientIds && !allowedClientIds.has(r.clientId)) continue;
    const applicationDate = iso(r.submittedAt || r.createdAt);
    const editDate = iso(r.updatedAt || r.createdAt);
    const createdBy = userById.get(r.createdByUserId);
    const inferredViaProxy = createdBy ? createdBy.role !== 'client' : false;
    rows.push({
      id: `CUR-${r.id}`,
      type: r.type,
      companyId: r.clientId,
      companyName: client.name,
      applicationDate,
      editDate,
      status: statusFromCompanyUpdateRequest(r),
      viaProxy: !!(r as { createdViaProxy?: unknown }).createdViaProxy || inferredViaProxy,
      source: { kind: 'COMPANY_UPDATE_REQUEST', id: r.id },
    });
  }

  for (const r of db.rorcDeclarationRequests ?? []) {
    const client = clientById.get(r.clientId);
    if (!client || client.deletedAt) continue;
    if (allowedClientIds && !allowedClientIds.has(r.clientId)) continue;
    const applicationDate = iso(r.submittedAt || r.createdAt);
    const editDate = iso(r.updatedAt || r.createdAt);

    const packetIds = (r.packetIds ?? []).length ? (r.packetIds ?? []) : [r.packetId];
    const packets = packetIds.map((id) => db.signaturePackets.find((p) => p.id === id) ?? null);
    const allSigned = packets.length > 0 && packets.every((p) => p?.status === 'SIGNED');
    const derivedStatus = r.status === 'PENDING_REVIEW' && !allSigned ? 'SIGNING' : statusFromRorcDeclaration(r);

    rows.push({
      id: `RORC-${r.id}`,
      type: 'RORC_DECLARATION',
      companyId: r.clientId,
      companyName: client.name,
      applicationDate,
      editDate,
      status: derivedStatus,
      source: { kind: 'RORC_DECLARATION_REQUEST', id: r.id },
    });
  }

  for (const r of db.annualGeneralMeetingRequests ?? []) {
    const client = clientById.get(r.clientId);
    if (!client || client.deletedAt) continue;
    if (allowedClientIds && !allowedClientIds.has(r.clientId)) continue;
    const applicationDate = iso(r.submittedAt || r.createdAt);
    const editDate = iso(r.updatedAt || r.createdAt);
    rows.push({
      id: `AGM-${r.id}`,
      type: 'ANNUAL_GENERAL_MEETING',
      companyId: r.clientId,
      companyName: client.name,
      applicationDate,
      editDate,
      status: statusFromAgm(r),
      source: { kind: 'ANNUAL_GENERAL_MEETING_REQUEST', id: r.id },
    });
  }

  rows.sort((a, b) => {
    if (a.editDate !== b.editDate) return b.editDate.localeCompare(a.editDate);
    return b.applicationDate.localeCompare(a.applicationDate);
  });

  return rows;
}
