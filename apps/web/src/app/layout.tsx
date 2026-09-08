import type { Metadata, Viewport } from "next";
import { DM_Sans, Inter, JetBrains_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "@/components/ui/sonner";
import { QueryProvider } from "@/components/providers/query-provider";
import { ActiveCompanyProvider } from "@/components/providers/active-company-provider";
import { PwaRegister } from "@/components/providers/pwa-register";
import "./globals.css";

const dmSans = DM_Sans({
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

export const metadata: Metadata = {
  title: "Piscatio — Aquaculture Farm Management",
  description: "Multi-tenant farm management platform for aquaculture operations.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Piscatio",
  },
};

export const viewport: Viewport = {
  themeColor: "#14b8a6",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html
        lang="tr"
        className={`${dmSans.variable} ${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
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
