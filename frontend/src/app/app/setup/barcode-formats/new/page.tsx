"use client";

import { Breadcrumb } from "@/components/ui/breadcrumb";
import { MANAGER_ROLES } from "@/lib/roles";
import { RoleGuard } from "@/components/ui/role-guard";
import { FormatEditor } from "@/components/barcode/format-editor";
import type { BarcodeFormat } from "@/types";

export default function NewBarcodeFormatPage() {
  const emptyFormat: BarcodeFormat = {
    id: "",
    name: "",
    isActive: true,
    qtyPerFormat: true,
    uniqueBarcode: false,
    segments: [],
    updatedAt: "",
  };

  return (
    <RoleGuard roles={MANAGER_ROLES} menus={["master.barcodeFormats"]}>
      <Breadcrumb
        crumbs={[
          { label: "Master", href: "/app/setup" },
          { label: "Format Barcode", href: "/app/setup/barcode-formats" },
          { label: "Format Baru" },
        ]}
      />
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-zinc-900 sm:text-[28px]">
          Format Barcode Baru
        </h1>
        <p className="mt-1 text-[13px] text-zinc-500">
          Atur informasi format dan struktur posisi barcode.
        </p>
      </div>
      <FormatEditor format={emptyFormat} />
    </RoleGuard>
  );
}
