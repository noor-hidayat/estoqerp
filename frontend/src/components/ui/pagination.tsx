"use client";

import { cx } from "@/lib/utils";

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

const PAGE_SIZES = [20, 100, 500, 2500];

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: PaginationProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="inline-flex items-center overflow-hidden rounded-lg border border-gray-200 bg-white">
        {PAGE_SIZES.map((size, i) => (
          <button
            key={size}
            onClick={() => onPageSizeChange(size)}
            className={cx(
              "px-3 py-2 text-sm font-medium text-gray-700 transition-colors",
              i < PAGE_SIZES.length - 1 && "border-r border-gray-200",
              pageSize === size && "bg-gray-50"
            )}
          >
            {size}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 text-sm text-gray-500">
        <span>
          {total > 0 ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, total)} dari {total}
        </span>
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
        >
          Load More
        </button>
      </div>
    </div>
  );
}
