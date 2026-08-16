import * as React from "react"
import { cn } from "@/lib/utils"

const Field = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="field"
    className={cn("flex flex-col gap-2", className)}
    {...props}
  />
))
Field.displayName = "Field"

const FieldLabel = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
  <label
    ref={ref}
    data-slot="field-label"
    className={cn(
      "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
      className
    )}
    {...props}
  />
))
FieldLabel.displayName = "FieldLabel"

const FieldDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    data-slot="field-description"
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
FieldDescription.displayName = "FieldDescription"

interface FieldErrorMessage {
  message?: React.ReactNode;
}

const FieldError = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement> & {
    errors?: (React.ReactNode | FieldErrorMessage | null | undefined)[];
  }
>(({ className, errors = [], ...props }, ref) => {
  const visible = errors.filter(Boolean)
  if (visible.length === 0) return null
  return (
    <div
      ref={ref}
      data-slot="field-error"
      className={cn("text-sm text-destructive", className)}
      {...props}
    >
      {visible.map((error, i) => {
        const text =
          typeof error === "object" && error !== null && "message" in error
            ? (error as FieldErrorMessage).message
            : (error as React.ReactNode)
        return <p key={i}>{text}</p>
      })}
    </div>
  )
})
FieldError.displayName = "FieldError"

export { Field, FieldLabel, FieldDescription, FieldError }