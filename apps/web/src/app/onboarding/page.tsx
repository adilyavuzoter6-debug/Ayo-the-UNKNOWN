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
import { Logo } from "@/components/shared/logo";
import { TimezoneSelect } from "@/components/farms/timezone-select";

export default function OnboardingPage() {
  const router = useRouter();
  const { setCompanyId } = useActiveCompany();
  const { data: companies, isLoading, isError, refetch } = useMyCompanies();
  const createCompany = useCreateCompany();

  const form = useForm<CreateCompanyInput>({
    resolver: zodResolver(createCompanySchema),
    defaultValues: { name: "", legalName: "", countryCode: "", timezone: "Europe/Istanbul" },
  });

  // One company per account: anyone who already belongs to a company goes straight into the
  // app instead of being offered to create another one.
  const hasCompany = !!companies && companies.length > 0;
  React.useEffect(() => {
    if (!hasCompany) return;
    setCompanyId(companies[0]!.id);
    router.replace("/dashboard");
  }, [hasCompany, companies, setCompanyId, router]);

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
        <div className="flex items-center justify-center">
          <Logo size={36} />
        </div>

        {isError ? (
          <Card>
            <CardHeader>
              <CardTitle>Can&apos;t reach the server right now</CardTitle>
              <CardDescription>
                This doesn&apos;t mean your company is gone — we just couldn&apos;t check. Try
                again in a moment rather than creating a new one.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full" onClick={() => refetch()}>
                Try again
              </Button>
            </CardContent>
          </Card>
        ) : isLoading || hasCompany ? (
          <p className="text-center text-sm text-muted-foreground">Yükleniyor…</p>
        ) : (
          <>
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
                              <TimezoneSelect value={field.value} onChange={field.onChange} />
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
          </>
        )}
      </div>
    </div>
  );
}
