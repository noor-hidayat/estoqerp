"use client";

import { useEffect } from "react";
import { toast } from "@/components/ui/sonner";

/** Tampilkan error sebagai toast popup (tengah-atas) setiap kali nilai error
 *  berubah menjadi non-kosong. Dipakai menggantikan banner error inline. */
export function useErrorToast(error: string | null | undefined) {
  useEffect(() => {
    const msg = error?.trim();
    if (!msg) return;
    toast.error(msg);
  }, [error]);
}