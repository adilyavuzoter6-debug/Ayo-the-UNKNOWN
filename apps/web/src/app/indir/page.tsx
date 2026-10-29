import type { Metadata } from "next";
import Link from "next/link";
import { Download, Laptop, Monitor, WifiOff } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Logo } from "@/components/shared/logo";
import { SiteFooter } from "@/components/landing/site-footer";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Masaüstü uygulaması",
  description: "Bağlantı koptuğunda da çalışan Piscatio masaüstü uygulamasını macOS ve Windows için indirin.",
};

// Installers are attached to GitHub releases by .github/workflows/desktop-release.yml. Their file
// names carry no version, so /releases/latest/download/<name> always serves the newest build.
const RELEASES = "https://github.com/adilyavuzoter6-debug/Ayo-the-UNKNOWN/releases/latest/download";

const PLATFORMS = [
  {
    icon: Laptop,
    name: "macOS",
    downloads: [
      { label: "Apple Silicon (M1 ve sonrası)", file: "Piscatio-mac-arm64.dmg" },
      { label: "Intel işlemcili Mac", file: "Piscatio-mac-x64.dmg" },
    ],
    firstLaunch:
      "İlk açılışta macOS uygulamanın doğrulanamadığını söyler. Sistem Ayarları › Gizlilik ve Güvenlik bölümünde en alttaki “Yine de Aç” düğmesine basın; bu yalnızca bir kez gerekir.",
  },
  {
    icon: Monitor,
    name: "Windows",
    downloads: [{ label: "Windows 10 / 11 (64 bit)", file: "Piscatio-win-x64.exe" }],
    firstLaunch:
      "Kurulumda Windows SmartScreen uyarısı çıkarsa “Ek bilgi”ye, ardından “Yine de çalıştır”a tıklayın.",
  },
] as const;

export default function DownloadPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-6">
          <Link href="/">
            <Logo size={32} wordmarkClassName="text-foreground" />
          </Link>
          <Link href="/sign-in" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
            Giriş Yap
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-3xl px-4 pb-10 pt-16 text-center md:px-6 md:pt-20">
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            Piscatio masaüstü uygulaması
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground">
            Çiftlikte bağlantı koptuğunda da çalışır: son görüntülediğiniz veriler açık kalır, yemleme,
            ölüm ve su kalitesi kayıtları bağlantı geldiğinde otomatik gönderilir.
          </p>
        </section>

        <section className="mx-auto grid max-w-4xl grid-cols-1 gap-4 px-4 pb-12 md:grid-cols-2 md:px-6">
          {PLATFORMS.map((platform) => (
            <div
              key={platform.name}
              className="flex flex-col rounded-xl border border-border bg-card p-6 ring-1 ring-foreground/5"
            >
              <div className="mb-4 flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-lg bg-teal-500/10">
                  <platform.icon className="size-5 text-teal-500" />
                </div>
                <h2 className="font-display text-lg font-semibold text-foreground">{platform.name}</h2>
              </div>
              <div className="flex flex-col gap-2">
                {platform.downloads.map((download) => (
                  <a
                    key={download.file}
                    href={`${RELEASES}/${download.file}`}
                    className={cn(buttonVariants({ variant: "default" }), "justify-start")}
                  >
                    <Download className="size-4" />
                    {download.label}
                  </a>
                ))}
              </div>
              <p className="mt-4 text-[13px] leading-snug text-muted-foreground">
                {platform.firstLaunch}
              </p>
            </div>
          ))}
        </section>

        <section className="mx-auto max-w-4xl px-4 pb-16 md:px-6">
          <div className="flex items-start gap-3 rounded-xl border border-border bg-card/50 p-5">
            <WifiOff className="mt-0.5 size-4 shrink-0 text-teal-500" />
            <p className="text-sm text-muted-foreground">
              Uygulamayı ilk kez açtığınızda internet bağlantısı gerekir; giriş yapıp ekranları bir kez
              görüntüledikten sonra bağlantısız da açılır. Transfer, hasat ve ayarlar gibi tüm ekibi
              etkileyen işlemler yalnızca çevrimiçiyken yapılabilir. Güncellemeler çıktığında uygulama
              sizi haberdar eder.
            </p>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
