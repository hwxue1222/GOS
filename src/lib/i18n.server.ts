import { cookies } from 'next/headers';
import { LANG_COOKIE, normalizeLang, type Lang } from '@/lib/i18n';

export async function getLangFromCookies(): Promise<Lang> {
  const c = await cookies();
  const v = c.get(LANG_COOKIE)?.value;
  return normalizeLang(v);
}
