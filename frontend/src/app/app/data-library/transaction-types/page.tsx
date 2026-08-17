"use client";

import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { MoreHorizontal, Pencil, Plus, Tags, Trash2 } from "lucide-react";
import { useMovementTypes, useRemove } from "@/lib/api/query";
import type { MovementType } from "@/types";
import { PageHeader } from "@/components/ui/page-header";
import { MANAGER_ROLES } from "@/lib/roles";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ShellLoader } from "@/components/ui/loader";

const KIND_LABELS: Record<string, string> = {
  RECEIPT: "Receipt",
  ISSUE: "Issue",
  TRANSFER: "Transfer",
};

export default function TransactionTypesPage() {
  const navigate = useNavigate();
  const { data: typesRaw = [], isLoading } = useMovementTypes();
  const removeType = useRemove("movementTypes");

  const types = useMemo(
    () => [...typesRaw].sort((a, b) => a.code.localeCompare(b.code)),
    [typesRaw]
  );

  const handleRemove = async (t: MovementType) => {
    if (t.builtin) {
      alert("Tipe transaksi bawaan (Receipt/Issue/Transfer) tidak dapat dihapus.");
      return;
    }
    if (!confirm(`Delete transaction type "${t.code}"?`)) return;
    try {
      await removeType.mutateAsync(t.id);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  if (isLoading) return <ShellLoader />;

  const columns: DataTableColumn<MovementType>[] = [
    {
      id: "code",
      header: "Code",
      sortValue: (t) => t.code,
      cell: (t) => (
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">{t.code}</span>
          {t.builtin && <Badge tone="info">Built-in</Badge>}
        </div>
      ),
    },
    {
      id: "kind",
      header: "Type",
      sortValue: (t) => t.kind,
      cell: (t) => (
        <span className="text-xs font-medium text-foreground">
          {KIND_LABELS[t.kind] ?? t.kind ?? "—"}
        </span>
      ),
    },
    {
      id: "series",
      header: "Series",
      sortValue: (t) => t.series,
      cell: (t) => (
        <span className="font-mono text-xs text-muted-foreground">
          {t.series ? `${t.series}-0001` : "—"}
        </span>
      ),
    },
    {
      id: "name",
      header: "Name",
      sortValue: (t) => t.name,
      cell: (t) => <span className="font-medium text-foreground">{t.name}</span>,
      className: "min-w-[220px]",
    },
    {
      id: "actions",
      header: "",
      align: "right",
      cell: (t) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              aria-label={`Actions for ${t.code}`}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem onClick={() => navigate(`/app/data-library/transaction-types/${t.id}`)}>
              <Pencil className="mr-2 h-3.5 w-3.5" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => handleRemove(t)}
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <RoleGuard roles={MANAGER_ROLES} menus={["master.movementTypes"]}>
      <PageHeader
        title="Transaction Types"
        description="Base types Receipt, Issue, dan Transfer tersedia bawaan. Kembangkan tipe baru dari salah satunya dan atur series penomoran sendiri."
        actions={
          <Button onClick={() => navigate("/app/data-library/transaction-types/new")}>
            <Plus size={15} strokeWidth={2} />
            Add Transaction Type
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={types}
        getRowId={(t) => t.id}
        searchPlaceholder="Search transaction types..."
        getSearchText={(t) => `${t.code} ${t.name} ${t.kind} ${t.series}`}
        minWidth={640}
        emptyIcon={<Tags size={26} strokeWidth={2} />}
        emptyTitle="No transaction types yet"
        emptyDescription="Add types like TRANSFER, RECEIVING, or ADJUSTMENT before creating transactions."
      />
    </RoleGuard>
  );
}