'use client';

import Link from 'next/link';

export default function ModalShell(props: {
  title: string;
  closeHref: string;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 bg-black/30 flex items-start justify-center p-4 sm:p-8">
      <div className="w-full max-w-5xl rounded-xl bg-white shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/5">
          <div className="text-base font-semibold text-black">{props.title}</div>
          <Link href={props.closeHref} className="text-black/40 hover:text-black/70 px-2 py-1">
            ×
          </Link>
        </div>
        <div className="px-6 py-6">{props.children}</div>
      </div>
    </div>
  );
}

