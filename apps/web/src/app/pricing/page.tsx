import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Waves, Check, Clock } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TIERS = [
  {
    slug: "STARTER",
    name: "Başlangıç",
    price: 59,
    description: "Tek çiftlikli küçük işletmeler için.",
    features: [
      "1 çiftlik, 5 tanka kadar",
      "Üretim, yemleme, sağlık takibi",
      "Su kalitesi ölçümleri",
      "Hasat kayıtları",
    ],
    highlighted: false,
  },
  {
    slug: "STANDARD",
    name: "Standart",
    price: 179,
    description: "Büyüyen, çoklu tesisli işletmeler için.",
    features: [
      "Sınırsız çiftlik ve tank",
      "Kritik uyarılar için e-posta bildirimi",
      "Üretim maliyeti takibi",
      "Denetim raporu (PDF/yazdır)",
    ],
    highlighted: true,
  },
  {
    slug: "PROFESSIONAL",
    name: "Profesyonel",
    price: 499,
    description: "Kurumsal ölçekli işletmeler için.",
    features: [
      "Standart'taki her şey",
      "Öncelikli destek",
      "Gelişmiş raporlama",
      "Özel entegrasyon desteği",
    ],
    highlighted: false,
  },
] as const;

export default async function PricingPage() {
  const { userId } = await auth();
  if (userId) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-md bg-teal-500">
              <Waves className="size-4.5 text-white" strokeWidth={2.5} />
            </div>
            <span className="font-display text-lg font-bold tracking-tight text-foreground">
              Piscatio
            </span>
          </Link>
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
        <section className="mx-auto max-w-3xl px-4 py-16 text-center md:px-6">
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            Basit, şeffaf fiyatlandırma
          </h1>
          <p className="mt-4 text-base text-muted-foreground">
            Her plan <span className="font-medium text-foreground">30 gün ücretsiz deneme</span> ile
            başlar, kredi kartı gerekmez.
          </p>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-20 md:px-6">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {TIERS.map((tier) => (
              <div
                key={tier.slug}
                className={cn(
                  "flex flex-col rounded-xl border p-6",
                  tier.highlighted
                    ? "border-teal-500 bg-card ring-2 ring-teal-500"
                    : "border-border bg-card ring-1 ring-foreground/5",
                )}
              >
                {tier.highlighted ? (
                  <span className="mb-3 inline-block w-fit rounded-full bg-teal-500/10 px-2.5 py-0.5 text-[11px] font-medium text-teal-600 dark:text-teal-400">
                    En çok tercih edilen
                  </span>
                ) : null}
                <h2 className="font-display text-lg font-semibold text-foreground">{tier.name}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{tier.description}</p>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="font-display text-3xl font-bold text-foreground">
                    ${tier.price}
                  </span>
                  <span className="text-sm text-muted-foreground">/ay</span>
                </div>

                <ul className="mt-5 flex-1 space-y-2.5">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm text-foreground">
                      <Check className="mt-0.5 size-4 shrink-0 text-teal-500" />
                      {feature}
                    </li>
                  ))}
                </ul>

                <Link
                  href="/sign-up"
                  className={cn(
                    buttonVariants({ variant: tier.highlighted ? "default" : "outline" }),
                    "mt-6 w-full",
                  )}
                >
                  30 Gün Ücretsiz Dene
                </Link>
                <p className="mt-2 flex items-center justify-center gap-1 text-center text-[11px] text-muted-foreground">
                  <Clock className="size-3" /> Ödeme sistemi yakında aktif olacak
                </p>
              </div>
            ))}
          </div>

          <p className="mx-auto mt-10 max-w-xl text-center text-xs text-muted-foreground">
            Fiyatlar dolar cinsinden gösterilmektedir; ödeme Türk Lirası karşılığı üzerinden
            alınacaktır.
          </p>
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
