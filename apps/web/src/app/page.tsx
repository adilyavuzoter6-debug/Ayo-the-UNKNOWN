import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import {
  Waves,
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
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-md bg-teal-500">
              <Waves className="size-4.5 text-white" strokeWidth={2.5} />
            </div>
            <span className="font-display text-lg font-bold tracking-tight text-foreground">
              Piscatio
            </span>
          </div>
          <div className="flex items-center gap-2">
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
        <section className="mx-auto max-w-4xl px-4 py-20 text-center md:px-6 md:py-28">
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground md:text-5xl">
            Alabalık çiftliğinizi <span className="text-teal-500">tek yerden</span> yönetin
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground md:text-lg">
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
        </section>

        <section className="border-t border-border bg-card/50 py-16">
          <div className="mx-auto max-w-6xl px-4 md:px-6">
            <div className="mx-auto mb-10 max-w-xl text-center">
              <h2 className="font-display text-2xl font-bold tracking-tight text-foreground">
                Çiftliğinizin her yönü, tek panelde
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map((feature) => (
                <div
                  key={feature.title}
                  className="rounded-xl border border-border bg-card p-5 ring-1 ring-foreground/5"
                >
                  <div className="mb-3 flex size-9 items-center justify-center rounded-lg bg-teal-500/10">
                    <feature.icon className="size-4.5 text-teal-500" />
                  </div>
                  <h3 className="font-display text-sm font-semibold text-foreground">
                    {feature.title}
                  </h3>
                  <p className="mt-1.5 text-[13px] leading-snug text-muted-foreground">
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
      </main>

      <footer className="border-t border-border py-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 text-xs text-muted-foreground md:px-6">
          <span>© {new Date().getFullYear()} Piscatio Technologies</span>
          <span>Su ürünleri çiftlik yönetimi</span>
        </div>
      </footer>
    </div>
  );
}
