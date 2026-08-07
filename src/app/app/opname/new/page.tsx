"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight } from "@phosphor-icons/react";
import { useData } from "@/hooks/use-db";
import { useSession } from "@/lib/session";
import { newUid } from "@/lib/mock/store";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cx } from "@/lib/utils";
import type { OpnameMode } from "@/types";

const MODES: {
  id: OpnameMode;
  title: string;
  desc: string;
  points: string[];
}[] = [
  {
    id: "COMPARE",
    title: "Bandingkan Stok Sistem",
    desc: "Hasil hitung fisik dibandingkan dengan stok sistem untuk menemukan selisih.",
    points: [
      "Qty sistem diambil dari master item",
      "Variance otomatis dihitung",
      "Cocok untuk opname berkala",
    ],
  },
  {
    id: "SCRATCH",
    title: "Hitung Ulang dari Nol",
    desc: "Tidak membandingkan dengan stok sistem. Semua qty dihitung fisik.",
    points: [
      "Tanpa referensi stok sistem",
      "Ideal untuk stock cleanup / audit",
      "Hasil fisik menjadi basis baru",
    ],
  },
];

export default function NewProjectPage() {
  const router = useRouter();
  const { db, insert } = useData();
  const { user } = useSession();

  const [name, setName] = useState("");
  const [branchId, setBranchId] = useState(db.branches[0]?.id ?? "");
  const [warehouseId, setWarehouseId] = useState("");
  const [mode, setMode] = useState<OpnameMode>("COMPARE");
  const [deadline, setDeadline] = useState("");

  const warehouses = useMemo(
    () => db.warehouses.filter((w) => w.branchId === branchId),
    [db, branchId]
  );

  const handleBranchChange = (id: string) => {
    setBranchId(id);
    const whs = db.warehouses.filter((w) => w.branchId === id);
    setWarehouseId(whs[0]?.id ?? "");
  };

  const create = async () => {
    if (!name.trim() || !warehouseId) return;
    const id = newUid("prj");
    const err = await insert("projects", {
      id,
      name: name.trim(),
      branchId,
      warehouseId,
      mode,
      status: "DRAFT",
      createdAt: new Date().toISOString(),
      deadline: deadline || undefined,
      createdBy: user?.id ?? "",
    });
    if (err) return;
    router.push(`/app/opname/${id}`);
  };

  return (
    <div>
      <button
        onClick={() => router.push("/app/opname")}
        className="mb-6 inline-flex items-center gap-2 text-[13px] font-medium text-zinc-500 transition-colors hover:text-zinc-800"
      >
        <ArrowLeft size={15} weight="bold" />
        Kembali ke Projects
      </button>

      <PageHeader
        eyebrow="Stock Opname"
        title="Buat Project Baru"
        description="Atur nama project, lokasi gudang, dan mode opname yang akan digunakan."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <div className="rounded-2xl border border-zinc-200/70 bg-white p-6">
            <h3 className="mb-4 text-[13px] font-semibold uppercase tracking-wider text-zinc-500">
              Detail project
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Input
                  label="Nama project"
                  placeholder="Contoh: Opname Februari 2026"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <Select
                label="Cabang"
                value={branchId}
                onChange={(e) => handleBranchChange(e.target.value)}
              >
                {db.branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code} — {b.name}
                  </option>
                ))}
              </Select>
              <Select
                label="Gudang"
                value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value)}
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} — {w.name}
                  </option>
                ))}
              </Select>
              <div className="sm:col-span-2">
                <Input
                  label="Deadline (opsional)"
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <p className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-zinc-500">
              Mode opname
            </p>
            <div className="flex flex-col gap-3">
              {MODES.map((m) => {
                const active = mode === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => setMode(m.id)}
                    className={cx(
                      "rounded-2xl border p-5 text-left transition-all",
                      active
                        ? "border-emerald-500/60 bg-emerald-50/50 ring-1 ring-emerald-500/20"
                        : "border-zinc-200 bg-white hover:border-zinc-300"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-[14.5px] font-semibold text-zinc-900">
                        {m.title}
                      </p>
                      <span
                        className={cx(
                          "flex h-5 w-5 items-center justify-center rounded-full border-2",
                          active
                            ? "border-emerald-600"
                            : "border-zinc-300"
                        )}
                      >
                        {active && (
                          <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" />
                        )}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[12.5px] leading-relaxed text-zinc-500">
                      {m.desc}
                    </p>
                    <ul className="mt-3 space-y-1">
                      {m.points.map((pt) => (
                        <li
                          key={pt}
                          className="flex items-center gap-2 text-[11.5px] text-zinc-500"
                        >
                          <span className="h-1 w-1 rounded-full bg-emerald-500" />
                          {pt}
                        </li>
                      ))}
                    </ul>
                  </button>
                );
              })}
            </div>
          </div>

          <Button
            variant="secondary"
            size="lg"
            className="w-full"
            disabled={!name.trim() || !warehouseId}
            onClick={create}
          >
            Buat Project
            <ArrowRight size={16} weight="bold" />
          </Button>
        </div>
      </div>
    </div>
  );
}
