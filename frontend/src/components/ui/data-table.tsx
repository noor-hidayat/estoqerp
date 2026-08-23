"use client"

import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Columns3,
  ListFilter,
  Search,
  SearchX,
  X,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import * as SelectPrimitive from "@radix-ui/react-select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import {
  Filters,
  type Filter,
  type FilterFieldConfig,
} from "@/components/reui/filters"

export interface DataTableColumn<T> {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Return the value used for client-side sorting. Omit to make the column non-sortable. */
  sortValue?: (row: T) => string | number;
  /** Return the raw value used by the built-in filter. Falls back to `sortValue` when omitted. */
  filterValue?: (row: T) => string | number | null | undefined;
  align?: "left" | "right" | "center";
  className?: string;
  headerClassName?: string;
  /** Minimum width in px for this column (helps horizontal scrolling with many columns). */
  minWidth?: number;
}

export type SortState = { id: string; dir: "asc" | "desc" } | null;

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  getRowId: (row: T) => string;
  loading?: boolean;
  error?: string | null;

  // Toolbar ---------------------------------------------------------------
  /** Fully custom toolbar. Replaces the default toolbar entirely. */
  toolbar?: ReactNode;
  /** Extra controls rendered right after the search input. */
  filters?: ReactNode;
  /** Right-side actions: primary action, export, view options, settings. */
  toolbarRight?: ReactNode;
  /** Enables the built-in search input. */
  searchPlaceholder?: string;
  /** Controlled search value (e.g. server-side search). */
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  /** Client-side search matching. Only applied when provided. */
  getSearchText?: (row: T) => string;
  /** Enables the built-in filter button next to the search input. Defaults to true for client-side tables. */
  filterable?: boolean;
  /** Overrides the auto-derived filter fields. */
  filterFields?: FilterFieldConfig[];

  // Selection --------------------------------------------------------------
  selectable?: boolean;
  selectedKeys?: Set<string> | null;
  onSelectionChange?: (keys: Set<string>) => void;

  // Sorting ----------------------------------------------------------------
  initialSort?: SortState;
  /** Called when sort changes — required for server-side sorting. */
  onSortChange?: (sort: SortState) => void;
  /** Column id used by the toolbar Sort button (defaults to the first date/created column). */
  sortColumnId?: string;

  // Pagination -------------------------------------------------------------
  pagination?: "client" | "server" | "none";
  page?: number;
  pageSize?: number;
  total?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizes?: number[];

  // Empty state ------------------------------------------------------------
  emptyIcon?: ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  onResetFilters?: () => void;

  // Footer -----------------------------------------------------------------
  footerLeft?: ReactNode;
  footer?: ReactNode;
  showTotal?: boolean;

  // Layout -----------------------------------------------------------------
  minWidth?: number;
  className?: string;
  rowClassName?: (row: T) => string | undefined;
  /** Layout kolom fixed (table-fixed) — kolom memakai lebar yang ditentukan. */
  fixedLayout?: boolean;
  /** Class tambahan untuk elemen <table> (mis. border-separate utk sticky). */
  tableClassName?: string;

  // Column visibility --------------------------------------------------------
  /** localStorage key for column visibility. Defaults to a key derived from column ids. */
  columnVisibilityKey?: string;
}

const DEFAULT_PAGE_SIZES = [10, 20, 50, 100];

/* Spasi kolom & cell tabel — permanen, dipakai di semua DataTable. */
const CELL_PADDING = "px-4 py-2.5";
const HEADER_PADDING = "h-auto px-4 py-2.5";
const TOOLBAR_PADDING = "px-3 py-2.5";
const FOOTER_PADDING = "px-3 py-2";

function matchesFilter(rawValue: unknown, filter: Filter): boolean {
  const value = rawValue ?? null;
  const str = (v: unknown) => String(v ?? "").toLowerCase();
  switch (filter.operator) {
    case "is":
      return value === filter.values[0];
    case "is_not":
      return value !== filter.values[0];
    case "is_any_of":
      return filter.values.includes(value);
    case "is_not_any_of":
      return !filter.values.includes(value);
    case "includes_all":
      return filter.values.includes(value);
    case "excludes_all":
      return !filter.values.some((v) => v === value);
    case "contains":
      return str(value).includes(str(filter.values[0]));
    case "not_contains":
      return !str(value).includes(str(filter.values[0]));
    case "starts_with":
      return str(value).startsWith(str(filter.values[0]));
    case "ends_with":
      return str(value).endsWith(str(filter.values[0]));
    case "empty":
      return value === null || value === undefined || value === "";
    case "not_empty":
      return value !== null && value !== undefined && value !== "";
    default:
      return true;
  }
}

