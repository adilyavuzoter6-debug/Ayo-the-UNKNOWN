"use client";

import * as React from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { PanelCard } from "@/components/shared/panel-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  useCalculateScenarios,
  useDeleteScenario,
  useSaveScenario,
  useSavedScenarios,
  useScenarioPrefill,
} from "@/hooks/use-cost-scenarios";
import { ApiError } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import type {
  ExpenseMode,
  FishBatch,
  ProjectionMode,
  SavedCostScenario,
  ScenarioExpenseInput,
  ScenarioInput,
  ScenarioOutcome,
  ScenarioResult,
  ScenarioStageInput,
} from "@/lib/types";

/** Text while typing; a number only when it parses. An empty field stays undefined, never 0. */
function num(value: string): number | undefined {
  const cleaned = value.trim().replace(",", ".");
  if (cleaned === "") return undefined;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

const fmt = (n: number, digits = 2) => n.toLocaleString("tr", { maximumFractionDigits: digits });
const tryFmt = (n: number | null) => (n === null ? "—" : `${fmt(n)} ₺`);
const perUnit = (n: number | null) => (n === null ? "—" : `${fmt(n)} ₺`);

interface StageRow {
  minG: string;
  maxG: string;
  price: string;
  fcr: string;
  days: string;
  mortality: string;
}

interface ExpenseRow {
  label: string;
  amount: string;
  mode: ExpenseMode;
}

/** The four ranges from the planning brief. Only the ranges are prefilled; every number stays for the user. */
const DEFAULT_STAGES: StageRow[] = [
  { minG: "3", maxG: "5", price: "", fcr: "", days: "", mortality: "" },
  { minG: "5", maxG: "20", price: "", fcr: "", days: "", mortality: "" },
  { minG: "20", maxG: "100", price: "", fcr: "", days: "", mortality: "" },
  { minG: "100", maxG: "350", price: "", fcr: "", days: "", mortality: "" },
];

/** A target weight and, optionally, its own duration. An empty duration is derived from the growth rate. */
interface TargetRow {
  target: string;
  days: string;
}

export function TargetWeightScenariosPanel({ farmId, batches }: { farmId: string; batches: FishBatch[] }) {
  const [batchId, setBatchId] = React.useState("");
  const [startCount, setStartCount] = React.useState("");
  const [startWeight, setStartWeight] = React.useState("");
  const [startCost, setStartCost] = React.useState("");
  const [mode, setMode] = React.useState<ProjectionMode>("SIMPLE");
  const [price, setPrice] = React.useState("");
  const [fcr, setFcr] = React.useState("");
  const [sgr, setSgr] = React.useState("");
  const [mortality, setMortality] = React.useState("");
  const [stages, setStages] = React.useState<StageRow[]>(DEFAULT_STAGES);
  const [expenses, setExpenses] = React.useState<ExpenseRow[]>([{ label: "", amount: "", mode: "TOTAL" }]);
  const [targets, setTargets] = React.useState<TargetRow[]>([
    { target: "20", days: "" },
    { target: "100", days: "" },
    { target: "350", days: "" },
  ]);
  const [outcomes, setOutcomes] = React.useState<ScenarioOutcome[] | null>(null);
  const [scenarioName, setScenarioName] = React.useState("");

  const prefill = useScenarioPrefill(farmId, batchId || undefined);
  const calculate = useCalculateScenarios(farmId);
  const saved = useSavedScenarios(farmId);
  const saveScenario = useSaveScenario(farmId);
  const deleteScenario = useDeleteScenario(farmId);

  // Pulls what is recorded for the chosen batch into the start fields. Explicit, so a value the user has
  // typed is never overwritten by surprise.
  async function onPrefill() {
    const result = await prefill.refetch();
    if (!result.data) return;
    setStartCount(String(result.data.startCount));
    setStartWeight(String(result.data.startAvgWeightG));
    setStartCost(String(result.data.startAccumulatedCostTry));
    if (result.data.sgrPctPerDay !== null && sgr.trim() === "") {
      setSgr(String(Math.round(result.data.sgrPctPerDay * 10000) / 10000));
    }
    if (result.data.feedPriceTryPerKg !== null && price.trim() === "") {
      setPrice(String(result.data.feedPriceTryPerKg));
    }
    toast.success("Parti bilgileri alındı.");
  }

  function buildInputs(): ScenarioInput[] {
    const common = {
      startCount: num(startCount),
      startAvgWeightG: num(startWeight),
      startAccumulatedCostTry: num(startCost),
    };
    const expenseInputs: ScenarioExpenseInput[] = expenses
      .filter((e) => e.label.trim() !== "" || e.amount.trim() !== "")
      .map((e) => ({ label: e.label, amountTry: num(e.amount) as number, mode: e.mode }));

    return targets
      .filter((t) => t.target.trim() !== "")
      .map<ScenarioInput>((t) =>
        mode === "SIMPLE"
          ? {
              ...common,
              mode: "SIMPLE",
              targetWeightG: num(t.target),
              durationDays: num(t.days),
              sgrPctPerDay: num(sgr),
              feedPriceTryPerKg: num(price),
              fcr: num(fcr),
              mortalityPct: num(mortality),
              expenses: expenseInputs,
            }
          : {
              ...common,
              mode: "STAGED",
              targetWeightG: num(t.target),
              stages: stages.map<ScenarioStageInput>((st) => ({
                minG: num(st.minG),
                maxG: num(st.maxG),
                feedPriceTryPerKg: num(st.price),
                fcr: num(st.fcr),
                durationDays: num(st.days),
                mortalityPct: num(st.mortality),
              })),
              expenses: expenseInputs,
            },
      );
  }

  async function onCalculate() {
    const inputs = buildInputs();
    if (inputs.length === 0) {
      toast.error("En az bir hedef gramaj girin.");
      return;
    }
    try {
      const { results } = await calculate.mutateAsync(inputs);
      setOutcomes(results);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Hesap yapılamadı.");
    }
  }

  async function onSave() {
    const name = scenarioName.trim();
    if (!name) {
      toast.error("Senaryo için bir ad girin.");
      return;
    }
    const inputs = buildInputs();
    try {
      for (const scenario of inputs) {
        await saveScenario.mutateAsync({
          name: inputs.length > 1 ? `${name} — ${scenario.targetWeightG} g` : name,
          batchId: batchId || undefined,
          scenario,
        });
      }
      toast.success(inputs.length > 1 ? `${inputs.length} senaryo kaydedildi.` : "Senaryo kaydedildi.");
      setScenarioName("");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Senaryo kaydedilemedi.");
    }
  }

  function loadSaved(s: SavedCostScenario) {
    const i = s.input;
    setMode(i.mode);
    setStartCount(i.startCount !== undefined ? String(i.startCount) : "");
    setStartWeight(i.startAvgWeightG !== undefined ? String(i.startAvgWeightG) : "");
    setStartCost(i.startAccumulatedCostTry !== undefined ? String(i.startAccumulatedCostTry) : "");
    setPrice(i.feedPriceTryPerKg !== undefined ? String(i.feedPriceTryPerKg) : "");
    setFcr(i.fcr !== undefined ? String(i.fcr) : "");
    setSgr(i.sgrPctPerDay !== undefined ? String(i.sgrPctPerDay) : "");
    setMortality(i.mortalityPct !== undefined ? String(i.mortalityPct) : "");
    setStages(
      i.stages?.length
        ? i.stages.map((st) => ({
            minG: String(st.minG ?? ""),
            maxG: String(st.maxG ?? ""),
            price: String(st.feedPriceTryPerKg ?? ""),
            fcr: String(st.fcr ?? ""),
            days: String(st.durationDays ?? ""),
            mortality: String(st.mortalityPct ?? ""),
          }))
        : DEFAULT_STAGES,
    );
    setExpenses(
      i.expenses.length
        ? i.expenses.map((e) => ({ label: e.label, amount: String(e.amountTry), mode: e.mode }))
        : [{ label: "", amount: "", mode: "TOTAL" }],
    );
    setTargets([
      { target: String(i.targetWeightG ?? ""), days: i.durationDays !== undefined ? String(i.durationDays) : "" },
    ]);
    setBatchId(s.batchId ?? "");
    setOutcomes(null);
    toast.success(`"${s.name}" yüklendi.`);
  }

  const updateStage = (index: number, patch: Partial<StageRow>) =>
    setStages((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  const updateExpense = (index: number, patch: Partial<ExpenseRow>) =>
    setExpenses((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  return (
    <PanelCard title="Hedef Gramaja Göre Maliyet Hesaplama">
      <div className="space-y-5 px-4.5 py-4">
        <p className="text-[11px] text-muted-foreground">
          Bu bölüm yalnızca tahmin yapar; hiçbir stok, yem veya gider kaydını değiştirmez. Partinin bugüne kadar
          gerçekleşen maliyeti başlangıç olarak alınır, hesaba yalnızca bundan sonraki yem ve giderler eklenir.
        </p>

        {/* Starting point */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-48">
              <Label className="mb-1 block text-[11px] text-muted-foreground">Parti (opsiyonel)</Label>
              <Select value={batchId} onValueChange={(v) => setBatchId(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Bağımsız senaryo">
                    {(v: string) => (v ? batches.find((b) => b.id === v)?.lotCode : "Bağımsız senaryo")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {batches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.lotCode}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {batchId ? (
              <Button
                variant="outline"
                size="sm"
                disabled={prefill.isFetching}
                onClick={onPrefill}
              >
                {prefill.isFetching ? "Getiriliyor…" : "Kayıtlı bilgileri getir"}
              </Button>
            ) : null}
            {prefill.error ? (
              <p className="text-[11px] text-red-600 dark:text-red-400">
                {prefill.error instanceof ApiError ? prefill.error.message : "Parti bilgileri alınamadı."}
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Başlangıç canlı adedi" value={startCount} onChange={setStartCount} />
            <Field label="Başlangıç ort. ağırlığı (g)" value={startWeight} onChange={setStartWeight} />
            <Field label="Şu ana kadar gerçekleşen maliyet (₺)" value={startCost} onChange={setStartCost} />
            <div>
              <Label className="mb-1 block text-[11px] text-muted-foreground">Hesap modu</Label>
              <div className="flex overflow-hidden rounded-md border border-border text-xs">
                {(["SIMPLE", "STAGED"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={cn(
                      "flex-1 px-2.5 py-1.5 font-medium transition-colors",
                      mode === m ? "bg-teal-500 text-white" : "bg-transparent text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {m === "SIMPLE" ? "Hızlı" : "Aşamalı"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Growth assumptions */}
        {mode === "SIMPLE" ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Yem fiyatı (₺/kg)" value={price} onChange={setPrice} />
            <Field label="FCR" value={fcr} onChange={setFcr} />
            <Field label="Büyüme hızı SGR (%/gün)" value={sgr} onChange={setSgr} />
            <Field label="Toplam ölüm oranı (%)" value={mortality} onChange={setMortality} />
          </div>
        ) : (
          <div className="space-y-2">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Alt (g)</TableHead>
                    <TableHead>Üst (g)</TableHead>
                    <TableHead>Yem ₺/kg</TableHead>
                    <TableHead>FCR</TableHead>
                    <TableHead>Süre (gün)</TableHead>
                    <TableHead>Ölüm %</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stages.map((s, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Input value={s.minG} onChange={(e) => updateStage(i, { minG: e.target.value })} />
                      </TableCell>
                      <TableCell>
                        <Input value={s.maxG} onChange={(e) => updateStage(i, { maxG: e.target.value })} />
                      </TableCell>
                      <TableCell>
                        <Input value={s.price} onChange={(e) => updateStage(i, { price: e.target.value })} />
                      </TableCell>
                      <TableCell>
                        <Input value={s.fcr} onChange={(e) => updateStage(i, { fcr: e.target.value })} />
                      </TableCell>
                      <TableCell>
                        <Input value={s.days} onChange={(e) => updateStage(i, { days: e.target.value })} />
                      </TableCell>
                      <TableCell>
                        <Input value={s.mortality} onChange={(e) => updateStage(i, { mortality: e.target.value })} />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setStages((rows) => rows.filter((_, j) => j !== i))}
                          aria-label="Aşamayı sil"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setStages((rows) => [...rows, { minG: "", maxG: "", price: "", fcr: "", days: "", mortality: "" }])
              }
            >
              <Plus className="size-3.5" /> Aşama ekle
            </Button>
            <p className="text-[11px] text-muted-foreground">
              Aralıklar birbirine değmeli, boşluk ve çakışma olmamalı. Hedef gramaj bir aralığın ortasındaysa hesap o
              gramajda durur.
            </p>
          </div>
        )}

        {/* Expenses */}
        <div className="space-y-2">
          <Label className="block text-[11px] text-muted-foreground">
            Bu süreçte oluşacak ek giderler (işçilik, elektrik, oksijen, su, sağlık…). Aynı gideri iki kez girmeyin.
          </Label>
          {expenses.map((e, i) => (
            <div key={i} className="grid grid-cols-[1fr_8rem_8rem_auto] items-center gap-2">
              <Input
                placeholder="Gider adı"
                value={e.label}
                onChange={(ev) => updateExpense(i, { label: ev.target.value })}
              />
              <Input
                placeholder="Tutar (₺)"
                value={e.amount}
                onChange={(ev) => updateExpense(i, { amount: ev.target.value })}
              />
              <div className="flex overflow-hidden rounded-md border border-border text-xs">
                {(["TOTAL", "DAILY"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => updateExpense(i, { mode: m })}
                    className={cn(
                      "flex-1 px-2 py-1.5 font-medium",
                      e.mode === m ? "bg-teal-500 text-white" : "text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {m === "TOTAL" ? "Dönem toplamı" : "Günlük"}
                  </button>
                ))}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExpenses((rows) => rows.filter((_, j) => j !== i))}
                aria-label="Gideri sil"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setExpenses((rows) => [...rows, { label: "", amount: "", mode: "TOTAL" }])}
          >
            <Plus className="size-3.5" /> Gider ekle
          </Button>
        </div>

        {/* Targets */}
        <div className="space-y-2">
          <Label className="block text-[11px] text-muted-foreground">
            Hedef ortalama gramajlar. Her hedefin süresini ayrı yazabilir, boş bırakırsanız büyüme hızından (SGR) türetilir.
          </Label>
          {targets.map((t, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <Input
                className="w-28"
                placeholder="Hedef (g)"
                value={t.target}
                onChange={(e) =>
                  setTargets((rows) => rows.map((r, j) => (j === i ? { ...r, target: e.target.value } : r)))
                }
              />
              {mode === "SIMPLE" ? (
                <Input
                  className="w-48"
                  placeholder="Süre (gün) — boş = SGR"
                  value={t.days}
                  onChange={(e) =>
                    setTargets((rows) => rows.map((r, j) => (j === i ? { ...r, days: e.target.value } : r)))
                  }
                />
              ) : (
                <span className="text-[11px] text-muted-foreground">Süre aşama tablosundan gelir</span>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setTargets((rows) => rows.filter((_, j) => j !== i))}
                aria-label="Hedefi sil"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setTargets((rows) => [...rows, { target: "", days: "" }])}>
            <Plus className="size-3.5" /> Hedef ekle
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={onCalculate} disabled={calculate.isPending}>
            {calculate.isPending ? "Hesaplanıyor…" : "Hesapla"}
          </Button>
        </div>

        {/* Results */}
        {outcomes ? <ScenarioComparison outcomes={outcomes} targets={targets.map((t) => t.target)} /> : null}

        {/* Save */}
        {outcomes ? (
          <div className="flex flex-wrap items-end gap-2 border-t border-border pt-4">
            <div className="min-w-56 flex-1">
              <Label className="mb-1 block text-[11px] text-muted-foreground">Senaryo adı</Label>
              <Input
                placeholder="örn. 1000 adet somon, Mart kohortu"
                value={scenarioName}
                onChange={(e) => setScenarioName(e.target.value)}
              />
            </div>
            <Button variant="outline" onClick={onSave} disabled={saveScenario.isPending}>
              Senaryoyu kaydet
            </Button>
          </div>
        ) : null}

        {/* Saved scenarios */}
        <div className="space-y-2 border-t border-border pt-4">
          <Label className="block text-[11px] text-muted-foreground">Kayıtlı senaryolar</Label>
          {saved.isLoading ? null : saved.data && saved.data.length > 0 ? (
            <ul className="divide-y divide-border">
              {saved.data.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
                  <div>
                    <span className="font-medium text-foreground">{s.name}</span>
                    <span className="ml-2 text-muted-foreground">
                      {new Date(s.createdAt).toLocaleDateString("tr")} · hedef {s.input.targetWeightG} g
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => loadSaved(s)}>
                      Yükle
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={deleteScenario.isPending}
                      onClick={() =>
                        deleteScenario.mutate(s.id, {
                          onSuccess: () => toast.success("Senaryo silindi."),
                        })
                      }
                    >
                      <Trash2 className="size-3.5" /> Sil
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">Henüz kayıtlı senaryo yok.</p>
          )}
        </div>
      </div>
    </PanelCard>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label className="mb-1 block text-[11px] text-muted-foreground">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} inputMode="decimal" />
    </div>
  );
}

function ScenarioComparison({ outcomes, targets }: { outcomes: ScenarioOutcome[]; targets: string[] }) {
  const usedTargets = targets.filter((t) => t.trim() !== "");
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sonuç</TableHead>
              {outcomes.map((o, i) => (
                <TableHead key={i} className="whitespace-nowrap">
                  Hedef {usedTargets[i] ?? "—"} g
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {outcomes.some((o) => !o.ok) ? (
              <TableRow>
                <TableCell className="text-xs text-muted-foreground">Hata</TableCell>
                {outcomes.map((o, i) => (
                  <TableCell key={i} className="text-xs text-red-600 dark:text-red-400">
                    {o.ok ? "—" : o.error}
                  </TableCell>
                ))}
              </TableRow>
            ) : null}
            {ROWS.map((row) => (
              <TableRow key={row.label}>
                <TableCell className="text-xs text-muted-foreground">{row.label}</TableCell>
                {outcomes.map((o, i) => (
                  <TableCell key={i} className={cn("font-mono text-xs", row.tone?.(o))}>
                    {o.ok ? row.value(o.result) : "—"}
                  </TableCell>
                ))}
              </TableRow>
            ))}
            <TableRow>
              <TableCell className="text-xs text-muted-foreground">Maliyet dağılımı</TableCell>
              {outcomes.map((o, i) => (
                <TableCell key={i}>{o.ok ? <Breakdown result={o.result} /> : "—"}</TableCell>
              ))}
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Süre: elle girilen değer kullanılır; boşsa SGR&apos;den ln(hedef ÷ başlangıç) ÷ (SGR ÷ 100) gün türetilir. Bu
        türetmede büyümenin üstel olduğu varsayılır; hesap ise süre boyunca ağırlığı doğrusal artırır. Yem ve ölüm
        gün gün hesaplanır.
      </p>
      {outcomes.map((o, i) =>
        o.ok && o.result.warnings.length > 0 ? (
          <p key={`w${i}`} className="text-[11px] text-amber-700 dark:text-amber-400">
            Hedef {usedTargets[i]} g: {o.result.warnings.join(" ")}
          </p>
        ) : null,
      )}

      {outcomes.map((o, i) =>
        o.ok && o.result.stages.length > 0 ? (
          <div key={`s${i}`} className="space-y-1">
            <p className="text-[11px] font-medium text-muted-foreground">
              Aşama dökümü — hedef {usedTargets[i]} g
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Aralık (g)</TableHead>
                  <TableHead>Gün</TableHead>
                  <TableHead>FCR</TableHead>
                  <TableHead>Yem (kg)</TableHead>
                  <TableHead>Yem maliyeti</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {o.result.stages.map((st, j) => (
                  <TableRow key={j}>
                    <TableCell className="font-mono text-xs">
                      {fmt(st.fromG, 2)}–{fmt(st.toG, 2)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{fmt(st.days, 1)}</TableCell>
                    <TableCell className="font-mono text-xs">{st.fcr}</TableCell>
                    <TableCell className="font-mono text-xs">{fmt(st.feedKg, 2)}</TableCell>
                    <TableCell className="font-mono text-xs">{tryFmt(st.feedCostTry)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null,
      )}
    </div>
  );
}

const ROWS: {
  label: string;
  value: (r: ScenarioResult) => string;
  tone?: (o: ScenarioOutcome) => string | undefined;
}[] = [
  { label: "Yetiştirme süresi (gün)", value: (r) => fmt(r.days, 1) },
  {
    label: "Süre kaynağı",
    value: (r) => (r.durationSource === "MANUAL" ? "elle girildi" : r.durationSource === "SGR" ? "SGR'den türetildi" : "aşamalardan"),
  },
  { label: "Hedefte canlı adet", value: (r) => fmt(r.aliveAtTarget, 1) },
  { label: "Ölen adet (tahmini)", value: (r) => fmt(r.deadCount, 1) },
  { label: "Hedefte toplam biyokütle (kg)", value: (r) => fmt(r.targetBiomassKg, 2) },
  { label: "Gerekli toplam yem (kg)", value: (r) => fmt(r.feedKg, 2) },
  { label: "Ek yem maliyeti", value: (r) => tryFmt(r.feedCostTry) },
  { label: "Ek işletme giderleri", value: (r) => tryFmt(r.expensesTry) },
  { label: "Hedefe ulaşmak için ek maliyet", value: (r) => tryFmt(r.additionalCostTry) },
  { label: "Başlangıç maliyeti (gerçekleşen)", value: (r) => tryFmt(r.startAccumulatedCostTry) },
  { label: "Toplam üretim maliyeti", value: (r) => tryFmt(r.totalCostTry) },
  { label: "Balık başına maliyet (₺/adet)", value: (r) => perUnit(r.costPerFishTry) },
  { label: "Kilogram maliyeti (₺/kg)", value: (r) => perUnit(r.costPerKgTry) },
];

function Breakdown({ result }: { result: ScenarioResult }) {
  const total = result.totalCostTry;
  if (total <= 0) return <span className="text-xs text-muted-foreground">—</span>;
  const parts = [
    { label: "Başlangıç", value: result.startAccumulatedCostTry, color: "bg-slate-400" },
    { label: "Yem", value: result.feedCostTry, color: "bg-teal-500" },
    { label: "Giderler", value: result.expensesTry, color: "bg-amber-500" },
  ];
  return (
    <div className="space-y-1">
      <div className="flex h-2.5 w-full overflow-hidden rounded bg-muted">
        {parts.map((p) => (
          <div key={p.label} className={p.color} style={{ width: `${(p.value / total) * 100}%` }} />
        ))}
      </div>
      <div className="space-y-0.5 text-[11px] text-muted-foreground">
        {parts.map((p) => (
          <div key={p.label} className="flex justify-between gap-2">
            <span>{p.label}</span>
            <span className="font-mono">
              {fmt((p.value / total) * 100, 1)}% · {fmt(p.value)} ₺
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
