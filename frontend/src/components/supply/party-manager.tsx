import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Pencil, Plus, Trash2, Truck, Users } from "lucide-react";
import { useInsert, useUpdate, useRemove, useResourceList } from "@/lib/api/query";
import type { Party } from "@/types";
import { PageHeader } from "@/components/ui/page-header";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { useErrorToast } from "@/hooks/use-error-toast";

interface PartyManagerProps {
  kind: "suppliers" | "customers";
  title: string;
  menu: string;
  singular: string;
  icon: typeof Truck | typeof Users;
}

interface PartyForm {
  id?: string;
  code: string;
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  taxId: string;
  isActive: boolean;
}

function blankForm(): PartyForm {
  return {
    code: "",
    name: "",
    contactPerson: "",
    phone: "",
    email: "",
    address: "",
    taxId: "",
    isActive: true,
  };
}

export function PartyManager({ kind, title, menu, singular, icon: Icon }: PartyManagerProps) {
  const navigate = useNavigate();
  const { data: rows = [], isLoading } = useResourceList<Party>(kind);
  const insert = useInsert(kind as "suppliers" | "customers");
  const update = useUpdate(kind as "suppliers" | "customers");
  const remove = useRemove(kind as "suppliers" | "customers");

  const [editing, setEditing] = useState<PartyForm | null>(null);
  const [error, setError] = useState("");
  useErrorToast(error);

  const openNew = () => setEditing(blankForm());
  const openEdit = (p: Party) =>
    setEditing({
      id: p.id,
      code: p.code,
      name: p.name,
      contactPerson: p.contactPerson ?? "",
      phone: p.phone ?? "",
      email: p.email ?? "",
      address: p.address ?? "",
      taxId: p.taxId ?? "",
      isActive: p.isActive ?? true,
    });

  const save = async () => {
    if (!editing) return;
    if (!editing.code.trim() || !editing.name.trim()) {
      setError("Code and name are required.");
      return;
    }
    const body = {
      code: editing.code.trim(),
      name: editing.name.trim(),
      contactPerson: editing.contactPerson.trim() || null,
      phone: editing.phone.trim() || null,
      email: editing.email.trim() || null,
      address: editing.address.trim() || null,
      taxId: editing.taxId.trim() || null,
      isActive: editing.isActive,
    };
    try {
      if (editing.id) {
        await update.mutateAsync({ id: editing.id, patch: body });
      } else {
        await insert.mutateAsync(body);
      }
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : `Failed to save ${singular}.`);
    }
  };

  const handleRemove = async (p: Party) => {
    if (!confirm(`Delete ${singular} "${p.name}"?`)) return;
    try {
      await remove.mutateAsync(p.id);
    } catch (e) {
      alert(e instanceof Error ? e.message : `Failed to delete ${singular}.`);
    }
  };

  const columns: DataTableColumn<Party>[] = [
    {
      id: "code",
      header: "Code",
      cell: (r) => <span className="font-mono text-xs text-muted-foreground">{r.code}</span>,
    },
    {
      id: "name",
      header: "Name",
      cell: (r) => <span className="font-medium text-foreground">{r.name}</span>,
      sortValue: (r) => r.name,
    },
    {
      id: "contactPerson",
      header: "Contact",
      cell: (r) => <span className="text-muted-foreground">{r.contactPerson || "—"}</span>,
    },
    {
      id: "phone",
      header: "Phone",
      cell: (r) => <span className="text-muted-foreground">{r.phone || "—"}</span>,
    },
    {
      id: "email",
      header: "Email",
      cell: (r) => <span className="text-muted-foreground">{r.email || "—"}</span>,
    },
    {
      id: "status",
      header: "Status",
      cell: (r) => (
        <Badge tone={r.isActive === false ? "red" : "neutral"}>
          {r.isActive === false ? "Inactive" : "Active"}
        </Badge>
      ),
    },
    {
      id: "actions",
      header: "",
      align: "right",
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => openEdit(r)}
            aria-label={`Edit ${singular}`}
          >
            <Pencil size={14} strokeWidth={2} />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-destructive hover:bg-destructive/10"
            onClick={() => handleRemove(r)}
            aria-label={`Delete ${singular}`}
          >
            <Trash2 size={14} strokeWidth={2} />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <RoleGuard roles={[]} menus={[menu]}>
      <PageHeader
        title={title}
        actions={
          <Button size="sm" className="h-7 px-2.5 text-xs" onClick={openNew}>
            <Plus size={14} strokeWidth={2} />
            Add {singular}
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={rows}
        getRowId={(r) => r.id}
        loading={isLoading}
        searchPlaceholder={`Search ${title.toLowerCase()}...`}
        getSearchText={(r) => `${r.code} ${r.name} ${r.contactPerson ?? ""} ${r.email ?? ""}`}
        emptyIcon={<Icon size={26} strokeWidth={2} />}
        emptyTitle={`No ${title.toLowerCase()}`}
        emptyDescription={`Add a new ${singular.toLowerCase()} to get started.`}
      />

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing?.id ? `Edit ${singular}` : `New ${singular}`}
            </DialogTitle>
          </DialogHeader>

          {editing && (
            <div className="grid gap-4 py-2">
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Code"
                  value={editing.code}
                  onChange={(e) => setEditing({ ...editing, code: e.target.value })}
                />
                <Input
                  label="Name"
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Contact Person"
                  value={editing.contactPerson}
                  onChange={(e) => setEditing({ ...editing, contactPerson: e.target.value })}
                />
                <Input
                  label="Phone"
                  value={editing.phone}
                  onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
                />
              </div>
              <Input
                label="Email"
                type="email"
                value={editing.email}
                onChange={(e) => setEditing({ ...editing, email: e.target.value })}
              />
              <Input
                label="Address"
                value={editing.address}
                onChange={(e) => setEditing({ ...editing, address: e.target.value })}
              />
              <Input
                label="Tax ID"
                value={editing.taxId}
                onChange={(e) => setEditing({ ...editing, taxId: e.target.value })}
              />
              <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Switch
                  checked={editing.isActive}
                  onCheckedChange={(v) => setEditing({ ...editing, isActive: v === true })}
                />
                Active
              </label>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} disabled={insert.isPending || update.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </RoleGuard>
  );
}