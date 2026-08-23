import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm",
        outline: "text-foreground border-border",
        success:
          "border-transparent bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
        warning:
          "border-transparent bg-amber-50 text-amber-700 hover:bg-amber-100",
        info:
          "border-transparent bg-sky-50 text-sky-700 hover:bg-sky-100",
        violet:
          "border-transparent bg-violet-50 text-violet-700 hover:bg-violet-100",
        neutral:
          "border-transparent bg-muted text-muted-foreground hover:bg-muted/80",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function mapTone(tone?: string): VariantProps<typeof badgeVariants>["variant"] {
  switch (tone) {
    case "emerald": return "success"
    case "amber": return "warning"
    case "red": return "destructive"
    case "blue": return "info"
    case "violet": return "violet"
    case "neutral": return "neutral"
    default: return tone as any || "default"
  }
}

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean;
  icon?: React.ReactNode;
  tone?: string;
}

function Badge({ className, variant, tone, dot, icon, children, ...props }: BadgeProps) {
  const mappedVariant = tone ? mapTone(tone) : variant
  return (
    <div className={cn(badgeVariants({ variant: mappedVariant }), className)} {...props}>
      {icon}
      {dot && (
        <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      )}
      {children}
    </div>
  )
}

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  status: string;
  tone?: string;
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  IN_PROGRESS: "In Progress",
  APPROVED: "Completed",
  CANCELLED: "Cancelled",
  PENDING: "Pending",
  COMPLETED: "Completed",
};

const STATUS_TONE: Record<string, string> = {
  DRAFT: "neutral",
  IN_PROGRESS: "blue",
  APPROVED: "violet",
  CANCELLED: "neutral",
  PENDING: "neutral",
  COMPLETED: "emerald",
};

function StatusBadge({ status, tone, className, ...props }: StatusBadgeProps) {
  return (
    <Badge
      tone={tone ?? STATUS_TONE[status] ?? "neutral"}
      dot={status === "DRAFT"}
      className={className}
      {...props}
    >
      {STATUS_LABELS[status] ?? status}
    </Badge>
  )
}

export { Badge, StatusBadge, badgeVariants }
