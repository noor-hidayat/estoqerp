"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, CheckCircle2, Loader2, Save, XCircle } from "lucide-react";
import { api } from "@/lib/api/client";
import { PageHeader } from "@/components/ui/page-header";
import { RoleGuard } from "@/components/ui/role-guard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { MANAGER_ROLES } from "@/lib/roles";

interface AiSettingsForm {
  enabled: boolean;
  defaultProvider: "GOOGLE" | "DEEPSEEK";
  googleApiKey: string;
  googleModel: string;
  deepseekApiKey: string;
  deepseekModel: string;
}

interface AiModels {
  GOOGLE: string[];
  DEEPSEEK: string[];
}

const KEY_MASK = "••••••••";

const EMPTY: AiSettingsForm = {
  enabled: false,
  defaultProvider: "GOOGLE",
  googleApiKey: "",
  googleModel: "gemini-3.5-flash",
  deepseekApiKey: "",
  deepseekModel: "deepseek-chat",
};

export default function AiSettingsPage() {
  const [form, setForm] = useState<AiSettingsForm>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [googleKeyEdited, setGoogleKeyEdited] = useState(false);
  const [deepseekKeyEdited, setDeepseekKeyEdited] = useState(false);
  const [models, setModels] = useState<AiModels | null>(null);
  const original = useRef<AiSettingsForm | null>(null);

  useEffect(() => {
    let disposed = false;
    api
      .get<AiModels>("/ai/models")
      .then((m) => {
        if (!disposed) setModels(m);
      })
      .catch(() => {
        // daftar model tidak tersedia — field tetap bisa diisi manual
      });
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    api
      .get<AiSettingsForm>("/ai/settings")
      .then((s) => {
        if (!disposed) {
          setForm(s);
          original.current = s;
        }
      })
      .catch((e) => {
        if (!disposed) {
          setMessage({
            ok: false,
            text: e instanceof Error ? e.message : "Gagal memuat pengaturan.",
          });
        }
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => {
      disposed = true;
    };
  }, []);

  const set = <K extends keyof AiSettingsForm>(key: K, value: AiSettingsForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const payload: AiSettingsForm = {
        ...form,
        // Jika field key tidak disentuh dan sebelumnya terisi, kirim kembali
        // mask agar backend mempertahankan key lama.
        googleApiKey: googleKeyEdited
          ? form.googleApiKey
          : original.current?.googleApiKey
            ? KEY_MASK
            : form.googleApiKey,
        deepseekApiKey: deepseekKeyEdited
          ? form.deepseekApiKey
          : original.current?.deepseekApiKey
            ? KEY_MASK
            : form.deepseekApiKey,
      };
      const updated = await api.put<AiSettingsForm>("/ai/settings", payload);
      setForm(updated);
      original.current = updated;
      setGoogleKeyEdited(false);
      setDeepseekKeyEdited(false);
      setMessage({ ok: true, text: "Pengaturan AI berhasil disimpan." });
    } catch (e) {
      setMessage({
        ok: false,
        text: e instanceof Error ? e.message : "Gagal menyimpan pengaturan.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <RoleGuard roles={MANAGER_ROLES}>
      <div>
        <PageHeader
          eyebrow="Settings"
          title="AI Assistant"
          description="Konfigurasi provider AI untuk asisten analis Estoq. API key disimpan terenkripsi di database."
        />

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 size={16} strokeWidth={2} className="animate-spin" />
            Memuat pengaturan…
          </div>
        ) : (
          <div className="grid max-w-2xl gap-5">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Bot size={18} strokeWidth={2} className="text-primary" />
                  Umum
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">Aktifkan AI Assistant</p>
                    <p className="text-sm text-muted-foreground">
                      Jika nonaktif, widget chat tidak akan menjawab.
                    </p>
                  </div>
                  <Switch
                    checked={form.enabled}
                    onCheckedChange={(v) => set("enabled", v)}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium leading-none">
                      Provider Default
                    </label>
                    <NativeSelect
                      value={form.defaultProvider}
                      onChange={(e) =>
                        set("defaultProvider", e.target.value as AiSettingsForm["defaultProvider"])
                      }
                    >
                      <NativeSelectOption value="GOOGLE">Google Gemini (free tier)</NativeSelectOption>
                      <NativeSelectOption value="DEEPSEEK">DeepSeek</NativeSelectOption>
                    </NativeSelect>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Google Gemini</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="API Key"
                  type="password"
                  autoComplete="off"
                  placeholder={form.googleApiKey === KEY_MASK ? KEY_MASK : "Masukkan API key Google AI Studio"}
                  value={form.googleApiKey === KEY_MASK ? "" : form.googleApiKey}
                  onChange={(e) => {
                    setGoogleKeyEdited(true);
                    set("googleApiKey", e.target.value);
                  }}
                  hint="Kosongkan untuk menghapus key. Key aktif disembunyikan."
                />
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium leading-none">Model</label>
                  <NativeSelect
                    value={form.googleModel}
                    onChange={(e) => set("googleModel", e.target.value)}
                    className="h-10 w-full"
                  >
                    {!((models?.GOOGLE ?? []).includes(form.googleModel)) && (
                      <NativeSelectOption value={form.googleModel}>
                        {form.googleModel}
                      </NativeSelectOption>
                    )}
                    {(models?.GOOGLE ?? []).map((m) => (
                      <NativeSelectOption key={m} value={m}>
                        {m}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">DeepSeek</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="API Key"
                  type="password"
                  autoComplete="off"
                  placeholder={form.deepseekApiKey === KEY_MASK ? KEY_MASK : "Masukkan API key DeepSeek"}
                  value={form.deepseekApiKey === KEY_MASK ? "" : form.deepseekApiKey}
                  onChange={(e) => {
                    setDeepseekKeyEdited(true);
                    set("deepseekApiKey", e.target.value);
                  }}
                  hint="Kosongkan untuk menghapus key. Key aktif disembunyikan."
                />
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium leading-none">Model</label>
                  <NativeSelect
                    value={form.deepseekModel}
                    onChange={(e) => set("deepseekModel", e.target.value)}
                    className="h-10 w-full"
                  >
                    {!((models?.DEEPSEEK ?? []).includes(form.deepseekModel)) && (
                      <NativeSelectOption value={form.deepseekModel}>
                        {form.deepseekModel}
                      </NativeSelectOption>
                    )}
                    {(models?.DEEPSEEK ?? []).map((m) => (
                      <NativeSelectOption key={m} value={m}>
                        {m}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
              </CardContent>
            </Card>

            {message && (
              <p
                className={`flex items-center gap-2 text-sm ${
                  message.ok ? "text-emerald-600" : "text-destructive"
                }`}
              >
                {message.ok ? (
                  <CheckCircle2 size={15} strokeWidth={2} />
                ) : (
                  <XCircle size={15} strokeWidth={2} />
                )}
                {message.text}
              </p>
            )}

            <div>
              <Button onClick={save} disabled={saving}>
                {saving ? (
                  <Loader2 size={15} strokeWidth={2} className="animate-spin" />
                ) : (
                  <Save size={15} strokeWidth={2} />
                )}
                Simpan Pengaturan
              </Button>
            </div>
          </div>
        )}
      </div>
    </RoleGuard>
  );
}