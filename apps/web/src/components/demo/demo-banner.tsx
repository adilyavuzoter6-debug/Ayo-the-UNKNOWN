"use client";

import * as React from "react";
import { SignOutButton } from "@clerk/nextjs";
import { Sparkles, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const LIFETIME_HOURS = 24;
const noopSubscribe = () => () => {};

/** The strip above every page of a visitor's demo: what this is, and the way to a real account. */
export function DemoBanner({ createdAt }: { createdAt: string }) {
  const [now] = React.useState(() => Date.now());
  const hoursLeft = Math.max(1, Math.ceil(LIFETIME_HOURS - (now - new Date(createdAt).getTime()) / 3_600_000));

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 bg-gradient-to-r from-teal-500 to-navy-700 px-4 py-2 text-xs text-white md:px-6">
      <Sparkles className="size-3.5 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="font-semibold">Canlı demo</span> · Örnek verilerle istediğinizi deneyin; değişiklikleriniz yalnızca
        sizde görünür. Bu demo yaklaşık {hoursLeft} saat sonra silinir.
      </span>
      <SignOutButton redirectUrl="/sign-up">
        <button className="rounded-md bg-white px-2.5 py-1 font-semibold text-navy-900 hover:bg-white/90">
          Kendi hesabınızı açın
        </button>
      </SignOutButton>
    </div>
  );
}

const TOUR = [
  "Karadeniz Alabalık örnek işletmesi: 3 çiftlik, 19 havuz ve kafes, yaklaşık 7 aylık üretim kaydı.",
  "Yemleme, ölüm ve su ölçümü girin; stoklar ve grafikler hemen güncellenir.",
  "Raporlar'da çiftlik karşılaştırmasına, Excel'e aktarmaya ve anormal partilere bakın.",
  "Her şeyi değiştirebilirsiniz: bu demo yalnızca size ait ve 24 saat sonra silinir.",
];

/** Shown once when a visitor first lands in their demo. */
export function DemoWelcome({ companyId }: { companyId: string }) {
  const key = `piscatio:demo-welcome:${companyId}`;
  // Whether this demo's welcome was already dismissed, read from the browser's storage.
  const seen = React.useSyncExternalStore(
    noopSubscribe,
    () => {
      try {
        return localStorage.getItem(key) !== null;
      } catch {
        return false;
      }
    },
    () => true,
  );
  const [dismissed, setDismissed] = React.useState(false);
  const open = !seen && !dismissed;

  function close() {
    setDismissed(true);
    try {
      localStorage.setItem(key, "1");
    } catch {
      // A blocked storage just means the welcome may show again.
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : close())}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-md" showCloseButton={false}>
        <div className="relative bg-gradient-to-br from-navy-950 via-navy-900 to-navy-700 px-6 pt-6 pb-5 text-white">
          <div className="pointer-events-none absolute -top-12 -right-8 size-40 rounded-full bg-teal-500/25 blur-3xl" aria-hidden />
          <button
            type="button"
            onClick={close}
            aria-label="Kapat"
            className="absolute top-3 right-3 rounded-md p-1 text-white/70 hover:bg-white/10 hover:text-white"
          >
            <X className="size-4" />
          </button>
          <div className="relative">
            <div className="text-[11px] font-semibold tracking-wide text-teal-400 uppercase">Canlı demo</div>
            <DialogHeader className="mt-1 text-left">
              <DialogTitle className="font-display text-xl font-bold text-white">Demoya hoş geldiniz!</DialogTitle>
              <DialogDescription className="text-sm text-white/70">
                Piscatio&apos;yu gerçek bir alabalık çiftliğinin verileriyle, hesap açmadan deneyin.
              </DialogDescription>
            </DialogHeader>
          </div>
        </div>
        <ul className="space-y-2.5 px-6 py-5">
          {TOUR.map((line, i) => (
            <li key={line} className="flex items-start gap-3 text-sm text-foreground">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-teal-500/15 text-[11px] font-semibold text-teal-600 dark:text-teal-400">
                {i + 1}
              </span>
              {line}
            </li>
          ))}
        </ul>
        <DialogFooter className="border-t border-border px-6 py-4">
          <Button onClick={close} className="w-full sm:w-auto">
            Keşfetmeye başlayın
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
