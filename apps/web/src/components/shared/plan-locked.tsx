import Link from "next/link";
import { ArrowRight, Check, Lock, Mail } from "lucide-react";
import { PLAN_FEATURE_LABEL, PLAN_LABEL, PlanFeature, minimumPlanFor } from "@aquai/types";
import { buttonVariants } from "@/components/ui/button";
import { CONTACT_EMAIL } from "@/lib/contact";
import { cn } from "@/lib/utils";

/** What each locked feature gives, in the customer's terms. */
const BENEFITS: Record<PlanFeature, string[]> = {
  [PlanFeature.COST_TRACKING]: [
    "Yem, işçilik ve ilaç giderlerini partilere dağıtın",
    "Kg başı üretim maliyetini ve dönem kârını görün",
    "Hedef ağırlığa kadar maliyet senaryoları kurun",
  ],
  [PlanFeature.INSPECTION_REPORT]: [
    "Resmî denetim için hazır üretim, sağlık ve su kalitesi raporu",
    "Tek tıkla yazdırın ya da Excel olarak indirin",
  ],
  [PlanFeature.EMAIL_ALERTS]: ["Kritik su kalitesi, ölüm artışı ve düşük yem stoğunda e-posta"],
  [PlanFeature.ADVANCED_REPORTS]: [
    "Çiftliklerinizi stok, FCR, ölüm, hasat ve maliyetle yan yana karşılaştırın",
    "Tüm kayıtları sekme sekme Excel'e aktarın",
    "FCR'ı sapan ve ölümü artan partiler otomatik işaretlensin",
  ],
  [PlanFeature.AI_ASSISTANT]: [
    "Verilerinize Türkçe soru sorun: \"Bu hafta hangi partide sorun var?\"",
    "Stok, FCR, ölüm, su kalitesi ve büyüme tahminini sizin için yorumlasın",
    "Çiftliklerinizi karşılaştırsın, nedenleri açıklasın",
  ],
};

/**
 * Stands in for a feature the company's plan doesn't include: what it does, which plan has it,
 * and how to get it. `compact` is the one-line version for dashboard panels.
 */
export function PlanLocked({ feature, compact = false }: { feature: PlanFeature; compact?: boolean }) {
  const plan = PLAN_LABEL[minimumPlanFor(feature)];
  const mailto = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`${plan} planına geçmek istiyorum`)}`;

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-teal-500/40 bg-teal-500/5 px-4.5 py-3.5">
        <Lock className="size-4 shrink-0 text-teal-500" />
        <p className="min-w-0 flex-1 text-sm text-foreground">
          <span className="font-medium">{PLAN_FEATURE_LABEL[feature]}</span>{" "}
          <span className="text-muted-foreground">{plan} planında.</span>
        </p>
        <Link href="/settings#plan" className="inline-flex items-center gap-1 text-xs font-medium text-teal-500 hover:underline">
          Planınızı görün <ArrowRight className="size-3" />
        </Link>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card ring-1 ring-foreground/5">
      <div className="flex items-center gap-3 bg-navy-900 px-5 py-4 text-white">
        <div className="flex size-9 items-center justify-center rounded-lg bg-white/10">
          <Lock className="size-4 text-teal-400" />
        </div>
        <div>
          <div className="text-[11px] font-medium tracking-wide text-teal-400 uppercase">{plan} ve üzeri</div>
          <div className="font-display text-base font-semibold">{PLAN_FEATURE_LABEL[feature]}</div>
        </div>
      </div>
      <div className="space-y-4 px-5 py-5">
        <ul className="space-y-2">
          {BENEFITS[feature].map((benefit) => (
            <li key={benefit} className="flex items-start gap-2 text-sm text-foreground">
              <Check className="mt-0.5 size-4 shrink-0 text-teal-500" />
              {benefit}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <a href={mailto} className={cn(buttonVariants({ size: "sm" }))}>
            <Mail className="size-4" /> {plan} planına geçin
          </a>
          <Link href="/pricing" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            Planları karşılaştırın
          </Link>
        </div>
      </div>
    </div>
  );
}
