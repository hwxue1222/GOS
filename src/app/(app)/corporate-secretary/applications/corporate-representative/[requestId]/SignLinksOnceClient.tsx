'use client';

import { useEffect, useState } from 'react';

type LinkRow = { email: string; url: string };

export default function SignLinksOnceClient(props: { requestId: string }) {
  const [links, setLinks] = useState<LinkRow[] | null>(null);

  useEffect(() => {
    try {
      const key = `gos.tmp.rdrSignLinks.${props.requestId}`;
      const raw = window.sessionStorage.getItem(key);
      if (!raw) return;
      window.sessionStorage.removeItem(key);
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return;
      const next = parsed
        .map((x: any) => ({ email: String(x?.email ?? '').trim(), url: String(x?.url ?? '').trim() }))
        .filter((x: any) => x.email && x.url);
      if (next.length) setLinks(next);
    } catch {
      return;
    }
  }, [props.requestId]);

  if (!links?.length) return null;

  return (
    <div className="rounded-xl bg-white border border-black/5 p-5">
      <div className="text-sm font-medium">Signing links</div>
      <div className="mt-1 text-xs text-black/50">Links are shown only once. In production, signers use email.</div>
      <div className="mt-3 space-y-2 text-sm">
        {links.map((l) => (
          <div key={l.email} className="break-words">
            <span className="text-black/60">{l.email}</span>
            <span className="text-black/40">{' — '}</span>
            <a className="text-[#2f7bdc] hover:underline" href={l.url} target="_blank" rel="noreferrer">
              {l.url}
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}

