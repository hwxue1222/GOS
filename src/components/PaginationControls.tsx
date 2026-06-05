'use client';

import { useMemo } from 'react';

type Props = {
  total: number;
  pageStart: number;
  pageEnd: number;
  page: number;
  totalPages: number;
  pageSize?: number;
  pageSizeOptions?: number[];
  onPageChange: (nextPage: number) => void;
  onPageSizeChange?: (nextPageSize: number) => void;
};

export default function PaginationControls({
  total,
  pageStart,
  pageEnd,
  page,
  totalPages,
  pageSize,
  pageSizeOptions,
  onPageChange,
  onPageSizeChange,
}: Props) {
  const pageOptions = useMemo(() => {
    const out: number[] = [];
    for (let i = 1; i <= totalPages; i++) out.push(i);
    return out;
  }, [totalPages]);

  return (
    <div className="flex items-center justify-end gap-2 text-sm text-black/60">
      <div className="hidden sm:block">{total === 0 ? '0' : `${pageStart + 1}-${pageEnd}`} / {total}</div>
      {onPageSizeChange && typeof pageSize === 'number' ? (
        <select
          value={pageSize}
          onChange={(e) => {
            const next = Number(e.target.value) || pageSize;
            onPageSizeChange(next);
            onPageChange(1);
          }}
          className="rounded-md border border-black/10 bg-white px-2 py-2 text-sm text-black/70"
        >
          {(pageSizeOptions ?? [10, 20, 50, 100]).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      ) : null}
      <button
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        className="rounded-md border border-black/10 bg-white px-3 py-2 text-sm disabled:opacity-50"
      >
        Prev
      </button>
      <div className="flex items-center gap-1">
        <select
          value={page}
          onChange={(e) => onPageChange(Number(e.target.value) || 1)}
          className="rounded-md border border-black/10 bg-white px-2 py-2 text-sm text-black/70"
        >
          {pageOptions.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <div className="min-w-[44px] text-center">/ {totalPages}</div>
      </div>
      <button
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        className="rounded-md border border-black/10 bg-white px-3 py-2 text-sm disabled:opacity-50"
      >
        Next
      </button>
    </div>
  );
}

