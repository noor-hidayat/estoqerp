import { MANAGER_ROLES } from "@/lib/roles";
import { RoleGuard } from "@/components/ui/role-guard";
import { BatchFormatEditor } from "@/components/batch/format-editor";
import { FormPage } from "@/components/ui/form-page";
import type { BatchFormat } from "@/types";

export default function NewBatchFormatPage() {
  const emptyFormat: BatchFormat = {
    id: "",
    name: "",
    isActive: true,
    segments: [],
    updatedAt: "",
  };

  return (
    <RoleGuard roles={MANAGER_ROLES} menus={["master.batchFormats"]}>
      <FormPage title="New Batch Format">
        <BatchFormatEditor format={emptyFormat} />
      </FormPage>
    </RoleGuard>
  );
}