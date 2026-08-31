import { cn } from "@/lib/utils";

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
      <div className="inline-flex items-center overflow-hidden rounded-lg border bg-card">
        {PAGE_SIZES.map((size, i) => (
          <button
            key={size}
            onClick={() => onPageSizeChange(size)}
            className={cn(
              "px-3 py-2 text-sm font-medium text-foreground transition-colors",
              i < PAGE_SIZES.length - 1 && "border-r border-border",
              pageSize === size && "bg-muted"
            )}
          >
            {size}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>
          {total > 0 ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, total)} of {total}
        </span>
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="rounded-lg bg-muted px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/80 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
        >
          Load More
        </button>
      </div>
    </div>
  );
}