"use client";

import Link from "next/link";
import { SignIn, SignUp } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { useDesktopBridge } from "@/lib/desktop";

const variables = { colorPrimary: "#00b4d8", borderRadius: "0.625rem" };

/**
 * Clerk's sign-in/sign-up card. Inside the desktop app, Google won't sign in from an embedded
 * browser, so its in-card button is hidden and replaced by one that continues in the system
 * browser (see apps/web/src/app/desktop-login/page.tsx); email sign-in keeps working in-app.
 */
export function AuthCard({ mode }: { mode: "sign-in" | "sign-up" }) {
  const desktop = useDesktopBridge();
  const appearance = {
    variables,
    elements: desktop
      ? { socialButtonsBlockButton__google: { display: "none" }, socialButtonsIconButton__google: { display: "none" } }
      : undefined,
  };

  return (
    <>
      {desktop ? (
        <div className="w-full max-w-[25rem] space-y-2 text-center">
          <Button className="w-full" onClick={() => desktop.signInInBrowser()}>
            Google ile giriş yap (tarayıcıda)
          </Button>
          <p className="text-xs text-muted-foreground">
            Google girişi tarayıcınızda açılır, ardından uygulamaya otomatik dönülür. E-posta ile aşağıdan giriş
            yapabilirsiniz.
          </p>
        </div>
      ) : null}
      {mode === "sign-in" ? <SignIn appearance={appearance} /> : <SignUp appearance={appearance} />}
      <p className="text-center text-sm text-muted-foreground">
        Önce denemek mi istersiniz?{" "}
        <Link href="/demo" className="font-medium text-teal-500 hover:underline">
          Hesap açmadan canlı demoyu açın →
        </Link>
      </p>
    </>
  );
}
