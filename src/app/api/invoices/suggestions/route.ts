import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { findInvoiceEmailHistoryByBillTo, readDb } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';
import type { InvoiceBillTo } from '@/lib/types';

function normalizeEmail(v: string) {
  return v.trim().toLowerCase();
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!hasPermission(user, 'invoices', 'viewAll')) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const url = new URL(req.url);
  const type = (url.searchParams.get('type') ?? '').toUpperCase();
  const clientId = (url.searchParams.get('clientId') ?? '').trim();
  const companyName = (url.searchParams.get('companyName') ?? '').trim();

  const billTo: InvoiceBillTo | null =
    type === 'CLIENT' && clientId
      ? { type: 'CLIENT', clientId, companyName: '' }
      : type === 'ONE_OFF' && companyName
        ? { type: 'ONE_OFF', companyName }
        : null;

  if (!billTo) return NextResponse.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });

  const history = await findInvoiceEmailHistoryByBillTo(billTo);
  const historyTo = history?.toEmails ?? [];
  const historyCc = history?.ccEmails ?? [];

  const notifyPeople: Array<{ role: 'DIRECTOR' | 'SHAREHOLDER'; name: string; email: string }> = [];

  if (billTo.type === 'CLIENT') {
    const db = await readDb();
    const partyById = new Map(db.parties.map((p) => [p.id, p]));
    const personById = new Map(db.persons.map((p) => [p.id, p]));
    const roles = db.clientPartyRoles
      .filter((r) => r.clientId === billTo.clientId)
      .filter((r) => r.role === 'DIRECTOR' || r.role === 'SHAREHOLDER')
      .filter((r) => !r.resignationDate);

    const seen = new Set<string>();
    for (const r of roles) {
      const party = partyById.get(r.partyId);
      if (!party || party.type !== 'PERSON' || !party.personId) continue;
      const person = personById.get(party.personId);
      const email = person?.email?.trim() ?? '';
      if (!email) continue;
      const k = `${r.role}:${normalizeEmail(email)}`;
      if (seen.has(k)) continue;
      seen.add(k);
      notifyPeople.push({ role: r.role, name: person?.fullName ?? party.displayName, email });
    }
  }

  return NextResponse.json({
    ok: true,
    history: { toEmails: historyTo, ccEmails: historyCc },
    notifyPeople,
  });
}

