import { MoreHorizontal, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface DocMenuProps {
  onCancel?: () => void;
  onDelete?: () => void;
  cancelDisabled?: boolean;
  deleteDisabled?: boolean;
  cancelLabel?: string;
  deleteLabel?: string;
}

/** Menu titik-tiga standar: Cancel (status → CANCELED) + Delete (hapus dari DB). */
export function DocMenu({
  onCancel,
  onDelete,
  cancelDisabled,
  deleteDisabled,
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
