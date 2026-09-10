"use client"

import * as React from "react"
import { Select as SelectPrimitive } from "@base-ui/react/select"
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { SearchableOption } from "@/components/ui/searchable-select"

interface ParsedOptions {
  options: SearchableOption[]
  placeholder: string | null
}

function getNodeText(node: React.ReactNode): string {
  if (node == null || node === false || node === true) return ""
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(getNodeText).join("")
  if (React.isValidElement(node)) return getNodeText((node.props as { children?: React.ReactNode }).children)
  return ""
}

function optionsFromChildren(children: React.ReactNode): ParsedOptions {
  let placeholder: string | null = null
  const options: SearchableOption[] = []
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return
    const props = child.props as React.OptionHTMLAttributes<HTMLOptionElement>
    if (typeof (props as { value?: unknown }).value !== "string") return
    const value = props.value as string
    const label = getNodeText(props.children).trim()
    if (value === "" && label !== "") {
      placeholder = label
    } else {
      options.push({ value, label })
    }
  })
  return { options, placeholder }
}

function NativeSelectTrigger({ className, size = "default", children, ...props }: SelectPrimitive.Trigger.Props & { size?: "sm" | "default" }) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "flex w-fit items-center justify-between gap-2 rounded-lg border border-input bg-zinc-100 dark:bg-zinc-800 px-3 py-2 text-sm whitespace-nowrap shadow-sm transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-placeholder:text-muted-foreground data-[size=default]:h-8 data-[size=sm]:h-7 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5 dark:bg-input/30 dark:hover:bg-input/50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "w-full",
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon>
        <ChevronDownIcon className="pointer-events-none size-4 text-muted-foreground" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

function NativeSelectContent({ className, children, side = "bottom", sideOffset = 4, align = "center", alignOffset = 0, alignItemWithTrigger = true, ...props }: SelectPrimitive.Popup.Props & Pick<SelectPrimitive.Positioner.Props, "align" | "alignOffset" | "side" | "sideOffset" | "alignItemWithTrigger">) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner side={side} sideOffset={sideOffset} align={align} alignOffset={alignOffset} alignItemWithTrigger={alignItemWithTrigger} className="isolate z-50">
        <SelectPrimitive.Popup
          data-slot="select-content"
          className={cn(
            "relative isolate z-50 max-h-(--available-height) w-(--anchor-width) min-w-36 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className
          )}
          {...props}
        >
          <SelectPrimitive.ScrollUpArrow className="top-0 z-10 flex w-full cursor-default items-center justify-center bg-popover py-1">
            <ChevronUpIcon className="size-4" />
          </SelectPrimitive.ScrollUpArrow>
          <SelectPrimitive.List>{children}</SelectPrimitive.List>
          <SelectPrimitive.ScrollDownArrow className="bottom-0 z-10 flex w-full cursor-default items-center justify-center bg-popover py-1">
            <ChevronDownIcon className="size-4" />
          </SelectPrimitive.ScrollDownArrow>
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  )
}

function NativeSelectItem({ className, children, ...props }: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex w-full cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SelectPrimitive.ItemText className="flex flex-1 shrink-0 gap-2 whitespace-nowrap">{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="pointer-events-none absolute right-2 flex size-4 items-center justify-center">
        <CheckIcon className="size-4" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  )
}

const NativeSelect = React.forwardRef<HTMLButtonElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, value, onChange, onBlur, disabled, id, name, ...rest }, ref) => {
    const selectId = id || name
    const { options, placeholder: detectedPlaceholder } = optionsFromChildren(children)
    const stringValue = value == null ? "" : String(value)
    const handleValueChange = (v: unknown) => {
      const str = v == null ? "" : String(v)
      onChange?.({ target: { value: str } } as unknown as React.ChangeEvent<HTMLSelectElement>)
    }
    return (
      <SelectPrimitive.Root value={stringValue} onValueChange={handleValueChange} disabled={disabled}>
        <NativeSelectTrigger id={selectId} ref={ref as React.Ref<HTMLButtonElement>} className={className} disabled={disabled} {...(rest as any)}>
          <SelectPrimitive.Value placeholder={detectedPlaceholder || "Select..."} />
        </NativeSelectTrigger>
        <NativeSelectContent>
          {options.length === 0 ? (
            <div className="px-2 py-6 text-center text-xs text-muted-foreground">No options</div>
          ) : (
            options.map((o) => (
              <NativeSelectItem key={o.value || `empty-${o.label}`} value={o.value}>
                {o.label || "—"}
              </NativeSelectItem>
            ))
          )}
        </NativeSelectContent>
      </SelectPrimitive.Root>
    )
  }
)
NativeSelect.displayName = "NativeSelect"

const NativeSelectOption = React.forwardRef<HTMLOptionElement, React.OptionHTMLAttributes<HTMLOptionElement>>(({ className, ...props }, ref) => (
  <option ref={ref} data-slot="native-select-option" className={cn("bg-background text-foreground", className)} {...props} />
))
NativeSelectOption.displayName = "NativeSelectOption"

export { NativeSelect, NativeSelectOption }
