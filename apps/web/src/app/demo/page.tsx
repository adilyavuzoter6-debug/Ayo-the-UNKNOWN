"use client";

import * as React from "react";
import Link from "next/link";
import { useAuth, useUser } from "@clerk/nextjs";
import { Loader2 } from "lucide-react";
import { Logo } from "@/components/shared/logo";
import { Button, buttonVariants } from "@/components/ui/button";
import { API_URL } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type State = { kind: "starting" } | { kind: "error"; message: string };

/** Opens a demo and moves on to signing in with its ticket; returns what went wrong otherwise. */
async function openDemo(): Promise<State | null> {
  try {
    const res = await fetch(`${API_URL}/demo`, { method: "POST" });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        kind: "error",
        message:
          res.status === 429
            ? "Kısa sürede çok fazla demo açıldı. Lütfen biraz sonra tekrar deneyin."
            : (body?.error?.message ?? "Demo açılamadı. Lütfen tekrar deneyin."),
      };
    }
    const ticket = body.data.ticket as string;
    window.location.replace(
      `/sign-in?__clerk_ticket=${encodeURIComponent(ticket)}&redirect_url=${encodeURIComponent("/dashboard")}`,
    );
    return null;
  } catch {
    return { kind: "error", message: "Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin." };
  }
}

/**
 * The live demo's front door: opens a private demo for this visitor through the API and signs
 * them into it with the single-use ticket it returns. Someone signed in to a real account is
 * asked to sign out first; someone already in a demo goes straight back to it.
 */
export default function DemoPage() {
  const { isLoaded, isSignedIn, signOut } = useAuth();
  const { user } = useUser();
  const [state, setState] = React.useState<State>({ kind: "starting" });
  const started = React.useRef(false);

  const demoUser = user?.publicMetadata?.demo === true;
  const signedInElsewhere = isLoaded && isSignedIn && !demoUser;

  const start = React.useCallback(() => {
    void openDemo().then((failure) => failure && setState(failure));
  }, []);

  React.useEffect(() => {
    if (!isLoaded || started.current) return;
    if (isSignedIn) {
      if (demoUser) {
        started.current = true;
        window.location.replace("/dashboard");
      }
      return;
    }
    started.current = true;
    start();
  }, [isLoaded, isSignedIn, demoUser, start]);

  const email = user?.primaryEmailAddress?.emailAddress ?? "";

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-navy-950 via-navy-900 to-navy-800 px-4 text-white">
      <div className="pointer-events-none absolute -top-24 -right-16 size-96 rounded-full bg-teal-500/20 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-32 -left-16 size-80 rounded-full bg-teal-400/10 blur-3xl" aria-hidden />
      <div className="relative flex w-full max-w-md flex-col items-center gap-6 text-center">
        <Logo size={40} wordmarkClassName="text-white text-2xl" />
        {signedInElsewhere ? (
          <div className="space-y-4">
            <h1 className="font-display text-2xl font-bold">Demoyu açmak için çıkış yapın</h1>
            <p className="text-sm text-white/70">
              Şu anda {email ? <span className="text-white">{email}</span> : "kendi hesabınızla"} giriş yapmış
              durumdasınız. Demo ayrı bir hesapta açılır; hesabınızdaki veriler etkilenmez.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => signOut({ redirectUrl: "/demo" })} className="bg-teal-500 text-navy-950 hover:bg-teal-400">
                Çıkış yap ve demoyu aç
              </Button>
              <Link href="/dashboard" className={cn(buttonVariants({ variant: "ghost" }), "text-white hover:bg-white/10 hover:text-white")}>
                Hesabıma dön
              </Link>
            </div>
          </div>
        ) : state.kind === "starting" ? (
          <>
            <Loader2 className="size-8 animate-spin text-teal-400" />
            <div>
              <h1 className="font-display text-2xl font-bold">Demonuz hazırlanıyor</h1>
              <p className="mt-2 text-sm text-white/70">
                Örnek bir alabalık çiftliğini sizin için kuruyoruz: 3 çiftlik, 19 havuz, aylar süren kayıt. Birkaç
                saniye sürer.
              </p>
            </div>
          </>
        ) : (
          <div className="space-y-4">
            <h1 className="font-display text-2xl font-bold">Demo açılamadı</h1>
            <p className="text-sm text-white/70">{state.message}</p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                onClick={() => {
                  setState({ kind: "starting" });
                  start();
                }}
                className="bg-teal-500 text-navy-950 hover:bg-teal-400">
                Tekrar deneyin
              </Button>
              <Link href="/" className={cn(buttonVariants({ variant: "ghost" }), "text-white hover:bg-white/10 hover:text-white")}>
                Ana sayfa
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
