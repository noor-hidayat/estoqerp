"use client";

import { useState } from "react";
import {
  Package,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import {
  useItems,
  useCategories,
  useInsert,
  useUpdate,
  useRemove,
} from "@/lib/api/query";
import { useSaveShortcut } from "@/lib/use-save-shortcut";
import { formatNumber } from "@/lib/utils";
import type { Item } from "@/types";
import { PageHeader } from "@/components/ui/page-header";
import { MANAGER_ROLES } from "@/lib/roles";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Table, Td } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ShellLoader } from "@/components/ui/loader";
import { Pagination } from "@/components/ui/pagination";

const EMPTY: Omit<Item, "id" | "hue"> = {
  code: "",
  name: "",
  unit: "pcs",
  categoryId: "",
  price: 0,
  barcodeId: "",
  qty: undefined,
};

export default function ItemsPage() {
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");

  const {
    data: result,
    isLoading: itemsLoading,
  } = useItems({
    query: query || undefined,
    categoryId: categoryFilter === "all" ? undefined : categoryFilter,
    page,
    pageSize,
  });
  const { data: categories, isLoading: categoriesLoading } = useCategories();
  const insertItem = useInsert("items");
  const updateItem = useUpdate("items");
  const removeItem = useRemove("items");

  const items = result?.rows ?? [];
  const total = result?.total ?? 0;

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
      price: item.price,
      barcodeId: item.barcodeId ?? "",
      qty: item.qty,
    });
    setError("");
    setOpen(true);
  };

  const save = async () => {
    if (!form.code.trim() || !form.name.trim() || !form.categoryId) {
      setError("Kode, nama, dan kategori wajib diisi.");
      return;
    }
    try {
      if (editing) {
        await updateItem.mutateAsync({
          id: editing.id,
          patch: { ...form, code: form.code.trim(), name: form.name.trim() },
        });
      } else {
        await insertItem.mutateAsync({
          ...form,
          code: form.code.trim(),
          name: form.name.trim(),
          hue: Math.floor(Math.random() * 360),
        });
      }
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan item.");
    }
  };

  useSaveShortcut(save, open);

  const handleRemove = async (item: Item) => {
    if (
      !confirm(
        `Hapus item "${item.name}"? Saldo stok terkait ikut terhapus; riwayat scan tetap tersimpan.`
      )
    )
      return;
    try {
      await removeItem.mutateAsync(item.id);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menghapus item.");
    }
  };

  if (itemsLoading || categoriesLoading) return <ShellLoader />;

  return (
    <RoleGuard roles={MANAGER_ROLES} menus={["master.items"]}>
      <PageHeader
        eyebrow="Setup"
        title="Produk"
        description="Master data barang sebagai dasar perhitungan hasil opname."
        actions={
          <Button variant="secondary" onClick={openCreate}>
            <Plus size={15} strokeWidth={2} />
            Tambah Item
          </Button>
        }
      />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          placeholder="Cari nama atau kode item..."
          value={query}
          onChange={(e) => { setQuery(e.target.value); setPage(1); }}
          icon={<Search size={15} strokeWidth={2} />}
          className="sm:max-w-xs"
        />
        <Select
          value={categoryFilter}
          onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
          className="sm:w-56"
        >
          <option value="all">Semua kategori</option>
          {(categories ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.code} — {c.name}
            </option>
          ))}
        </Select>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<Package size={26} strokeWidth={2} />}
          title="Tidak ada item"
          description="Tambahkan item baru atau sesuaikan filter pencarian Anda."
        />
      ) : (
        <div className="min-w-0 rounded-lg border border-zinc-200 bg-white">
          <Table
            storageKey="items"
            fixed
            minWidth={1000}
            widths={["w-28", "w-[300px]", "w-40", "w-24", "w-44", "w-24", "w-24"]}
            columns={["Item Code", "Item Name", "Category", "UOM", "Barcode", "Qty/Box", ""]}
          >
            {items.map((item) => (
              <tr key={item.id} className="transition-colors hover:bg-zinc-50/60">
                <Td mono nowrap truncate>
                  {item.code}
                </Td>
                <Td truncate>
                  <span className="text-[13.5px] font-semibold text-zinc-900">
                    {item.name}
                  </span>
                </Td>
                <Td>
                  <Badge tone="neutral">
                    {(categories ?? []).find((c) => c.id === item.categoryId)?.name ?? "—"}
                  </Badge>
                </Td>
                <Td nowrap className="text-[12.5px]">{item.unit}</Td>
                <Td mono nowrap className="text-[12px] text-zinc-500">
                  {item.barcodeId || item.code}
                </Td>
                <Td mono nowrap className="text-right text-[12.5px]">
                  {item.qty != null ? formatNumber(item.qty) : "—"}
                </Td>
                <Td nowrap>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEdit(item)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
                    >
                      <Pencil size={15} strokeWidth={2} />
                    </button>
                    <button
                      onClick={() => handleRemove(item)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 size={15} strokeWidth={2} />
                    </button>
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        </div>
      )}

      {total > 0 && (
        <div className="mt-4">
          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            onPageSizeChange={(ps) => { setPageSize(ps); setPage(1); }}
          />
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit Item" : "Tambah Item"}
        description="Isi detail master data barang."
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
            {(categories ?? []).map((c) => (
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
          <Input
            label="Barcode ID (opsional)"
            value={form.barcodeId ?? ""}
            onChange={(e) => setForm({ ...form, barcodeId: e.target.value })}
            placeholder="Masukkan barcode item"
          />
          <Input
            label="Qty master (isi per barcode)"
            type="number"
            min={0}
            value={form.qty ?? ""}
            onChange={(e) =>
              setForm({
                ...form,
                qty: e.target.value === "" ? undefined : Math.max(0, Number(e.target.value) || 0),
              })
            }
            placeholder="Contoh: 1 barcode = 12 pcs"
          />
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
