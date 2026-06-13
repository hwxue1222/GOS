import Link from 'next/link';
import React from 'react';
import AppTopNav from '@/components/AppTopNav';

export default function ApplicationDetailShell(props: {
  title: string;
  requestId: string;
  statusBadge?: React.ReactNode;
  headerActions?: React.ReactNode;
  left: React.ReactNode;
  right: React.ReactNode;
}) {
  const requestIdDisplay = (() => {
    const id = String(props.requestId ?? '');
    if (id.length <= 18) return id;
    return `${id.slice(0, 10)}…${id.slice(-4)}`;
  })();

  return (
    <div className="min-h-screen flex flex-col">
      <AppTopNav active="corporate-secretary" />
      <div className="flex-1 bg-[#f7f8fa]">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs text-black/50">
                <Link href="/corporate-secretary/applications" className="hover:underline">
                  Applications
                </Link>
                <span> / Details</span>
              </div>
              <h1 className="mt-1 text-xl font-semibold">{props.title}</h1>
              <div className="mt-1 text-sm text-black/60" title={props.requestId}>
                Request ID: {requestIdDisplay}
              </div>
            </div>
            <div className="flex items-center gap-3">
              {props.statusBadge ? <div>{props.statusBadge}</div> : null}
              {props.headerActions ? <div>{props.headerActions}</div> : null}
              <Link href="/dashboard" className="text-sm text-[#2f7bdc] hover:underline">
                Back
              </Link>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-7 space-y-4">{props.left}</div>
            <div className="lg:col-span-5">
              <div className="space-y-4 lg:sticky lg:top-20">{props.right}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
