"use client";

import * as React from "react";
import { Plus, Save } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCreateFishSpecies,
  useFishSpecies,
  useUpdateFishSpecies,
} from "@/hooks/use-fish-species";
import { ApiError } from "@/lib/api-error";
import type { FishSpecies } from "@/lib/types";

/** Default thresholds are trout-tuned (see alerts.service.ts) — shown as placeholders so an
 * empty field visibly means "using the app default", not "zero". */
const DEFAULT_PLACEHOLDER = {
  criticalDoMgL: "6.0",
  criticalPhLow: "6.0",
  criticalPhHigh: "9.0",
  criticalTempHighC: "22.0",
};

function ThresholdRow({ species }: { species: FishSpecies }) {
  const isOwn = species.companyId !== null;
  const updateSpecies = useUpdateFishSpecies();
  const [values, setValues] = React.useState({
    criticalDoMgL: species.criticalDoMgL ?? "",
    criticalPhLow: species.criticalPhLow ?? "",
    criticalPhHigh: species.criticalPhHigh ?? "",
    criticalTempHighC: species.criticalTempHighC ?? "",
  });

  async function onSave() {
    try {
      await updateSpecies.mutateAsync({
        speciesId: species.id,
        criticalDoMgL: values.criticalDoMgL ? Number(values.criticalDoMgL) : undefined,
        criticalPhLow: values.criticalPhLow ? Number(values.criticalPhLow) : undefined,
        criticalPhHigh: values.criticalPhHigh ? Number(values.criticalPhHigh) : undefined,
        criticalTempHighC: values.criticalTempHighC ? Number(values.criticalTempHighC) : undefined,
      });
      toast.success(`"${species.name}" için eşikler güncellendi.`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Eşikler güncellenirken bir sorun oluştu.");
    }
  }

  return (
    <div className="border-b border-border px-4.5 py-3 last:border-b-0">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-sm font-medium text-foreground">{species.name}</span>
        {species.strain ? (
          <span className="text-xs text-muted-foreground">({species.strain})</span>
        ) : null}
        <Badge variant={isOwn ? "secondary" : "outline"} className="text-[10px]">
          {isOwn ? "Kendi türünüz" : "Genel"}
        </Badge>
      </div>

      {!isOwn ? (
        <p className="text-xs text-muted-foreground">
          Genel referans türlerin eşikleri düzenlenemez — kendi eşiklerinizi tanımlamak için bu
          türü kendi adınıza yeniden ekleyin.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <Label className="text-[11px] text-muted-foreground">Kritik DO (mg/L)</Label>
            <Input
              type="number"
              step="0.1"
              min="0"
              placeholder={DEFAULT_PLACEHOLDER.criticalDoMgL}
              value={values.criticalDoMgL}
              onChange={(e) => setValues((v) => ({ ...v, criticalDoMgL: e.target.value }))}
              className="h-8 text-xs"
            />
          </div>
          <div>
            <Label className="text-[11px] text-muted-foreground">pH alt sınır</Label>
            <Input
              type="number"
              step="0.1"
              placeholder={DEFAULT_PLACEHOLDER.criticalPhLow}
              value={values.criticalPhLow}
              onChange={(e) => setValues((v) => ({ ...v, criticalPhLow: e.target.value }))}
              className="h-8 text-xs"
            />
          </div>
          <div>
            <Label className="text-[11px] text-muted-foreground">pH üst sınır</Label>
            <Input
              type="number"
              step="0.1"
              placeholder={DEFAULT_PLACEHOLDER.criticalPhHigh}
              value={values.criticalPhHigh}
              onChange={(e) => setValues((v) => ({ ...v, criticalPhHigh: e.target.value }))}
              className="h-8 text-xs"
            />
          </div>
          <div>
            <Label className="text-[11px] text-muted-foreground">Kritik sıcaklık (°C)</Label>
            <Input
              type="number"
              step="0.1"
              placeholder={DEFAULT_PLACEHOLDER.criticalTempHighC}
              value={values.criticalTempHighC}
              onChange={(e) => setValues((v) => ({ ...v, criticalTempHighC: e.target.value }))}
              className="h-8 text-xs"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="col-span-2 sm:col-span-4"
            disabled={updateSpecies.isPending}
            onClick={onSave}
          >
            <Save className="size-3.5" />
            {updateSpecies.isPending ? "Kaydediliyor…" : "Eşikleri kaydet"}
          </Button>
        </div>
      )}
    </div>
  );
}

function AddSpeciesForm() {
  const [name, setName] = React.useState("");
  const [strain, setStrain] = React.useState("");
  const createSpecies = useCreateFishSpecies();

  async function onAdd() {
    if (!name.trim()) return;
    try {
      await createSpecies.mutateAsync({ name: name.trim(), strain: strain.trim() || undefined });
      setName("");
      setStrain("");
      toast.success(`"${name.trim()}" eklendi.`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Tür eklenirken bir sorun oluştu.");
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-2 px-4.5 py-3">
      <div className="min-w-32 flex-1">
        <Label className="text-[11px] text-muted-foreground">Yeni tür adı</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="örn. Somon"
          className="h-8 text-xs"
        />
      </div>
      <div className="min-w-32 flex-1">
        <Label className="text-[11px] text-muted-foreground">Alt tür / soy (opsiyonel)</Label>
        <Input
          value={strain}
          onChange={(e) => setStrain(e.target.value)}
          placeholder="örn. AquaGen"
          className="h-8 text-xs"
        />
      </div>
      <Button size="sm" disabled={createSpecies.isPending || !name.trim()} onClick={onAdd}>
        <Plus className="size-3.5" />
        Ekle
      </Button>
    </div>
  );
}

export function SpeciesSection() {
  const { data: species, isLoading } = useFishSpecies();

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardHeader className="border-b border-border py-4">
        <CardTitle>Balık Türleri & Su Kalitesi Eşikleri</CardTitle>
        <CardDescription>
          Her tür için kritik su kalitesi eşiklerini ayarlayın — boş bırakılan alanlar
          uygulamanın varsayılan (alabalığa göre ayarlı) eşiklerini kullanır. Bir havuzda birden
          fazla tür varsa, en hassas türün eşiği geçerli olur.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-4">
            <Skeleton className="h-24 rounded" />
          </div>
        ) : species && species.length > 0 ? (
          species.map((s) => <ThresholdRow key={s.id} species={s} />)
        ) : (
          <p className="px-4.5 py-8 text-center text-sm text-muted-foreground">Henüz tür yok.</p>
        )}
        <div className="border-t border-border bg-muted/20">
          <AddSpeciesForm />
        </div>
      </CardContent>
    </Card>
  );
}
