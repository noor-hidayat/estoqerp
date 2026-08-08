"use client";

import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { MANAGER_ROLES } from "@/lib/roles";
import { RoleGuard } from "@/components/ui/role-guard";
import { FormatEditor } from "@/components/barcode/format-editor";
import { useDB } from "@/hooks/use-db";

export default function EditBarcodeFormatPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const db = useDB();

  const format = db.barcodeFormats.find((f) => f.id === params.id);

  if (!format) {
    return (
      <RoleGuard roles={MANAGER_ROLES}>
        <PageHeader title="Format tidak ditemukan" />
        <button onClick={() => router.push("/app/settings/barcode-formats")}>
          Kembali
        </button>
      </RoleGuard>
    );
  }

  return (
    <RoleGuard roles={MANAGER_ROLES}>
      <PageHeader
        eyebrow="Settings"
        title={format.name}
        description="Sesuaikan segmen posisi digit dan uji parsing format ini."
      />
      <FormatEditor key={format.id} format={format} />
    </RoleGuard>
  );
}
