import type { AuditLog } from '@/lib/types';
import type { TimelineItem } from './ActivityTimelineCard';

function formatTs(ts: string) {
  const s = String(ts ?? '').trim();
  if (!s) return '';
  return s.slice(0, 19).replace('T', ' ');
}

export function auditLogsToTimelineItems(input: {
  logs: AuditLog[];
  titlePrefix?: string;
}): TimelineItem[] {
  const prefix = String(input.titlePrefix ?? '').trim();
  return input.logs
    .filter((l) => !!String(l.createdAt ?? '').trim())
    .map((l) => {
      const who = String(l.actorName ?? '').trim();
      const title = prefix ? `${prefix}${l.summary}` : l.summary;
      const detail = who ? `By: ${who}` : undefined;
      return { ts: formatTs(l.createdAt), title, detail };
    });
}

export function signatureEventsToTimelineItems(input: {
  signatures: Array<{ signedAt?: string; email: string; signerName?: string; documentTitle?: string }>;
}): TimelineItem[] {
  return input.signatures
    .filter((s) => !!String(s.signedAt ?? '').trim())
    .map((s) => {
      const who = String(s.signerName ?? '').trim() || s.email;
      const doc = String(s.documentTitle ?? '').trim();
      const title = doc ? `Signed: ${doc}` : 'Signed';
      return { ts: formatTs(String(s.signedAt)), title, detail: who };
    });
}

