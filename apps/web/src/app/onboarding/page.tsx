"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { createCompanySchema, type CreateCompanyInput } from "@aquai/validation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useActiveCompany } from "@/components/providers/active-company-provider";
import { useCreateCompany, useMyCompanies } from "@/hooks/use-companies";
import { ApiError } from "@/lib/api-error";
import { Waves } from "lucide-react";

export default function OnboardingPage() {
  const router = useRouter();
  const { setCompanyId } = useActiveCompany();
  const { data: companies, isLoading } = useMyCompanies();
  const createCompany = useCreateCompany();

  const form = useForm<CreateCompanyInput>({
    resolver: zodResolver(createCompanySchema),
    defaultValues: { name: "", legalName: "", countryCode: "", timezone: "" },
  });

  async function onSubmit(values: CreateCompanyInput) {
    try {
      const company = await createCompany.mutateAsync(values);
      setCompanyId(company.id);
      toast.success(`${company.name} created.`);
      router.replace("/farms");
    } catch (error) {
      if (error instanceof ApiError) {
        toast.error(error.message);
      } else {
        toast.error("Something went wrong creating the company.");
      }
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center justify-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Waves className="size-5" />
          </div>
          <span className="text-xl font-semibold tracking-tight">Piscatio</span>
        </div>

        {!isLoading && companies && companies.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Continue to your workspace</CardTitle>
              <CardDescription>
                You already belong to {companies.length === 1 ? "a company" : "companies"}.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {companies.map((c) => (
                <Button
                  key={c.id}
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => {
                    setCompanyId(c.id);
                    router.replace("/farms");
                  }}
                >
                  {c.name}
                </Button>
              ))}
              <p className="pt-2 text-center text-sm text-muted-foreground">
                Or create a new company below.
              </p>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Create your company</CardTitle>
            <CardDescription>
              This becomes the top of your farm hierarchy — you&apos;ll be its owner.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company name</FormLabel>
                      <FormControl>
                        <Input placeholder="Fjord Trout Co." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="legalName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Legal name (optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="Fjord Trout Co. AS" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="countryCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Country code</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="TR"
                            maxLength={2}
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
                        <FormLabel>Timezone</FormLabel>
                        <FormControl>
                          <Input placeholder="Europe/Istanbul" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <Button type="submit" className="w-full" disabled={createCompany.isPending}>
                  {createCompany.isPending ? "Creating…" : "Create company"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
