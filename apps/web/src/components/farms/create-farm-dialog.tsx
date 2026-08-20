"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { createFarmSchema, type CreateFarmInput } from "@aquai/validation";
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
import { useCreateFarm } from "@/hooks/use-farms";
import { ApiError } from "@/lib/api-error";

export function CreateFarmDialog() {
  const [open, setOpen] = React.useState(false);
  const createFarm = useCreateFarm();

  const form = useForm<CreateFarmInput>({
    resolver: zodResolver(createFarmSchema),
    defaultValues: { name: "", code: "", timezone: "" },
  });

  async function onSubmit(values: CreateFarmInput) {
    try {
      const farm = await createFarm.mutateAsync({
        ...values,
        timezone: values.timezone || undefined,
      });
      toast.success(`"${farm.name}" çiftliği oluşturuldu.`);
      form.reset();
      setOpen(false);
    } catch (error) {
      if (error instanceof ApiError) {
        toast.error(error.message);
      } else {
        toast.error("Çiftlik oluşturulurken bir sorun oluştu.");
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
          <Button>
            <Plus className="size-4" />
            Yeni çiftlik
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Çiftlik oluştur</DialogTitle>
          <DialogDescription>
            Bir çiftlik fiziksel bir sahadır. Sonrasında bölüm ve havuz ekleyebilirsin.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Çiftlik adı</FormLabel>
                  <FormControl>
                    <Input placeholder="Ana Çiftlik" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Kod</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="CIFTLIK-1"
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
                name="timezone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Saat dilimi (opsiyonel)</FormLabel>
                    <FormControl>
                      <Input placeholder="Europe/Istanbul" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button type="submit" disabled={createFarm.isPending}>
                {createFarm.isPending ? "Oluşturuluyor…" : "Çiftlik oluştur"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
