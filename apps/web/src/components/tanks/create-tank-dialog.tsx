"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateTank } from "@/hooks/use-tanks";
import { ApiError } from "@/lib/api-error";
import type { TankType } from "@/lib/types";

const TANK_TYPES: { value: TankType; label: string }[] = [
  { value: "TANK", label: "Tank" },
  { value: "POND", label: "Pond" },
  { value: "CAGE", label: "Cage" },
  { value: "RACEWAY", label: "Raceway" },
];

const schema = z.object({
  code: z.string().trim().min(1).max(20),
  type: z.enum(["TANK", "POND", "CAGE", "RACEWAY"]),
  volumeM3: z.string().optional(),
  maxBiomassKg: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

export function CreateTankDialog({ farmId, sectionId }: { farmId: string; sectionId: string }) {
  const [open, setOpen] = React.useState(false);
  const createTank = useCreateTank(farmId, sectionId);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { code: "", type: "TANK", volumeM3: "", maxBiomassKg: "" },
  });

  async function onSubmit(values: FormValues) {
    try {
      const tank = await createTank.mutateAsync({
        code: values.code,
        type: values.type,
        volumeM3: values.volumeM3 ? Number(values.volumeM3) : undefined,
        maxBiomassKg: values.maxBiomassKg ? Number(values.maxBiomassKg) : undefined,
      });
      toast.success(`Tank "${tank.code}" created.`);
      form.reset();
      setOpen(false);
    } catch (error) {
      if (error instanceof ApiError) {
        toast.error(error.message);
      } else {
        toast.error("Something went wrong creating the tank.");
      }
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) form.reset();
      }}
    >
      <DialogTrigger
        render={
          <Button variant="ghost" size="sm">
            <Plus className="size-4" />
            Add tank
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add a tank</DialogTitle>
          <DialogDescription>Tanks, ponds, cages, or raceways within this section.</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Code</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="A12"
                        {...field}
                        onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {TANK_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="volumeM3"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Volume (m³)</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" step="0.01" placeholder="120" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="maxBiomassKg"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Max biomass (kg)</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" step="0.01" placeholder="5000" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button type="submit" disabled={createTank.isPending}>
                {createTank.isPending ? "Adding…" : "Add tank"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
