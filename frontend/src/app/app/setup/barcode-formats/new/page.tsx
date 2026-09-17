import { MANAGER_ROLES } from "@/lib/roles";
import { RoleGuard } from "@/components/ui/role-guard";
import { FormatEditor } from "@/modules/barcode/components/format-editor";
import { FormPage } from "@/components/ui/form-page";
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
      <FormPage
        title="New Barcode Format"

      >
        <FormatEditor format={emptyFormat} />
      </FormPage>
    </RoleGuard>
  );
}