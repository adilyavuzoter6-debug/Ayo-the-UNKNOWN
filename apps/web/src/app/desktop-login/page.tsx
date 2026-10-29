import { auth, clerkClient } from "@clerk/nextjs/server";
import { Logo } from "@/components/shared/logo";
import { OpenDesktopApp } from "./open-desktop-app";

/**
 * Second half of signing in to the desktop app through the system browser. Google refuses to sign
 * in inside embedded browsers, so the desktop app opens this page in the user's real browser
 * instead; the proxy sends a signed-out visitor through /sign-in first and back here. Once signed
 * in, this mints a short-lived, single-use Clerk sign-in token and hands it to the desktop app
 * over the piscatio:// link, along with the `state` the app generated, so the app only accepts a
 * hand-off it actually asked for.
 */
const STATE_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const TOKEN_LIFETIME_SECONDS = 120;

export default async function DesktopLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { state } = await searchParams;
  const { userId } = await auth();

  let deepLink: string | null = null;
  if (userId && typeof state === "string" && STATE_PATTERN.test(state)) {
    const client = await clerkClient();
    const { token } = await client.signInTokens.createSignInToken({
      userId,
      expiresInSeconds: TOKEN_LIFETIME_SECONDS,
    });
    deepLink = `piscatio://auth?ticket=${encodeURIComponent(token)}&state=${encodeURIComponent(state)}`;
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-muted/30 p-4">
      <Logo size={36} />
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-sm">
        {deepLink ? (
          <OpenDesktopApp deepLink={deepLink} />
        ) : (
          <>
            <h1 className="font-display text-lg font-semibold text-foreground">Bağlantı geçersiz</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Bu sayfa Piscatio masaüstü uygulamasından açılmalı. Uygulamada &quot;Tarayıcıda giriş yap&quot;
              düğmesine tekrar basın.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
