"use client";

import { useMemo, useState } from "react";
import {
  MagnifyingGlass,
  Package,
  PencilSimple,
  Plus,
  Trash,
} from "@phosphor-icons/react";
import { useData } from "@/hooks/use-db";
import { newUid } from "@/lib/mock/store";
import { formatNumber } from "@/lib/utils";
import type { Item } from "@/types";
import { PageHeader } from "@/components/ui/page-header";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Table, Td } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

const EMPTY: Omit<Item, "id" | "hue"> = {
  code: "",
  name: "",
  unit: "pcs",
  categoryId: "",
  systemStock: {},
  price: 0,
};

export default function ItemsPage() {
  const { db, insert, update, remove } = useData();
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");

  const items = useMemo(() => {
    return db.items
      .filter((i) => {
        const matchQuery =
          !query ||
          i.name.toLowerCase().includes(query.toLowerCase()) ||
          i.code.includes(query);
        const matchCat =
          categoryFilter === "all" || i.categoryId === categoryFilter;
        return matchQuery && matchCat;
      })
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [db, query, categoryFilter]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    setError("");
    setOpen(true);
  };

  const openEdit = (item: Item) => {
    setEditing(item);
    setForm({
      code: item.code,
      name: item.name,
      unit: item.unit,
      categoryId: item.categoryId,
      systemStock: { ...item.systemStock },
      price: item.price,
    });
    setError("");
    setOpen(true);
  };

  const setStock = (warehouseId: string, value: string) => {
    setForm((f) => ({
      ...f,
      systemStock: {
        ...f.systemStock,
        [warehouseId]: value === "" ? 0 : Math.max(0, Number(value) || 0),
      },
    }));
  };

  const save = async () => {
    if (!form.code.trim() || !form.name.trim() || !form.categoryId) {
      setError("Kode, nama, dan kategori wajib diisi.");
      return;
    }
    if (
      db.items.some(
        (i) =>
          i.code.toLowerCase() === form.code.trim().toLowerCase() &&
          i.id !== editing?.id
      )
    ) {
      setError("Kode item sudah digunakan.");
      return;
    }
    const err = editing
      ? await update("items", editing.id, { ...form })
      : await insert("items", {
          ...form,
          id: newUid("itm"),
          hue: Math.floor(Math.random() * 360),
        });
    if (err) {
      setError(err);
      return;
    }
    setOpen(false);
  };

  const handleRemove = async (item: Item) => {
    if (
      !confirm(`Hapus item "${item.name}"? Data scan terkait akan tetap tersimpan.`)
    )
      return;
    const err = await remove("items", item.id);
    if (err) setError(err);
  };

  return (
    <RoleGuard roles={["ADMIN"]}>
      <PageHeader
        eyebrow="Setup"
        title="Item / Produk"
        description="Master data barang beserta stok sistem per gudang sebagai pembanding hasil hitung fisik."
        actions={
          <Button variant="secondary" onClick={openCreate}>
            <Plus size={15} weight="bold" />
            Tambah Item
          </Button>
        }
      />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          placeholder="Cari nama atau kode item..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          icon={<MagnifyingGlass size={15} weight="bold" />}
          className="sm:max-w-xs"
        />
        <Select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="sm:w-56"
        >
          <option value="all">Semua kategori</option>
          {db.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code} — {c.name}
            </option>
          ))}
        </Select>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<Package size={26} weight="bold" />}
          title="Tidak ada item"
          description="Tambahkan item baru atau sesuaikan filter pencarian Anda."
        />
      ) : (
        <div className="rounded-2xl border border-zinc-200/70 bg-white">
          <Table
            columns={["Kode", "Item", "Kategori", "Unit", "Stok per Gudang", ""]}
          >
            {items.map((item) => (
              <tr key={item.id} className="transition-colors hover:bg-zinc-50/60">
                <Td mono>{item.code}</Td>
                <Td>
                  <div className="flex items-center gap-3">
                    <span
                      className="flex h-9 w-9 items-center justify-center rounded-xl text-[11px] font-bold text-white"
                      style={{
                        background: `hsl(${item.hue} 55% 45%)`,
                      }}
                    >
                      {item.name
                        .split(" ")
                        .slice(0, 2)
                        .map((w) => w[0])
                        .join("")}
                    </span>
                    <span className="text-[13.5px] font-semibold text-zinc-900">
                      {item.name}
                    </span>
                  </div>
                </Td>
                <Td>
                  <Badge tone="neutral">
                    {db.categories.find((c) => c.id === item.categoryId)?.name ?? "—"}
                  </Badge>
                </Td>
                <Td className="text-[12.5px]">{item.unit}</Td>
                <Td>
                  <div className="flex flex-col gap-1">
                    {db.warehouses.map((w) => {
                      const qty = item.systemStock[w.id] ?? 0;
                      return (
                        <span key={w.id} className="flex items-center gap-2">
                          <span className="font-mono text-[11px] font-medium text-zinc-500">
                            {w.code}
                          </span>
                          <span
                            className={`font-mono text-[12px] ${
                              qty > 0 ? "text-zinc-800" : "text-zinc-400"
                            }`}
                          >
                            {formatNumber(qty)}
                          </span>
                        </span>
                      );
                    })}
                  </div>
                </Td>
                <Td>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEdit(item)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
                    >
                      <PencilSimple size={15} weight="bold" />
                    </button>
                    <button
                      onClick={() => handleRemove(item)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash size={15} weight="bold" />
                    </button>
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit Item" : "Tambah Item"}
        description="Isi detail master data barang dan stok sistem per gudang."
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button variant="secondary" onClick={save}>
              Simpan
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Kode item"
            placeholder="00001"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            hint="Kode ini dipakai di segmen ITEM_CODE barcode."
          />
          <Input
            label="Unit"
            value={form.unit}
            onChange={(e) => setForm({ ...form, unit: e.target.value })}
            placeholder="pcs / dus / karung"
          />
          <div className="sm:col-span-2">
            <Input
              label="Nama item"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <Select
            label="Kategori"
            value={form.categoryId}
            onChange={(e) =>
              setForm({ ...form, categoryId: e.target.value })
            }
          >
            <option value="">Pilih kategori...</option>
            {db.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} — {c.name}
              </option>
            ))}
          </Select>
          <Input
            label="Harga satuan (Rp)"
            type="number"
            min={0}
            value={form.price}
            onChange={(e) =>
              setForm({ ...form, price: Math.max(0, Number(e.target.value) || 0) })
            }
          />
        </div>

        <div className="mt-5">
          <p className="mb-2 text-[13px] font-medium text-zinc-700">
            Stok sistem per gudang
          </p>
          <div className="flex flex-col gap-2">
            {db.warehouses.map((w) => (
              <div
                key={w.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 px-3.5 py-2.5"
              >
                <div className="leading-tight">
                  <p className="text-[13px] font-medium text-zinc-800">
                    {w.code}
                  </p>
                  <p className="text-[11px] text-zinc-400">{w.name}</p>
                </div>
                <Input
                  type="number"
                  min={0}
                  value={form.systemStock[w.id] ?? 0}
                  onChange={(e) => setStock(w.id, e.target.value)}
                  className="h-9 w-28 text-right font-mono"
                />
              </div>
            ))}
          </div>
        </div>

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-[12.5px] text-red-600">
            {error}
          </p>
        )}
      </Modal>
    </RoleGuard>
  );
}
