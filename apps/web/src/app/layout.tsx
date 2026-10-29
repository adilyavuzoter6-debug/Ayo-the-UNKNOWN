import type { Metadata, Viewport } from "next";
import { Sora, Inter, JetBrains_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "@/components/ui/sonner";
import { QueryProvider } from "@/components/providers/query-provider";
import { ActiveCompanyProvider } from "@/components/providers/active-company-provider";
import { PwaRegister } from "@/components/providers/pwa-register";
import { clerkLocalization } from "@/lib/clerk-localization";
import "./globals.css";

const sora = Sora({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const inter = Inter({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono-data",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const DESCRIPTION =
  "Alabalık ve su ürünleri çiftlikleri için üretim, yemleme, sağlık, su kalitesi, hasat ve maliyet takibi; " +
  "kritik durumlarda anında uyarı, denetime hazır raporlar ve bağlantısız çalışan masaüstü uygulaması.";

export const metadata: Metadata = {
  metadataBase: new URL("https://piscatiotechnologies.com"),
  title: {
    default: "Piscatio — Su ürünleri çiftlik yönetim yazılımı",
    template: "%s · Piscatio",
  },
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    locale: "tr_TR",
    siteName: "Piscatio",
    title: "Piscatio — Alabalık çiftliğinizi tek yerden yönetin",
    description: DESCRIPTION,
  },
  twitter: { card: "summary_large_image" },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Piscatio",
  },
};

export const viewport: Viewport = {
  themeColor: "#00b4d8",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider localization={clerkLocalization}>
      <html
        lang="tr"
        className={`${sora.variable} ${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
        suppressHydrationWarning
      >
        <body className="min-h-full flex flex-col bg-background text-foreground">
          <QueryProvider>
            <ActiveCompanyProvider>{children}</ActiveCompanyProvider>
          </QueryProvider>
          <Toaster />
          <PwaRegister />
        </body>
      </html>
    </ClerkProvider>
  );
}
