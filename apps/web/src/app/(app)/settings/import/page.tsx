"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, CheckCircle2, Download, FileSpreadsheet, Loader2, RotateCcw, Upload } from "lucide-react";
import { PanelCard } from "@/components/shared/panel-card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCommitImport, useImports, usePreviewImport, useUndoImport } from "@/hooks/use-imports";
import { useApiClient } from "@/lib/api-client";
import { ApiError } from "@/lib/api-error";
import { downloadImportTemplate } from "@/lib/import-template";
import type { DataImport, FeedProduct, Farm, FishSpecies, ImportKind, ImportPreview, Tank } from "@/lib/types";
import { cn } from "@/lib/utils";

const KIND_LABEL: Record<ImportKind, string> = {
  farm: "Çiftlik",
  tank: "Tank",
  batch: "Parti",
  feeding: "Yemleme",
  mortality: "Ölüm",
  weighing: "Tartım",
  water: "Su kalitesi",
  harvest: "Hasat",
  transfer: "Transfer",
  treatment: "Tedavi",
};
const KINDS = Object.keys(KIND_LABEL) as ImportKind[];
const MAX_FILE_MB = 8;

const fmt = (n: number) => n.toLocaleString("tr");
const errorText = (error: unknown, fallback: string) =>
  error instanceof ApiError
    ? error.status === 403
      ? "Veri aktarma yetkiniz yok. Şirket sahibi, genel müdür veya çiftlik müdürü yapabilir."
      : error.message
    : fallback;

/**
 * Ayarlar → Veri aktarma: brings a farm's history in from Excel. The file is checked first and
 * nothing is written until every row is understood; each import can be undone as a whole.
 */
export default function ImportPage() {
  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<ImportPreview | null>(null);
  const previewImport = usePreviewImport();
  const commitImport = useCommitImport();
  const input = React.useRef<HTMLInputElement>(null);

  async function choose(chosen: File | undefined) {
    if (!chosen) return;
    setPreview(null);
    setFile(chosen);
    if (!/\.xlsx$/i.test(chosen.name)) {
      toast.error("Yalnızca .xlsx dosyaları okunabilir. Eski .xls dosyasını Excel'de .xlsx olarak kaydedin.");
      return;
    }
    if (chosen.size > MAX_FILE_MB * 1024 * 1024) {
      toast.error(`Dosya en fazla ${MAX_FILE_MB} MB olabilir; dosyayı bölün.`);
      return;
    }
    try {
      setPreview(await previewImport.mutateAsync(chosen));
    } catch (error) {
      toast.error(errorText(error, "Dosya kontrol edilemedi."));
    }
  }

  async function commit() {
    if (!file) return;
    try {
      const result = await commitImport.mutateAsync(file);
      const total = KINDS.reduce((sum, k) => sum + result.counts[k], 0);
      toast.success(`${fmt(total)} kayıt içe aktarıldı.`);
      setFile(null);
      setPreview(null);
      if (input.current) input.current.value = "";
    } catch (error) {
      toast.error(errorText(error, "İçe aktarma yapılamadı; hiçbir kayıt yazılmadı."));
    }
  }

  const total = preview ? KINDS.reduce((sum, k) => sum + preview.counts[k], 0) : 0;
  const ready = !!preview && preview.errorCount === 0 && total > 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/settings" className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3" /> Ayarlar
        </Link>
        <h1 className="font-display text-xl font-bold tracking-tight text-foreground">Veri aktarma</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Excel&apos;de tuttuğunuz çiftlik, tank ve partilerinizi; geçmiş yemleme, ölüm, tartım, su kalitesi, hasat, transfer ve
          tedavi kayıtlarınızı uygulamaya aktarın. Panolar, tahminler ve raporlar ilk günden geçmişinizle çalışsın.
        </p>
      </div>

      <PanelCard title="1. Şablonu indirin">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4.5 py-4 text-sm">
          <p className="max-w-md text-muted-foreground">
            Çiftlik, tank ve partiler ile her kayıt türü için bir sekme; nasıl doldurulacağı ve kodlarınız içinde. Nasıl
            doldurulduğunu görmek için 6 aylık örnek bir tesisle dolu dosyayı da indirebilirsiniz.
          </p>
          <TemplateButtons />
        </div>
      </PanelCard>

      <PanelCard title="2. Dosyanızı yükleyin">
        <div className="space-y-4 px-4.5 py-4">
          <label
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void choose(e.dataTransfer.files[0]);
            }}
            className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border px-4 py-8 text-center transition hover:border-teal-500/60 hover:bg-teal-500/5"
          >
            {previewImport.isPending ? (
              <Loader2 className="size-6 animate-spin text-teal-500" />
            ) : (
              <FileSpreadsheet className="size-6 text-teal-500" />
            )}
            <span className="text-sm font-medium text-foreground">
              {previewImport.isPending ? "Dosya kontrol ediliyor…" : file ? file.name : "Excel dosyasını seçin ya da buraya bırakın"}
            </span>
            <span className="text-xs text-muted-foreground">.xlsx · en fazla {MAX_FILE_MB} MB · hiçbir şey kontrol edilmeden yazılmaz</span>
            <input
              ref={input}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              onChange={(e) => void choose(e.target.files?.[0])}
            />
          </label>

          {preview ? <PreviewResult preview={preview} total={total} /> : null}

          {preview ? (
            <div className="flex justify-end">
              <Button disabled={!ready || commitImport.isPending} onClick={() => void commit()}>
                {commitImport.isPending ? <Loader2 className="animate-spin" /> : <Upload />}
                {ready ? `${fmt(total)} kaydı içe aktar` : "İçe aktar"}
              </Button>
            </div>
          ) : null}
        </div>
      </PanelCard>

      <HistoryCard />
    </div>
  );
}

