"use client";

import { useParams, useRouter } from "next/navigation";
import { FormSkeleton } from "@/components/ui/skeleton";
import { MANAGER_ROLES } from "@/lib/roles";
import { RoleGuard } from "@/components/ui/role-guard";
import { BatchFormatEditor } from "@/components/batch/format-editor";
import { FormPage } from "@/components/ui/form-page";
import { useBatchFormats } from "@/lib/api/query";

export default function EditBatchFormatPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data: formats = [], isLoading } = useBatchFormats();

  if (isLoading) {
    return (
      <RoleGuard roles={MANAGER_ROLES} menus={["master.batchFormats"]}>
        <FormSkeleton sections={[["half", "half", "wide", "toggle"]]} />
      </RoleGuard>
    );
  }

  const format = formats.find((f) => f.id === params.id);

  if (!format) {
    return (
      <RoleGuard roles={MANAGER_ROLES} menus={["master.batchFormats"]}>
        <p className="py-20 text-center text-lg font-semibold text-foreground">
          Format not found
        </p>
        <div className="text-center">
          <button
            onClick={() => router.push("/app/data-library/batch-formats")}
            className="text-sm text-primary hover:text-primary/80"
          >
            Back to Batch Formats
          </button>
        </div>
      </RoleGuard>
    );
  }

  return (
    <RoleGuard roles={MANAGER_ROLES} menus={["master.batchFormats"]}>
      <FormPage title="Edit Format">
        <BatchFormatEditor key={format.id} format={format} />
      </FormPage>
    </RoleGuard>
  );
}