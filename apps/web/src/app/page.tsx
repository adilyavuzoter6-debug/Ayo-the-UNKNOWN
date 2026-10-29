import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import {
  Fish,
  Wheat,
  HeartPulse,
  Droplets,
  Scissors,
  Wallet,
  BarChart3,
  Building2,
  Bell,
  ShieldCheck,
  ArrowRight,
  Download,
  WifiOff,
  FileSpreadsheet,
  Activity,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Logo } from "@/components/shared/logo";
import { ProductPreview } from "@/components/landing/product-preview";
import { cn } from "@/lib/utils";

const HIGHLIGHTS = [
  {
    icon: WifiOff,
    title: "Bağlantı koptuğunda da çalışır",
    description:
      "Masaüstü uygulaması internetsiz açılır; yemleme, ölüm ve su kalitesi kayıtları bağlantı gelince kendiliğinden gönderilir.",
    href: "/indir",
    linkLabel: "Uygulamayı indirin",
  },
  {
    icon: Activity,
    title: "Sorunu siz fark etmeden işaretler",
    description:
      "Ölümleri kendi geçmişine göre artan, FCR'ı hedefinden ya da benzerlerinden sapan partiler gerekçesiyle listelenir.",
  },
  {
    icon: FileSpreadsheet,
    title: "Çiftlikleri yan yana koyun",
    description:
      "Stok, yem, FCR, ölüm, hasat ve maliyeti çiftlik çiftlik karşılaştırın; tüm kayıtlarla birlikte Excel'e aktarın.",
  },
];

const FEATURES = [
  {
    icon: Fish,
    title: "Üretim Takibi",
    description: "Parti ve tank bazlı stok, FCR/SGR hesaplamaları ve büyüme eğrileri.",
  },
  {
    icon: Wheat,
    title: "Yemleme & Envanter",
    description: "Yem stok takibi, otomatik düşük stok uyarısı, yemleme kayıtları.",
  },
  {
    icon: HeartPulse,
    title: "Sağlık & Ölüm",
    description: "Ölüm kayıtları, veteriner tedavileri ve yasal arınma süresi takibi.",
  },
  {
    icon: Droplets,
    title: "Su Kalitesi",
    description: "Sıcaklık, oksijen, pH ölçümleri — kritik eşik aşıldığında anında uyarı.",
  },
  {
    icon: Scissors,
    title: "Hasat",
    description: "Planlı ve gerçekleşen hasatları kaydedin, canlı stoktan otomatik düşülsün.",
  },
  {
    icon: Wallet,
    title: "Maliyetler",
    description: "Yem, işçilik, ilaç gideri — parti bazlı kg başı maliyet raporu.",
  },
  {
    icon: BarChart3,
    title: "Denetim Raporu",
    description: "Resmi denetimler için tek tıkla hazır, yazdırılabilir üretim raporu.",
  },
  {
    icon: Building2,
    title: "Çoklu Çiftlik",
    description: "Birden fazla çiftlik, tesis, kafes/havuz/tankı tek panelden yönetin.",
  },
];

