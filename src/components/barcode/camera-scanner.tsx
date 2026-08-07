"use client";

import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Camera, VideoCamera, X } from "@phosphor-icons/react";

export function CameraScanner({
  onScan,
  onClose,
}: {
  onScan: (text: string) => void;
  onClose: () => void;
}) {
  const containerId = "qr-camera-reader";
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const onScanRef = useRef(onScan);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(true);

  useEffect(() => {
    onScanRef.current = onScan;
  });

  useEffect(() => {
    let cancelled = false;
    let scanner: Html5Qrcode | null = null;

    Promise.resolve()
      .then(() => {
        if (cancelled) return;
        scanner = new Html5Qrcode(containerId);
        scannerRef.current = scanner;
        return scanner.start(
          { facingMode: "environment" },
          { fps: 12, qrbox: { width: 240, height: 120 } },
          (text) => onScanRef.current(text.trim()),
          () => {
            // decode errors are expected between frames; ignore
          }
        );
      })
      .then(() => {
        if (cancelled) return;
        setStarting(false);
      })
      .catch(() => {
        if (cancelled) return;
        setStarting(false);
        setError(
          "Kamera tidak dapat diakses. Pastikan izin kamera diberikan dan gunakan HTTPS atau localhost."
        );
      });

    return () => {
      cancelled = true;
      if (scanner) {
        const s = scanner;
        try {
          s.stop()
            .then(() => {
              try {
                s.clear();
              } catch {
                // ignore
              }
            })
            .catch(() => {
              // ignore
            });
        } catch {
          // stop() throws synchronously when the scanner is not running yet;
          // nothing to release in that case.
        }
      }
      scannerRef.current = null;
    };
  }, []);

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200/70 bg-zinc-950">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2 text-zinc-200">
          <Camera size={16} weight="bold" className="text-emerald-400" />
          <span className="text-[13px] font-medium">Scan dengan kamera</span>
        </div>
        <button
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-100"
        >
          <X size={15} weight="bold" />
        </button>
      </div>

      <div className="relative mx-auto aspect-[4/3] w-full max-w-sm">
        <div id="qr-camera-reader" className="absolute inset-0 [&>video]:h-full [&>video]:w-full [&>video]:object-cover" />
        {starting && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-zinc-950 text-zinc-300">
            <VideoCamera size={28} weight="bold" className="animate-pulse text-emerald-400" />
            <span className="text-[13px]">Mengaktifkan kamera...</span>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-950 px-6">
            <p className="text-center text-[13px] leading-relaxed text-amber-300">
              {error}
            </p>
          </div>
        )}
      </div>

      <p className="px-4 py-3 text-center text-[11.5px] text-zinc-500">
        Arahkan kamera ke barcode. Kode terdeteksi otomatis diproses.
      </p>
    </div>
  );
}
