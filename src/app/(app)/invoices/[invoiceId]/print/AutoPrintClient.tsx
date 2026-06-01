'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

export default function AutoPrintClient() {
  const searchParams = useSearchParams();
  const auto = searchParams.get('auto') === '1' || searchParams.get('autoprint') === '1';

  useEffect(() => {
    if (!auto) return;
    let canceled = false;
    const run = async () => {
      try {
        const fonts = (document as any).fonts;
        if (fonts?.ready) await fonts.ready;
      } catch {
        return;
      }
      if (canceled) return;
      window.setTimeout(() => {
        if (canceled) return;
        window.print();
      }, 200);
    };
    void run();
    return () => {
      canceled = true;
    };
  }, [auto]);

  return null;
}

