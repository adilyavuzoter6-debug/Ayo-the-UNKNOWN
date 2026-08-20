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
import { useCreateFarmSection } from "@/hooks/use-farm-sections";
import { ApiError } from "@/lib/api-error";

const schema = z.object({
  name: z.string().trim().min(2).max(200),
});
type FormValues = z.infer<typeof schema>;

export function CreateSectionDialog({ farmId }: { farmId: string }) {
  const [open, setOpen] = React.useState(false);
  const createSection = useCreateFarmSection(farmId);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "" },
  });

  async function onSubmit(values: FormValues) {
    try {
      const section = await createSection.mutateAsync(values);
      toast.success(`"${section.name}" bölümü oluşturuldu.`);
      form.reset();
      setOpen(false);
    } catch (error) {
      if (error instanceof ApiError) {
        toast.error(error.message);
      } else {
        toast.error("Bölüm oluşturulurken bir sorun oluştu.");
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
            <Plus className="size-4" />
            Yeni bölüm
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Bölüm oluştur</DialogTitle>
          <DialogDescription>Çiftlik sahasının bir alt bölümü, örn. &quot;Saha A&quot;.</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bölüm adı</FormLabel>
                  <FormControl>
                    <Input placeholder="Bölüm 1" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={createSection.isPending}>
                {createSection.isPending ? "Oluşturuluyor…" : "Bölüm oluştur"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
