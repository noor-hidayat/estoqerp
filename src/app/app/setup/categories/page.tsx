"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus, Tag, Trash2 } from "lucide-react";
import { useData } from "@/hooks/use-db";
import { newUid } from "@/lib/mock/store";
import type { Category } from "@/types";
import { PageHeader } from "@/components/ui/page-header";
import { MANAGER_ROLES } from "@/lib/roles";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Table, Td } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";

export default function CategoriesPage() {
  const { db, insert, update, remove } = useData();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form, setForm] = useState({ code: "", name: "" });
  const [error, setError] = useState("");

  const categories = useMemo(
    () => [...db.categories].sort((a, b) => a.code.localeCompare(b.code)),
    [db]
  );

  const openCreate = () => {
    setEditing(null);
    setForm({ code: "", name: "" });
    setError("");
    setOpen(true);
  };

  const openEdit = (cat: Category) => {
    setEditing(cat);
    setForm({ code: cat.code, name: cat.name });
    setError("");
    setOpen(true);
  };

  const save = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      setError("Kode dan nama kategori wajib diisi.");
      return;
    }
    if (
      db.categories.some(
        (c) =>
          c.code.toLowerCase() === form.code.trim().toLowerCase() &&
          c.id !== editing?.id
      )
    ) {
      setError("Kode kategori sudah digunakan.");
      return;
    }
    const err = editing
      ? await update("categories", editing.id, { ...form })
      : await insert("categories", { ...form, id: newUid("cat") });
    if (err) {
      setError(err);
      return;
    }
    setOpen(false);
  };

  const handleRemove = async (cat: Category) => {
    if (!confirm(`Hapus kategori "${cat.code}"?`)) return;
    const err = await remove("categories", cat.id);
    if (err) setError(err);
  };

  const itemCount = (catId: string) =>
    db.items.filter((i) => i.categoryId === catId).length;

  return (
    <RoleGuard roles={MANAGER_ROLES}>
      <PageHeader
        eyebrow="Setup"
        title="Kategori"
        description="Kelola kategori produk untuk mengelompokkan item dalam master data."
        actions={
          <Button variant="secondary" onClick={openCreate}>
            <Plus size={15} strokeWidth={2.2} />
            Tambah Kategori
          </Button>
        }
      />

      {categories.length === 0 ? (
        <EmptyState
          icon={<Tag size={26} strokeWidth={2} />}
          title="Belum ada kategori"
          description="Tambahkan kategori untuk mengelompokkan item."
        />
      ) : (
        <div className="rounded-lg border border-zinc-200 bg-white">
          <Table columns={["Kode", "Nama Kategori", "Jumlah Item", ""]}>
            {categories.map((cat) => (
              <tr key={cat.id} className="transition-colors hover:bg-zinc-50/60">
                <Td mono>{cat.code}</Td>
                <Td className="text-[13.5px] font-semibold text-zinc-900">
                  {cat.name}
                </Td>
                <Td className="text-[12.5px] text-zinc-500">
                  {itemCount(cat.id)} item
                </Td>
                <Td>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEdit(cat)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
                    >
                      <Pencil size={15} strokeWidth={2.2} />
                    </button>
                    <button
                      onClick={() => handleRemove(cat)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 size={15} strokeWidth={2.2} />
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
        title={editing ? "Edit Kategori" : "Tambah Kategori"}
        description="Kategori digunakan untuk mengelompokkan item dan sebagai segmen di format barcode."
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
            label="Kode kategori"
            placeholder="CTGRY"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            hint="Kode ini dipakai di segmen CATEGORY barcode."
          />
          <Input
            label="Nama kategori"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Makanan ringan"
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
