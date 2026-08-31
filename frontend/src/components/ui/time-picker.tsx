import * as React from "react"
import { Clock } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"

function parseTimeInput(raw: string): { h: number; m: number; s: number } | null {
  const d = raw.replace(/\D/g, "")
  if (!d) return null
  let h = 0
  let m = 0
  let s = 0
  if (d.length <= 2) {
    h = Number(d)
  } else if (d.length <= 4) {
    h = Number(d.slice(0, 2))
    m = Number(d.slice(2))
  } else {
    h = Number(d.slice(0, 2))
    m = Number(d.slice(2, 4))
    s = Number(d.slice(4, 6))
  }
  if (h > 23 || m > 59 || s > 59) return null
  return { h, m, s }
}

function toSeconds(h: number, m: number, s: number) {
  return h * 3600 + m * 60 + s
}

function fromSeconds(t: number) {
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const s = t % 60
  return { h, m, s }
}

function toStr(h: number, m: number, s: number) {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

export function TimePicker({
  label,
  value,
  onChange,
  disabled,
  id,
}: {
  label?: string
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  id?: string
}) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [open, setOpen] = React.useState(false)
  const [focused, setFocused] = React.useState(false)
  const [text, setText] = React.useState(value || "")

  const parts = (value || "").split(":").map(Number)
  const secs = toSeconds(parts[0] || 0, parts[1] || 0, parts[2] || 0)
  const display = focused ? text : value || ""

  React.useEffect(() => {
    setText(value || "")
  }, [value])

  const commit = (h: number, m: number, s: number) => {
    onChange(toStr(h, m, s))
  }

  const handleFocus = () => {
    setFocused(true)
    setText(value || "")
  }

  const handleBlur = () => {
    setFocused(false)
    const p = parseTimeInput(text)
    if (p) commit(p.h, p.m, p.s)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      const p = parseTimeInput(text)
      if (p) commit(p.h, p.m, p.s)
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className="text-sm font-medium leading-none">
          {label}
        </label>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <div className="relative">
            <Clock
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              id={id}
              ref={inputRef}
              value={display}
              disabled={disabled}
              onFocus={handleFocus}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              onChange={(e) => setText(e.target.value)}
              className="h-8 w-full rounded-md border border-input bg-zinc-200/60 pl-9 pr-3 text-[13px] shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus:border-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
        </PopoverTrigger>
        <PopoverContent className="w-72 animate-pop-in p-4" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
          <Slider
            value={[secs]}
            min={0}
            max={86399}
            step={1}
            onValueChange={(v) => {
              const { h, m, s } = fromSeconds(v[0])
              commit(h, m, s)
            }}
          />
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>00:00:00</span>
            <span className="font-mono text-foreground">{value}</span>
            <span>23:59:59</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="mt-3 w-full text-xs"
            onClick={() => {
              const now = new Date()
              commit(now.getHours(), now.getMinutes(), now.getSeconds())
              setOpen(false)
            }}
          >
            Now
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  )
}