import Link from "next/link";
import { Fish, HeartPulse, Scale, TrendingUp, Wheat } from "lucide-react";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Badge } from "@/components/ui/badge";

// Sample figures for the landing page; nothing here comes from a real company.
const KPIS = [
  { icon: Fish, color: "#0d2d5e", label: "Toplam Canlı Balık", value: "184.250", sub: "canlı stok" },
  { icon: Scale, color: "#00b4d8", label: "Güncel Biyokütle", value: "42,6", unit: "t", sub: "14 aktif parti" },
  { icon: TrendingUp, color: "#10b981", label: "FCR (30 gün)", value: "1,12", sub: "ortalama" },
  { icon: Wheat, color: "#f59e0b", label: "Bugünkü Yem", value: "512", unit: "kg", sub: "38 kayıt" },
];

const ANOMALIES = [
  {
    icon: HeartPulse,
    label: "Ölüm riski",
    severity: { label: "Yüksek", variant: "destructive" as const },
    lot: "AB-2026-014",
    where: "Kuzey · T-07",
    detail: "Haftalık ölüm %2,4 (önceki ortalama %0,3) · tankta açık oksijen alarmı",
  },
  {
    icon: Wheat,
    label: "Yüksek FCR",
    severity: { label: "Orta", variant: "warning" as const },
    lot: "AB-2026-009",
    where: "Merkez · H-03",
    detail: "FCR 1,46, aynı türdeki 11 partinin ortancası 1,12",
  },
];

const FARMS = [
  { name: "Merkez", fish: "96.400", fcr: "1,08", mortality: "0,9" },
  { name: "Kuzey", fish: "52.150", fcr: "1,21", mortality: "2,1", worst: true },
  { name: "Dere", fish: "35.700", fcr: "1,10", mortality: "0,7" },
];

/** A framed, sample-data picture of the app built from its own components, so it stays true to them. */
export function ProductPreview() {
  return (
    <figure className="mx-auto max-w-5xl">
      <div className="overflow-hidden rounded-xl border border-border bg-background shadow-2xl shadow-navy-900/10 ring-1 ring-foreground/5">
        <div className="flex items-center gap-1.5 border-b border-border bg-card px-4 py-2.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-foreground/15" />
          <span className="size-2.5 rounded-full bg-foreground/15" />
          <span className="size-2.5 rounded-full bg-foreground/15" />
          <span className="ml-3 truncate rounded-md bg-muted px-3 py-0.5 font-mono text-[11px] text-muted-foreground">
            piscatiotechnologies.com/dashboard
          </span>
        </div>

        <div className="space-y-3 p-3 text-left sm:p-5">
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            {KPIS.map((k) => (
              <KpiCard key={k.label} {...k} />
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
            <div className="rounded-xl border border-border bg-card lg:col-span-3">
              <div className="border-b border-border px-4 py-2.5 font-display text-sm font-semibold">Anomaliler (2)</div>
              {ANOMALIES.map((a) => (
                <div key={a.lot} className="flex items-start gap-3 border-b border-border px-4 py-3 last:border-b-0">
                  <a.icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-medium">{a.label}</span>
                      <Badge variant={a.severity.variant}>{a.severity.label}</Badge>
                      <span className="font-mono text-xs text-teal-500">{a.lot}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{a.where}</div>
                    <div className="mt-1 text-xs text-foreground">{a.detail}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-border bg-card lg:col-span-2">
              <div className="border-b border-border px-4 py-2.5 font-display text-sm font-semibold">
                Çiftlik karşılaştırması
              </div>
              <table className="w-full text-xs">
                <thead className="text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="px-4 py-2 text-left font-medium">Çiftlik</th>
                    <th className="px-2 py-2 text-right font-medium">Balık</th>
                    <th className="px-2 py-2 text-right font-medium">FCR</th>
                    <th className="px-4 py-2 text-right font-medium">Ölüm %</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {FARMS.map((f) => (
                    <tr key={f.name} className="border-b border-border last:border-b-0">
                      <td className="px-4 py-2 font-sans font-medium">{f.name}</td>
                      <td className="px-2 py-2 text-right">{f.fish}</td>
                      <td className={f.worst ? "px-2 py-2 text-right font-semibold text-warning" : "px-2 py-2 text-right"}>
                        {f.fcr}
                      </td>
                      <td className={f.worst ? "px-4 py-2 text-right font-semibold text-warning" : "px-4 py-2 text-right"}>
                        {f.mortality}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
      <figcaption className="mt-3 text-center text-xs text-muted-foreground">
        Örnek verilerle uygulama görünümü ·{" "}
        <Link href="/demo" className="font-medium text-teal-500 hover:underline">
          Canlı demoda kendiniz deneyin →
        </Link>
      </figcaption>
    </figure>
  );
}
