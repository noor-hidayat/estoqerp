import { useNavigate, useParams } from "react-router-dom";
import { FormSkeleton } from "@/components/ui/skeleton";
import { MANAGER_ROLES } from "@/lib/roles";
import { RoleGuard } from "@/components/ui/role-guard";
import { FormatEditor } from "@/components/barcode/format-editor";
import { FormPage } from "@/components/ui/form-page";
import { useBarcodeFormats } from "@/lib/api/query";

export default function EditBarcodeFormatPage() {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const router = { push: (to: string) => navigate(to), replace: (to: string) => navigate(to, { replace: true }), back: () => navigate(-1) } as any;
  const { data: formats = [], isLoading } = useBarcodeFormats();

  if (isLoading) {
    return (
      <RoleGuard roles={MANAGER_ROLES} menus={["master.barcodeFormats"]}>
        <FormSkeleton
          sections={[
            ["half", "half", "wide", "toggle", "toggle", "toggle"],
            ["segment", "segment", "segment"],
          ]}
        />
      </RoleGuard>
    );
  }

  const format = formats.find((f) => f.id === params.id);

  if (!format) {
    return (
      <RoleGuard roles={MANAGER_ROLES} menus={["master.barcodeFormats"]}>
        <p className="py-20 text-center text-lg font-semibold text-foreground">
          Format not found
        </p>
        <div className="text-center">
          <button
            onClick={() => router.push("/app/setup/barcode-formats")}
            className="text-sm text-primary hover:text-primary/80"
          >
            Back to Barcode Formats
          </button>
        </div>
      </RoleGuard>
    );
  }

  return (
    <RoleGuard roles={MANAGER_ROLES} menus={["master.barcodeFormats"]}>
      <FormPage
        title="Edit Format"
      >
        <FormatEditor key={format.id} format={format} />
      </FormPage>
    </RoleGuard>
  );
}