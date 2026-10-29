import Link from "next/link";
import {
  BarChart3,
  Building2,
  Droplets,
  Fish,
  HeartPulse,
  LayoutDashboard,
  Package,
  Scale,
  TrendingUp,
  Wallet,
  Wheat,
} from "lucide-react";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Badge } from "@/components/ui/badge";
import { AppIconMark } from "@/lib/app-icon";
import { ForecastPreview } from "./forecast-preview";

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
    where: "Kuzey · K-07",
    detail: "Haftalık ölüm %2,4 (önceki ortalama %0,3) · kafeste açık oksijen alarmı",
  },
  {
    icon: Wheat,
    label: "Yüksek FCR",
    severity: { label: "Orta", variant: "warning" as const },
    lot: "AB-2026-009",
    where: "Merkez · H-03",
    detail: "FCR 1,46; aynı türdeki 11 partinin ortancası 1,12",
  },
];

const FARMS = [
  { name: "Merkez", fish: "96.400", fcr: "1,08", mortality: "0,9" },
  { name: "Kuzey", fish: "52.150", fcr: "1,21", mortality: "2,1", worst: true },
  { name: "Dere", fish: "35.700", fcr: "1,10", mortality: "0,7" },
];

const NAV = [LayoutDashboard, Building2, Fish, Wheat, HeartPulse, Droplets, Package, Wallet, BarChart3];

// 30 days of feed (kg) and deaths for the trend card, drawn as plain SVG.
const FEED = [
  468, 472, 470, 481, 476, 489, 493, 488, 495, 501, 497, 506, 503, 511, 508, 499, 514, 509, 517, 512, 520, 515, 506,
  518, 523, 519, 526, 521, 515, 512,
];
const DEATHS = [62, 58, 61, 55, 57, 60, 54, 52, 56, 53, 51, 55, 50, 49, 52, 48, 51, 47, 50, 46, 49, 52, 58, 64, 71, 78, 84, 88, 93, 97];

function TrendCard() {
  const w = 300;
  const h = 96;
  const maxFeed = 560;
  const maxDeaths = 110;
  const bar = w / FEED.length;
  const line = DEATHS.map((d, i) => `${(i + 0.5) * bar},${h - (d / maxDeaths) * h}`).join(" ");
  return (
    <div className="flex h-full flex-col rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-2.5 font-display text-sm font-semibold">Son 30 gün</div>
      <div className="flex gap-6 px-4 pt-3">
        <div>
          <div className="text-[10px] text-muted-foreground">Verilen yem</div>
          <div className="font-mono text-sm font-semibold">15,1 t</div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground">Ölüm</div>
          <div className="font-mono text-sm font-semibold">1.801</div>
        </div>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="mt-auto h-28 w-full px-3 pb-3" preserveAspectRatio="none" aria-hidden>
        {FEED.map((f, i) => (
          <rect
            key={i}
            x={i * bar + 1}
            y={h - (f / maxFeed) * h}
            width={bar - 2}
            height={(f / maxFeed) * h}
            rx={1.5}
            className="fill-teal-500/80"
          />
        ))}
        <polyline points={line} fill="none" strokeWidth={2} className="stroke-warning" strokeLinejoin="round" />
      </svg>
      <div className="flex gap-4 px-4 pb-3 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="size-2 rounded-sm bg-teal-500" /> Yem
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-0.5 w-2.5 rounded bg-warning" /> Ölüm
        </span>
      </div>
    </div>
  );
}

/**
 * A framed picture of the app with sample data: its navy sidebar, the dashboard's opening band,
 * KPI cards, the growth forecast (switchable 1/3/6 months), the 30-day trend, anomalies and the
 * farm comparison. Built from the app's own components where it can be, so it stays true to them.
 */
export function ProductPreview() {
  return (
    <figure className="relative mx-auto max-w-6xl">
      {/* Brand glow behind the window. */}
      <div
        className="pointer-events-none absolute inset-x-0 -top-10 bottom-10 -z-10 md:-inset-x-10 rounded-[3rem] bg-gradient-to-b from-teal-500/15 via-navy-900/5 to-transparent blur-3xl"
        aria-hidden
      />
      <div className="overflow-hidden rounded-2xl border border-border bg-background shadow-2xl shadow-navy-900/20 ring-1 ring-foreground/5">
        <div className="flex items-center gap-1.5 border-b border-border bg-card px-4 py-2.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
          <span className="mx-auto truncate rounded-md bg-muted px-3 py-0.5 font-mono text-[11px] text-muted-foreground">
            piscatiotechnologies.com/dashboard
          </span>
          <span className="w-12" />
        </div>

        <div className="flex">
          <aside className="hidden w-14 shrink-0 flex-col items-center gap-1 bg-navy-900 py-3 md:flex" aria-hidden>
            <AppIconMark size={30} radius={8} />
            <div className="mt-3 flex flex-col gap-1">
              {NAV.map((Icon, i) => (
                <span
                  key={i}
                  className={
                    i === 0
                      ? "flex size-9 items-center justify-center rounded-lg bg-teal-500/20 text-white"
                      : "flex size-9 items-center justify-center rounded-lg text-white/45"
                  }
                >
                  <Icon className="size-4" />
                </span>
              ))}
            </div>
          </aside>

          <div className="min-w-0 flex-1 space-y-3 bg-muted/20 p-3 text-left sm:p-4">
            <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-navy-950 via-navy-900 to-navy-800 px-4 py-3.5 text-white">
              <div className="pointer-events-none absolute -top-10 -right-6 size-36 rounded-full bg-teal-500/25 blur-2xl" aria-hidden />
              <div className="relative flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="text-[11px] text-white/60">Perşembe, 29 Ekim</div>
                  <div className="font-display text-base font-bold sm:text-lg">Günaydın, Ahmet</div>
                  <div className="text-xs text-white/70">
                    <span className="font-medium text-white">Merkez Tesis</span> · 184.250 canlı balık · 42,6 t
                  </div>
                </div>
                <div className="hidden gap-1.5 sm:flex">
                  {[
                    { icon: Wheat, label: "Yemleme" },
                    { icon: HeartPulse, label: "Ölüm" },
                    { icon: Droplets, label: "Su ölçümü" },
                  ].map((a) => (
                    <span
                      key={a.label}
                      className="inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-[11px] ring-1 ring-white/15"
                    >
                      <a.icon className="size-3 text-teal-400" /> {a.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
              {KPIS.map((k) => (
                <KpiCard key={k.label} {...k} />
              ))}
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
              <div className="lg:col-span-3">
                <ForecastPreview />
              </div>
              <div className="lg:col-span-2">
                <TrendCard />
              </div>
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
                        <td className="px-4 py-2.5 font-sans font-medium">{f.name}</td>
                        <td className="px-2 py-2.5 text-right">{f.fish}</td>
                        <td className={f.worst ? "px-2 py-2.5 text-right font-semibold text-warning" : "px-2 py-2.5 text-right"}>
                          {f.fcr}
                        </td>
                        <td className={f.worst ? "px-4 py-2.5 text-right font-semibold text-warning" : "px-4 py-2.5 text-right"}>
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
      </div>
      <figcaption className="mt-4 text-center text-xs text-muted-foreground">
        Örnek verilerle uygulama görünümü · tahmin sekmelerine tıklayabilirsiniz ·{" "}
        <Link href="/demo" className="font-medium text-teal-500 hover:underline">
          Canlı demoda kendiniz deneyin →
        </Link>
      </figcaption>
    </figure>
  );
}
