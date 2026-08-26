"use client";

import { useEffect, useState } from "react";
import { Plus, Star, Trash2 } from "lucide-react";
import { useSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { useDashboard, useDashboards } from "@/lib/api/use-dashboards";
import { DashboardBuilder } from "@/components/dashboard/builder";
import { PageHeader } from "@/components/ui/page-header";

export default function DashboardConfigPage() {
  const { isSystem, permissions } = useSession();
  const canManage = can(isSystem, permissions, "dashboard", "manage");

  const { dashboards, isLoading, create, update, remove } = useDashboards();
  const [selectedId, setSelectedId] = useState<string>("");
  const { data: detail } = useDashboard(selectedId || undefined);
  const [name, setName] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    if (!dashboards.length) return;
    if (!dashboards.some((d) => d.id === selectedId)) {
      const def = dashboards.find((d) => d.isGlobal) ?? dashboards[0];
      setSelectedId(def.id);
      setName(def.name);
    }
  }, [dashboards, selectedId]);

  useEffect(() => {
    const cur = dashboards.find((d) => d.id === selectedId);
    if (cur) setName(cur.name);
  }, [selectedId, dashboards]);

  if (!canManage) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
        <p className="text-lg font-semibold">Akses ditolak</p>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          Hanya admin yang dapat mengonfigurasi dashboard.
        </p>
      </div>
    );
  }

  const selected = dashboards.find((d) => d.id === selectedId);

  function handleCreate() {
    const n = newName.trim();
    if (!n) return;
    create.mutate(
      { name: n },
      {
        onSuccess: (res) => {
          setSelectedId(res.id);
          setCreateOpen(false);
          setNewName("");
        },
      }
    );
  }

  function handleDelete() {
    if (!selected) return;
    if (!confirm(`Hapus dashboard "${selected.name}"?`)) return;
    remove.mutate(selected.id, {
      onSuccess: () => {
        const next = dashboards.find((d) => d.id !== selected.id);
        if (next) setSelectedId(next.id);
      },
    });
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Konfigurasi Dashboard"
        description="Kelola dashboard & susun widget (tambah, urutkan, ubah ukuran, edit). Tersimpan global untuk semua user."
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <Label>Dashboard Aktif</Label>
          <NativeSelect
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            {dashboards.map((d) => (
              <NativeSelectOption key={d.id} value={d.id}>
                {d.name}
                {d.isGlobal ? " (global)" : ""}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>

        <div className="min-w-[220px] flex-1">
          <Label>Nama Dashboard</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => selected && update.mutate({ id: selected.id, patch: { name } })}
          />
        </div>

        <Button
          variant="outline"
          onClick={() => selected && update.mutate({ id: selected.id, patch: { isGlobal: true } })}
          disabled={!selected || selected.isGlobal}
        >
          <Star size={14} strokeWidth={2} />
          Jadikan Global
        </Button>

        <Button variant="outline" onClick={handleDelete} disabled={!selected}>
          <Trash2 size={14} strokeWidth={2} />
          Hapus
        </Button>

        <Button onClick={() => setCreateOpen(true)}>
          <Plus size={14} strokeWidth={2} />
          Dashboard Baru
        </Button>
      </div>

      {selected ? (
        <DashboardBuilder
          key={selected.id}
          dashboardId={selected.id}
          widgets={detail?.widgets ?? []}
        />
      ) : (
        <p className="py-16 text-center text-sm text-muted-foreground">
          {isLoading ? "Memuat…" : "Belum ada dashboard."}
        </p>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Dashboard Baru</DialogTitle>
            <DialogDescription>Buat dashboard kosong, lalu susun widget-nya.</DialogDescription>
          </DialogHeader>
          <div>
            <Label>Nama</Label>
            <Input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="mis. Warehouse Dashboard"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Batal
            </Button>
            <Button onClick={handleCreate} disabled={create.isPending || !newName.trim()}>
              Buat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
