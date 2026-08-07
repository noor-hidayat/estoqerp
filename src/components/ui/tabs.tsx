"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { cx } from "@/lib/utils";

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: string; label: string; icon?: ReactNode; count?: number }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto rounded-full border border-zinc-200/80 bg-white p-1">
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={cx(
              "relative flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors",
              isActive ? "text-zinc-900" : "text-zinc-500 hover:text-zinc-800"
            )}
          >
            {isActive && (
              <motion.span
                layoutId="tab-pill"
                className="absolute inset-0 rounded-full bg-zinc-900"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5">
              {tab.icon}
              {tab.label}
              {typeof tab.count === "number" && (
                <span
                  className={cx(
                    "rounded-full px-1.5 py-px font-mono text-[10px] font-semibold",
                    isActive ? "bg-white/15 text-zinc-100" : "bg-zinc-100 text-zinc-500"
                  )}
                >
                  {tab.count}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
