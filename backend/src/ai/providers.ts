export type AiProviderName = "GOOGLE" | "DEEPSEEK";

export interface AiProviderConfig {
  provider: AiProviderName;
  apiKey: string;
  model: string;
}

export interface AiChatMessage {
  role: "user" | "assistant";
  content: string;
}

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const DEEPSEEK_BASE = "https://api.deepseek.com";
const REQUEST_TIMEOUT_MS = 180_000;

/** Model yang dikenal per provider — untuk pemilih model di widget chat. */
export const KNOWN_MODELS: Record<AiProviderName, string[]> = {
  GOOGLE: [
    "gemini-3.5-flash",
    "gemini-3.6-flash",
    "gemini-flash-latest",
    "gemini-flash-lite-latest",
    "gemini-3-flash-preview",
    "gemini-3.1-flash-lite",
  ],
  DEEPSEEK: ["deepseek-chat", "deepseek-reasoner"],
};

function buildSystemPrompt(dataContext: string): string {
  const lines = [
    'Kamu adalah "Sobat Stok", asisten AI untuk aplikasi StockOps (sistem manajemen stock opname & inventory).',
    "",
    "SCOPE:",
    "- Kamu HANYA menjawab pertanyaan seputar: stok barang, hasil opname, pergerakan stok (stock movement), laporan inventory, warehouse, dan data terkait proyek opname.",
    "- Jika user bertanya di luar topik ini (contoh: rekomendasi makanan, cuaca, obrolan umum), tolak dengan sopan dan arahkan kembali ke topik stok/inventory. Jangan menjawab pertanyaan di luar scope.",
    "",
    "DATA ACCESS:",
    "- Ambil data dari database/API StockOps sesuai konteks pertanyaan (item, warehouse, tanggal, project opname).",
    "- Jika data tidak tersedia atau item/warehouse tidak ditemukan, katakan dengan jelas — jangan mengarang angka.",
  ];
  if (dataContext) {
    lines.push(
      "",
      "Data aplikasi berikut adalah SNAPSHOT READ-ONLY (tidak bisa kamu ubah):",
      dataContext
    );
  } else {
    lines.push(
      "",
      "CATATAN: Data aplikasi TIDAK dimuat pada percakapan ini.",
      "Jika user menanyakan data stok/opname/laporan, katakan datanya tidak tersedia saat ini dan JANGAN mengarang angka."
    );
  }
  lines.push(
    "",
    "GAYA JAWABAN:",
    "- JANGAN gunakan Markdown tebal: tidak ada tanda bintang (**tebal**, *miring*), tidak ada header (# / ##), tidak ada tanda kutip kode (`). Gunakan teks polos: pisahkan baris, urutan pakai \"1. 2. 3.\" atau \"-\", tanpa bintang.",
    "- Kalau perlu tabel (laporan, list transaksi, stock movement), keluarkan sebagai tabel dengan format: baris header, baris pemisah (|---|), lalu baris data, TANPA bintang tebal di dalamnya. Tabel ini akan dirender sebagai tabel sungguhan, jadi pisahkan setiap tabel dengan baris kosong.",
    "- Default: jawaban singkat dan langsung ke angka/fakta yang diminta. Tidak perlu penjelasan panjang kecuali diminta detail/analisis.",
    "- Jangan otomatis mengaitkan setiap jawaban dengan \"opname\" kalau user tidak menanyakan soal opname — misalnya kalau user cuma tanya \"berapa stok item X\", jawab stoknya saja, tidak perlu selalu tampilkan data selisih opname/status approval kecuali relevan atau diminta.",
    "- Kalau user minta \"singkat\", langsung beri angka/fakta inti tanpa tabel/format tambahan kecuali memang cocok.",
    "- Kalau user minta analisis atau deteksi anomali, baru berikan penjelasan lebih detail (pola, tren, flag masalah).",
    "- Untuk pertanyaan progres/status proyek opname, gunakan data agregat di bagian progres_proyek (barang terscan vs total barang gudang, jumlah sesi, qty scan, status, entri). Persentase progress = barang terscan / total barang gudang. Jika total barang tidak tersedia (null/0), katakan datanya belum cukup — jangan membuat persentase sendiri.",
    "",
    "BAHASA:",
    "- Ikuti bahasa yang dipakai user (Indonesia/English), gunakan gaya santai tapi tetap informatif. Sesuaikan dengan data yang ada di sistem.",
    "- Kamu hanya boleh menganalisis; tidak boleh memberi instruksi yang mengubah data."
  );
  return lines.join("\n");
}

