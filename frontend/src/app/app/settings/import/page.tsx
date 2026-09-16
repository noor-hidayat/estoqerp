import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileUp,
  RotateCcw,
} from "lucide-react";
import {
  DATASETS,
  downloadTemplate,
  importDataset,
  parseSpreadsheet,
  type DatasetDescriptor,
  type DatasetId,
  type ImportMode,
  type ImportResult,
} from "@/lib/api/import";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RoleGuard } from "@/components/ui/role-guard";
import { MANAGER_ROLES } from "@/lib/roles";
import { cx } from "@/lib/utils";
import { useErrorToast } from "@/hooks/use-error-toast";

type Step = "choose" | "preview" | "done";

export default function ImportDataPage() {
  const [datasetId, setDatasetId] = useState<DatasetId | null>(null);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [parseError, setParseError] = useState<string>("");
  useErrorToast(parseError);
  const [mode, setMode] = useState<ImportMode>("skip");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dataset = useMemo(() => DATASETS.find((d) => d.id === datasetId) ?? null, [datasetId]);
  const step: Step = !dataset ? "choose" : result ? "done" : "preview";

  const reset = () => {
    setDatasetId(null);
    setRows([]);
    setFileName("");
    setParseError("");
    setResult(null);
    setMode("skip");
  };

  const onPick = (id: DatasetId) => {
    setDatasetId(id);
    setRows([]);
    setFileName("");
    setParseError("");
    setResult(null);
  };

  const onUpload = async (file: File) => {
    setParseError("");
    try {
      const parsed = await parseSpreadsheet(file);
      if (parsed.length === 0) {
          setParseError("File is empty or contains only headers.");
        return;
      }
      setRows(parsed);
      setFileName(file.name);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Failed to read file.");
    }
  };

  const submitImport = async () => {
    if (!dataset) return;
    setSubmitting(true);
    try {
      const res = await importDataset(dataset.id, rows, mode);
      setResult(res);
    } catch (e) {
      setResult({
        inserted: 0,
        updated: 0,
        skipped: 0,
        errors: [{ row: 0, message: e instanceof Error ? e.message : "Failed to connect to server." }],
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <RoleGuard roles={MANAGER_ROLES} menus={["settings.import"]}>
      <PageHeader
        title="Import Data"
        actions={
          dataset ? (
            <Button variant="ghost" onClick={reset}>
              <RotateCcw size={15} strokeWidth={2} />
              Other dataset
            </Button>
          ) : null
        }
      />

      {step === "choose" && (
        <ChooseStep onPick={onPick} />
      )}

      {dataset && step === "preview" && dataset && (
        <PreviewStep
          dataset={dataset}
          rows={rows}
          fileName={fileName}
          mode={mode}
          submitting={submitting}
          onModeChange={setMode}
          onPickFile={() => fileRef.current?.click()}
          fileRef={fileRef}
          onFile={onUpload}
          onSubmit={submitImport}
        />
      )}

      {dataset && step === "done" && result && (
        <DoneStep dataset={dataset} result={result} fileName={fileName} onReset={reset} />
      )}
    </RoleGuard>
  );
}

function ChooseStep({ onPick }: { onPick: (id: DatasetId) => void }) {
  return (
    <div className="space-y-6">
      <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-foreground">Import Data</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Import master data from spreadsheet (.xlsx / .csv). Select a dataset below, then download
            the template, fill in the data, and upload it back.
          </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {DATASETS.map((d) => (
          <button
            key={d.id}
            onClick={() => onPick(d.id)}
            className="group flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-6 text-left transition-all duration-300 hover:-translate-y-0.5 hover:border-border hover:shadow-[0_14px_36px_-16px_rgb(17_17_17/0.14)]"
          >
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <FileSpreadsheet size={20} strokeWidth={2} />
            </span>
            <span className="text-[15px] font-semibold tracking-tight text-foreground">{d.label}</span>
            <span className="mt-1 text-[12px] font-medium text-muted-foreground group-hover:text-foreground">
              Select →
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function PreviewStep({
  dataset,
  rows,
  fileName,
  mode,
  submitting,
  onModeChange,
  onPickFile,
  fileRef,
  onFile,
  onSubmit,
}: {
  dataset: DatasetDescriptor;
  rows: Record<string, unknown>[];
  fileName: string;
  mode: ImportMode;
  submitting: boolean;
  onModeChange: (m: ImportMode) => void;
  onPickFile: () => void;
  fileRef: React.RefObject<HTMLInputElement | null>;
  onFile: (f: File) => void;
  onSubmit: () => void;
}) {
  // Deteksi kolom spreadsheet yang dikenal dan yang tidak dikenal.
  const knownKeys = new Set(dataset.columns.map((c) => c.key));
  const fileKeys = new Set<string>();
  for (const row of rows) for (const k of Object.keys(row)) fileKeys.add(k);
  const unknownKeys = [...fileKeys].filter((k) => !knownKeys.has(k));
  const usedKeys = dataset.columns.filter((c) => fileKeys.has(c.key));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Dataset</p>
          <h1 className="mt-0.5 text-[22px] font-semibold tracking-tight text-foreground">
            {dataset.label}
          </h1>
        </div>
          <Button variant="outline" onClick={() => downloadTemplate(dataset)}>
          <Download size={15} strokeWidth={2} />
          Download template
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold tracking-tight text-foreground">Upload file</h2>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">
              Format: .xlsx or .csv. First row is treated as header.
            </p>
          </div>
          <Button variant="secondary" onClick={onPickFile}>
            <FileUp size={15} strokeWidth={2} />
            {rows.length > 0 ? "Replace file" : "Select file"}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = "";
            }}
          />
        </div>
        {fileName && (
          <p className="mt-3 text-[12.5px] text-muted-foreground">
            File: <span className="font-medium text-foreground">{fileName}</span> — {rows.length} rows
          </p>
        )}
      </div>

      {rows.length > 0 && (
        <>
          {unknownKeys.length > 0 && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12.5px] text-amber-800">
              <AlertTriangle size={16} strokeWidth={2} className="mt-0.5 shrink-0" />
              <div>
                Unknown columns in template will be ignored:{" "}
                <span className="">{unknownKeys.join(", ")}</span>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
              Preview ({rows.length} rows)
            </h2>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">
              First 10 rows that will be sent to the server.
            </p>
            <div className="mt-4 overflow-x-auto rounded-lg border border-border">
              <Table style={{ minWidth: usedKeys.length * 130 + 60 }}>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px] min-w-[40px] max-w-[40px] px-3 py-2 text-xs font-medium text-muted-foreground text-center">#</TableHead>
                    {usedKeys.map((c) => (
                      <TableHead key={c.key} className="px-3 py-2 text-xs font-medium text-muted-foreground">
                        {c.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 10).map((row, i) => (
                    <TableRow key={i} className="hover:bg-accent/60">
                      <TableCell className="px-3 py-2 text-[11.5px] tracking-tight text-muted-foreground">
                        {String(i + 1).padStart(2, "0")}
                      </TableCell>
                      {usedKeys.map((c) => {
                        const v = row[c.key];
                        const s = v === undefined || v === "" ? "" : String(v);
                        const missing = c.required && (v === undefined || v === "");
                        const isCode = c.key === "code" || c.key === "itemGroupCode" || c.key === "warehouseCode" || c.key === "branchCode" || c.key === "itemCode";
                        return (
                          <TableCell
                            key={c.key}
                            className={cx(
                              "whitespace-normal px-3 py-2 text-[13px]",
                              isCode && " text-[11.5px] tracking-tight text-muted-foreground",
                              missing && "bg-destructive/10 text-destructive",
                              !missing && c.required && "text-foreground"
                            )}
                          >
                            {missing ? "(wajib)" : s}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-[15px] font-semibold tracking-tight text-foreground">Import mode</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <ModeCard
                active={mode === "skip"}
                onClick={() => onModeChange("skip")}
                title="Skip duplicates"
              />
              <ModeCard
                active={mode === "update"}
                onClick={() => onModeChange("update")}
                title="Update & add"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="primary" onClick={onSubmit} disabled={submitting}>
              {submitting ? "Importing..." : `Import ${rows.length} rows`}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function ModeCard({
  active,
  onClick,
  title,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "flex flex-col items-start gap-1 rounded-lg border p-4 text-left transition-colors",
        active ? "border-primary bg-muted" : "border-border bg-card hover:border-border"
      )}
    >
      <span className="text-[14px] font-semibold text-foreground">{title}</span>
    </button>
  );
}

function DoneStep({
  dataset,
  result,
  fileName,
  onReset,
}: {
  dataset: DatasetDescriptor;
  result: ImportResult;
  fileName: string;
  onReset: () => void;
}) {
  const hasError = result.errors.length > 0;
  const total = result.inserted + result.updated + result.skipped + result.errors.length;
  return (
    <div className="space-y-6">
      <div
        className={cx(
          "flex items-start gap-3 rounded-xl border px-5 py-4",
          hasError
            ? "border-amber-200 bg-amber-50 text-amber-800"
            : "border-emerald-200 bg-emerald-50 text-emerald-800"
        )}
      >
        <CheckCircle2 size={20} strokeWidth={2} className="mt-0.5 shrink-0" />
        <div>
          <h1 className="text-[16px] font-semibold tracking-tight">
            Import {dataset.label} completed
          </h1>
          <p className="mt-0.5 text-[13px]">
            {fileName ? `File: ${fileName}. ` : ""}
            {result.inserted} added, {result.updated} updated, {result.skipped} skipped,{" "}
            {result.errors.length} failed out of {total} rows.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <SummaryStat label="Added" value={result.inserted} />
        <SummaryStat label="Updated" value={result.updated} />
        <SummaryStat label="Skipped" value={result.skipped} />
        <SummaryStat label="Failed" value={result.errors.length} tone={hasError ? "danger" : "muted"} />
      </div>

      {result.errors.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
            Failed rows ({result.errors.length})
          </h2>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            Row numbers match the spreadsheet (excluding header). Fix the file and try again.
          </p>
          <div className="mt-4 overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20 px-3 py-2 text-xs font-medium text-muted-foreground">Row</TableHead>
                  <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground">Message</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.errors.slice(0, 50).map((e, i) => (
                  <TableRow key={i} className="hover:bg-accent/60">
                    <TableCell className="px-3 py-2 text-[11.5px] tracking-tight text-muted-foreground">{e.row}</TableCell>
                    <TableCell className="whitespace-normal px-3 py-2 text-[13px] text-foreground">{e.message}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {result.errors.length > 50 && (
            <p className="mt-3 text-[12px] text-muted-foreground">
              ... and {result.errors.length - 50} more rows.
            </p>
          )}
        </div>
      )}

      <div className="flex justify-end">
        <Button variant="secondary" onClick={onReset}>
          <RotateCcw size={15} strokeWidth={2} />
          Import another dataset
        </Button>
      </div>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: number;
  tone?: "muted" | "danger";
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-5 py-4">
      <p className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p
        className={cx(
          "mt-1 text-[24px] font-semibold tracking-tight",
          tone === "danger" && value > 0 ? "text-destructive" : "text-foreground"
        )}
      >
        {value}
      </p>
    </div>
  );
}