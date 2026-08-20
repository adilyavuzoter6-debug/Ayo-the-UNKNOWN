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
import { useCreateFishBatch } from "@/hooks/use-fish-batches";
import { useCreateFishSpecies, useFishSpecies } from "@/hooks/use-fish-species";
import { ApiError } from "@/lib/api-error";

const schema = z.object({
  speciesId: z.string().min(1, "Bir tür seçin"),
  lotCode: z.string().trim().min(1).max(40),
  fishCount: z.coerce.number().int().positive(),
  avgWeightG: z.coerce.number().positive(),
  farmEntryDate: z.string().min(1),
});
type FormValues = z.infer<typeof schema>;

export function CreateFishBatchDialog({ farmId, tankId }: { farmId: string; tankId: string }) {
  const [open, setOpen] = React.useState(false);
  const [newSpeciesName, setNewSpeciesName] = React.useState("");
  const { data: species } = useFishSpecies();
  const createSpecies = useCreateFishSpecies();
  const createBatch = useCreateFishBatch(farmId, tankId);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      speciesId: "",
      lotCode: "",
      fishCount: undefined,
      avgWeightG: undefined,
      farmEntryDate: new Date().toISOString().slice(0, 10),
    },
  });

  async function onAddSpecies() {
    if (!newSpeciesName.trim()) return;
    try {
      const created = await createSpecies.mutateAsync({ name: newSpeciesName.trim() });
      form.setValue("speciesId", created.id);
      setNewSpeciesName("");
      toast.success(`Tür "${created.name}" eklendi.`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Tür eklenirken bir sorun oluştu.");
    }
  }

  async function onSubmit(values: FormValues) {
    try {
      await createBatch.mutateAsync({ ...values, tankId });
      toast.success("Stoklama kaydedildi.");
      form.reset();
      setOpen(false);
    } catch (error) {
      if (error instanceof ApiError) {
        toast.error(error.message);
      } else {
        toast.error("Stoklama kaydedilirken bir sorun oluştu.");
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
          <Button variant="outline" size="sm">
            <Plus className="size-3.5" />
            Stoklama ekle
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Yeni stoklama</DialogTitle>
          <DialogDescription>Bu havuza yeni bir balık partisi (batch) stokla.</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="speciesId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tür</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Tür seçin" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {species?.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                          {s.strain ? ` (${s.strain})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex items-center gap-2">
              <Input
                placeholder="Yeni tür adı (opsiyonel)"
                value={newSpeciesName}
                onChange={(e) => setNewSpeciesName(e.target.value)}
                className="h-8 text-xs"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!newSpeciesName.trim() || createSpecies.isPending}
                onClick={onAddSpecies}
              >
                Ekle
              </Button>
            </div>

            <FormField
              control={form.control}
              name="lotCode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Lot kodu</FormLabel>
                  <FormControl>
                    <Input placeholder="LOT-2026-00125" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="fishCount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Adet</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} step={1} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="avgWeightG"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ort. ağırlık (g)</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="farmEntryDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tarih</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="submit" disabled={createBatch.isPending}>
                {createBatch.isPending ? "Kaydediliyor…" : "Kaydet"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
