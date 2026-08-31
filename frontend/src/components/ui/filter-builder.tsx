import { useMemo, useState } from "react";
import { ListFilter, Plus, Trash2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LegacySelect } from "@/components/ui/select";

export type FilterBuilderFieldType = "text" | "select" | "number" | "date";

export interface FilterBuilderOption {
  value: string;
  label: string;
}

export interface FilterBuilderField {
  key: string;
  label: string;
  type: FilterBuilderFieldType;
  options?: FilterBuilderOption[];
  /** List of available values from the data. When provided, the value column
   *  renders a select with these options instead of a free-text input. */
  values?: FilterBuilderOption[];
  placeholder?: string;
}

export interface FilterRule {
  id: string;
  field: string;
  operator: string;
  values: string[];
}

interface Operator {
  value: string;
  label: string;
}

const OPERATORS: Record<FilterBuilderFieldType, Operator[]> = {
  text: [
    { value: "is", label: "equal" },
    { value: "is_not", label: "not equal" },
    { value: "contains", label: "contains" },
    { value: "not_contains", label: "does not contain" },
    { value: "starts_with", label: "starts with" },
    { value: "ends_with", label: "ends with" },
    { value: "empty", label: "is empty" },
    { value: "not_empty", label: "is not empty" },
  ],
  select: [
    { value: "is", label: "equal" },
    { value: "is_not", label: "not equal" },
    { value: "empty", label: "is empty" },
    { value: "not_empty", label: "is not empty" },
  ],
  number: [
    { value: "is", label: "equal" },
    { value: "is_not", label: "not equal" },
    { value: "gt", label: "greater than" },
    { value: "lt", label: "less than" },
    { value: "between", label: "between" },
    { value: "empty", label: "is empty" },
    { value: "not_empty", label: "is not empty" },
  ],
  date: [
    { value: "is", label: "equal" },
    { value: "is_not", label: "not equal" },
    { value: "before", label: "before" },
    { value: "after", label: "after" },
    { value: "between", label: "between" },
    { value: "empty", label: "is empty" },
    { value: "not_empty", label: "is not empty" },
  ],
};

export function operatorsFor(field: FilterBuilderField): Operator[] {
  const hasList = (field.values?.length ?? 0) > 0;
  return hasList ? OPERATORS.select : OPERATORS[field.type];
}

export function matchesFilterRule(raw: unknown, rule: FilterRule): boolean {
  const value = raw ?? null;
  const str = (v: unknown) => String(v ?? "").toLowerCase();
  const [a, b] = rule.values;
  switch (rule.operator) {
    case "is":
      return str(value) === str(a);
    case "is_not":
      return str(value) !== str(a);
    case "contains":
      return str(value).includes(str(a));
    case "not_contains":
      return !str(value).includes(str(a));
    case "starts_with":
      return str(value).startsWith(str(a));
    case "ends_with":
      return str(value).endsWith(str(a));
    case "gt":
      return Number(value) > Number(a);
    case "lt":
      return Number(value) < Number(a);
    case "before":
      return str(value) < str(a);
    case "after":
      return str(value) > str(a);
    case "between":
      return str(value) >= str(a) && str(value) <= str(b);
    case "empty":
      return value === null || value === undefined || value === "";
    case "not_empty":
      return value !== null && value !== undefined && value !== "";
    default:
      return true;
  }
}

const inputType = (field: FilterBuilderField, operator: string) =>
  operator === "between"
    ? field.type === "number"
      ? "number"
      : field.type === "date"
        ? "date"
        : "text"
    : field.type === "number"
      ? "number"
      : field.type === "date"
        ? "date"
        : "text";

interface FilterValueInputProps {
  field: FilterBuilderField;
  values: string[];
  operator: string;
  onChange: (values: string[]) => void;
}

