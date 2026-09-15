import { useState } from "react";
import { MoreVertical, Pencil, Plus, Power, Trash, Trash2, Truck, Users } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { timeAgo } from "@/lib/utils";
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
  const { data: rows = [], isLoading } = useResourceList<Party>(kind);
  const insert = useInsert(kind as "suppliers" | "customers");
  const update = useUpdate(kind as "suppliers" | "customers");
  const remove = useRemove(kind as "suppliers" | "customers");

  const [editing, setEditing] = useState<PartyForm | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
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

  const handleToggleActive = async (p: Party) => {
    const next = p.isActive === false;
    if (!confirm(next ? `Activate ${singular.toLowerCase()} "${p.name}"?` : `Deactivate ${singular.toLowerCase()} "${p.name}"?`)) return;
    try {
      await update.mutateAsync({ id: p.id, patch: { isActive: next } });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to update status.");
    }
  };

  const handleBulkRemove = async () => {
    const n = selected.size;
    if (n === 0) return;
    if (!confirm(`Delete ${n} selected ${singular.toLowerCase()}${n > 1 ? "s" : ""}?`)) return;
    try {
      await Promise.all([...selected].map((id) => remove.mutateAsync(id)));
      setSelected(new Set());
    } catch (e) {
      alert(e instanceof Error ? e.message : `Failed to delete ${singular.toLowerCase()}s.`);
    }
  };

  const columns: DataTableColumn<Party>[] = [
    {
      id: "no",
      header: "No",
      align: "center",
      cell: (_r, index) => <span className="text-xs tabular-nums text-muted-foreground">{index ?? ""}</span>,
      className: "w-[56px] pr-8 text-center tabular-nums",
    },
    {
      id: "code",
      header: `${singular} Code`,
      cell: (r) => <span className="whitespace-nowrap text-xs text-muted-foreground">{r.code}</span>,
      sortValue: (r) => r.code,
      className: "w-[130px] pr-8 whitespace-nowrap",
    },
    {
      id: "name",
      header: singular,
      cell: (r) => (
        <span className="truncate font-medium whitespace-nowrap text-foreground" title={r.name}>
          {r.name}
        </span>
      ),
      sortValue: (r) => r.name,
      className: "min-w-[280px] pr-8 whitespace-nowrap",
    },
    {
      id: "contactPerson",
      header: "Contact",
      cell: (r) => <span className="whitespace-nowrap text-xs text-muted-foreground">{r.contactPerson || ""}</span>,
      className: "w-[160px] pr-8 whitespace-nowrap",
    },
    {
      id: "phone",
      header: "Phone",
      cell: (r) => <span className="whitespace-nowrap text-xs text-muted-foreground">{r.phone || ""}</span>,
      className: "w-[140px] pr-8 whitespace-nowrap",
    },
    {
      id: "email",
      header: "Email",
      cell: (r) => <span className="truncate whitespace-nowrap text-xs text-muted-foreground" title={r.email ?? ""}>{r.email || ""}</span>,
      className: "w-[200px] pr-8 whitespace-nowrap",
    },
    {
      id: "status",
      header: "Status",
      cell: (r) => (
        <Badge tone={r.isActive === false ? "neutral" : "success"} className="rounded-md text-[11px]">
          {r.isActive === false ? "Inactive" : "Active"}
        </Badge>
      ),
      className: "w-[110px] pr-8",
    },
    {
      id: "created",
      header: "Created",
      cell: (r) => <span className="whitespace-nowrap text-xs text-muted-foreground">{r.createdAt ? timeAgo(r.createdAt) : ""}</span>,
      sortValue: (r) => r.createdAt ?? "",
      className: "w-[150px] pr-8",
    },
    {
      id: "actions",
      header: "Action",
      align: "center",
      cell: (r) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => e.stopPropagation()}>
              <MoreVertical size={14} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openEdit(r); }} className="gap-2">
              <Pencil size={14} /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleToggleActive(r); }} className="gap-2">
              <Power size={14} /> {r.isActive === false ? "Activate" : "Deactivate"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleRemove(r); }} className="gap-2 text-destructive focus:text-destructive">
              <Trash size={14} /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
      className: "w-[70px] text-center",
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
        selectable
        selectedKeys={selected}
        onSelectionChange={setSelected}
        toolbarRight={
          selected.size > 0 ? (
            <Button
              variant="destructive"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={handleBulkRemove}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete ({selected.size})
            </Button>
          ) : null
        }
        minWidth={1200}
        onRowClick={(r) => openEdit(r)}
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