import React from 'react';

function normalizeLabel(status: string) {
  const s = String(status ?? '').trim();
  const up = s.toUpperCase();
  if (up === 'PENDING_SIGNATURES') return 'SIGNING';
  return s || '-';
}

function badgeClass(status: string) {
  const up = String(status ?? '').trim().toUpperCase();
  if (up === 'SIGNING' || up === 'PENDING_SIGNATURES' || up === 'OTP_SENT') return 'bg-[#eff6ff] text-[#1d4ed8] border-[#bfdbfe]';
  if (up === 'PENDING_REVIEW') return 'bg-[#faf5ff] text-[#6d28d9] border-[#e9d5ff]';
  if (up === 'NEED_MORE_INFO' || up === 'PROCESSING' || up === 'BLOCKED_REPRESENTATIVE') return 'bg-[#fff7ed] text-[#c2410c] border-[#fed7aa]';
  if (up === 'APPROVED' || up === 'COMPLETE' || up === 'SIGNED' || up === 'APPLIED') return 'bg-[#ecfdf5] text-[#047857] border-[#a7f3d0]';
  if (up === 'REJECTED' || up === 'REVOKED') return 'bg-[#fef2f2] text-[#b91c1c] border-[#fecaca]';
  return 'bg-white text-black/70 border-black/10';
}

export default function StatusBadge(props: { status: string; label?: string }) {
  const label = String(props.label ?? '').trim() || normalizeLabel(props.status);
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${badgeClass(props.status)}`}>{label}</span>;
}

