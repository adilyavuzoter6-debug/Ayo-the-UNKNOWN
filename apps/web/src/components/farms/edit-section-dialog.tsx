"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
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
import { useUpdateFarmSection } from "@/hooks/use-farm-sections";
import { ApiError } from "@/lib/api-error";
import type { FarmSection } from "@/lib/types";

const schema = z.object({
  name: z.string().trim().min(2).max(200),
});
type FormValues = z.infer<typeof schema>;

export function EditSectionDialog({
  farmId,
  section,
}: {
  farmId: string;
  section: FarmSection;
}) {
  const [open, setOpen] = React.useState(false);
  const updateSection = useUpdateFarmSection(farmId);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    values: { name: section.name },
  });

  async function onSubmit(values: FormValues) {
    try {
      await updateSection.mutateAsync({ sectionId: section.id, name: values.name });
      toast.success("Section renamed.");
      setOpen(false);
    } catch (error) {
      if (error instanceof ApiError) {
        toast.error(error.message);
      } else {
        toast.error("Something went wrong renaming the section.");
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="icon-sm" aria-label="Rename section">
            <Pencil className="size-3.5" />
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Rename section</DialogTitle>
          <DialogDescription>Update this section&apos;s display name.</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Section name</FormLabel>
                  <FormControl>
                    <Input placeholder="Section 1" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={updateSection.isPending}>
                {updateSection.isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
