import * as React from "react"
import { cn } from "@/lib/utils"
import { SearchableSelect, type SearchableOption } from "@/components/ui/searchable-select"

interface ParsedOptions {
  options: SearchableOption[];
  placeholder: string | null;
}

function getNodeText(node: React.ReactNode): string {
  if (node == null || node === false || node === true) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(getNodeText).join("");
  if (React.isValidElement(node))
    return getNodeText((node.props as { children?: React.ReactNode }).children);
  return "";
}

function optionsFromChildren(children: React.ReactNode): ParsedOptions {
  let placeholder: string | null = null;
  const options: SearchableOption[] = [];
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    const props = child.props as React.OptionHTMLAttributes<HTMLOptionElement>;
    if (typeof (props as { value?: unknown }).value !== "string") return;
    const value = props.value as string;
    const label = getNodeText(props.children).trim();
    if (value === "" && label !== "") {
      placeholder = label;
    } else {
      options.push({ value, label });
    }
  });
  return { options, placeholder };
}

const NativeSelect = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, value, onChange, onBlur, disabled, id, name }, ref) => {
  const selectId = id || name;
  const { options, placeholder: detectedPlaceholder } = optionsFromChildren(children);
  return (
    <div className={cn("relative w-full", className)}>
      <SearchableSelect
        inputId={selectId}
        inputRef={ref as React.Ref<HTMLInputElement>}
        options={options}
        value={String(value ?? "")}
        placeholder={detectedPlaceholder || "Type to search..."}
        excludeSelected={false}
        disabled={disabled}
        onBlur={() => onBlur?.({} as unknown as React.FocusEvent<HTMLSelectElement>)}
        onChange={(v) => {
          onChange?.({
            target: { value: v },
          } as unknown as React.ChangeEvent<HTMLSelectElement>);
        }}
      />
    </div>
  )
})
NativeSelect.displayName = "NativeSelect"

const NativeSelectOption = React.forwardRef<
  HTMLOptionElement,
  React.OptionHTMLAttributes<HTMLOptionElement>
>(({ className, ...props }, ref) => (
  <option
    ref={ref}
    data-slot="native-select-option"
    className={cn("bg-background text-foreground", className)}
    {...props}
  />
))
NativeSelectOption.displayName = "NativeSelectOption"

export { NativeSelect, NativeSelectOption }
