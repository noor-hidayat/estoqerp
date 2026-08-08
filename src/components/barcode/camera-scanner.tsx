"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Video, X } from "lucide-react";

const SCAN_COOLDOWN_MS = 600;
const MAX_DECODE_WIDTH = 560;

let audioCtx: AudioContext | null = null;

function playBeep() {
  try {
    if (!audioCtx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return;
      audioCtx = new Ctor();
    }
    if (audioCtx.state === "suspended") void audioCtx.resume();
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "square";
    osc.frequency.value = 2000;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.3, now + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.11);
  } catch {
    // ignore audio errors
  }
}

interface DecodeResponse {
  id: number;
  text: string;
}

export function CameraScanner({
  onScan,
  onClose,
}: {
  onScan: (text: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onScanRef = useRef(onScan);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef(new Map<number, (text: string) => void>());
  const seqRef = useRef(0);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(true);

  useEffect(() => {
    onScanRef.current = onScan;
  });

  useEffect(() => {
    let cancelled = false;

    const worker = new Worker(new URL("./decode-worker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;
    worker.onmessage = (e: MessageEvent<DecodeResponse>) => {
      const { id, text } = e.data;
      const cb = pendingRef.current.get(id);
      pendingRef.current.delete(id);
      if (cb) cb(text);
    };

    const decodeLoop = async (video: HTMLVideoElement) => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      let busy = false;
      const loop = async () => {
        if (cancelled || busy) return;
        if (
          video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
          video.videoWidth > 0
        ) {
          const scale = Math.min(1, MAX_DECODE_WIDTH / video.videoWidth);
          canvas.width = Math.max(1, Math.floor(video.videoWidth * scale));
          canvas.height = Math.max(1, Math.floor(video.videoHeight * scale));
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          let imageData: ImageData;
          try {
            imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          } catch {
            timerRef.current = window.setTimeout(loop, 100);
            return;
          }
          busy = true;
          const id = ++seqRef.current;
          pendingRef.current.set(id, (text) => {
            busy = false;
            if (cancelled) return;
            if (text) {
              playBeep();
              onScanRef.current(text);
              timerRef.current = window.setTimeout(loop, SCAN_COOLDOWN_MS);
              return;
            }
            void loop();
          });
          worker.postMessage({ id, imageData }, [imageData.data.buffer]);
        } else {
          timerRef.current = window.setTimeout(loop, 100);
        }
      };
      await loop();
    };

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "environment",
            width: { ideal: 960 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        video.srcObject = stream;
        await video.play();
        if (cancelled) return;
        try {
          if (audioCtx && audioCtx.state === "suspended") void audioCtx.resume();
        } catch {
          // ignore
        }
        setStarting(false);
        void decodeLoop(video);
      } catch {
        if (!cancelled) {
          setStarting(false);
          setError(
            "Kamera tidak dapat diakses. Pastikan izin kamera diberikan dan gunakan HTTPS atau localhost."
          );
        }
      }
    };

    void start();

    return () => {
      cancelled = true;
      if (timerRef.current) window.clearTimeout(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      workerRef.current?.terminate();
      workerRef.current = null;
      pendingRef.current.clear();
    };
  }, []);

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200 bg-zinc-950">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2 text-zinc-200">
          <Camera size={16} strokeWidth={2.2} className="text-emerald-400" />
          <span className="text-[13px] font-medium">Scan dengan kamera</span>
        </div>
        <button
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-100"
        >
          <X size={15} strokeWidth={2.2} />
        </button>
      </div>

      <div className="relative mx-auto aspect-[4/3] w-full max-w-sm">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="relative h-1/3 w-[80%]">
            <span className="absolute -left-1 -top-1 h-4 w-4 border-l-2 border-t-2 border-emerald-400" />
            <span className="absolute -right-1 -top-1 h-4 w-4 border-r-2 border-t-2 border-emerald-400" />
            <span className="absolute -bottom-1 -left-1 h-4 w-4 border-b-2 border-l-2 border-emerald-400" />
            <span className="absolute -bottom-1 -right-1 h-4 w-4 border-b-2 border-r-2 border-emerald-400" />
          </div>
        </div>
        {starting && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-zinc-950 text-zinc-300">
            <Video size={28} strokeWidth={2} className="animate-pulse text-emerald-400" />
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
