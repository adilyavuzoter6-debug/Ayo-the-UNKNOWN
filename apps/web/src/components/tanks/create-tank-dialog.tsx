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
import { TANK_TYPE_LABEL } from "@/lib/tanks";
import type { TankType } from "@/lib/types";

const TANK_TYPES: TankType[] = ["POND", "CAGE", "TANK", "RACEWAY"];

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
      toast.success(`"${tank.code}" havuzu eklendi.`);
      form.reset();
      setOpen(false);
    } catch (error) {
      if (error instanceof ApiError) {
        toast.error(error.message);
      } else {
        toast.error("Havuz eklenirken bir sorun oluştu.");
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
            Havuz ekle
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Havuz ekle</DialogTitle>
          <DialogDescription>Bu bölüm içindeki havuz, kafes veya tank.</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Kod</FormLabel>
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
                    <FormLabel>Tür</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {TANK_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {TANK_TYPE_LABEL[t]}
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
                    <FormLabel>Hacim (m³)</FormLabel>
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
                    <FormLabel>Maks. biyokütle (kg)</FormLabel>
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
                {createTank.isPending ? "Ekleniyor…" : "Havuz ekle"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
