"use client";

import { Link, useParams } from "react-router-dom";
import { useMemo } from "react";
import { Warehouse } from "lucide-react";
import { StatusBadge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { ShellLoader } from "@/components/ui/loader";
import { useOpnameProjectDetail } from "@/lib/api/query";

interface ChildRow {
  id: string;
  warehouseName: string;
  branchName: string;
  totalLokasi: number;
  countedLokasi: number;
  pct: number;
  status: string;
}

export default function ProjectParentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useOpnameProjectDetail(id);

  const children = useMemo<ChildRow[]>(
    () => data?.children ?? [],
    [data]
  );

  if (isLoading) return <ShellLoader />;
  if (!data) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center text-center">
        <p className="text-lg font-semibold text-foreground">Project not found</p>
        <Link to="/app/project" className="mt-3 text-sm font-medium text-primary hover:underline">
          Back to project list
        </Link>
      </div>
    );
  }

  const columns: DataTableColumn<ChildRow>[] = [
    {
      id: "id",
      header: "ID",
      sortValue: (c) => c.id,
      cell: (c) => (
        <span className="font-mono text-[11px] text-muted-foreground">{c.id}</span>
      ),
    },
    {
      id: "warehouse",
      header: "Warehouse",
      sortValue: (c) => c.warehouseName,
      cell: (c) => (
        <Link
          to={`/app/project/so/${c.id}`}
          className="font-medium text-foreground hover:text-primary"
        >
          {c.warehouseName}
        </Link>
      ),
      minWidth: 200,
    },
    {
      id: "branch",
      header: "Branch",
      sortValue: (c) => c.branchName,
      cell: (c) => <span className="text-muted-foreground">{c.branchName}</span>,
    },
    {
      id: "progress",
      header: "Progress",
      sortValue: (c) => c.pct,
      cell: (c) => (
        <div className="flex items-center gap-2.5">
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${c.pct}%` }}
            />
          </div>
          <span className="whitespace-nowrap text-[11.5px] text-muted-foreground">
            {c.countedLokasi}/{c.totalLokasi} ({c.pct}%)
          </span>
        </div>
      ),
      minWidth: 180,
    },
    {
      id: "status",
      header: "Status",
      align: "right",
      sortValue: (c) => c.status,
      cell: (c) => <StatusBadge status={c.status} />,
    },
  ];

  return (
    <div className="animate-fade-up">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {data.parent.name}
        </h1>
      </div>

      <DataTable
        columns={columns}
        data={children}
        getRowId={(c) => c.id}
        searchPlaceholder="Search warehouses..."
        getSearchText={(c) =>
          `${c.id} ${c.warehouseName} ${c.branchName} ${c.status}`
        }
        pagination="client"
        initialSort={{ id: "warehouse", dir: "asc" }}
        emptyIcon={<Warehouse size={26} strokeWidth={2} />}
        emptyTitle="No warehouses yet"
        emptyDescription="This project has no stock opname assigned to any warehouse."
      />
    </div>
  );
}