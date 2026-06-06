import AppTopNav from '@/components/AppTopNav';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { getIncorporationApplicationDetail, readDb } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';
import IncorporationApplicationDetailClient from '@/app/(app)/incorporation/applications/[applicationId]/ui/IncorporationApplicationDetailClient';

function isActiveRole(r: { role: string; resignationDate?: string; toDate?: string }) {
  if (r.role === 'DIRECTOR' || r.role === 'SECRETARY') return !r.resignationDate;
  if (r.role === 'SHAREHOLDER' || r.role === 'RORC') return !r.toDate;
  return true;
}

async function canClientAccessCompany(userEmail: string, clientId: string) {
  const db = await readDb();
  const emailKey = userEmail.trim().toLowerCase();
  const partyById = new Map(db.parties.map((p) => [p.id, p]));
  const personById = new Map(db.persons.map((p) => [p.id, p]));
  for (const r of db.clientPartyRoles) {
    if (r.clientId !== clientId) continue;
    if (!isActiveRole(r)) continue;
    const party = partyById.get(r.partyId);
    if (!party || party.type !== 'PERSON' || !party.personId) continue;
    const person = personById.get(party.personId);
    if (!person) continue;
    if ((person.email ?? '').trim().toLowerCase() !== emailKey) continue;
    return true;
  }
  return false;
}

export default async function IncorporationApplicationDetailPage({
  params,
}: {
  params: Promise<{ applicationId: string }>;
}) {
  const me = await getCurrentUser();
  if (!me) return null;
  const { applicationId } = await params;

  const detail = await getIncorporationApplicationDetail(applicationId);
  if (!detail) {
    return (
      <div className="min-h-screen flex flex-col">
        <AppTopNav active="incorporation" />
        <div className="flex-1">
          <div className="max-w-6xl mx-auto px-4 py-6">
            <div className="rounded-xl bg-white border border-black/5 p-6 text-sm text-red-600">NOT_FOUND</div>
          </div>
        </div>
      </div>
    );
  }

  const app = detail.application;
  if (me.role === 'client') {
    if (app.createdByUserId !== me.id) {
      const ok = app.companyId ? await canClientAccessCompany(me.email, app.companyId) : false;
      if (!ok) {
        return (
          <div className="min-h-screen flex flex-col">
            <AppTopNav active="incorporation" />
            <div className="flex-1">
              <div className="max-w-6xl mx-auto px-4 py-6">
                <div className="rounded-xl bg-white border border-black/5 p-6 text-sm text-red-600">FORBIDDEN</div>
              </div>
            </div>
          </div>
        );
      }
    }
  } else {
    const canView = hasPermission(me, 'secretary', 'viewAll') || hasPermission(me, 'secretary', 'viewAssigned');
    if (!canView) {
      return (
        <div className="min-h-screen flex flex-col">
          <AppTopNav active="incorporation" />
          <div className="flex-1">
            <div className="max-w-6xl mx-auto px-4 py-6">
              <div className="rounded-xl bg-white border border-black/5 p-6 text-sm text-red-600">FORBIDDEN</div>
            </div>
          </div>
        </div>
      );
    }
  }

  const canReview = me.role !== 'client' && hasPermission(me, 'secretary', 'update');
  const files = detail.files.map((f) => ({
    id: f.id,
    fileName: f.fileName,
    mimeType: f.mimeType,
    size: f.size,
    uploadedByName: f.uploadedByName,
    uploadedAt: f.uploadedAt,
  }));

  return (
    <div className="min-h-screen flex flex-col">
      <AppTopNav active="incorporation" />
      <div className="flex-1">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-xl font-semibold">Incorporation</h1>
            <Link href="/corporate-secretary/applications" className="text-sm text-[#2f7bdc] hover:underline">
              Applications
            </Link>
          </div>
          <div className="mt-4">
            <IncorporationApplicationDetailClient
              meRole={me.role}
              canReview={canReview}
              application={detail.application}
              events={detail.events}
              files={files}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

