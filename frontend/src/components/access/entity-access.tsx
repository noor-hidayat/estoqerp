"use client";

import type { Branch, Warehouse, Location } from "@/types";

export interface CheckedIds {
  branches: Set<string>;
  warehouses: Set<string>;
}

export function EntityAccess({
  branches,
  warehouses,
  locations,
  checked,
  toggle,
}: {
  branches: Branch[];
  warehouses: Warehouse[];
  locations: Location[];
  checked: CheckedIds;
  toggle: (type: "BRANCH" | "WAREHOUSE", id: string) => void;
}) {
  const branchWhs = (bid: string) =>
    warehouses.filter((w) => w.branchId === bid);

  const CheckRow = ({
    label,
    type,
    id,
    indent = 0,
    bold = false,
    count,
  }: {
    label: string;
    type: "BRANCH" | "WAREHOUSE";
    id: string;
    indent?: number;
    bold?: boolean;
    count?: number;
  }) => (
    <label
      className="flex cursor-pointer items-center gap-2 rounded-md py-1.5 hover:bg-accent"
      style={{ paddingLeft: 10 + indent * 18 }}
    >
      <input
        type="checkbox"
        checked={
          type === "BRANCH"
            ? checked.branches.has(id)
            : checked.warehouses.has(id)
        }
        onChange={() => toggle(type, id)}
        className="h-4 w-4 rounded border-border accent-primary"
      />
      <span className={bold ? "text-[13px] font-semibold text-foreground" : "text-[13px] text-muted-foreground"}>
        {label}
      </span>
      {typeof count === "number" && count > 0 && (
        <span className="rounded bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground">
          {count} locations
        </span>
      )}
    </label>
  );

  return (
    <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-border bg-muted/40 p-2">
      {branches.length === 0 && (
        <p className="px-2 py-3 text-center text-[12.5px] text-muted-foreground">No branches yet.</p>
      )}
      {branches.map((b) => {
        const whs = branchWhs(b.id);
        return (
          <div key={b.id} className="rounded-lg border border-border/70 bg-card px-1.5 py-1">
            <CheckRow label={`${b.code} — ${b.name}`} type="BRANCH" id={b.id} bold />
            {whs.map((w) => {
              const locCount = locations.filter((l) => l.warehouseId === w.id).length;
              return (
                <div key={w.id} className="border-l border-border pl-3">
                  <CheckRow
                    label={`${w.code} — ${w.name}`}
                    type="WAREHOUSE"
                    id={w.id}
                    count={locCount}
                  />
                </div>
              );
            })}
            {whs.length === 0 && (
              <p className="pl-10 pb-1 text-[11.5px] text-muted-foreground">No warehouses yet</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
