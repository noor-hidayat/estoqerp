"use client";

import { SearchableSelect, type SearchableOption } from "@/components/ui/searchable-select";

export interface ComboOption {
  value: string;
  label: string;
}

export function ComboBox({
  label,
  options,
  value,
  onChange,
  placeholder = "Cari...",
  emptyText = "No results",
  className,
}: {
  label?: string;
  options: ComboOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyText?: string;
  className?: string;
}) {
  return (
    <SearchableSelect
      label={label}
      options={options as SearchableOption[]}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      emptyText={emptyText}
      className={className}
    />
  );
}
