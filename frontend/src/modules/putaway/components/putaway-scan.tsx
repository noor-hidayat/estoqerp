// Scan Barcode Putaway — reuse pola Transaction/Movement + Count:
// input scan (auto-submit 1s setelah berhenti ketik, paste & Enter langsung
// submit) + tombol kamera (CameraScanner) + panel "Last barcode".
// Scan History hanya berisi barcode yang benar-benar di-scan (dipanggil
// parent lewat onScan); baris manual / dari GRN tidak masuk history.

import { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { Input } from "@/components/ui/input";
import { CameraScanner } from "@/modules/barcode/components/camera-scanner";

export interface ScannedEntry {
  key: string;
  barcode: string;
  itemCode: string;
}

export function PutawayScanBar({
  onScan,
  history,
}: {
  onScan: (raw: string) => void;
  history: ScannedEntry[];
}) {
  const [scanInput, setScanInput] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
    };
  }, []);

  const submit = (raw: string) => {
    const barcode = raw.trim();
    if (!barcode) return;
    if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
    onScan(barcode);
    setScanInput("");
  };

  return (
    <div>
      <div className="mb-4 grid gap-x-8 sm:grid-cols-2">
        <div>
          <div className="mb-2">
            <span className="text-[13px] font-medium text-foreground">Scan Barcode</span>
          </div>
          <div className="relative">
            <Input
              ref={scanInputRef}
              value={scanInput}
              onChange={(e) => {
                const v = e.target.value;
                const isPaste =
                  (e.nativeEvent as InputEvent)?.inputType === "insertFromPaste";
                setScanInput(v);
                if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
                if (isPaste && v.trim()) {
                  submit(v);
                } else {
                  scanTimerRef.current = setTimeout(() => {
                    const cur = scanInputRef.current?.value ?? "";
                    if (cur.trim()) submit(cur);
                  }, 1000);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit(scanInput);
                }
              }}
              placeholder="Scan barcode..."
              className="h-8 rounded-md pl-3 pr-11 text-[13px] shadow-none focus-visible:ring-1"
            />
            <button
              type="button"
              aria-label="Scan with camera"
              onClick={() => setCameraOpen(true)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-zinc-200/80 hover:text-foreground"
            >
              <Camera size={16} strokeWidth={2} />
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Press Enter to add to Details table. Barcode is optional — manual input also supported.
          </p>
        </div>

        {history.length > 0 && (
          <div>
            <div className="mb-2">
              <span className="text-[13px] font-medium text-foreground">Last barcode</span>
            </div>
            <div className="overflow-hidden rounded-md border border-border bg-zinc-100 dark:bg-muted/40">
              <div className="max-h-[280px] overflow-y-auto">
                {history.slice(-10).reverse().map((h) => (
                  <div
                    key={h.key}
                    className="break-all border-b border-border/60 bg-card px-3 py-1.5 text-[11.5px] text-foreground last:border-0 even:bg-zinc-50 dark:even:bg-muted/20"
                  >
                    {h.barcode}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {cameraOpen && (
        <div className="mb-4">
          <CameraScanner
            onScan={(text) => submit(text)}
            onClose={() => setCameraOpen(false)}
          />
        </div>
      )}
    </div>
  );
}

export function PutawayScanHistoryTable({ history }: { history: ScannedEntry[] }) {
  if (history.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center">
        <p className="text-[13px] font-medium text-foreground">Belum ada scan history</p>
        <p className="mt-1 text-[12px] text-muted-foreground">Scan barcode di tab Details untuk melihat history.</p>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[12.5px]">
          <thead className="bg-zinc-100 text-[11px] uppercase tracking-wider text-muted-foreground dark:bg-zinc-800">
            <tr>
              <th className="px-4 py-2.5 font-semibold">No.</th>
              <th className="px-4 py-2.5 font-semibold">Barcode</th>
              <th className="px-4 py-2.5 font-semibold">Item Code</th>
              <th className="px-4 py-2.5 text-right font-semibold">Qty</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {history.slice().reverse().map((h, idx) => (
              <tr key={h.key} className="hover:bg-muted/30">
                <td className="px-4 py-2.5 text-xs text-muted-foreground">{history.length - idx}</td>
                <td className="break-all px-4 py-2.5 text-xs text-foreground">{h.barcode}</td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground">{h.itemCode}</td>
                <td className="px-4 py-2.5 text-right text-xs text-foreground">1</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
