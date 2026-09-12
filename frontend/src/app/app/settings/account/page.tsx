import { useEffect, useRef, useState } from "react";
import { useUserSignature, useUpsertUserSignature, useDeleteUserSignature, useUpdateMe } from "@/lib/api/query";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormPage, FormSection, FormGrid } from "@/components/ui/form-page";
import { toast } from "sonner";

export default function AccountSignaturePage() {
  const { user } = useSession();
  const { data: sig, isLoading } = useUserSignature();
  const upsert = useUpsertUserSignature();
  const del = useDeleteUserSignature();
  const updateMe = useUpdateMe();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [accountForm, setAccountForm] = useState({ name: "", email: "", phone: "" });
  const [passwordForm, setPasswordForm] = useState({ password: "", confirm: "" });

  const [livePreview, setLivePreview] = useState<string | null>(null);

  const clearCanvas = () => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    setHasDrawn(false);
    setLivePreview(null);
  };

  const getTrimmedDataUrl = (canvas: HTMLCanvasElement): string => {
    const ctx = canvas.getContext("2d")!;
    const { width, height } = canvas;
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    let minX = width, minY = height, maxX = 0, maxY = 0;
    let found = false;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const a = data[idx + 3];
        const r = data[idx], g = data[idx + 1], b = data[idx + 2];
        const isTransparent = a < 10;
        const isWhite = r > 250 && g > 250 && b > 250 && a > 200;
        if (!isTransparent && !isWhite) {
          found = true;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (!found) return canvas.toDataURL("image/png");
    const pad = 8;
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(width - 1, maxX + pad);
    maxY = Math.min(height - 1, maxY + pad);
    const w = maxX - minX + 1;
    const h = maxY - minY + 1;
    const tmp = document.createElement("canvas");
    tmp.width = w;
    tmp.height = h;
    const tCtx = tmp.getContext("2d")!;
    tCtx.drawImage(canvas, minX, minY, w, h, 0, 0, w, h);
    return tmp.toDataURL("image/png");
  };

  useEffect(() => {
    clearCanvas();
  }, []);

  useEffect(() => {
    if (sig?.signatureData) setLivePreview(sig.signatureData);
  }, [sig?.signatureData]);

  useEffect(() => {
    if (user) {
      setAccountForm({ name: user.name ?? "", email: user.email ?? "", phone: (user as any).phone ?? "" });
    }
  }, [user?.name, user?.email, (user as any)?.phone]);

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    if ("touches" in e) {
      const t = (e as React.TouchEvent).touches[0];
      return { x: t.clientX - rect.left, y: t.clientY - rect.top };
    }
    const m = e as React.MouseEvent;
    return { x: m.clientX - rect.left, y: m.clientY - rect.top };
  };

  const start = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsDrawing(true);
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    const { x, y } = getPos(e);
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo((x * c.width) / c.getBoundingClientRect().width, (y * c.height) / c.getBoundingClientRect().height);
  };
  const move = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    const { x, y } = getPos(e);
    const rect = c.getBoundingClientRect();
    ctx.lineTo((x * c.width) / rect.width, (y * c.height) / rect.height);
    ctx.stroke();
    setHasDrawn(true);
  };
  const end = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.closePath();
    try {
      const trimmed = getTrimmedDataUrl(c);
      // hanya update jika ada coretan
      const isEmpty = trimmed === c.toDataURL("image/png") && !hasDrawn;
      if (!isEmpty) setLivePreview(trimmed);
    } catch {}
  };

  const handleSave = async () => {
    const c = canvasRef.current;
    if (!c) return;
    if (!hasDrawn) {
      toast.error("Gambar tanda tangan terlebih dahulu.");
      return;
    }
    const dataUrl = getTrimmedDataUrl(c);
    if (dataUrl.length > 1 * 1024 * 1024) {
      toast.error("Signature terlalu besar, coba gambar lebih kecil.");
      return;
    }
    try {
      await upsert.mutateAsync(dataUrl);
      toast.success("Signature disimpan — background transparan & pas ukuran.");
    } catch (e: any) {
      toast.error(e.message || "Gagal menyimpan signature.");
    }
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1 * 1024 * 1024) {
      toast.error("File terlalu besar (max 1MB).");
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("File harus gambar.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      const c = canvasRef.current;
      if (!c) return;
      const ctx = c.getContext("2d")!;
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, c.width, c.height);
        // contain, background transparan biar pas ukuran
        const scale = Math.min(c.width / img.width, c.height / img.height) * 0.9;
        const w = img.width * scale;
        const h = img.height * scale;
        const x = (c.width - w) / 2;
        const y = (c.height - h) / 2;
        ctx.drawImage(img, x, y, w, h);
        setHasDrawn(true);
        try {
          setLivePreview(getTrimmedDataUrl(c));
        } catch {}
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleDelete = async () => {
    if (!confirm("Hapus signature?")) return;
    try {
      await del.mutateAsync();
      toast.success("Signature dihapus.");
      clearCanvas();
    } catch (e: any) {
      toast.error(e.message || "Gagal menghapus.");
    }
  };

  const handleSaveAccount = async () => {
    if (!accountForm.name.trim() || !accountForm.email.trim()) {
      toast.error("Nama dan email wajib diisi.");
      return;
    }
    try {
      await updateMe.mutateAsync({ name: accountForm.name.trim(), email: accountForm.email.trim(), phone: accountForm.phone.trim() || null } as any);
      toast.success("Account diperbarui. Silakan refresh jika nama belum berubah di header.");
    } catch (e: any) {
      toast.error(e.message || "Gagal menyimpan account.");
    }
  };

  const handleSavePassword = async () => {
    if (!passwordForm.password) {
      toast.error("Password baru wajib diisi.");
      return;
    }
    if (passwordForm.password.length < 6) {
      toast.error("Password minimal 6 karakter.");
      return;
    }
    if (passwordForm.password !== passwordForm.confirm) {
      toast.error("Konfirmasi password tidak cocok.");
      return;
    }
    try {
      await updateMe.mutateAsync({ password: passwordForm.password } as any);
      toast.success("Password diperbarui.");
      setPasswordForm({ password: "", confirm: "" });
    } catch (e: any) {
      toast.error(e.message || "Gagal menyimpan password.");
    }
  };

  const { isSystem } = useSession() as any;
  if (isSystem) {
    return <div className="py-20 text-center text-muted-foreground">Administrator tidak memiliki akses My Account.</div>;
  }
  if (isLoading) return <div className="py-20 text-center text-muted-foreground">Loading…</div>;
  if (!user) return <div className="py-20 text-center text-muted-foreground">Tidak terautentikasi.</div>;

  const previewUrl = hasDrawn && livePreview ? livePreview : sig?.signatureData ?? null;
  const previewDate = new Date().toLocaleDateString("id-ID");

  return (
    <>
      <FormPage
        title="My Account"
        actions={
          <div className="flex items-center gap-2">
            {sig && (
              <Button variant="destructive" size="sm" onClick={handleDelete} disabled={del.isPending}>
                Delete Signature
              </Button>
            )}
          </div>
        }
      >
        <FormSection title="Account Information" description="Perbarui nama, email, dan telepon Anda. Email harus unik.">
          <FormGrid>
            <Input label="Nama" value={accountForm.name} onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })} placeholder="Nama lengkap" />
            <Input label="Email" type="email" value={accountForm.email} onChange={(e) => setAccountForm({ ...accountForm, email: e.target.value })} placeholder="email@contoh.com" />
            <Input label="Telp" value={accountForm.phone} onChange={(e) => setAccountForm({ ...accountForm, phone: e.target.value })} placeholder="08xxxxxxxxxx" />
            <div className="flex items-end">
              <Button size="sm" onClick={handleSaveAccount} disabled={updateMe.isPending}>
                {updateMe.isPending ? "Saving..." : "Save Account"}
              </Button>
            </div>
          </FormGrid>
        </FormSection>

        <FormSection title="Change Password" description="Kosongkan jika tidak ingin mengganti password.">
          <FormGrid>
            <Input label="Password Baru" type="password" value={passwordForm.password} onChange={(e) => setPasswordForm({ ...passwordForm, password: e.target.value })} placeholder="Minimal 6 karakter" />
            <Input label="Konfirmasi Password" type="password" value={passwordForm.confirm} onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })} placeholder="Ulangi password" />
            <div className="flex items-end">
              <Button size="sm" onClick={handleSavePassword} disabled={updateMe.isPending}>
                Update Password
              </Button>
            </div>
          </FormGrid>
        </FormSection>

        <FormSection title="Signature per Account" description="Tanda tangan digital Anda — digunakan untuk Prepared By & Approved By di dokumen PO. Gambar di canvas atau upload gambar.">
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium">Current Signature</label>
              {sig?.signatureData ? (
                <div className="rounded-lg border border-border bg-white p-4">
                  <img src={sig.signatureData} alt="Current signature" className="mx-auto max-h-32 w-auto object-contain" />
                  <p className="mt-2 text-center text-xs text-muted-foreground">Updated {sig.updatedAt ? new Date(sig.updatedAt).toLocaleString("id-ID") : ""}</p>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Belum ada signature</div>
              )}
              <div className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">User: {user?.name} ({user?.email}) — signature disimpan per account.</div>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium">Draw Signature</label>
              <div
                className="rounded-lg border border-border bg-white p-2"
                style={{
                  backgroundImage: "radial-gradient(circle, #e5e7eb 1px, transparent 1px)",
                  backgroundSize: "18px 18px",
                  backgroundPosition: "0 0",
                }}
              >
                <canvas
                  ref={canvasRef}
                  width={400}
                  height={160}
                  className="h-40 w-full cursor-crosshair touch-none rounded bg-transparent"
                  onMouseDown={start}
                  onMouseMove={move}
                  onMouseUp={end}
                  onMouseLeave={end}
                  onTouchStart={start}
                  onTouchMove={move}
                  onTouchEnd={end}
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={clearCanvas}>Clear</Button>
                <Button size="sm" onClick={handleSave} disabled={upsert.isPending || !hasDrawn}>
                  {upsert.isPending ? "Saving..." : "Save Signature"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                  Upload Image
                </Button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Gambar atau upload, lalu Save. Format PNG data URL, max 1MB.</p>
            </div>
          </div>
          <div className="mt-8">
            <label className="mb-2 block text-sm font-medium">Preview di Dokumen</label>
            <p className="mb-3 text-xs text-muted-foreground">Pratinjau seperti akan ditempel di dokumen PO (garis + nama + tanggal).</p>
            <div className="flex justify-center rounded-lg border border-border bg-white p-8">
              <div className="flex flex-col items-center">
                <div className="flex h-[64px] w-[220px] items-center justify-center">
                  {previewUrl ? (
                    <img src={previewUrl} alt="Preview signature" className="max-h-[64px] max-w-[220px] object-contain" />
                  ) : (
                    <span className="text-xs text-muted-foreground">— belum ada —</span>
                  )}
                </div>
                <div className="mt-2 h-px w-[220px] bg-zinc-900" />
                <div className="mt-2 text-[11px] font-medium text-black">{user?.name ?? "-"}</div>
                <div className="text-[10px] text-zinc-600">{previewDate}</div>
              </div>
            </div>
          </div>
        </FormSection>
      </FormPage>
    </>
  );
}
