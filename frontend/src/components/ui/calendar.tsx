"use client"

import * as React from "react"
import { DayPicker } from "react-day-picker"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col gap-4 sm:flex-row",
        month: "flex flex-col gap-4",
        nav: "flex items-center justify-between",
        button_previous:
          "absolute left-1 top-1.5 z-10 h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50",
        button_next:
          "absolute right-1 top-1.5 z-10 h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50",
        month_caption: "flex justify-center pt-1 relative items-center",
        month_grid: "w-full border-collapse space-y-1",
        weekdays: "flex",
        weekday: "text-muted-foreground rounded-md w-8 text-[0.8rem] font-normal",
        week: "flex w-full mt-2",
        day: "p-0 text-center text-sm",
        day_button: cn(
          "rounded-md p-0 font-normal h-8 w-8 text-foreground opacity-100",
          "hover:bg-accent hover:text-accent-foreground",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          "aria-selected:bg-primary aria-selected:text-primary-foreground",
          "disabled:pointer-events-none disabled:opacity-50"
        ),
        selected:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground rounded-md",
        today: "bg-accent text-accent-foreground rounded-md",
        outside: "text-muted-foreground opacity-50",
        disabled: "text-muted-foreground opacity-50",
        range_start:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground rounded-l-md",
        range_middle:
          "bg-primary/15 text-primary-foreground hover:bg-primary/15 hover:text-primary-foreground",
        range_end:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground rounded-r-md",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className, ...props }) =>
          orientation === "left" ? (
            <ChevronLeft className={cn("h-4 w-4", className)} {...props} />
          ) : (
            <ChevronRight className={cn("h-4 w-4", className)} {...props} />
          ),
      }}
      {...props}
    />
  )
}

export { Calendar }