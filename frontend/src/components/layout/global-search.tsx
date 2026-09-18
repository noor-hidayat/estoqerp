import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, CornerDownLeft, ArrowUp, ArrowDown } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { ScrollArea } from "@/components/ui/scroll-area";
import { NAV, WAREHOUSE_NAV } from "./nav";

interface PageEntry {
  label: string;
  href: string;
  group: string;
}

function buildPages(): PageEntry[] {
  const out: PageEntry[] = [];
  for (const g of [...NAV, ...WAREHOUSE_NAV]) {
    for (const item of g.items) {
      out.push({ label: item.label, href: item.href, group: g.title });
      item.children?.forEach((c) =>
        out.push({
          label: `${item.label} / ${c.label}`,
          href: c.href,
          group: g.title,
        })
      );
    }
  }
  return out;
}

const PAGES = buildPages();

export function GlobalSearch() {
  const navigate = useNavigate();
  const router = { push: (to: string) => navigate(to), replace: (to: string) => navigate(to, { replace: true }), back: () => navigate(-1) } as any;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return PAGES;
    return PAGES.filter(
      (p) =>
        p.label.toLowerCase().includes(q) || p.href.toLowerCase().includes(q)
    );
  }, [query]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  // Shortcut global: Cmd/Ctrl + K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Autofocus saat dialog terbuka
  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open]);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  function onInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const sel = results[active];
      if (sel) go(sel.href);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group hidden h-9 items-center gap-2 rounded-lg border border-border bg-muted/40 pl-3 pr-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:flex"
      >
        <Search size={15} strokeWidth={2} />
        <span className="w-32 text-left">Cari halaman…</span>
        <Kbd className="bg-background">⌘K</Kbd>
      </button>

      {/* Tombol icon-only di layar kecil */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Cari halaman"
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted/40 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:hidden"
      >
        <Search size={16} strokeWidth={2} />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl gap-0 overflow-hidden p-0 sm:rounded-xl">
          <DialogTitle className="sr-only">Cari halaman</DialogTitle>

          <div className="flex items-center gap-2.5 border-b border-border px-4">
            <Search size={18} strokeWidth={2} className="shrink-0 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onInputKey}
              placeholder="Cari halaman di aplikasi…"
              className="h-12 border-0 bg-transparent px-0 text-[15px] shadow-none focus-visible:ring-0"
            />
          </div>

          <ScrollArea className="max-h-[60vh]">
            <div ref={listRef} className="p-2">
              {results.length === 0 ? (
                <p className="px-3 py-10 text-center text-sm text-muted-foreground">
                  Tidak ada halaman untuk “{query}”.
                </p>
              ) : (
                results.map((p, i) => (
                  <button
                    key={p.href + p.label}
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(p.href)}
                    className={cnRow(i === active)}
                  >
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block truncate text-[13.5px] font-medium text-foreground">
                        {p.label}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground">
                      {p.group}
                    </span>
                    {i === active && (
                      <CornerDownLeft
                        size={14}
                        strokeWidth={2}
                        className="shrink-0 text-muted-foreground"
                      />
                    )}
                  </button>
                ))
              )}
            </div>
          </ScrollArea>

          <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Kbd><ArrowUp size={11} /></Kbd>
              <Kbd><ArrowDown size={11} /></Kbd>
              untuk navigasi
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd><CornerDownLeft size={11} /></Kbd>
              pilih
            </span>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function cnRow(active: boolean) {
  return [
    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
    active ? "bg-accent" : "hover:bg-accent/60",
  ].join(" ");
}