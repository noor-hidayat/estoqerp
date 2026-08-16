import * as React from "react"
import { cn } from "@/lib/utils"
import { Button, type ButtonProps } from "@/components/ui/button"

const InputGroup = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="input-group"
    className={cn(
      "flex w-full items-center rounded-md border border-input bg-transparent shadow-sm transition-colors focus-within:ring-1 focus-within:ring-ring",
      className
    )}
    {...props}
  />
))
InputGroup.displayName = "InputGroup"

const InputGroupInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    data-slot="input-group-input"
    className={cn(
      "h-9 w-full bg-transparent px-3 py-1 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
      className
    )}
    {...props}
  />
))
InputGroupInput.displayName = "InputGroupInput"

const InputGroupAddon = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    side?: "left" | "right"
    align?: "inline-start" | "inline-end"
  }
>(({ className, side, align, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="input-group-addon"
    className={cn(
      "flex shrink-0 items-center justify-center text-muted-foreground",
      side === "left" || align === "inline-start"
        ? "pl-3 pr-0"
        : side === "right" || align === "inline-end"
          ? "pl-0 pr-3"
          : "px-3",
      className
    )}
    {...props}
  />
))
InputGroupAddon.displayName = "InputGroupAddon"

const InputGroupText = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement>
>(({ className, ...props }, ref) => (
  <span
    ref={ref}
    data-slot="input-group-text"
    className={cn("flex items-center text-sm text-muted-foreground", className)}
    {...props}
  />
))
InputGroupText.displayName = "InputGroupText"

const InputGroupButton = React.forwardRef<
  HTMLButtonElement,
  ButtonProps & { asChild?: boolean }
>(({ className, variant = "ghost", size, ...props }, ref) => (
  <Button
    ref={ref}
    variant={variant}
    size={size}
    className={cn("shrink-0", className)}
    {...props}
  />
))
InputGroupButton.displayName = "InputGroupButton"

export { InputGroup, InputGroupInput, InputGroupAddon, InputGroupButton, InputGroupText }