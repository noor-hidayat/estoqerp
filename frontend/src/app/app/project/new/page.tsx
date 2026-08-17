"use client";

import { useNavigate } from "react-router-dom";
import { CalendarIcon } from "lucide-react";
import { useBranches, useWarehouses, useCreateOpnameProject } from "@/lib/api/query";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useForm, Controller, useWatch } from "react-hook-form";
import { format } from "date-fns";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Checkbox } from "@/components/ui/checkbox";
import { RoleGuard } from "@/components/ui/role-guard";
import {
  FormPage,
  FormSection,
  FormGrid,
} from "@/components/ui/form-page";
import { MANAGER_ROLES } from "@/lib/roles";

const formSchema = z.object({
  name: z.string().min(1, "Project name is required"),
  deadline: z.date().optional(),
  mode: z.enum(["COMPARE", "SCRATCH"]),
  branchId: z.string(),
  warehouseIds: z.array(z.string()).min(1, "Select at least one warehouse"),
});

type FormValues = z.infer<typeof formSchema>;

export default function NewProjectPage() {
  return (
    <RoleGuard roles={MANAGER_ROLES} menus={["opname.new"]}>
      <Page />
    </RoleGuard>
  );
}

function Page() {
  const navigate = useNavigate();
  const { data: branches } = useBranches();
  const create = useCreateOpnameProject();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      deadline: undefined,
      mode: "COMPARE",
      branchId: "",
      warehouseIds: [],
    },
  });

  const branchId = useWatch({ control: form.control, name: "branchId" });
  const { data: warehouses } = useWarehouses(branchId || undefined);

  function onSubmit(values: FormValues) {
    const selected = new Set(values.warehouseIds);
    create.mutate(
      {
        name: values.name,
        deadline: values.deadline ? format(values.deadline, "yyyy-MM-dd") : null,
        mode: values.mode,
        warehouses: (warehouses ?? [])
          .filter((wh) => selected.has(wh.id))
          .map((wh) => ({ warehouseId: wh.id, branchId: wh.branchId })),
      },
      {
        onSuccess: (res) => {
          navigate(`/app/project/${(res as { id: string }).id}`);
        },
      }
    );
  }

  function onReset() {
    form.reset();
    form.clearErrors();
  }

return (
    <FormPage
      title="Create Project"
      description="Set the name, mode, and warehouses to be counted."
      actions={
        <Button type="submit" form="create-project-form" variant="primary" disabled={create.isPending}>
          {create.isPending ? "Saving..." : "Save"}
        </Button>
      }
    >
      <form
        id="create-project-form"
        onSubmit={form.handleSubmit(onSubmit)}
        onReset={onReset}
      >
        <FormSection>
          <FormGrid>
            <Controller
              control={form.control}
              name="name"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel>Project Name</FieldLabel>
                  <Input
                    placeholder="Stock Opname August"
                    type="text"
                    {...field}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              control={form.control}
              name="deadline"
              render={({ field, fieldState }) => (
                <div className="sm:col-span-2">
                  <div className="sm:max-w-[49%]">
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel>Deadline</FieldLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className="w-full justify-start text-left font-normal"
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {field.value ? (
                              format(field.value, "PPP")
                            ) : (
                              <span className="text-muted-foreground">
                                Pick a date
                              </span>
                            )}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar mode="single" onSelect={field.onChange} />
                        </PopoverContent>
                      </Popover>
                      {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                    </Field>
                  </div>
                </div>
              )}
            />

            <Controller
              control={form.control}
              name="mode"
              render={({ field, fieldState }) => (
                <div className="sm:col-span-2">
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel>Project Mode</FieldLabel>
                    <RadioGroup
                      className="grid gap-3 sm:grid-cols-2"
                      value={field.value}
                      name={field.name}
                      onValueChange={field.onChange}
                    >
                      <div className="flex items-start space-x-3 rounded-lg border border-border p-4 has-[[data-state=checked]]:border-primary">
                        <RadioGroupItem value="COMPARE" id="radio-mode-compare" className="mt-0.5" />
                        <div className="grid gap-1 leading-none">
                          <FieldLabel
                            htmlFor="radio-mode-compare"
                            className="font-medium"
                          >
                            Compare
                          </FieldLabel>
                          <p className="text-sm text-muted-foreground">
                            Compare physical count with system stock and monitor variance
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start space-x-3 rounded-lg border border-border p-4 has-[[data-state=checked]]:border-primary">
                        <RadioGroupItem value="SCRATCH" id="radio-mode-scratch" className="mt-0.5" />
                        <div className="grid gap-1 leading-none">
                          <FieldLabel
                            htmlFor="radio-mode-scratch"
                            className="font-medium"
                          >
                            Scratch
                          </FieldLabel>
                          <p className="text-sm text-muted-foreground">
                            Start fresh stock count based entirely on physical condition
                          </p>
                        </div>
                      </div>
                    </RadioGroup>
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                </div>
              )}
            />
          </FormGrid>
        </FormSection>

        <FormSection>
          <FormGrid>
            <Controller
              control={form.control}
              name="branchId"
              render={({ field, fieldState }) => (
                <div className="sm:col-span-2">
                  <div className="sm:max-w-[49%]">
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel>Select Branch</FieldLabel>
                      <NativeSelect
                        value={field.value ?? ""}
                        onChange={(event) => field.onChange(event.target.value)}
                        onBlur={field.onBlur}
                        ref={field.ref}
                      >
                        <NativeSelectOption value="">All branches</NativeSelectOption>
                        {branches?.map((b) => (
                          <NativeSelectOption key={b.id} value={b.id}>
                            {b.name}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                      {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                    </Field>
                  </div>
                </div>
              )}
            />

            <Controller
              control={form.control}
              name="warehouseIds"
              render={({ field, fieldState }) => (
                <div className="sm:col-span-2">
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel>Select Warehouses</FieldLabel>
                    {warehouses && warehouses.length > 0 ? (
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {warehouses.map((wh) => {
                          const checked = field.value.includes(wh.id);
                          return (
                            <div
                              key={wh.id}
                              className="flex items-center space-x-2.5 rounded-lg border border-border px-3 py-2.5 has-[[data-state=checked]]:border-primary"
                            >
                              <Checkbox
                                id={`wh-${wh.id}`}
                                checked={checked}
                                onCheckedChange={(v) => {
                                  const next = v
                                    ? [...field.value, wh.id]
                                    : field.value.filter((id) => id !== wh.id);
                                  field.onChange(next);
                                }}
                              />
                              <FieldLabel
                                htmlFor={`wh-${wh.id}`}
                                className="cursor-pointer"
                              >
                                {wh.name}
                              </FieldLabel>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No warehouses available for the selected branch.
                      </p>
                    )}
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                </div>
              )}
            />
          </FormGrid>
        </FormSection>

        {create.isError && (
          <p className="mb-5 rounded-lg bg-destructive/10 px-3 py-2 text-[12.5px] text-destructive">
            {create.error instanceof Error
              ? create.error.message
              : "Failed to create project."}
          </p>
        )}
      </form>
    </FormPage>
  );
}