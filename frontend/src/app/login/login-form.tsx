"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Loader2, Lock, Mail } from "lucide-react";
import { useSession } from "@/lib/session";
import { BrandMark } from "@/components/app-shell/sidebar";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading, signIn } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const next = searchParams.get("next");

  useEffect(() => {
    if (!loading && user) router.replace(next?.startsWith("/app") ? next : "/app");
  }, [user, loading, router, next]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("Email and password are required.");
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
    <div className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-background px-5 py-12">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 left-1/2 h-96 w-[36rem] -translate-x-1/2 rounded-full bg-primary/[0.04] blur-3xl"
      />
      <div className="w-full max-w-sm animate-fade-up">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="rounded-2xl border border-border bg-card p-3 shadow-sm">
            <BrandMark className="h-9 w-9" />
          </div>
          <h1 className="mt-5 text-2xl font-semibold tracking-[-0.02em] text-foreground">
            Welcome back
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Sign in to start stock opname.
          </p>
        </div>

        <Card className="border-border/80 shadow-sm">
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label
                  htmlFor="email"
                  className="text-sm font-medium leading-none"
                >
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@opname.id"
                  icon={<Mail size={16} strokeWidth={2} />}
                  className="h-11"
                />
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="password"
                    className="text-sm font-medium leading-none"
                  >
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    <Lock size={16} strokeWidth={2} />
                  </span>
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="flex h-11 w-full rounded-md border border-input bg-transparent pl-10 pr-11 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center justify-center rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {showPassword ? (
                      <EyeOff size={16} strokeWidth={2} />
                    ) : (
                      <Eye size={16} strokeWidth={2} />
                    )}
                  </button>
                </div>
              </div>

              {error && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-[12.5px] text-destructive">
                  {error}
                </p>
              )}

              <Button
                type="submit"
                size="lg"
                disabled={submitting}
                className="mt-1 w-full"
              >
                {submitting ? (
                  <Loader2 size={16} strokeWidth={2} className="animate-spin" />
                ) : (
                  "Sign in"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Estoq · Stock Opname
        </p>
      </div>
    </div>
  );
}