export function DataTable<T>({
  columns,
  data,
  getRowId,
  loading = false,
  error = null,

  toolbar,
  filters,
  toolbarRight,
  searchPlaceholder,
  searchValue,
  onSearchChange,
  getSearchText,
  filterable,
  filterFields: customFilterFields,

  selectable = false,
  selectedKeys,
  onSelectionChange,

  initialSort = null,
  onSortChange,
  sortColumnId,

  pagination = "client",
  page: pageProp,
  pageSize: pageSizeProp,
  total: totalProp,
  onPageChange,
  onPageSizeChange,
  pageSizes = DEFAULT_PAGE_SIZES,

  emptyIcon = <SearchX className="h-6 w-6" strokeWidth={1.5} />,
  emptyTitle = "No data found",
  emptyDescription = "",
  onResetFilters,

  footerLeft,
  footer,
  showTotal = true,

  minWidth,
  className,
  rowClassName,
  columnVisibilityKey,
  fixedLayout = false,
  tableClassName,
}: DataTableProps<T>) {
  const isClient = pagination === "client";

  const [internalSearch, setInternalSearch] = useState("");
  const [internalFilters, setInternalFilters] = useState<Filter[]>([]);
  const [internalPage, setInternalPage] = useState(1);
  const [internalPageSize, setInternalPageSize] = useState(pageSizes[0] ?? 10);
  const [internalSelected, setInternalSelected] = useState<Set<string>>(new Set());

  const defaultSort = useMemo<SortState>(() => {
    if (initialSort) return initialSort;
    const dateCol = columns.find(
      (c) =>
        c.sortValue !== undefined &&
        /date|time|created|updated|Date|Time|Created|Updated/i.test(c.id)
    );
    return dateCol ? { id: dateCol.id, dir: "desc" } : null;
  }, [columns, initialSort]);
  const [sort, setSort] = useState<SortState>(defaultSort);

  const sortColId = useMemo(
    () =>
      sortColumnId ??
      columns.find(
        (c) =>
          c.sortValue !== undefined &&
          /date|time|created|updated/i.test(c.id)
      )?.id ??
      null,
    [columns, sortColumnId]
  );
  const applySort = (id: string, dir: "asc" | "desc") => {
    setSort({ id, dir });
    onSortChange?.({ id, dir });
  };

  const storageKey = columnVisibilityKey ?? `data-table:cols:${columns.map((c) => c.id).join("|")}`;
  const [hidden, setHidden] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) return new Set(JSON.parse(raw) as string[]);
    } catch {
      /* ignore */
    }
    return new Set();
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify([...hidden]));
    } catch {
      /* ignore */
    }
  }, [hidden, storageKey]);

  const visibleColumns = useMemo(
    () => columns.filter((c) => c.header === "" || !hidden.has(c.id)),
    [columns, hidden]
  );
  const toggleableColumns = useMemo(
    () => columns.filter((c) => c.header !== ""),
    [columns]
  );
  const visibleToggleableCount = visibleColumns.filter((c) => c.header !== "").length;

  const toggleColumn = (id: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const search = searchValue ?? internalSearch;
  const setSearch = onSearchChange ?? setInternalSearch;
  const filterEnabled = filterable ?? isClient;

  // Auto-derive filter fields from columns + data (options follow the column values).
  const filterFields = useMemo<FilterFieldConfig[]>(() => {
    if (customFilterFields) return customFilterFields;
    const cols = columns.filter(
      (c) => c.filterValue !== undefined || c.sortValue !== undefined
    );
    return cols.map((col) => {
      const getValue = (col.filterValue ?? col.sortValue)!;
      const seen: (string | number)[] = [];
      const seenSet = new Set<string | number>();
      for (const row of data) {
        const v = getValue(row);
        if (v === null || v === undefined || v === "") continue;
        if (!seenSet.has(v)) {
          seenSet.add(v);
          seen.push(v);
          if (seen.length > 40) break;
        }
      }
      if (seen.length > 0 && seen.length <= 40) {
        seen.sort((a, b) =>
          String(a).localeCompare(String(b), undefined, { numeric: true })
        );
        return {
          key: col.id,
          label: col.header,
          type: "select",
          defaultOperator: "is",
          options: seen.map((v) => ({ value: v, label: String(v) })),
        };
      }
      return {
        key: col.id,
        label: col.header,
        type: "text",
        defaultOperator: "contains",
        placeholder: `Filter ${col.header.toLowerCase()}...`,
      };
    });
  }, [columns, data, customFilterFields]);

  const hasBuiltInFilter = filterEnabled && filterFields.length > 0;
  const page = isClient ? internalPage : (pageProp ?? 1);
  const pageSize = isClient ? internalPageSize : (pageSizeProp ?? pageSizes[0] ?? 10);
  const selected = selectedKeys ?? internalSelected;
  const setSelected = onSelectionChange ?? setInternalSelected;

  // Client-side filtering + sorting ---------------------------------------
  const visible = useMemo(() => {
    let rows = data;
    if (isClient && getSearchText && search) {
      const q = search.toLowerCase();
      rows = rows.filter((r) => getSearchText(r).toLowerCase().includes(q));
    }
    if (isClient && hasBuiltInFilter && internalFilters.length > 0) {
      rows = rows.filter((r) =>
        internalFilters.every((f) => {
          const col = columns.find((c) => c.id === f.field);
          const fn = col ? (col.filterValue ?? col.sortValue) : undefined;
          return matchesFilter(fn ? fn(r) : null, f);
        })
      );
    }
    if (isClient && sort) {
      const col = columns.find((c) => c.id === sort.id);
      if (col?.sortValue) {
        const dir = sort.dir === "asc" ? 1 : -1;
        rows = [...rows].sort((a, b) => {
          const va = col.sortValue!(a);
          const vb = col.sortValue!(b);
          if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
          return String(va).localeCompare(String(vb), undefined, { numeric: true }) * dir;
        });
      }
    }
    return rows;
  }, [data, search, sort, columns, getSearchText, isClient, hasBuiltInFilter, internalFilters]);

  const total = isClient ? visible.length : (totalProp ?? data.length);
  const maxPage = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, maxPage);
  const pagedRows = useMemo(() => {
    if (pagination !== "client") return visible;
    const start = (safePage - 1) * pageSize;
    return visible.slice(start, start + pageSize);
  }, [visible, safePage, pageSize, pagination]);

  // Reset to first page when filters/search/sort change (client mode).
  useEffect(() => {
    if (isClient) setInternalPage(1);
  }, [search, sort, internalFilters, isClient]);

  useEffect(() => {
    if (isClient && safePage !== page) setInternalPage(safePage);
  }, [safePage, page, isClient]);

  // Selection helpers ------------------------------------------------------
  const pageIds = pagedRows.map(getRowId);
  const selectedOnPage = pageIds.filter((id) => selected.has(id)).length;
  const allSelected = pagedRows.length > 0 && selectedOnPage === pagedRows.length;
  const someSelected = selectedOnPage > 0 && !allSelected;

  const toggleAll = () => {
    const next = new Set(selected);
    if (allSelected) pageIds.forEach((id) => next.delete(id));
    else pageIds.forEach((id) => next.add(id));
    setSelected(next);
  };

  const toggleRow = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const changePage = (p: number) => {
    const next = Math.min(Math.max(1, p), maxPage);
    if (isClient) setInternalPage(next);
    else onPageChange?.(next);
  };

  const changePageSize = (size: number) => {
    if (isClient) {
      setInternalPageSize(size);
      setInternalPage(1);
    } else {
      onPageSizeChange?.(size);
    }
  };

  const hasToolbar = Boolean(
    toolbar || searchPlaceholder || searchValue !== undefined || filters || toolbarRight || toggleableColumns.length > 1 || hasBuiltInFilter || (sortColId && (isClient || Boolean(onSortChange)))
  );

  const handleResetFilters = () => {
    setInternalFilters([]);
    onResetFilters?.();
  };

  const hasFooter =
    Boolean(footerLeft || footer) ||
    (pagination !== "none" && (selectable || showTotal));

  return (
    <div className={cn("rounded-md border border-border bg-card", className)}>
      {toolbar ? (
        toolbar
      ) : hasToolbar ? (
        <div className={`flex flex-wrap items-center justify-between gap-2 border-b border-border ${TOOLBAR_PADDING}`}>
          <div className="flex flex-wrap items-center gap-2">
            {(searchPlaceholder || searchValue !== undefined) && (
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={searchPlaceholder ?? "Search..."}
                  className="h-8 w-[210px] pl-8 pr-7 text-xs shadow-none focus-visible:ring-1"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    aria-label="Clear search"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}
            {hasBuiltInFilter && (
              <Filters
                filters={internalFilters}
                fields={filterFields}
                onChange={setInternalFilters}
                size="sm"
                trigger={
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 px-2.5 text-xs shadow-none"
                  >
                    <ListFilter className="h-3.5 w-3.5" />
                    Filter
                    {internalFilters.length > 0 && (
                      <span className="rounded-sm bg-muted px-1.5 text-[10px] font-semibold leading-4 text-muted-foreground">
                        {internalFilters.length}
                      </span>
                    )}
                  </Button>
                }
              />
            )}
            {filters}
          </div>
          {(toolbarRight || toggleableColumns.length > 1 || (sortColId && (isClient || Boolean(onSortChange)))) && (
            <div className="flex items-center gap-2">
              {toolbarRight}
              {sortColId && (isClient || Boolean(onSortChange)) && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 px-0 shadow-none"
                  onClick={() => {
                    const nextDir =
                      sort?.id === sortColId && sort.dir === "asc" ? "desc" : "asc";
                    applySort(sortColId, nextDir);
                  }}
                  aria-label="Toggle sort by created date"
                >
                  {sort?.id === sortColId ? (
                    sort.dir === "asc" ? (
                      <ArrowUp className="h-3.5 w-3.5" />
                    ) : (
                      <ArrowDown className="h-3.5 w-3.5" />
                    )
                  ) : (
                    <ArrowUpDown className="h-3.5 w-3.5" />
                  )}
                </Button>
              )}
              {toggleableColumns.length > 1 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 px-2.5 text-xs shadow-none"
                    >
                      <Columns3 className="h-3.5 w-3.5" />
                      Columns
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
                      Show columns
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {toggleableColumns.map((col) => {
                      const isHidden = hidden.has(col.id);
                      return (
                        <DropdownMenuCheckboxItem
                          key={col.id}
                          checked={!isHidden}
                          onCheckedChange={() => toggleColumn(col.id)}
                          disabled={!isHidden && visibleToggleableCount === 1}
                          className="text-xs"
                        >
                          {col.header}
                        </DropdownMenuCheckboxItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          )}
        </div>
      ) : null}

      <Table
        style={minWidth ? { minWidth } : undefined}
        className={cn(
          "border-collapse text-left text-[13px]",
          fixedLayout && "table-fixed",
          tableClassName
        )}
      >
        <TableHeader className="bg-muted/40 [&_tr]:border-border">
          <TableRow className="border-border hover:bg-transparent">
            {selectable && (
              <TableHead className="w-10 px-3 py-2.5">
                <Checkbox
                  checked={allSelected ? true : someSelected ? "indeterminate" : false}
                  onCheckedChange={toggleAll}
                  aria-label="Select all rows"
                  disabled={pagedRows.length === 0 || loading}
                />
              </TableHead>
            )}
            {visibleColumns.map((col) => {
              const align = col.align ?? "left";
              return (
                <TableHead
                  key={col.id}
                  className={cn(
                    `${HEADER_PADDING} text-xs font-medium text-muted-foreground last:pr-5`,
                    align === "right" && "text-right",
                    align === "center" && "text-center",
                    col.headerClassName
                  )}
                  style={col.minWidth ? { minWidth: col.minWidth } : undefined}
                >
                  {col.header}
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>

        {loading ? (
          <TableBody className="[&_tr]:border-border/70">
            {Array.from({ length: Math.min(Math.max(pageSize, 4), 8) }).map((_, i) => (
              <TableRow key={i} className="border-border/70 hover:bg-transparent">
                {selectable && (
                  <TableCell className="px-3 py-2.5">
                    <Skeleton className="h-4 w-4 rounded-sm" />
                  </TableCell>
                )}
                {visibleColumns.map((col, j) => (
                  <TableCell key={col.id} className={CELL_PADDING}>
                    <Skeleton
                      className={cn(
                        "h-3.5",
                        (i + j) % 3 === 0 ? "w-3/4" : (i + j) % 3 === 1 ? "w-1/2" : "w-2/3"
                      )}
                    />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        ) : error ? (
          <TableBody>
            <TableRow>
              <TableCell colSpan={visibleColumns.length + (selectable ? 1 : 0)}>
                <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-destructive/10 text-destructive">
                    <SearchX className="h-5 w-5" strokeWidth={1.5} />
                  </div>
                  <p className="text-sm font-medium text-foreground">An error occurred</p>
                  <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
                    {error}
                  </p>
                </div>
              </TableCell>
            </TableRow>
          </TableBody>
        ) : pagedRows.length === 0 ? (
          <TableBody>
            <TableRow>
              <TableCell colSpan={visibleColumns.length + (selectable ? 1 : 0)}>
                <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-muted text-muted-foreground ring-1 ring-border">
                    {emptyIcon}
                  </div>
                  <p className="text-sm font-medium text-foreground">{emptyTitle}</p>
                  {emptyDescription && (
                    <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
                      {emptyDescription}
                    </p>
                  )}
                  {onResetFilters || internalFilters.length > 0 ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleResetFilters}
                      className="mt-4 h-7 px-3 text-xs"
                    >
                      Reset filters
                    </Button>
                  ) : null}
                </div>
              </TableCell>
            </TableRow>
          </TableBody>
        ) : (
          <TableBody className="[&_tr]:border-border/70">
            {pagedRows.map((row) => {
              const id = getRowId(row);
              const isSelected = selected.has(id);
              return (
                <TableRow
                  key={id}
                  className={cn(
                    "border-border/70 transition-colors hover:bg-muted/40",
                    isSelected && "bg-muted/50 hover:bg-muted/60",
                    rowClassName?.(row)
                  )}
                >
                  {selectable && (
                    <TableCell className="px-3 py-2.5 align-middle">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleRow(id)}
                        aria-label={`Select row ${id}`}
                      />
                    </TableCell>
                  )}
                  {visibleColumns.map((col) => {
                    const align = col.align ?? "left";
                    return (
                      <TableCell
                        key={col.id}
                        className={cn(
                          `whitespace-normal ${CELL_PADDING} align-middle last:pr-5`,
                          align === "right" && "text-right",
                          align === "center" && "text-center",
                          col.className
                        )}
                        style={col.minWidth ? { minWidth: col.minWidth } : undefined}
                      >
                        {col.cell(row)}
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        )}
      </Table>

      {!loading && hasFooter && (
        <div className={`flex flex-wrap items-center justify-between gap-2 border-t border-border ${FOOTER_PADDING}`}>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {footerLeft}
            {selectable ? (
              <span className="tabular-nums">
                {selected.size} of {total} row{total !== 1 ? "s" : ""} selected.
              </span>
            ) : showTotal && pagination !== "none" ? (
              <span className="tabular-nums">Total {total} row{total !== 1 ? "s" : ""}</span>
            ) : null}
          </div>

          {footer ? (
            footer
          ) : pagination !== "none" ? (
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Rows per page</span>
                <SelectPrimitive.Root
                  value={String(pageSize)}
                  onValueChange={(v) => changePageSize(Number(v))}
                >
                  <SelectTrigger
                    aria-label="Rows per page"
                    className="h-7 w-[64px] px-2 text-xs shadow-none"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {pageSizes.map((size) => (
                      <SelectItem key={size} value={String(size)}>
                        {size}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </SelectPrimitive.Root>
              </div>

              <span className="text-xs tabular-nums text-muted-foreground">
                Page {safePage} of {maxPage}
              </span>

              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => changePage(1)}
                  disabled={page <= 1}
                  aria-label="First page"
                >
                  <ChevronsLeft className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => changePage(page - 1)}
                  disabled={page <= 1}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => changePage(page + 1)}
                  disabled={page >= maxPage}
                  aria-label="Next page"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => changePage(maxPage)}
                  disabled={page >= maxPage}
                  aria-label="Last page"
                >
                  <ChevronsRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}