"use client";

import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  Fish,
  Weight,
  Wheat,
  TrendingUp,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Clock,
  Scissors,
  Droplets,
  Package,
  Activity,
} from "lucide-react";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { PanelCard } from "@/components/shared/panel-card";

const biomassData = [
  { ay: "Mar", biyokütle: 720, hedef: 740 },
  { ay: "Nis", biyokütle: 755, hedef: 770 },
  { ay: "May", biyokütle: 790, hedef: 800 },
  { ay: "Haz", biyokütle: 820, hedef: 825 },
  { ay: "Tem", biyokütle: 845, hedef: 850 },
  { ay: "Ağu", biyokütle: 865, hedef: 870 },
];

const fcrData = [
  { hafta: "H1", fcr: 1.18 },
  { hafta: "H2", fcr: 1.15 },
  { hafta: "H3", fcr: 1.22 },
  { hafta: "H4", fcr: 1.14 },
  { hafta: "H5", fcr: 1.11 },
  { hafta: "H6", fcr: 1.12 },
];

const deathData = [
  { gun: "P", oran: 0.043 },
  { gun: "S", oran: 0.038 },
  { gun: "Ç", oran: 0.051 },
  { gun: "P", oran: 0.044 },
  { gun: "C", oran: 0.062 },
  { gun: "C", oran: 0.039 },
  { gun: "P", oran: 0.041 },
];

const farmDistribution = [
  { ciftlik: "Çiftlik A", ton: 312 },
  { ciftlik: "Çiftlik B", ton: 248 },
  { ciftlik: "Çiftlik C", ton: 185 },
  { ciftlik: "Çiftlik D", ton: 120 },
];

const alerts = [
  { id: 1, level: "critical" as const, text: "A-12 havuzunda oksijen kritik seviyede (5.2 mg/L)", time: "14 dk önce" },
  { id: 2, level: "warning" as const, text: "Salmon Pro 3mm yem stoğu 5 günlük seviyede", time: "1 sa önce" },
  { id: 3, level: "critical" as const, text: "B-07 havuzunda günlük ölüm oranı %0.18 (kritik)", time: "2 sa önce" },
  { id: 4, level: "info" as const, text: "C Çiftliği hasat planlaması 3 gün sonra başlıyor", time: "3 sa önce" },
];

const tasks = [
  { done: true, text: "A çiftliği sabah yemleme kaydı", time: "07:30" },
  { done: true, text: "B-04 havuzu numune alımı", time: "09:00" },
  { done: false, text: "Veteriner raporu onayı", time: "12:00" },
  { done: false, text: "Öğleden sonra yemleme — C çiftliği", time: "14:00" },
  { done: false, text: "Stok sayımı — Yem deposu", time: "16:30" },
];

const activities = [
  { icon: Wheat, color: "#00b4d8", text: "A Çiftliği — 12 havuz için yemleme kaydedildi", time: "8 dk önce" },
  { icon: Fish, color: "#0d2d5e", text: "B-07 havuzuna 4.200 balık transferi tamamlandı", time: "32 dk önce" },
  { icon: Droplets, color: "#3b82f6", text: "C-03 havuzu su kalitesi ölçümü eklendi", time: "1 sa önce" },
  { icon: AlertTriangle, color: "#f59e0b", text: "D çiftliği ölüm bildirimi — B-12, 38 adet", time: "2 sa önce" },
  { icon: Scissors, color: "#10b981", text: "A çiftliği Partition-2024-03 hasat tamamlandı", time: "4 sa önce" },
];

const criticalPools = [
  { pool: "B-07", farm: "B Çiftliği", rate: "%0.18", count: 89 },
  { pool: "A-12", farm: "A Çiftliği", rate: "%0.14", count: 62 },
  { pool: "C-05", farm: "C Çiftliği", rate: "%0.11", count: 44 },
];

const alertStyles: Record<string, { icon: typeof AlertCircle; text: string; bg: string }> = {
  critical: { icon: AlertCircle, text: "text-destructive", bg: "bg-destructive/5" },
  warning: { icon: AlertTriangle, text: "text-warning", bg: "bg-warning/10" },
  info: { icon: Activity, text: "text-info", bg: "bg-info/10" },
};

