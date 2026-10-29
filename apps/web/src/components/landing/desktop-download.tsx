"use client";

import * as React from "react";
import Link from "next/link";
import { Download, WifiOff } from "lucide-react";
import { DOWNLOADS } from "@/lib/downloads";
import { cn } from "@/lib/utils";
import { AppleLogo, WindowsLogo } from "./platform-logos";

type Platform = "mac" | "windows" | null;

const noopSubscribe = () => () => {};
function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return "windows";
  if (/Macintosh|Mac OS X/i.test(ua) && !/iPhone|iPad/i.test(ua)) return "mac";
  return null;
}

function DownloadButton({
  href,
  logo,
  title,
  detail,
  recommended,
}: {
  href: string;
  logo: React.ReactNode;
  title: string;
  detail: string;
  recommended: boolean;
}) {
  return (
    <a
      href={href}
      download
      className={cn(
        "group relative flex flex-1 items-center gap-3 rounded-xl px-4 py-3 text-left transition",
        recommended
          ? "bg-navy-900 text-white shadow-lg shadow-navy-900/20 hover:bg-navy-800"
          : "border border-border bg-card text-foreground hover:border-teal-500/60 hover:shadow-md",
      )}
    >
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-lg",
          recommended ? "bg-white/10" : "bg-muted",
        )}
      >
        {logo}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className={cn("block text-[11px]", recommended ? "text-white/60" : "text-muted-foreground")}>{detail}</span>
      </span>
      <Download
        className={cn(
          "size-4 shrink-0 transition group-hover:translate-y-0.5",
          recommended ? "text-teal-400" : "text-muted-foreground group-hover:text-teal-500",
        )}
      />
      {recommended ? (
        <span className="absolute -top-2 right-3 rounded-full bg-teal-500 px-2 py-0.5 text-[10px] font-semibold text-navy-950">
          Bilgisayarınız için
        </span>
      ) : null}
    </a>
  );
}

/**
 * The landing page's desktop download: macOS and Windows installers straight from the page, with
 * the visitor's own system picked out. Browsers can't tell Apple Silicon from Intel Macs, so the
 * Mac button serves Apple Silicon (every Mac since late 2020) and Intel gets a link of its own.
 */
export function DesktopDownload() {
  const platform = React.useSyncExternalStore(noopSubscribe, detectPlatform, () => null);

  return (
    <div className="mx-auto mt-8 w-full max-w-2xl rounded-2xl border border-border bg-card/70 p-4 text-left shadow-sm ring-1 ring-foreground/5 backdrop-blur sm:p-5">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-lg bg-teal-500/10">
          <WifiOff className="size-4.5 text-teal-500" />
        </span>
        <div>
          <div className="font-display text-sm font-semibold text-foreground">Masaüstü uygulaması</div>
          <div className="text-xs text-muted-foreground">
            İnternet kesildiğinde de çalışır; kayıtlar bağlantı gelince gönderilir.
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex flex-1 flex-col gap-1.5">
          <DownloadButton
            href={DOWNLOADS.macArm}
            logo={<AppleLogo className="size-5" />}
            title="macOS için indir"
            detail="Apple Silicon (M1 ve sonrası) · .dmg"
            recommended={platform === "mac"}
          />
          <a href={DOWNLOADS.macIntel} download className="px-1 text-[11px] text-muted-foreground hover:text-teal-500">
            Intel işlemcili Mac mi? Buradan indirin
          </a>
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <DownloadButton
            href={DOWNLOADS.windows}
            logo={<WindowsLogo className="size-[18px]" />}
            title="Windows için indir"
            detail="Windows 10 / 11, 64 bit · .exe"
            recommended={platform === "windows"}
          />
          <Link href="/indir" className="px-1 text-[11px] text-muted-foreground hover:text-teal-500">
            İlk açılışta güvenlik uyarısı mı çıktı? Kurulum yardımı
          </Link>
        </div>
      </div>
    </div>
  );
}
