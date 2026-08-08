"use client";

import { PageHeader } from "@/components/ui/page-header";
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
    <RoleGuard roles={MANAGER_ROLES}>
      <PageHeader
        eyebrow="Settings"
        title="Format Barcode Baru"
        description="Definisikan segmen posisi digit pada barcode, lalu uji parsingnya secara langsung."
      />
      <FormatEditor format={emptyFormat} />
    </RoleGuard>
  );
}
