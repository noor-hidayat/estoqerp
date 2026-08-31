import { useEffect, useRef, useState } from "react";
import { Bot, Copy, Check, Loader2, Plus, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/session";
import { AnswerContent } from "@/components/ai-chat/answer-render";
import { useChat, type ChatMessage } from "@/components/ai-chat/use-chat";
import { useActiveWorkspace } from "@/hooks/use-workspace";

const SUGGESTIONS = [
  "Berapa total item di master data?",
  "Ringkas saldo stok per gudang",
  "Stok apa yang paling banyak?",
  "Bagaimana progres proyek opname?",
];

export default function AiChatPage() {
  const { user } = useSession();
  const { activeId } = useActiveWorkspace();
  const { messages, busy, status, send, stop, reset } = useChat(activeId);
  const [input, setInput] = useState("");
  const [scrolled, setScrolled] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const handleScroll = () => {
    setScrolled((scrollRef.current?.scrollTop ?? 0) > 12);
  };

  const enabled = status?.enabled ?? false;
  const canSend = enabled && !busy;

  const autoGrow = () => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "0px";
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    }
  };

  const submit = () => {
    const text = input.trim();
    if (!text || !canSend) return;
    setInput("");
    requestAnimationFrame(() => autoGrow());
    void send(text);
    textareaRef.current?.focus();
  };

  return (
    <div className="flex h-full flex-col pb-[calc(72px+env(safe-area-inset-bottom))] lg:pb-0">
      <div className="relative min-h-0 flex-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={reset}
          title="Mulai percakapan baru (riwayat dihapus)"
          className="absolute right-4 top-2 z-20 h-8 w-8 rounded-full border border-border bg-background/85 text-muted-foreground shadow-sm backdrop-blur-md transition-colors hover:bg-muted hover:text-foreground sm:right-6"
        >
          <Plus size={16} strokeWidth={2} />
        </Button>
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="h-full overflow-y-auto"
        >
          <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-4 pb-4 pt-2">
          {messages.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 pb-12 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/60 text-primary-foreground shadow-lg">
                <Bot size={26} strokeWidth={2} />
              </div>
              <div>
                <p className="text-lg font-semibold tracking-tight">
                  Halo {user?.name?.split(" ")[0] ?? ""}, ada yang bisa dibantu?
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Tanya soal stok, barang, gudang, dan progres opname
                </p>
              </div>
              <div className="flex max-w-lg flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={!canSend}
                    onClick={() => void send(s)}
                    className="rounded-full border border-border bg-background px-3.5 py-1.5 text-xs text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {messages.map((m) => (
                <MessageBubble key={m.id} m={m} />
              ))}
            </div>
          )}
        </div>
        </div>
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-x-0 top-0 z-10 h-10 bg-gradient-to-b from-background to-transparent transition-opacity duration-300",
            scrolled ? "opacity-100" : "opacity-0"
          )}
        />
      </div>

      <div className="flex-shrink-0 border-t bg-background px-4 pb-4 pt-3 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-3xl border border-border bg-card p-3 shadow-sm transition focus-within:border-ring/60 focus-within:shadow-md">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                autoGrow();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="Tanya soal stok & opname…"
              disabled={!canSend}
              rows={1}
              className="max-h-[200px] min-h-[24px] w-full resize-none bg-transparent text-[15px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-60"
            />
            <div className="mt-2.5 flex items-center justify-end gap-2">
              {busy ? (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={stop}
                  title="Hentikan"
                  className="h-9 w-9 rounded-full"
                >
                  <Loader2 size={17} strokeWidth={2} className="animate-spin" />
                </Button>
              ) : (
                <Button
                  size="icon"
                  onClick={submit}
                  disabled={!canSend || !input.trim()}
                  title="Kirim"
                  className="h-9 w-9 rounded-full"
                >
                  <Send size={16} strokeWidth={2} />
                </Button>
)}
            </div>
          {!enabled ? (
            <p className="mt-2 text-center text-[11px] leading-relaxed text-muted-foreground">
              AI assistant belum dikonfigurasi. Hubungi admin untuk mengisi API key di
              Pengaturan → AI Assistant.
            </p>
          ) : (
            <p className="mt-1.5 text-center text-[10px] text-muted-foreground/70">
              AI dapat membuat kesalahan — cek kembali data penting.
            </p>
          )}
        </div>
      </div>
    </div>
    </div>
  );
}

function MessageBubble({ m }: { m: ChatMessage }) {
  const [copied, setCopied] = useState(false);

  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">
          {m.content}
        </p>
      </div>
    );
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(m.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard tidak tersedia */
    }
  };

  return (
    <div className="group flex items-start gap-3">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/60 text-primary-foreground shadow-sm">
        <Bot size={14} strokeWidth={2} />
      </span>
      <div className="relative min-w-0 flex-1">
        <div
          className={cn(
            "text-[15px] leading-relaxed text-foreground",
            m.error && "text-destructive"
          )}
        >
          {m.error ? (
            m.error
          ) : m.streaming && !m.content ? (
            <span className="flex items-center gap-1 py-1.5">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-foreground/50" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-foreground/50 [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-foreground/50 [animation-delay:300ms]" />
            </span>
          ) : m.content ? (
            <AnswerContent content={m.content} />
          ) : (
            "…"
          )}
          {m.streaming && m.content && (
            <span className="ml-0.5 inline-block h-4 w-[3px] animate-pulse rounded-sm bg-foreground/60 align-middle" />
          )}
        </div>
        {!m.streaming && !m.error && m.content && (
          <button
            type="button"
            onClick={copy}
            title="Salin jawaban"
            className="mt-1 inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
          >
            {copied ? <Check size={13} strokeWidth={2} /> : <Copy size={13} strokeWidth={2} />}
          </button>
        )}
      </div>
    </div>
  );
}