const chartTooltipStyle = {
  background: "var(--color-card)",
  border: "1px solid var(--color-border)",
  borderRadius: 6,
  fontSize: 12,
};
const axisTick = { fontSize: 11, fill: "var(--color-muted-foreground)" };

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-5">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {["Son 30 gün", "Tüm Çiftlikler", "Tüm Tesisler", "Tüm Türler"].map((f, i) => (
          <button
            key={f}
            type="button"
            className={
              i === 0
                ? "rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
                : "rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/60"
            }
          >
            {f}
          </button>
        ))}
        <div className="flex-1" />
        <span className="text-[11px] text-muted-foreground/80">Son güncelleme: bugün 09:41</span>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
        <KpiCard icon={Fish} color="#0d2d5e" label="Toplam Canlı Balık" value="2.485.300" change="+1,2%" changeDir="up" sub="geçen aya göre" />
        <KpiCard icon={Weight} color="#00b4d8" label="Güncel Biyokütle" value="865.420" unit="kg" change="+2.3t" changeDir="up" sub="dün" />
        <KpiCard icon={TrendingUp} color="#8b5cf6" label="Ortalama Ağırlık" value="348" unit="g" change="+4g" changeDir="up" sub="bu hafta" />
        <KpiCard icon={Wheat} color="#f59e0b" label="Günlük Yem" value="12.450" unit="kg" change="-230kg" changeDir="down" sub="hedefin altında" />
        <KpiCard icon={Activity} color="#ef4444" label="Günlük Ölüm" value="1.260" unit="adet" change="+12%" changeDir="down" sub="uyarı eşiğinde" />
        <KpiCard icon={TrendingUp} color="#10b981" label="FCR" value="1,12" change="-0,03" changeDir="up" sub="hedef: 1,15" />
        <KpiCard icon={Package} color="#f97316" label="Yem Stok Süresi" value="23" unit="gün" sub="yeterli seviye" />
        <KpiCard icon={Scissors} color="#10b981" label="Yaklaşan Hasat" value="185.000" unit="kg" sub="önümüzdeki 30 gün" />
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <PanelCard title="Biyokütle Gelişimi (ton)" action="Detay">
          <div className="p-3">
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={biomassData} margin={{ left: 8, right: 16, top: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="bgrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-navy-900)" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="var(--color-navy-900)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="tgrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-teal-500)" stopOpacity={0.12} />
                    <stop offset="95%" stopColor="var(--color-teal-500)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="ay" tick={axisTick} axisLine={false} tickLine={false} />
                <YAxis tick={axisTick} axisLine={false} tickLine={false} domain={[700, 900]} />
                <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => [`${Number(v)} ton`]} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Area type="monotone" dataKey="biyokütle" name="Gerçekleşen" stroke="var(--color-navy-900)" fill="url(#bgrad)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="hedef" name="Hedef" stroke="var(--color-teal-500)" fill="url(#tgrad)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </PanelCard>

        <PanelCard title="FCR Gelişimi (haftalık)" action="Detay">
          <div className="p-3">
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={fcrData} margin={{ left: 8, right: 16, top: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="hafta" tick={axisTick} axisLine={false} tickLine={false} />
                <YAxis tick={axisTick} axisLine={false} tickLine={false} domain={[1.05, 1.3]} />
                <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => [Number(v).toFixed(2), "FCR"]} />
                <Line type="monotone" dataKey="fcr" stroke="var(--color-teal-500)" strokeWidth={2} dot={{ r: 4, fill: "var(--color-teal-500)", strokeWidth: 0 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </PanelCard>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <PanelCard title="Günlük Ölüm Oranı (%)" action="Detay">
          <div className="p-3">
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={deathData} margin={{ left: 8, right: 12, top: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="gun" tick={axisTick} axisLine={false} tickLine={false} />
                <YAxis tick={axisTick} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => [`${Number(v)}%`, "Ölüm oranı"]} />
                <Bar dataKey="oran" fill="var(--color-destructive)" radius={[3, 3, 0, 0]} opacity={0.8} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </PanelCard>

        <PanelCard title="Çiftlik Bazlı Biyokütle (ton)" action="Detay">
          <div className="p-3">
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={farmDistribution} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
                <XAxis type="number" tick={axisTick} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="ciftlik" tick={axisTick} axisLine={false} tickLine={false} width={64} />
                <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => [`${Number(v)} ton`]} />
                <Bar dataKey="ton" fill="var(--color-navy-900)" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </PanelCard>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_1fr_1fr]">
        <PanelCard title="Kritik Uyarılar" action="Tümü">
          <div className="flex flex-col">
            {alerts.map((a) => {
              const style = alertStyles[a.level];
              const AlertIcon = style.icon;
              return (
                <div key={a.id} className={`flex gap-2.5 border-b border-border px-4.5 py-2.5 last:border-b-0 ${style.bg}`}>
                  <AlertIcon className={`mt-0.5 size-3.5 shrink-0 ${style.text}`} />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs leading-snug text-foreground">{a.text}</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground/80">{a.time}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </PanelCard>

        <PanelCard title="Bugünün Görevleri" action="Tümü">
          <div className="flex flex-col">
            {tasks.map((t, i) => (
              <div
                key={i}
                className="flex items-center gap-2.5 border-b border-border px-4.5 py-2.5 last:border-b-0"
                style={{ opacity: t.done ? 0.55 : 1 }}
              >
                <CheckCircle2 className={`size-3.5 ${t.done ? "text-success" : "text-border"}`} />
                <div className={`flex-1 text-xs text-foreground ${t.done ? "line-through" : ""}`}>{t.text}</div>
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground/80">
                  <Clock className="size-2.5" /> {t.time}
                </div>
              </div>
            ))}
          </div>
        </PanelCard>

        <PanelCard title="Kritik Ölüm — Havuzlar" action="Detay">
          <div className="flex flex-col">
            {criticalPools.map((p, i) => (
              <div key={i} className="flex items-center gap-2.5 border-b border-border px-4.5 py-2.5">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-destructive font-mono text-[11px] font-bold text-white">
                  {p.pool}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-foreground">{p.pool}</div>
                  <div className="text-[11px] text-muted-foreground">{p.farm}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-sm font-semibold text-destructive">{p.rate}</div>
                  <div className="text-[11px] text-muted-foreground/80">{p.count} adet</div>
                </div>
              </div>
            ))}

            <div className="mt-1 border-t border-border px-4.5 pt-3 pb-1">
              <div className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Son Aktiviteler
              </div>
              {activities.map((a, i) => (
                <div key={i} className="flex items-start gap-2 pb-2">
                  <a.icon className="mt-0.5 size-3.5 shrink-0" style={{ color: a.color }} />
                  <div className="flex-1">
                    <div className="text-[11.5px] leading-snug text-foreground">{a.text}</div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground/80">{a.time}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </PanelCard>
      </div>
    </div>
  );
}
