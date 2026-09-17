import { useNavigate, useParams } from "react-router-dom";
import { FormSkeleton } from "@/components/ui/skeleton";
import { MANAGER_ROLES } from "@/lib/roles";
import { RoleGuard } from "@/components/ui/role-guard";
import { FormatEditor } from "@/modules/barcode/components/format-editor";
import { FormPage, FormSection } from "@/components/ui/form-page";
import { useBarcodeFormats, useRemove } from "@/lib/api/query";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ActivityTimeline } from "@/modules/activity/components/activity-timeline";

export default function EditBarcodeFormatPage() {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const router = { push: (to: string) => navigate(to), replace: (to: string) => navigate(to, { replace: true }), back: () => navigate(-1) } as any;
  const { data: formats = [], isLoading } = useBarcodeFormats();
  const remove = useRemove("barcodeFormats");
  const [editing, setEditing] = useState(false);

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

  const handleEdit = () => setEditing(true);
  const handleDelete = async () => {
    if (!confirm("Hapus format ini?")) return;
    try {
      await remove.mutateAsync(format.id);
      toast.success("Deleted");
      navigate("/app/setup/barcode-formats");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <RoleGuard roles={MANAGER_ROLES} menus={["master.barcodeFormats"]}>
      <FormPage
        title={format.name}
        titleBadge={
          editing ? (
            <Badge tone="destructive">Not save</Badge>
          ) : null
        }
        actions={
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <MoreHorizontal size={16} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-36">
                <DropdownMenuItem onClick={handleEdit} className="gap-2">
                  <Pencil size={14} /> Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleDelete} className="gap-2 text-destructive focus:text-destructive">
                  <Trash2 size={14} /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      >
        <FormatEditor key={format.id} format={format} readOnly={!editing} hideInternalActions={!editing} onSaved={() => setEditing(false)} />
        <FormSection title="Aktivitas">
          <ActivityTimeline documentType="BARCODE_FORMAT" documentId={params.id!} />
        </FormSection>
      </FormPage>
    </RoleGuard>
  );
}
