"use client";

import * as React from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Hands the sign-in over to the desktop app via its piscatio:// link, once automatically. */
export function OpenDesktopApp({ deepLink }: { deepLink: string }) {
  React.useEffect(() => {
    window.location.href = deepLink;
  }, [deepLink]);

  return (
    <>
      <h1 className="font-display text-lg font-semibold text-foreground">Piscatio uygulamasına dönülüyor</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Tarayıcı &quot;Piscatio açılsın mı?&quot; diye sorarsa izin verin. Uygulama açılmazsa aşağıdaki düğmeye basın.
        Bu sekmeyi sonra kapatabilirsiniz.
      </p>
      <a href={deepLink} className={cn(buttonVariants({ variant: "default" }), "mt-6 w-full")}>
        Piscatio&apos;yu aç
      </a>
    </>
  );
}
