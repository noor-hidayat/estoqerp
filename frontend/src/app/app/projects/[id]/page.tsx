"use client";

import { Link, useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronRight, CheckCircle2, Trash2, Warehouse } from "lucide-react";
import {
  useOpnameProjectDetail,
  useDeleteOpnameProject,
  useUpdate,
} from "@/lib/api/query";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ShellLoader } from "@/components/ui/loader";

export default function ProjectParentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading } = useOpnameProjectDetail(id);
  const deleteMut = useDeleteOpnameProject();
  const updateMut = useUpdate("projects");

  if (isLoading) return <ShellLoader />;
  if (!data) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center text-center">
        <p className="text-lg font-semibold text-foreground">Project not found</p>
        <Link to="/app/projects" className="mt-3 text-sm font-medium text-primary hover:underline">
          Back to project list
        </Link>
      </div>
    );
  }

  const { parent, children, summary } = data;

  const finalize = () => {
    if (!confirm("Finalize all stock opnames in this project?")) return;
    for (const child of children) {
      if (child.status !== "APPROVED" && child.status !== "CANCELLED") {
        updateMut.mutate({ id: child.id, patch: { status: "APPROVED" } });
      }
    }
  };

  const remove = () => {
    if (!confirm("Delete project along with all stock opnames, scans, and results within it?")) return;
    deleteMut.mutate(parent.id, { onSuccess: () => navigate("/app/projects") });
  };

  const canFinalize = summary.status !== "APPROVED" && summary.status !== "CANCELLED";

  return (
    <div className="animate-fade-up">
      <button
        onClick={() => navigate(-1)}
        className="mb-3 inline-flex items-center gap-1 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft size={14} strokeWidth={2.5} />
        Back
      </button>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[11px] font-semibold tracking-tight text-muted-foreground">
              {parent.id}
            </span>
            <h1 className="text-xl font-bold tracking-tight text-foreground">{parent.name}</h1>
          </div>
          <div className="mt-1 flex items-center gap-2 text-[12px] text-muted-foreground">
            <span>{summary.jumlahGudang} warehouses</span>
            {parent.deadline && (
              <>
                <span>·</span>
                <span>
                  Deadline {new Date(parent.deadline).toLocaleDateString("en-US")}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canFinalize && (
            <Button onClick={finalize}>
              <CheckCircle2 size={14} strokeWidth={2} />
              Finalize
            </Button>
          )}
          <Button variant="outline" onClick={remove} className="text-destructive hover:bg-destructive/10 hover:text-destructive">
            <Trash2 size={14} strokeWidth={2} />
            Delete
          </Button>
        </div>
      </div>

      <Card className="mb-5">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[12px] font-semibold text-muted-foreground">
              Overall progress
            </span>
            <span className="font-mono text-[13px] font-bold text-foreground">
              {summary.pct}%
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${summary.pct}%` }}
            />
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {summary.countedLokasi} of {summary.totalLokasi} locations completed
          </div>
        </CardContent>
      </Card>

      <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
        Stock Opname per Warehouse
      </h2>
      <div className="grid gap-3">
        {children.map((child) => (
          <Link
            key={child.id}
            to={`/app/so/${child.id}`}
            className="group flex items-center gap-4 rounded-xl border border-border bg-card p-4 transition-shadow hover:shadow-[0_8px_24px_-12px_rgb(24_24_27/0.14)]"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Warehouse size={18} strokeWidth={2} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="shrink-0 font-mono text-[10.5px] font-semibold tracking-tight text-muted-foreground">
                  {child.id}
                </span>
                <span className="truncate text-[13px] font-semibold text-foreground group-hover:text-primary">
                  {child.warehouseName}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                <span>{child.branchName}</span>
                <span>·</span>
                <span>{child.totalLokasi} locations</span>
                <span>·</span>
                <span>{child.countedLokasi} completed ({child.pct}%)</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${child.pct}%` }}
                />
              </div>
            </div>
            <StatusBadge status={child.status} />
            <ChevronRight size={16} strokeWidth={2} className="shrink-0 text-muted-foreground" />
          </Link>
        ))}
      </div>
    </div>
  );
}