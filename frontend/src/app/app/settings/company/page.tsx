import { useEffect, useState, useRef } from "react";
import { Building2, Loader2, Save, CheckCircle2, XCircle, Upload, Trash2 } from "lucide-react";
import { useCompanySettings, useUpdateCompanySettings } from "@/lib/api/query";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { FormPage, FormSection, FormGrid } from "@/components/ui/form-page";
import { ROLE_ADMINISTRATOR } from "@/lib/roles";
import { toast } from "sonner";

const COUNTRIES = ["Indonesia", "Malaysia", "Singapore", "Thailand", "Vietnam", "Philippines", "Japan", "China", "USA"];
const CURRENCIES = ["IDR", "USD", "EUR", "SGD", "JPY", "CNY", "MYR", "THB", "AUD"];
const TIMEZONES = ["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura", "Asia/Singapore", "Asia/Tokyo", "Asia/Shanghai", "America/New_York", "Europe/London"];
const FISCAL_YEARS = [
  { value: "JANUARY_DECEMBER", label: "January – December" },
  { value: "APRIL_MARCH", label: "April – March" },
  { value: "JULY_JUNE", label: "July – June" },
];

export default function CompanySettingsPage() {
  const { data, isLoading } = useCompanySettings();
  const update = useUpdateCompanySettings();
  const [form, setForm] = useState<any>({});
  const [snapshot, setSnapshot] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (data) {
      const init = {
        companyName: data.companyName ?? "",
        companyCode: data.companyCode ?? "",
        address: data.address ?? "",
        taxId: data.taxId ?? "",
        phone: (data as any).phone ?? "",
        email: (data as any).email ?? "",
        website: (data as any).website ?? "",
        country: data.country ?? "Indonesia",
        baseCurrency: data.baseCurrency ?? "IDR",
        timezone: data.timezone ?? "Asia/Jakarta",
        fiscalYear: data.fiscalYear ?? "JANUARY_DECEMBER",
        logo: data.logo ?? null,
      };
      setForm(init);
      setSnapshot(JSON.stringify(init));
    }
  }, [data]);

  const dirty = JSON.stringify(form) !== snapshot;

  // Kompres logo via canvas agar tidak trigger 413 Payload Too Large.
  // Base64 menambah ~33% ukuran -> 4MB file = ~5.3MB JSON > limit nginx 1MB & express 10MB.
  // Kita resize max 512px dan export JPEG/WebP ~0.8 quality, target <500KB.
  const compressImageToDataUrl = (file: File, maxDim = 512, quality = 0.8): Promise<string> =>
    new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          const ratio = Math.min(maxDim / w, maxDim / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          URL.revokeObjectURL(url);
          reject(new Error("Canvas tidak support"));
          return;
        }
        // putihkan background untuk JPEG (jaga logo transparan tetap terlihat)
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        // PNG dengan transparansi: pertahankan PNG, selain itu JPEG lebih kecil
        const isPng = file.type === "image/png";
        const mime = isPng ? "image/png" : "image/jpeg";
        try {
          const dataUrl = canvas.toDataURL(mime, quality);
          resolve(dataUrl);
        } catch (e) {
          reject(e as Error);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Gagal memuat gambar"));
      };
      img.src = url;
    });

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // reset agar pilih file sama tetap trigger onChange
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("File harus gambar.");
      return;
    }
    // file mentah >4MB sudah kita tolak sebelum kompres (hindari OOM), tapi kompres akan turunkan <500KB
    if (file.size > 4 * 1024 * 1024) {
      toast.error("Logo terlalu besar (max 4MB sebelum kompres). Silakan pilih file <4MB.");
      return;
    }
    try {
      let dataUrl: string;
      // SVG tidak perlu kompres canvas
      if (file.type === "image/svg+xml") {
        const reader = new FileReader();
        dataUrl = await new Promise<string>((res, rej) => {
          reader.onload = () => res(String(reader.result));
          reader.onerror = () => rej(new Error("Gagal baca file"));
          reader.readAsDataURL(file);
        });
      } else {
        dataUrl = await compressImageToDataUrl(file, 512, 0.8);
        // jika hasil masih >1MB, coba ulang dengan dimensi lebih kecil & quality lebih rendah
        if (dataUrl.length > 1 * 1024 * 1024) {
          dataUrl = await compressImageToDataUrl(file, 256, 0.7);
        }
      }
      if (dataUrl.length > 5 * 1024 * 1024) {
        toast.error("Logo masih terlalu besar (>5MB setelah kompres). Gunakan gambar lebih kecil.");
        return;
      }
      if (dataUrl.length > 500 * 1024) {
        toast.message(`Logo ${Math.round(dataUrl.length / 1024)}KB — disarankan <500KB agar cetak cepat.`);
      }
      setForm((prev: any) => ({ ...prev, logo: dataUrl }));
    } catch (err: any) {
      toast.error(err?.message || "Gagal memproses logo.");
    }
  };

  const compressDataUrl = (dataUrl: string, maxDim = 512, quality = 0.8): Promise<string> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > maxDim || h > maxDim) {
          const r = Math.min(maxDim / w, maxDim / h);
          w = Math.round(w * r); h = Math.round(h * r);
        }
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("Canvas tidak support")); return; }
        ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        try { resolve(canvas.toDataURL("image/jpeg", quality)); } catch (e) { reject(e as Error); }
      };
      img.onerror = () => reject(new Error("Gagal kompres logo lama"));
      img.src = dataUrl;
    });

  const handleSave = async () => {
    if (!form.companyName?.trim() || !form.companyCode?.trim()) {
      toast.error("Company Name dan Company Code wajib diisi.");
      return;
    }
    // Auto-kompres logo lama yang kelewat besar (mis. sudah tersimpan 5MB sebelum fix) agar save tidak selalu 413
    let logoToSend: string | null = form.logo || null;
    if (logoToSend && logoToSend.startsWith("data:image/") && logoToSend.length > 1 * 1024 * 1024) {
      try {
        toast.message("Logo lama terlalu besar, mengompres...");
        logoToSend = await compressDataUrl(logoToSend, 512, 0.8);
        if (logoToSend.length > 1 * 1024 * 1024) logoToSend = await compressDataUrl(logoToSend, 256, 0.7);
        if (logoToSend.length > 5 * 1024 * 1024) {
          toast.error("Logo masih >5MB setelah kompres. Klik Remove lalu upload ulang logo <500KB.");
          return;
        }
        // update form state agar snapshot sinkron setelah sukses
        setForm((prev: any) => ({ ...prev, logo: logoToSend }));
      } catch {
        toast.error("Gagal mengompres logo lama. Hapus logo lalu upload ulang.");
        return;
      }
    }
    try {
      await update.mutateAsync({
        companyName: form.companyName.trim(),
        companyCode: form.companyCode.trim().toUpperCase(),
        address: form.address?.trim() || null,
        taxId: form.taxId?.trim() || null,
        phone: form.phone?.trim() || null,
        email: form.email?.trim() || null,
        website: form.website?.trim() || null,
        country: form.country,
        baseCurrency: form.baseCurrency,
        timezone: form.timezone,
        fiscalYear: form.fiscalYear,
        logo: logoToSend,
      });
      toast.success("Company settings disimpan.");
      setSnapshot(JSON.stringify(form));
    } catch (e: any) {
      toast.error(e.message || "Gagal menyimpan.");
    }
  };

  if (isLoading) {
    return (
      <RoleGuard roles={[ROLE_ADMINISTRATOR]} menus={["settings.company"]}>
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-10">
          <Loader2 size={16} className="animate-spin" /> Memuat...
        </div>
      </RoleGuard>
    );
  }

  return (
    <RoleGuard roles={[ROLE_ADMINISTRATOR]} menus={["settings.company"]}>
      <FormPage
        title="Company Settings"
        titleBadge={dirty ? <span className="text-xs text-amber-600">Not save</span> : null}
        actions={
          <Button size="sm" onClick={handleSave} disabled={update.isPending || !dirty}>
            {update.isPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} strokeWidth={2} />}
            {update.isPending ? "Saving..." : "Save"}
          </Button>
        }
      >
        {/* Global Label */}
        <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
          <Building2 size={14} /> Global • SYS_ADMIN only
        </div>

        {/* Company */}
        <FormSection title="Company">
          <FormGrid>
            <Input
              label="Company Name"
              placeholder="Estoq"
              value={form.companyName || ""}
              onChange={(e) => setForm({ ...form, companyName: e.target.value })}
            />
            <Input
              label="Company Code"
              placeholder="ESTOQ"
              value={form.companyCode || ""}
              onChange={(e) => setForm({ ...form, companyCode: e.target.value.toUpperCase() })}
            />
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium leading-none">Address</label>
              <Textarea
                placeholder="Jl. Contoh No. 123, Jakarta"
                value={form.address || ""}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                rows={2}
              />
            </div>
            <Input
              label="Tax ID"
              placeholder="NPWP / Tax ID"
              value={form.taxId || ""}
              onChange={(e) => setForm({ ...form, taxId: e.target.value })}
            />
            <Input
              label="Phone"
              placeholder="+62 21 1234 5678"
              value={form.phone || ""}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
            <Input
              label="Email"
              placeholder="info@company.com"
              value={form.email || ""}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            <Input
              label="Website"
              placeholder="https://company.com"
              value={form.website || ""}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
            />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium leading-none">Company Logo</label>
              <div className="flex items-center gap-3">
                {form.logo ? (
                  <img src={form.logo} alt="Logo" className="h-12 w-12 rounded border border-border object-contain bg-white" />
                ) : (
                  <div className="h-12 w-12 rounded border border-dashed border-border flex items-center justify-center text-muted-foreground">
                    <Building2 size={16} />
                  </div>
                )}
                <div className="flex flex-col gap-1">
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
                  <div className="flex gap-1.5">
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => fileRef.current?.click()}>
                      <Upload size={12} /> Upload
                    </Button>
                    {form.logo && (
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setForm({ ...form, logo: null })}>
                        <Trash2 size={12} /> Remove
                      </Button>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">PNG/JPG max 4MB → auto-kompres ke &lt;500KB (512px) agar tidak 413, dipakai di setiap dokumen cetak.</p>
                </div>
              </div>
            </div>
          </FormGrid>
        </FormSection>

        {/* Regional & Localization */}
        <FormSection title="Regional & Localization">
          <FormGrid>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium leading-none">Country</label>
              <NativeSelect value={form.country || "Indonesia"} onChange={(e) => setForm({ ...form, country: e.target.value })}>
                {COUNTRIES.map((c) => (
                  <NativeSelectOption key={c} value={c}>
                    {c}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium leading-none">Base Currency</label>
              <NativeSelect value={form.baseCurrency || "IDR"} onChange={(e) => setForm({ ...form, baseCurrency: e.target.value })}>
                {CURRENCIES.map((c) => (
                  <NativeSelectOption key={c} value={c}>
                    {c}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <p className="text-[11px] text-muted-foreground">Default Currency untuk PO baru.</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium leading-none">Timezone</label>
              <NativeSelect value={form.timezone || "Asia/Jakarta"} onChange={(e) => setForm({ ...form, timezone: e.target.value })}>
                {TIMEZONES.map((tz) => (
                  <NativeSelectOption key={tz} value={tz}>
                    {tz}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          </FormGrid>
        </FormSection>

        {/* Fiscal */}
        <FormSection title="Fiscal">
          <FormGrid>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium leading-none">Fiscal Year</label>
              <NativeSelect value={form.fiscalYear || "JANUARY_DECEMBER"} onChange={(e) => setForm({ ...form, fiscalYear: e.target.value })}>
                {FISCAL_YEARS.map((f) => (
                  <NativeSelectOption key={f.value} value={f.value}>
                    {f.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          </FormGrid>
        </FormSection>
      </FormPage>
    </RoleGuard>
  );
}
