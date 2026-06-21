import { cookies } from 'next/headers';
import { findPortalSession, findPortalUserById, findSession, findUserById } from '@/lib/db';
import type { CurrentUser } from '@/lib/permissions';

export const ADMIN_SESSION_COOKIE = 'gos_session';
export const PORTAL_SESSION_COOKIE = 'gos_portal_session';

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const jar = await cookies();

  const adminToken = jar.get(ADMIN_SESSION_COOKIE)?.value;
  if (adminToken) {
    const session = await findSession(adminToken);
    if (!session) return null;
    const user = await findUserById(session.userId);
    if (!user) return null;
    return { id: user.id, name: user.name, email: user.email, role: user.role, permissions: user.permissions };
  }

  const portalToken = jar.get(PORTAL_SESSION_COOKIE)?.value;
  if (!portalToken) return null;
  const session = await findPortalSession(portalToken);
  if (!session) return null;
  const user = await findPortalUserById(session.userId);
  if (!user) return null;
  return { id: user.id, name: user.name, email: user.email, role: 'client', permissions: undefined };
}
