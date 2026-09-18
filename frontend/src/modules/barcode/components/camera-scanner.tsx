import { useEffect, useRef, useState } from "react";
import { Camera, Video, X } from "lucide-react";

const MAX_DECODE_WIDTH = 560;
const DEDUP_MS = 200;           // debounce barcode yang sama
const SCAN_COOLDOWN_MS = 1200;  // jeda setelah scan sukses sebelum scan berikutnya
const ROI_W_PCT = 0.80;         // lebar ROI = 80% frame (sesuai viewfinder)
const ROI_H_PCT = 0.45;         // tinggi ROI = 45% frame (sesuai viewfinder)

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
  const workerRef = useRef<Worker | null>(null);
  const workerBusyRef = useRef(false);
  const seqRef = useRef(0);
  const lastScanRef = useRef<{ text: string; at: number } | null>(null);
  const cooldownUntilRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(true);

  useEffect(() => {
    onScanRef.current = onScan;
  });

  useEffect(() => {
    let cancelled = false;

    const worker = new Worker(
      new URL("../workers/decode-worker.ts", import.meta.url),
      { type: "module" }
    );
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent<DecodeResponse>) => {
      const { text } = e.data;
      workerBusyRef.current = false;
      if (cancelled) return;
      if (!text) return;

      const now = Date.now();
      const last = lastScanRef.current;
      if (last && last.text === text && now - last.at < DEDUP_MS) return;

      // Jeda setelah scan sukses — abaikan deteksi selama cooldown.
      if (now < cooldownUntilRef.current) return;

      lastScanRef.current = { text, at: now };
      cooldownUntilRef.current = now + SCAN_COOLDOWN_MS;
      playBeep();
      onScanRef.current(text);
    };

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      setStarting(false);
      setError("Browser does not support canvas 2D.");
      return;
    }

    const sendFrame = (video: HTMLVideoElement) => {
      if (cancelled || workerBusyRef.current) return;
      if (
        video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
        video.videoWidth <= 0
      ) {
        return;
      }

      const vw = video.videoWidth;
      const vh = video.videoHeight;

      // ROI: tengah 80% x 45% — sesuai viewfinder overlay di UI
      const roiW = vw * ROI_W_PCT;
      const roiH = vh * ROI_H_PCT;
      const roiX = (vw - roiW) / 2;
      const roiY = (vh - roiH) / 2;

      const scale = Math.min(1, MAX_DECODE_WIDTH / roiW);
      canvas.width = Math.max(1, Math.floor(roiW * scale));
      canvas.height = Math.max(1, Math.floor(roiH * scale));

      ctx.drawImage(
        video,
        roiX, roiY, roiW, roiH,
        0, 0, canvas.width, canvas.height
      );

      let imageData: ImageData;
      try {
        imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      } catch {
        return;
      }

      workerBusyRef.current = true;
      const id = ++seqRef.current;
      worker.postMessage({ id, imageData }, [imageData.data.buffer]);
    };

    const video = videoRef.current;
    const schedule = () => {
      if (cancelled) return;
      if (!video) return;
      if (video.requestVideoFrameCallback) {
        video.requestVideoFrameCallback(() => {
          sendFrame(video);
          schedule();
        });
      } else {
        rafRef.current = requestAnimationFrame(() => {
          sendFrame(video);
          schedule();
        });
      }
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
        schedule();
      } catch {
        if (!cancelled) {
          setStarting(false);
          setError(
            "Camera cannot be accessed. Make sure camera permission is granted and use HTTPS or localhost."
          );
        }
      }
    };

    void start();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-background">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2 text-foreground">
          <Camera size={16} strokeWidth={2} className="text-primary" />
          <span className="text-[13px] font-medium">Scan with camera</span>
        </div>
        <button
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <X size={15} strokeWidth={2} />
        </button>
      </div>

      <div className="relative mx-auto aspect-video w-full max-w-md">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="relative h-1/3 w-[80%]">
            <span className="absolute -left-1 -top-1 h-4 w-4 border-l-2 border-t-2 border-emerald-600" />
            <span className="absolute -right-1 -top-1 h-4 w-4 border-r-2 border-t-2 border-emerald-600" />
            <span className="absolute -bottom-1 -left-1 h-4 w-4 border-b-2 border-l-2 border-emerald-600" />
            <span className="absolute -bottom-1 -right-1 h-4 w-4 border-b-2 border-r-2 border-emerald-600" />
          </div>
        </div>
        {starting && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background text-muted-foreground">
            <Video size={28} strokeWidth={2} className="animate-pulse text-emerald-600" />
            <span className="text-[13px]">Activating camera...</span>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-background px-6">
            <p className="text-center text-[13px] leading-relaxed text-amber-600">
              {error}
            </p>
          </div>
        )}
      </div>

      <p className="px-4 py-3 text-center text-[11.5px] text-muted-foreground">
        Point camera at barcode. Detected codes are automatically processed.
      </p>
    </div>
  );
}