// Settings > Dev Data — development tools issue #3 §13:
// reset seluruh LocalStorage, re-seed sample data, clear transaksi/master.
// Halaman ini hanya relevan saat VITE_DATA_MODE=local.

import { useState } from "react";
import { toast } from "sonner";
import { Database, RotateCcw, Sprout, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RoleGuard } from "@/components/ui/role-guard";
import { MANAGER_ROLES } from "@/lib/roles";
import { isLocalMode } from "@/lib/api/client";
import {
  reseed,
  resetAll,
  clearTransactions,
  clearMaster,
  collectionCounts,
} from "@/lib/data/dev-tools";
import { queryClient } from "@/lib/api/query-client";

export default function DevDataPage() {
  const [counts, setCounts] = useState<Record<string, number>>(() => collectionCounts());

  const refresh = () => {
    setCounts(collectionCounts());
    void queryClient.invalidateQueries();
  };

  const run = (label: string, fn: () => void) => {
    try {
      fn();
      refresh();
      toast.success(`${label} berhasil.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `${label} gagal.`);
    }
  };

  const confirmRun = (message: string, label: string, fn: () => void) => {
    toast.custom(
      (id) => (
        <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 shadow-lg">
          <span className="text-sm">{message}</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => toast.dismiss(id)}
          >
            No
          </Button>
          <Button
            size="sm"
            autoFocus
            onClick={() => {
              toast.dismiss(id);
              run(label, fn);
            }}
          >
            Yes
          </Button>
        </div>
      ),
      { duration: Infinity }
    );
  };

  return (
    <RoleGuard roles={MANAGER_ROLES}>
      <PageHeader title="Dev Data" description="Development tools — LocalStorage data layer (mode lokal)." />
      {!isLocalMode() && (
        <p className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Aplikasi berjalan dalam mode API — tools ini hanya berlaku untuk mode lokal (VITE_DATA_MODE=local).
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sprout size={16} /> Seed & Reset
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => run("Re-seed", () => void reseed())}>
              <Sprout size={15} /> Re-seed (tanpa overwrite)
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => confirmRun("Reset seluruh data lokal?", "Reset all", () => void resetAll())}
            >
              <RotateCcw size={15} /> Reset All + Seed
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Trash2 size={16} /> Clear Data
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => confirmRun("Hapus semua data transaksi?", "Clear transaksi", () => clearTransactions())}
            >
              Clear Transactions
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => confirmRun("Hapus semua master data?", "Clear master", () => clearMaster())}
            >
              Clear Master
            </Button>
          </CardContent>
        </Card>
      </div>
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Database size={16} /> Isi LocalStorage per koleksi
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Koleksi</TableHead>
                <TableHead className="text-right">Jumlah</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(counts).map(([name, n]) => (
                <TableRow key={name}>
                  <TableCell className="font-mono text-xs">{name}</TableCell>
                  <TableCell className="text-right tabular-nums">{n}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </RoleGuard>
  );
}
