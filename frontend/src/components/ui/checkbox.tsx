"use client"

import * as React from "react"
import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"
import { CheckIcon, MinusIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export interface CheckboxProps extends Omit<React.ComponentProps<typeof CheckboxPrimitive.Root>, "checked" | "defaultChecked" | "onCheckedChange"> {
  checked?: boolean | "indeterminate"
  defaultChecked?: boolean | "indeterminate"
  onCheckedChange?: (checked: boolean | "indeterminate") => void
}

function Checkbox({ className, checked, defaultChecked, onCheckedChange, indeterminate, ...props }: CheckboxProps & { indeterminate?: boolean }) {
  const isControlled = checked !== undefined
  const isIndeterminate = checked === "indeterminate" || indeterminate === true
  const isChecked = checked === "indeterminate" ? false : (checked as boolean | undefined)
  const defaultIsIndeterminate = defaultChecked === "indeterminate"
  const defaultIsChecked = defaultChecked === "indeterminate" ? false : (defaultChecked as boolean | undefined)

  const handleCheckedChange = (nextChecked: boolean, eventDetails: any) => {
    if (onCheckedChange) {
      // For backward compat with Radix: if next is checked, pass true, else false
      // If was indeterminate, next will be true/false depending on Base UI
      onCheckedChange(nextChecked)
    }
  }

  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      checked={isChecked}
      defaultChecked={defaultIsChecked}
      indeterminate={isControlled ? isIndeterminate : defaultIsIndeterminate || isIndeterminate}
      onCheckedChange={handleCheckedChange as any}
      className={cn(
        "peer relative flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input bg-zinc-100 dark:bg-zinc-800 shadow-xs transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-[checked]:border-primary data-[checked]:bg-primary data-[checked]:text-primary-foreground data-[indeterminate]:border-primary data-[indeterminate]:bg-primary data-[indeterminate]:text-primary-foreground dark:bg-input/30 dark:data-[checked]:bg-primary dark:data-[indeterminate]:bg-primary",
        // base-nova extra: group-has support for Field
        "group-has-disabled/field:opacity-50",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none [&>svg]:size-3.5"
      >
        {(isIndeterminate || defaultIsIndeterminate) ? <MinusIcon /> : <CheckIcon />}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
