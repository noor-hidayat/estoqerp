"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Barcode,
  SlidersHorizontal,
  CheckCircle,
  Stamp,
  SpinnerGap,
} from "@phosphor-icons/react";
import { useSession } from "@/lib/session";
import { BrandMark } from "@/components/app-shell/sidebar";

const FEATURES = [
  {
    icon: <SlidersHorizontal size={18} weight="bold" />,
    title: "Barcode dinamis berbasis segmen",
    desc: "Konfigurasi format barcode tanpa ubah kode program.",
  },
  {
    icon: <CheckCircle size={18} weight="bold" />,
    title: "Variance otomatis",
    desc: "Selisih stok sistem vs hitung fisik terdeteksi real-time.",
  },
  {
    icon: <Stamp size={18} weight="bold" />,
    title: "Workflow approval",
    desc: "Review supervisor sebelum data menjadi final.",
  },
];

const DEMO_ACCOUNTS = [
  { email: "raka.w@opname.id", label: "Admin" },
  { email: "nadia.p@opname.id", label: "Supervisor" },
  { email: "dimas.p@opname.id", label: "Staff Gudang" },
];

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading, signIn } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const next = searchParams.get("next");

  useEffect(() => {
    if (!loading && user) router.replace(next?.startsWith("/app") ? next : "/app");
  }, [user, loading, router, next]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("Email dan password wajib diisi.");
      return;
    }
    setSubmitting(true);
    setError("");
    const res = await signIn(email.trim(), password);
    setSubmitting(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    router.replace("/app");
  };

  return (
    <div className="grid min-h-[100dvh] lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden overflow-hidden bg-zinc-950 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg, transparent 0 59px, #fff 59px 60px), repeating-linear-gradient(0deg, transparent 0 59px, #fff 59px 60px)",
          }}
        />
        <div className="relative flex items-center gap-3 text-zinc-100">
          <BrandMark />
          <div className="leading-tight">
            <p className="text-[15px] font-semibold">StockOpname</p>
            <p className="text-[11px] text-zinc-400">Gudang Operations</p>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, type: "spring", stiffness: 220, damping: 26 }}
          className="relative max-w-md"
        >
          <p className="mb-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-emerald-400">
            <Barcode size={16} weight="bold" />
            Multi-cabang · Multi-gudang
          </p>
          <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight text-zinc-50">
            Opname stok yang terukur, tanpa menebak format barcode.
          </h1>
          <p className="mt-5 max-w-[46ch] text-[15px] leading-relaxed text-zinc-400">
            Kelola format barcode berbasis segmen, hitung fisik lewat scanner
            atau kamera HP, lalu tinjau selisih sebelum di-approve.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="relative flex flex-col gap-5"
        >
          {FEATURES.map((f) => (
            <div key={f.title} className="flex items-start gap-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5 text-emerald-400 ring-1 ring-white/10">
                {f.icon}
              </span>
              <div>
                <p className="text-[13.5px] font-medium text-zinc-100">
                  {f.title}
                </p>
                <p className="mt-0.5 text-[12.5px] text-zinc-500">{f.desc}</p>
              </div>
            </div>
          ))}
        </motion.div>
      </div>

      <div className="flex items-center justify-center px-5 py-12 sm:px-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 240, damping: 26 }}
          className="w-full max-w-md"
        >
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <BrandMark />
            <div className="leading-tight">
              <p className="text-[15px] font-semibold text-zinc-900">
                StockOpname
              </p>
              <p className="text-[11px] text-zinc-400">Gudang Operations</p>
            </div>
          </div>

          <h2 className="text-2xl font-semibold tracking-tight text-zinc-900">
            Masuk ke workspace
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-500">
            Gunakan akun yang dikelola oleh admin.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-[13px] font-medium text-zinc-700"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nama@opname.id"
                className="h-12 w-full rounded-xl border border-zinc-200 bg-white px-4 text-[14px] text-zinc-900 placeholder:text-zinc-400 transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              />
            </div>
            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-[13px] font-medium text-zinc-700"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-12 w-full rounded-xl border border-zinc-200 bg-white px-4 text-[14px] text-zinc-900 placeholder:text-zinc-400 transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              />
            </div>

            {error && (
              <p className="rounded-xl bg-red-50 px-3.5 py-2.5 text-[12.5px] text-red-600">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="mt-1 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-zinc-900 text-sm font-medium text-zinc-50 transition-all hover:bg-zinc-800 active:scale-[0.98] disabled:opacity-50"
            >
              {submitting ? (
                <SpinnerGap size={16} weight="bold" className="animate-spin" />
              ) : (
                <>
                  Masuk
                  <ArrowRight size={16} weight="bold" />
                </>
              )}
            </button>
          </form>

          <div className="mt-8 rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              Akun demo (password: StockOpname123!)
            </p>
            <div className="mt-2.5 flex flex-col gap-1.5">
              {DEMO_ACCOUNTS.map((a) => (
                <button
                  key={a.email}
                  type="button"
                  onClick={() => {
                    setEmail(a.email);
                    setPassword("StockOpname123!");
                  }}
                  className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left font-mono text-[12px] text-zinc-600 transition-colors hover:bg-zinc-100"
                >
                  <span className="truncate">{a.email}</span>
                  <span className="shrink-0 text-[10.5px] font-medium text-zinc-400">
                    {a.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <p className="mt-6 text-center text-[11.5px] leading-relaxed text-zinc-400">
            StockOpname untuk stock opname multi-cabang.
            <br />
            Gunakan keyboard-scanner, atau kamera HP pada mode mobile.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
