import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function formatDate(iso?: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(iso?: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatTime(iso?: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatNumber(
  n: number | string | null | undefined,
  opts?: { minimumFractionDigits?: number; maximumFractionDigits?: number }
) {
  if (n == null || n === "") return "";
  const num = typeof n === "string" ? Number(n) : n;
  if (!Number.isFinite(num)) return "";
  const minimumFractionDigits = opts?.minimumFractionDigits ?? 0;
  const maximumFractionDigits = opts?.maximumFractionDigits ?? 3;
  return new Intl.NumberFormat("id-ID", {
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(num);
}

export function formatQty(n: number | string | null | undefined) {
  return formatNumber(n, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

/**
 * Format Rupiah: Rp 10.000 (desimal hanya muncul bila ada, maks 2 digit).
 */
export function formatIDR(n: number) {
  if (!Number.isFinite(n)) return "";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
}

/**
 * Format ringkas: 1.2K (ribu), 1.5M (juta), 2.3B (miliar).
 * < 1000 tetap pakai formatNumber biasa (id-ID).
 * Desimal maks 1 digit, trailing .0 dihapus (1500 -> 1.5K, 15000 -> 15K).
 */
export function formatCompact(n: number, decimals = 1) {
  if (!Number.isFinite(n)) return "";
  const abs = Math.abs(n);
  if (abs < 1000) return formatNumber(n);
  const units: Array<[number, string]> = [
    [1e12, "T"],
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  for (let i = 0; i < units.length; i++) {
    const [threshold, suffix] = units[i];
    if (abs >= threshold) {
      const val = n / threshold;
      let str = val.toFixed(decimals);
      str = str.replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
      // handle overflow pembulatan mis. 999.999K -> 1000K => naik ke 1M
      if (Math.abs(Number(str)) >= 1000 && i > 0) {
        const [higherThreshold, higherSuffix] = units[i - 1];
        const higherVal = n / higherThreshold;
        let higherStr = higherVal.toFixed(decimals);
        higherStr = higherStr.replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
        return `${higherStr}${higherSuffix}`;
      }
      return `${str}${suffix}`;
    }
  }
  return formatNumber(n);
}

/** Format id internal (ses_2608_0001) → tampilan rapi (SES-2608-0001). */
export function formatId(id?: string | number | null): string {
  if (id == null || id === "") return "";
  return String(id).toUpperCase().replace(/_/g, "-");
}

export function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);
}

export function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minutes ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hours ago`;
  const days = Math.round(hrs / 24);
  return `${days} days ago`;
}

/** Waktu relatif ringkas: just now, 1m, 5h, 3d, 2w, 4M, 1y */
export function timeAgo(iso?: string): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}M`;
  return `${Math.floor(days / 365)}y`;
}

export function hueBg(hue: number) {
  return `hsl(${hue} 60% 45%)`;
}
