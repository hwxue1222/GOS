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
  const pages = useMemo(() => {
    if (totalPages <= 1) return [1];
    const current = Math.max(1, Math.min(totalPages, page));
    const around = new Set<number>([1, totalPages, current - 1, current, current + 1]);
    const list = [...around]
      .filter((n) => n >= 1 && n <= totalPages)
      .sort((a, b) => a - b);
    const out: Array<number | 'dots'> = [];
    for (let i = 0; i < list.length; i++) {
      const n = list[i];
      const prev = out[out.length - 1];
      if (typeof prev === 'number' && n - prev > 1) out.push('dots');
      out.push(n);
    }
    return out;
  }, [page, totalPages]);

  const canPrev = page > 1;
  const canNext = page < totalPages;

  const showingText = total > 0 ? `Showing ${pageStart}-${pageEnd} of ${total}` : '0 results';

  return (
    <div className="flex items-center justify-end gap-3 text-sm">
      <div className="mr-auto text-black/50">{showingText}</div>
      <div className="flex items-center gap-1 text-black/60">
        <button
          type="button"
          disabled={!canPrev}
          onClick={() => onPageChange(page - 1)}
          className="px-2 py-1 rounded-md text-black/60 hover:text-black disabled:opacity-40 disabled:hover:text-black/60"
        >
          {'<'}
        </button>
        {pages.map((p, idx) => {
          if (p === 'dots') {
            return (
              <span key={`dots-${idx}`} className="px-2 py-1 text-black/40">
                ···
              </span>
            );
          }
          const active = p === page;
          return (
            <button
              key={p}
              type="button"
              onClick={() => onPageChange(p)}
              className={
                active
                  ? 'px-2 py-1 rounded-md border border-[#2f7bdc] text-black shadow-[0_0_0_3px_rgba(47,123,220,0.12)]'
                  : 'px-2 py-1 rounded-md text-black/70 hover:text-[#2f7bdc]'
              }
            >
              {p}
            </button>
          );
        })}
        <button
          type="button"
          disabled={!canNext}
          onClick={() => onPageChange(page + 1)}
          className="px-2 py-1 rounded-md text-black/60 hover:text-black disabled:opacity-40 disabled:hover:text-black/60"
        >
          {'>'}
        </button>
      </div>

      {onPageSizeChange && typeof pageSize === 'number' ? (
        <select
          value={pageSize}
          onChange={(e) => {
            const next = Number(e.target.value) || pageSize;
            onPageSizeChange(next);
            onPageChange(1);
          }}
          className="rounded-md border border-black/10 bg-white px-2 py-1 text-sm text-black/70"
        >
          {(pageSizeOptions ?? [10, 20, 50, 100]).map((n) => (
            <option key={n} value={n}>
              {`${n} / page`}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  );
}
