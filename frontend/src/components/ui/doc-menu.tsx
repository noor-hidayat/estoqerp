import { MoreHorizontal, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface DocMenuProps {
  onEdit?: () => void;
  onCancel?: () => void;
  onDelete?: () => void;
  editDisabled?: boolean;
  cancelDisabled?: boolean;
  deleteDisabled?: boolean;
  editLabel?: string;
  cancelLabel?: string;
  deleteLabel?: string;
}

/** Menu titik-tiga standar: Edit + Cancel (→ CANCELED) + Delete (hapus dari DB). */
export function DocMenu({
  onEdit,
  onCancel,
  onDelete,
  editDisabled,
  cancelDisabled,
  deleteDisabled,
  editLabel = "Edit",
  cancelLabel = "Cancel",
  deleteLabel = "Delete",
}: DocMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="More actions">
          <MoreHorizontal size={16} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        {onEdit && (
          <DropdownMenuItem onClick={onEdit} disabled={editDisabled} className="gap-2">
            <Pencil size={14} /> {editLabel}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={onCancel} disabled={cancelDisabled || !onCancel} className="gap-2">
          <X size={14} /> {cancelLabel}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={onDelete}
          disabled={deleteDisabled || !onDelete}
          className="gap-2 text-destructive focus:text-destructive"
        >
          <Trash2 size={14} /> {deleteLabel}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
