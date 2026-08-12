"use client";

import { useParams, useRouter } from "next/navigation";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { ShellLoader } from "@/components/ui/loader";
import { MANAGER_ROLES } from "@/lib/roles";
import { RoleGuard } from "@/components/ui/role-guard";
import { FormatEditor } from "@/components/barcode/format-editor";
import { useBarcodeFormats } from "@/lib/api/query";

export default function EditBarcodeFormatPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data: formats = [], isLoading } = useBarcodeFormats();

  if (isLoading) {
    return (
      <RoleGuard roles={MANAGER_ROLES} menus={["master.barcodeFormats"]}>
        <ShellLoader />
      </RoleGuard>
    );
  }

  const format = formats.find((f) => f.id === params.id);

  if (!format) {
    return (
      <RoleGuard roles={MANAGER_ROLES} menus={["master.barcodeFormats"]}>
        <p className="py-20 text-center text-lg font-semibold text-zinc-800">
          Format tidak ditemukan
        </p>
        <div className="text-center">
          <button
            onClick={() => router.push("/app/setup/barcode-formats")}
            className="text-sm text-emerald-600 hover:text-emerald-700"
          >
            Kembali ke Format Barcode
          </button>
        </div>
      </RoleGuard>
    );
  }

  return (
    <RoleGuard roles={MANAGER_ROLES} menus={["master.barcodeFormats"]}>
      <Breadcrumb
        crumbs={[
          { label: "Master", href: "/app/setup" },
          { label: "Format Barcode", href: "/app/setup/barcode-formats" },
          { label: format.name },
        ]}
      />
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-zinc-900 sm:text-[28px]">
          Edit Format
        </h1>
        <p className="mt-1 text-[13px] text-zinc-500">
          Atur informasi format dan struktur posisi barcode.
        </p>
      </div>
      <FormatEditor key={format.id} format={format} />
    </RoleGuard>
  );
}
