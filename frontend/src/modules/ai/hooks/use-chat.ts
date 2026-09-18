import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api/client";
import { useSession } from "@/lib/session";
import { cleanAnswer } from "../components/answer-render";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  error?: string;
}

export interface AiStatus {
  enabled: boolean;
  defaultProvider: "GOOGLE" | "DEEPSEEK";
  googleModel: string;
  deepseekModel: string;
  googleKeySet: boolean;
  deepseekKeySet: boolean;
}

interface ChatEvent {
  type: "meta" | "token" | "done" | "error";
  text?: string;
  message?: string;
  provider?: string;
  model?: string;
}

let counter = 0;
const uid = () => `msg_${Date.now()}_${counter++}`;

const HISTORY_MAX = 100;

export function useChat(workspaceId?: string | null) {
  const { user } = useSession();
  const historyKey = user?.id ? `ai-chat-history-${user.id}:${workspaceId ?? "global"}` : null;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [modelId, setModelId] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    let disposed = false;
    const qs = workspaceId ? `?workspaceId=${workspaceId}` : "";
    api
      .get<AiStatus>(`/ai/status${qs}`)
      .then((s) => {
        if (!disposed) setStatus(s);
      })
      .catch(() => {
        // status tidak tersedia — widget tetap tampil
      });
    return () => {
      disposed = true;
    };
  }, [workspaceId]);

  // Model terpilih mengikuti pengaturan AI (settings) — provider default dengan key aktif.
  useEffect(() => {
    if (!status) return;
    const keyOk = (p: "GOOGLE" | "DEEPSEEK") =>
      p === "GOOGLE" ? status.googleKeySet : status.deepseekKeySet;
    const defModel = (p: "GOOGLE" | "DEEPSEEK") =>
      p === "GOOGLE" ? status.googleModel : status.deepseekModel;

    const pick = ((["GOOGLE", "DEEPSEEK"] as const).find((p) => keyOk(p)) ??
      status.defaultProvider);
    setModelId(`${pick}:${defModel(pick)}`);
  }, [status]);

  const send = useCallback(async (raw: string) => {
    const content = raw.trim();
    if (!content || busyRef.current) return;

    const [provider, model] = modelId.split(":") as ["GOOGLE" | "DEEPSEEK", string];

    const history = messages
      .filter((m) => !m.error)
      .map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, { id: uid(), role: "user", content }]);
    const assistantId = uid();
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", content: "", streaming: true },
    ]);
    busyRef.current = true;
    setBusy(true);

    const abort = new AbortController();
    abortRef.current = abort;

    const patch = (fn: (m: ChatMessage) => ChatMessage) =>
      setMessages((prev) => prev.map((m) => (m.id === assistantId ? fn(m) : m)));

    try {
      await api.stream<ChatEvent>(
        "/ai/chat",
        {
          messages: [...history, { role: "user", content }],
          provider,
          model,
          workspaceId: workspaceId ?? undefined,
        },
        (ev) => {
          if (ev.type === "token" && ev.text) {
            patch((m) => ({ ...m, content: m.content + cleanAnswer(ev.text ?? "") }));
          } else if (ev.type === "error") {
            patch((m) => ({
              ...m,
              streaming: false,
              error: ev.message ?? "Terjadi kesalahan.",
            }));
          } else if (ev.type === "done") {
            patch((m) => ({ ...m, content: cleanAnswer(m.content), streaming: false }));
          }
        },
        abort.signal
      );
    } catch (e) {
      const aborted = e instanceof DOMException && e.name === "AbortError";
      patch((m) => ({
        ...m,
        streaming: false,
        error: aborted
          ? "Percakapan dihentikan."
          : e instanceof Error
            ? e.message
            : "Terjadi kesalahan saat memproses pertanyaan.",
      }));
    } finally {
      busyRef.current = false;
      setBusy(false);
      abortRef.current = null;
    }
  }, [messages, modelId, workspaceId]);

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const reset = useCallback(() => {
    setMessages([]);
    if (historyKey) {
      try {
        localStorage.removeItem(historyKey);
      } catch {
        // abaikan
      }
    }
  }, [historyKey]);

  // Muat riwayat chat milik user (per akun, di browser ini).
  useEffect(() => {
    if (!historyKey) return;
    try {
      const raw = localStorage.getItem(historyKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return;
      const valid = parsed.filter(
        (m): m is ChatMessage =>
          !!m &&
          typeof m === "object" &&
          typeof (m as ChatMessage).content === "string" &&
          ((m as ChatMessage).role === "user" || (m as ChatMessage).role === "assistant")
      );
      if (valid.length > 0) setMessages(valid);
    } catch {
      // riwayat korup — abaikan
    }
  }, [historyKey]);

  // Simpan riwayat saat berubah (debounce).
  useEffect(() => {
    if (!historyKey || messages.length === 0) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(historyKey, JSON.stringify(messages.slice(-HISTORY_MAX)));
      } catch {
        // penyimpanan penuh — abaikan
      }
    }, 500);
    return () => clearTimeout(t);
  }, [messages, historyKey]);

  return { messages, busy, status, send, stop, reset };
}