function TemplateButtons() {
  const api = useApiClient();
  const [busy, setBusy] = React.useState<"empty" | "example" | null>(null);

  async function download(kind: "empty" | "example") {
    setBusy(kind);
    try {
      const [farms, feeds, species] = await Promise.all([
        api.get<Farm[]>("/farms"),
        api.get<FeedProduct[]>("/feed-products"),
        api.get<FishSpecies[]>("/fish-species"),
      ]);
      const tanks = (
        await Promise.all(
          farms.map(async (farm) =>
            (await api.get<Tank[]>(`/farms/${farm.id}/tanks`)).map((t) => ({ farmName: farm.name, farmCode: farm.code, tankCode: t.code })),
          ),
        )
      ).flat();
      await downloadImportTemplate(
        { tanks, feeds: feeds.map((f) => f.name), species: species.map((s) => s.name) },
        { example: kind === "example" },
      );
    } catch (error) {
      toast.error(errorText(error, "Şablon hazırlanamadı."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" disabled={busy !== null} onClick={() => void download("empty")}>
        {busy === "empty" ? <Loader2 className="animate-spin" /> : <Download />}
        Şablonu indir
      </Button>
      <Button variant="ghost" disabled={busy !== null} onClick={() => void download("example")}>
        {busy === "example" ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />}
        Örnek dolu dosya
      </Button>
    </div>
  );
}

function PreviewResult({ preview, total }: { preview: ImportPreview; total: number }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {KINDS.filter((kind) => preview.counts[kind] > 0).map((kind) => (
          <div key={kind} className="rounded-lg border border-border px-3 py-2.5">
            <div className="text-[11px] text-muted-foreground">{KIND_LABEL[kind]}</div>
            <div className="font-mono text-lg font-semibold text-foreground">{fmt(preview.counts[kind])}</div>
          </div>
        ))}
      </div>

      <div className="space-y-1 text-xs text-muted-foreground">
        {preview.skipped > 0 ? <p>{fmt(preview.skipped)} satır uygulamada zaten var; atlanacak.</p> : null}
        {preview.ignoredSheets.length > 0 ? (
          <p>Okunmayan sekmeler: {preview.ignoredSheets.join(", ")}.</p>
        ) : null}
      </div>

      {preview.errorCount > 0 ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5">
          <div className="flex items-start gap-2 px-3.5 py-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p>
              <span className="font-semibold">{fmt(preview.errorCount)} satır okunamadı ya da eşleştirilemedi.</span> Bunları Excel&apos;de
              düzeltip dosyayı yeniden seçin; hatalı satır kalmadan hiçbir kayıt yazılmaz.
            </p>
          </div>
          <div className="max-h-72 overflow-y-auto border-t border-destructive/20">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Sekme</TableHead>
                  <TableHead className="w-16 text-right">Satır</TableHead>
                  <TableHead>Sorun</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.errors.map((e) => (
                  <TableRow key={`${e.sheet}-${e.row}`}>
                    <TableCell className="text-xs">{e.sheet}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{e.row}</TableCell>
                    <TableCell className="text-xs whitespace-normal">{e.message}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {preview.errorCount > preview.errors.length ? (
            <p className="border-t border-destructive/20 px-3.5 py-2 text-xs text-muted-foreground">
              ve {fmt(preview.errorCount - preview.errors.length)} satır daha.
            </p>
          ) : null}
        </div>
      ) : total > 0 ? (
        <div className="flex items-start gap-2 rounded-lg border border-teal-500/30 bg-teal-500/5 px-3.5 py-3 text-sm text-foreground">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-teal-500" />
          <p>
            Dosya hazır. Geçmiş kayıtlar uyarı ya da e-posta oluşturmaz, yemlemeler bugünkü yem stoğunuzu değiştirmez; içe aktarımı
            sonra tek seferde geri alabilirsiniz.
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Dosyada yazılacak yeni kayıt yok.</p>
      )}

      {preview.batches.length > 0 ? (
        <div>
          <h3 className="mb-1.5 text-xs font-semibold text-muted-foreground uppercase">Partilere etkisi</h3>
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Parti</TableHead>
                  <TableHead className="text-right">Ölüm</TableHead>
                  <TableHead className="text-right">Hasat</TableHead>
                  <TableHead className="text-right">Tartım</TableHead>
                  <TableHead className="text-right">Şu an canlı</TableHead>
                  <TableHead className="text-right">Aktarım sonrası</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.batches.map((b) => (
                  <TableRow key={b.lotCode}>
                    <TableCell className="font-mono text-xs">
                      {b.lotCode}
                      {b.isNew ? (
                        <Badge variant="secondary" className="ml-1.5 font-sans text-[10px]">
                          Yeni
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right font-mono">{fmt(b.deaths)}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(b.harvested)}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(b.weighings)}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(b.liveNow)}</TableCell>
                    <TableCell className={cn("text-right font-mono font-medium", b.liveAfter < 0 && "text-destructive")}>
                      {fmt(b.liveAfter)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function HistoryCard() {
  const { data, isLoading, error } = useImports();
  return (
    <PanelCard title="Geçmiş içe aktarımlar">
      {isLoading ? (
        <div className="p-4">
          <Skeleton className="h-20 rounded" />
        </div>
      ) : error ? (
        <p className="px-4.5 py-8 text-center text-sm text-muted-foreground">{errorText(error, "Liste yüklenemedi.")}</p>
      ) : !data || data.length === 0 ? (
        <p className="px-4.5 py-8 text-center text-sm text-muted-foreground">Henüz içe aktarım yapılmadı.</p>
      ) : (
        <ul className="divide-y divide-border">
          {data.map((item) => (
            <HistoryItem key={item.id} item={item} />
          ))}
        </ul>
      )}
    </PanelCard>
  );
}

function HistoryItem({ item }: { item: DataImport }) {
  const undo = useUndoImport();
  const total = KINDS.reduce((sum, k) => sum + (item.counts[k] ?? 0), 0);

  async function onUndo() {
    try {
      await undo.mutateAsync(item.id);
      toast.success(`"${item.fileName}" içe aktarımı geri alındı.`);
    } catch (error) {
      toast.error(errorText(error, "Geri alınamadı."));
    }
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4.5 py-3 text-sm">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-foreground">{item.fileName}</span>
          {item.undoneAt ? (
            <Badge variant="secondary" className="text-[10px]">
              Geri alındı
            </Badge>
          ) : null}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {new Date(item.createdAt).toLocaleString("tr")}
          {item.userName ? ` · ${item.userName}` : ""} · {fmt(total)} kayıt (
          {KINDS.filter((k) => item.counts[k]).map((k) => `${KIND_LABEL[k].toLocaleLowerCase("tr")} ${fmt(item.counts[k])}`).join(", ")})
        </div>
      </div>
      {!item.undoneAt ? (
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button variant="outline" size="sm" disabled={undo.isPending}>
                <RotateCcw /> Geri al
              </Button>
            }
          />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Bu içe aktarım geri alınsın mı?</AlertDialogTitle>
              <AlertDialogDescription>
                &quot;{item.fileName}&quot; ile eklenen {fmt(total)} kayıt silinir; parti adetleri ve ağırlıkları içe aktarım öncesine döner.
                Uygulamada elle girilen kayıtlara dokunulmaz.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Vazgeç</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={() => void onUndo()}>
                Geri al
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </li>
  );
}