function FilterValueInput({ field, values, operator, onChange }: FilterValueInputProps) {
  if (operator === "between") {
    return (
      <div className="flex items-center gap-1.5">
        <Input
          type={inputType(field, operator)}
          value={values[0] ?? ""}
          onChange={(e) => onChange([e.target.value, values[1] ?? ""])}
          placeholder="Min"
          className="h-8 min-w-0 flex-1 text-xs"
        />
        <span className="shrink-0 text-xs text-muted-foreground">to</span>
        <Input
          type={inputType(field, operator)}
          value={values[1] ?? ""}
          onChange={(e) => onChange([values[0] ?? "", e.target.value])}
          placeholder="Max"
          className="h-8 min-w-0 flex-1 text-xs"
        />
      </div>
    );
  }

  const listOptions = field.values ?? field.options;
  if (listOptions && listOptions.length > 0) {
    const current = values[0] ?? "";
    const hasCurrent = listOptions.some((o) => o.value === current);
    const options = hasCurrent || !current ? listOptions : [{ value: current, label: current }, ...listOptions];
    return (
      <LegacySelect
        value={current}
        onChange={(e) => onChange([e.target.value])}
        className="h-8 w-full text-xs"
      >
        <option value="">Select...</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </LegacySelect>
    );
  }

  return (
    <Input
      type={inputType(field, operator)}
      value={values[0] ?? ""}
      onChange={(e) => onChange([e.target.value])}
      placeholder={field.placeholder ?? `Enter ${field.label.toLowerCase()}...`}
      className="h-8 w-full text-xs"
    />
  );
}

interface FilterBuilderProps {
  fields: FilterBuilderField[];
  filters: FilterRule[];
  onChange: (filters: FilterRule[]) => void;
}

export function FilterBuilder({ fields, filters, onChange }: FilterBuilderProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<FilterRule[]>(filters);
  const fieldMap = useMemo(() => new Map(fields.map((f) => [f.key, f])), [fields]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) setDraft(filters);
  };

  const addFilter = () => {
    const field = fields[0];
    if (!field) return;
    setDraft([
      ...draft,
      {
        id: crypto.randomUUID(),
        field: field.key,
        operator: operatorsFor(field)[0].value,
        values: [],
      },
    ]);
  };

  const updateFilter = (id: string, patch: Partial<FilterRule>) => {
    setDraft(draft.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  };

  const removeFilter = (id: string) => {
    setDraft(draft.filter((f) => f.id !== id));
  };

  const clearAll = () => setDraft([]);

  const apply = () => {
    onChange(draft);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 px-2.5 text-xs shadow-none"
        >
          <ListFilter className="h-3.5 w-3.5" />
          Filter
          {filters.length > 0 && (
            <span className="rounded-sm bg-muted px-1.5 text-[10px] font-semibold leading-4 text-muted-foreground">
              {filters.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[640px] max-w-[calc(100vw-2rem)] p-3">
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Filters
          </span>
          <span className="text-[11px] text-muted-foreground">
            Applied when you click &quot;Apply Filter&quot;
          </span>
        </div>
        <div className="flex max-h-[320px] flex-col gap-2 overflow-y-auto">
          {draft.length === 0 && (
            <p className="px-1 pb-1 text-xs text-muted-foreground">
              No filters yet. Add one below.
            </p>
          )}
          {draft.map((rule) => {
            const field = fieldMap.get(rule.field);
            if (!field) return null;
            const needsValue =
              rule.operator !== "empty" && rule.operator !== "not_empty";
            return (
              <div
                key={rule.id}
                className="grid grid-cols-[1fr_150px_1.5fr_auto] items-center gap-2"
              >
                <LegacySelect
                  value={rule.field}
                  onChange={(e) => {
                    const next = fieldMap.get(e.target.value);
                    const operator = next
                      ? operatorsFor(next)[0].value
                      : "is";
                    updateFilter(rule.id, { field: e.target.value, operator, values: [] });
                  }}
                  className="h-8 w-full text-xs"
                >
                  {fields.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
                </LegacySelect>

                <LegacySelect
                  value={rule.operator}
                  onChange={(e) =>
                    updateFilter(rule.id, { operator: e.target.value, values: [] })
                  }
                  className="h-8 w-full text-xs"
                >
                  {operatorsFor(field).map((op) => (
                    <option key={op.value} value={op.value}>
                      {op.label}
                    </option>
                  ))}
                </LegacySelect>

                {needsValue ? (
                  <FilterValueInput
                    field={field}
                    values={rule.values}
                    operator={rule.operator}
                    onChange={(values) => updateFilter(rule.id, { values })}
                  />
                ) : (
                  <span className="px-1 text-xs text-muted-foreground">—</span>
                )}

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => removeFilter(rule.id)}
                  aria-label="Remove filter"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={addFilter}
            >
              <Plus className="h-3.5 w-3.5" />
              Add Filter
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={clearAll}
              disabled={draft.length === 0}
            >
              Clear all
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button variant="primary" size="sm" className="h-8 text-xs" onClick={apply}>
              Apply Filter
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}