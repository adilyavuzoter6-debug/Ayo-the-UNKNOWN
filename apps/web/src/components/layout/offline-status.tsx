"use client";

import * as React from "react";
import { CloudOff, CloudUpload, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useOfflineQueue } from "@/components/providers/offline-queue-provider";

const timeFormat = new Intl.DateTimeFormat("tr", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * Topbar badge for the offline queue: shows when the device is offline, how many daily records
 * are waiting to be sent, and lets the user drop ones the server rejected. Renders nothing when
 * online with an empty queue.
 */
export function OfflineStatus() {
  const { online, records, discard, flush } = useOfflineQueue();
  const failed = records.filter((r) => r.error);
  const waiting = records.length - failed.length;

  if (online && records.length === 0) return null;

  const label = failed.length
    ? `${failed.length} kayıt gönderilemedi`
    : !online
      ? waiting
        ? `Çevrimdışı · ${waiting} kayıt bekliyor`
        : "Çevrimdışı"
      : `${waiting} kayıt gönderiliyor`;
  const Icon = failed.length ? TriangleAlert : online ? CloudUpload : CloudOff;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className={cn(
              "flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold transition-colors",
              failed.length
                ? "border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/15"
                : "border-border bg-muted/60 text-muted-foreground hover:bg-muted",
            )}
          >
            <Icon className="size-3.5" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        }
      />
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{online ? "Bekleyen kayıtlar" : "İnternet bağlantısı yok"}</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <div className="space-y-2 px-2 py-1.5 text-xs text-muted-foreground">
          {!online ? (
            <p>
              Son görüntülenen veriler gösteriliyor. Yemleme, ölüm ve su kalitesi kayıtları bu cihazda saklanır ve
              bağlantı gelince otomatik gönderilir. Diğer işlemler internet gerektirir.
            </p>
          ) : null}
          {records.length === 0 ? <p>Bekleyen kayıt yok.</p> : null}
          {records.map((record) => (
            <div key={record.id} className="flex items-start gap-2 rounded-md border border-border p-2">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground">
                  {record.label} · {timeFormat.format(new Date(record.createdAt))}
                </p>
                {record.error ? <p className="text-destructive">{record.error}</p> : <p>Gönderilmeyi bekliyor</p>}
              </div>
              {record.error ? (
                <button
                  type="button"
                  aria-label="Kaydı sil"
                  title="Bu kaydı sil"
                  className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => discard(record.id)}
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </div>
          ))}
          {online && waiting > 0 ? (
            <button type="button" className="text-teal-600 hover:underline" onClick={flush}>
              Şimdi gönder
            </button>
          ) : null}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
