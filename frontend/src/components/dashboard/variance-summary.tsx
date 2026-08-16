"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cx, formatNumber } from "@/lib/utils";
import type { WarehouseOpnameRow } from "./stock-opname-chart";

interface VarianceRow extends WarehouseOpnameRow {
  selisih: number;
  pct: number;
  isLargest: boolean;
}

function toneFor(r: VarianceRow): { text: string; bar: string } {
  if (r.selisih > 0) return { text: "text-amber-600", bar: "bg-amber-500" };
  if (r.pct <= -5) return { text: "text-destructive", bar: "bg-destructive" };
  return { text: "text-primary", bar: "bg-primary" };
}

const MAX_ROWS = 7;

export function VarianceSummary({
  warehouses,
}: {
  warehouses: WarehouseOpnameRow[];
}) {
  const rows = useMemo(() => {
    const sorted = warehouses
      .map((w) => {
        const selisih = w.countedQty - w.systemQty;
        const pct = w.systemQty > 0 ? (selisih / w.systemQty) * 100 : 0;
        return { ...w, selisih, pct, isLargest: false };
      })
      .sort((a, b) => Math.abs(b.selisih) - Math.abs(a.selisih));
    if (sorted[0]) sorted[0].isLargest = true;
    return sorted;
  }, [warehouses]);

  const maxAbsPct = Math.max(1, ...rows.map((r) => Math.abs(r.pct)));
  const visible = rows.slice(0, MAX_ROWS);
  const hidden = rows.length - visible.length;

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Variance Summary</CardTitle>
      </CardHeader>

      <CardContent className="p-0">
        <div className="px-6">
        {rows.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No warehouse data yet.
          </p>
        )}
        {visible.map((r) => {
          const tone = toneFor(r);
          return (
            <div
              key={r.warehouseId}
              className={cx(
                "flex items-center gap-3 py-2.5",
                r.isLargest && "rounded-md bg-muted/50"
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-[12.5px] font-medium text-card-foreground">
                    {r.warehouseName}
                  </p>
                  {r.isLargest && (
                    <Badge
                      variant="secondary"
                      className="shrink-0 px-1.5 py-px text-[8.5px] font-bold uppercase tracking-wide"
                    >
                      Largest
                    </Badge>
                  )}
                </div>
              </div>

              <div
                className={cx(
                  "flex shrink-0 items-center gap-0.5 font-mono text-[12.5px] font-semibold",
                  tone.text
                )}
              >
                {r.selisih >= 0 ? (
                  <ArrowUpRight size={13} strokeWidth={2.5} />
                ) : (
                  <ArrowDownRight size={13} strokeWidth={2.5} />
                )}
                {r.selisih > 0 ? "+" : ""}
                {formatNumber(r.selisih)}
              </div>

              <div className="w-14 shrink-0 text-right">
                <span className={cx("font-mono text-[11.5px] font-semibold", tone.text)}>
                  {r.pct > 0 ? "+" : ""}
                  {r.pct.toFixed(2).replace(".", ",")}%
                </span>
                <div className="mt-1 h-[3px] w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={cx("h-full rounded-full", tone.bar)}
                    style={{
                      width: `${Math.min(100, (Math.abs(r.pct) / maxAbsPct) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {hidden > 0 && (
        <div className="border-t border-border px-6 py-2">
          <p className="text-[11.5px] text-muted-foreground">
            +{hidden} other warehouses not shown
          </p>
        </div>
      )}
      </CardContent>

      <CardFooter className="border-t bg-muted/50 px-6 py-3">
        <Link
          href="/app/stock/warehouses"
          className="flex items-center gap-1 text-[12px] font-semibold text-primary transition-colors hover:text-primary/80"
        >
          View all warehouses
          <ArrowRight size={13} strokeWidth={2.5} />
        </Link>
      </CardFooter>
    </Card>
  );
}