"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import { z } from "zod";
import type { Role } from "@aquai/types";
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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useInviteMember } from "@/hooks/use-members";
import { ApiError } from "@/lib/api-error";
import { ROLE_LABEL, INVITABLE_ROLES } from "@/lib/roles";

const schema = z.object({
  email: z.string().email("Geçerli bir e-posta girin"),
  role: z.string().min(1, "Bir rol seçin"),
});
type FormValues = z.infer<typeof schema>;

export function InviteMemberDialog() {
  const [open, setOpen] = React.useState(false);
  const inviteMember = useInviteMember();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", role: "WORKER" },
  });

  async function onSubmit(values: FormValues) {
    try {
      await inviteMember.mutateAsync({ email: values.email, role: values.role as Role });
      toast.success("Davet gönderildi.");
      form.reset({ email: "", role: "WORKER" });
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Davet gönderilirken bir sorun oluştu.");
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
          <Button size="sm">
            <UserPlus className="size-3.5" />
            Kullanıcı davet et
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Kullanıcı davet et</DialogTitle>
          <DialogDescription>E-posta adresine bir davet gönderilecek.</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>E-posta</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="ornek@sirket.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Rol</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {INVITABLE_ROLES.map((role) => (
                        <SelectItem key={role} value={role}>
                          {ROLE_LABEL[role]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="submit" disabled={inviteMember.isPending}>
                {inviteMember.isPending ? "Gönderiliyor…" : "Davet gönder"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