/** Parser SSE sederhana (mendukung baris "data:" dengan separator \n atau \n\n). */
async function sseParse(
  body: ReadableStream<Uint8Array>,
  onData: (json: unknown) => void
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        onData(JSON.parse(payload));
      } catch {
        // lewati baris yang tidak valid
      }
    }
  }
}

class ProviderHttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ProviderHttpError";
    this.status = status;
  }
}

async function providerError(res: Response): Promise<Error> {
  let detail = "";
  try {
    const raw = await res.text();
    try {
      const parsed = JSON.parse(raw) as {
        error?: { message?: string };
        message?: string;
      };
      detail = parsed.error?.message ?? parsed.message ?? raw;
    } catch {
      detail = raw;
    }
  } catch {
    // abaikan
  }
  return new ProviderHttpError(
    res.status,
    `Provider AI error (${res.status}): ${(detail || res.statusText).slice(0, 300)}`
  );
}

async function streamGoogle(
  cfg: AiProviderConfig,
  systemPrompt: string,
  messages: AiChatMessage[],
  onToken: (text: string) => void,
  signal: AbortSignal
): Promise<void> {
  const url = `${GEMINI_BASE}/models/${encodeURIComponent(cfg.model)}:streamGenerateContent?alt=sse`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": cfg.apiKey,
    },
    body: JSON.stringify({
      contents: messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
    }),
    signal,
  });
  if (!res.ok || !res.body) throw await providerError(res);

  await sseParse(res.body, (json) => {
    const chunk = Array.isArray(json) ? json[0] : json;
    const parts = (chunk as { candidates?: { content?: { parts?: { text?: string }[] } }[] })
      ?.candidates?.[0]?.content?.parts;
    if (!parts) return;
    for (const part of parts) {
      if (part?.text) onToken(part.text);
    }
  });
}

async function streamDeepSeek(
  cfg: AiProviderConfig,
  systemPrompt: string,
  messages: AiChatMessage[],
  onToken: (text: string) => void,
  signal: AbortSignal
): Promise<void> {
  const res = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      stream: true,
      temperature: 0.2,
    }),
    signal,
  });
  if (!res.ok || !res.body) throw await providerError(res);

  await sseParse(res.body, (json) => {
    const delta = (json as { choices?: { delta?: { content?: string } }[] })
      ?.choices?.[0]?.delta?.content;
    if (delta) onToken(delta);
  });
}

/** Stream jawaban AI; throw Error bila gagal. Retry otomatis untuk error
 *  transien (429/5xx) yang umum terjadi di free tier. */
export async function streamAiChat(
  cfg: AiProviderConfig,
  dataContext: string,
  messages: AiChatMessage[],
  onToken: (text: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const systemPrompt = buildSystemPrompt(dataContext);
  const attempt = async (): Promise<void> => {
    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    if (cfg.provider === "GOOGLE") {
      await streamGoogle(cfg, systemPrompt, messages, onToken, combined);
    } else {
      await streamDeepSeek(cfg, systemPrompt, messages, onToken, combined);
    }
  };

  for (let i = 0; ; i++) {
    try {
      await attempt();
      return;
    } catch (e) {
      const status = e instanceof ProviderHttpError ? e.status : 0;
      const transient = status === 429 || status === 500 || status === 502 || status === 503;
      if (!transient || i >= 2) throw e;
      await new Promise((r) => setTimeout(r, 2500 * (i + 1)));
    }
  }
}