export default async function RootPage() {
  const { userId } = await auth();
  if (userId) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 px-4 md:px-6">
          <Logo size={32} wordmarkClassName="text-foreground" />
          <div className="flex items-center gap-1 sm:gap-2">
            {/* Pricing moves to the footer on phones, where three header links don't fit. */}
            <Link
              href="/pricing"
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "hidden sm:inline-flex")}
            >
              Fiyatlandırma
            </Link>
            <Link href="/sign-in" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
              Giriş Yap
            </Link>
            <Link href="/sign-up" className={cn(buttonVariants({ variant: "default", size: "sm" }))}>
              Ücretsiz Başla
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-4xl px-4 pt-16 pb-12 text-center md:px-6 md:pt-24">
          <h1 className="font-display text-3xl font-bold tracking-tight text-balance text-foreground md:text-5xl">
            Alabalık çiftliğinizi <span className="text-teal-500">tek yerden</span> yönetin
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-pretty text-muted-foreground md:text-lg">
            Üretim, yemleme, sağlık, su kalitesi, hasat ve maliyet takibini bir araya getiren; kritik
            durumları anında e-posta ile bildiren, denetime hazır raporlar üreten su ürünleri çiftlik
            yönetim yazılımı.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/sign-up"
              className={cn(buttonVariants({ variant: "default", size: "lg" }), "px-6")}
            >
              Ücretsiz Başla <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/sign-in"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }), "px-6")}
            >
              Zaten hesabım var
            </Link>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">30 gün ücretsiz · Kredi kartı gerekmez</p>
          <Link
            href="/indir"
            className="mx-auto mt-5 block max-w-sm text-sm text-balance text-muted-foreground hover:text-foreground sm:max-w-none"
          >
            <Download className="mr-1.5 inline size-4 align-[-3px]" />
            Bağlantısız da çalışan masaüstü uygulamasını indirin (macOS, Windows)
          </Link>
        </section>

        <section className="px-4 pb-16 md:px-6 md:pb-24">
          <ProductPreview />
        </section>

        <section className="border-t border-border py-16">
          <div className="mx-auto grid max-w-6xl grid-cols-1 gap-4 px-4 md:grid-cols-3 md:px-6">
            {HIGHLIGHTS.map((h) => (
              <div key={h.title} className="rounded-xl border border-border bg-card p-6 ring-1 ring-foreground/5">
                <div className="mb-4 flex size-10 items-center justify-center rounded-lg bg-navy-900">
                  <h.icon className="size-5 text-teal-400" />
                </div>
                <h3 className="font-display text-base font-semibold text-foreground">{h.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{h.description}</p>
                {h.href ? (
                  <Link
                    href={h.href}
                    className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-teal-500 hover:underline"
                  >
                    {h.linkLabel} <ArrowRight className="size-3.5" />
                  </Link>
                ) : null}
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-border bg-card/50 py-16">
          <div className="mx-auto max-w-6xl px-4 md:px-6">
            <div className="mx-auto mb-10 max-w-xl text-center">
              <h2 className="font-display text-2xl font-bold tracking-tight text-foreground">
                Çiftliğinizin her yönü, tek panelde
              </h2>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              {FEATURES.map((feature) => (
                <div
                  key={feature.title}
                  className="rounded-xl border border-border bg-card p-4 ring-1 ring-foreground/5 sm:p-5"
                >
                  <div className="mb-3 flex size-9 items-center justify-center rounded-lg bg-teal-500/10">
                    <feature.icon className="size-4.5 text-teal-500" />
                  </div>
                  <h3 className="font-display text-sm font-semibold text-foreground">
                    {feature.title}
                  </h3>
                  <p className="mt-1.5 text-xs leading-snug text-muted-foreground sm:text-[13px]">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-border py-16">
          <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-4 md:grid-cols-2 md:px-6">
            <div className="flex items-start gap-4">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-navy-900">
                <Bell className="size-5 text-teal-400" />
              </div>
              <div>
                <h3 className="font-display text-base font-semibold text-foreground">
                  Kritik durumlarda anında haber
                </h3>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Su kalitesi kritik seviyeye ulaştığında, ölüm oranı arttığında ya da yem stoğu
                  azaldığında, uygulamayı açık tutmanıza gerek kalmadan e-posta ile haberdar olursunuz.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-navy-900">
                <ShieldCheck className="size-5 text-teal-400" />
              </div>
              <div>
                <h3 className="font-display text-base font-semibold text-foreground">
                  Denetime her zaman hazır
                </h3>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Su Ürünleri Yetiştiriciliği Yönetmeliği kapsamındaki denetimler için gereken üretim,
                  sağlık ve su kalitesi kayıtlarını tek tıkla, yazdırılabilir bir rapor olarak alın.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 pb-16 md:px-6">
          <div className="mx-auto flex max-w-6xl flex-col items-center gap-5 rounded-2xl bg-navy-900 px-6 py-12 text-center md:py-14">
            <h2 className="font-display text-2xl font-bold tracking-tight text-balance text-white md:text-3xl">
              İlk partinizi bugün kaydedin
            </h2>
            <p className="max-w-xl text-sm text-pretty text-white/70 md:text-base">
              Kurulum yok, kredi kartı yok. 30 gün boyunca tüm özellikleri ücretsiz kullanın; çiftliğinize
              uyup uymadığına kendi verinizle karar verin.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link
                href="/sign-up"
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "bg-teal-500 px-6 text-navy-950 hover:bg-teal-400",
                )}
              >
                Ücretsiz Başla <ArrowRight className="size-4" />
              </Link>
              <Link
                href="/pricing"
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" }),
                  "border-white/25 bg-transparent px-6 text-white hover:bg-white/10 hover:text-white",
                )}
              >
                Fiyatları görün
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between md:px-6">
          <span>© {new Date().getFullYear()} Piscatio Technologies</span>
          <nav className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/pricing" className="hover:text-foreground">
              Fiyatlandırma
            </Link>
            <Link href="/indir" className="hover:text-foreground">
              Masaüstü uygulaması
            </Link>
            <Link href="/sign-in" className="hover:text-foreground">
              Giriş yap
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
