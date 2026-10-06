"use client";

import * as React from "react";
import { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Logo } from "@/components/shared/logo";
import { useApiClient } from "@/lib/api-client";
import { ApiError } from "@/lib/api-error";

function AcceptInvitationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const { isLoaded, isSignedIn } = useAuth();
  const api = useApiClient();
  const queryClient = useQueryClient();
  const [accepting, setAccepting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const returnPath = `/accept-invitation?token=${encodeURIComponent(token)}`;

  async function handleAccept() {
    setAccepting(true);
    setError(null);
    try {
      await api.post("/users/accept-invitation", { token }, { skipCompanyContext: true });
      await queryClient.invalidateQueries({ queryKey: ["companies"] });
      toast.success("Davet kabul edildi.");
      router.replace("/dashboard");
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 404
          ? "Davet bulunamadı, süresi dolmuş olabilir ya da bu hesabın e-posta adresiyle eşleşmiyor."
          : "Davet kabul edilirken bir sorun oluştu.",
      );
    } finally {
      setAccepting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-muted/30 p-4">
      <Logo size={36} />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Çiftlik daveti</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {!token ? (
            <p className="text-muted-foreground">Davet bağlantısı geçersiz.</p>
          ) : !isLoaded ? (
            <p className="text-muted-foreground">Yükleniyor…</p>
          ) : !isSignedIn ? (
            <>
              <p className="text-muted-foreground">
                Daveti kabul etmek için davet e-postasının geldiği adresle giriş yapın ya da hesap oluşturun.
              </p>
              <Button
                className="w-full"
                onClick={() => router.push(`/sign-in?redirect_url=${encodeURIComponent(returnPath)}`)}
              >
                Giriş yap
              </Button>
            </>
          ) : (
            <>
              <p className="text-muted-foreground">Bu davet bir çiftlik şirketine katılım içindir.</p>
              {error ? <p className="text-destructive">{error}</p> : null}
              <Button className="w-full" onClick={handleAccept} disabled={accepting}>
                {accepting ? "Kabul ediliyor…" : "Daveti kabul et"}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Yanlış hesapla mı giriş yaptınız?{" "}
                <Link href="/sign-in" className="underline">
                  Farklı hesapla giriş yap
                </Link>
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AcceptInvitationPage() {
  return (
    <Suspense fallback={null}>
      <AcceptInvitationContent />
    </Suspense>
  );
}
