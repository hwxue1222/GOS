import { cookies } from 'next/headers';
import { findSession, findUserById } from '@/lib/db';
import type { CurrentUser } from '@/lib/permissions';

export const SESSION_COOKIE = 'gos_session';

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await findSession(token);
  if (!session) return null;
  const user = await findUserById(session.userId);
  if (!user) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role, permissions: user.permissions };
}
