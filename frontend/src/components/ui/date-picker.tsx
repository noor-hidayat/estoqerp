import * as React from "react"
import { format, parse, parseISO, isValid } from "date-fns"
import { Calendar as CalendarIcon } from "lucide-react"
import { Calendar } from "@/components/ui/calendar"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

const DISPLAY = "dd-MM-yyyy"

const DATE_FORMATS = [
  "ddMMyy",
  "ddMMyyyy",
  "dd-MM-yyyy",
  "dd/MM/yyyy",
  "dd MM yyyy",
]

function parseDateInput(raw: string): Date | null {
  const s = raw.trim()
  if (!s) return null
  for (const f of DATE_FORMATS) {
    const d = parse(s, f, new Date())
    if (isValid(d)) return d
  }
  return null
}

export function DatePicker({
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
  const [text, setText] = React.useState(value ? format(parseISO(value), DISPLAY) : "")
  const [month, setMonth] = React.useState<Date | undefined>(
    value ? parseISO(value) : undefined
  )

  const date = value ? parseISO(value) : undefined
  const formatted = date ? format(date, DISPLAY) : ""
  const display = focused ? text : formatted

  React.useEffect(() => {
    if (value) {
      const d = parseISO(value)
      if (isValid(d)) {
        setText(format(d, DISPLAY))
        setMonth(d)
      }
    } else {
      setText("")
    }
  }, [value])

  const applyDate = (d: Date) => {
    onChange(format(d, "yyyy-MM-dd"))
  }

  const handleFocus = () => {
    setFocused(true)
    setText(formatted)
  }

  const handleBlur = () => {
    setFocused(false)
    const d = parseDateInput(text)
    if (d) applyDate(d)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      const d = parseDateInput(text)
      if (d) applyDate(d)
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
            <CalendarIcon
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
        <PopoverContent className="w-auto animate-pop-in p-0" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
          <Calendar
            mode="single"
            selected={date}
            month={month}
            onMonthChange={setMonth}
            onSelect={(d) => {
              if (d) {
                applyDate(d)
                setOpen(false)
              }
            }}
            defaultMonth={date}
          />
          <div className="border-t border-border p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs"
              onClick={() => {
                applyDate(new Date())
                setOpen(false)
              }}
            >
              Today
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}