"use client";

import * as React from "react";
import { ArrowUp, Loader2, RotateCcw, Sparkles } from "lucide-react";
import { PlanFeature } from "@aquai/types";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { PlanLocked } from "@/components/shared/plan-locked";
import { useAssistantChat, type AssistantTurn } from "@/hooks/use-assistant";
import { usePlan } from "@/hooks/use-plan";
import { ApiError } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import { AnswerFeedback } from "./answer-feedback";
import { AssistantMessage } from "./assistant-message";

const SUGGESTIONS = [
  "Bu hafta hangi partilerde sorun var?",
  "Çiftliklerimi son 30 güne göre karşılaştır.",
  "6 ay sonra hangi gramajda kaç balığım olur?",
  "Ölüm oranı en çok artan parti hangisi ve neden?",
];

/**
 * The AI farm assistant: a chat panel opened from the top bar. The conversation lives here, in the
 * app shell, so it survives moving between pages; it is not stored anywhere.
 */
export function AssistantPanel() {
  const { has } = usePlan();
  const [open, setOpen] = React.useState(false);
  const [turns, setTurns] = React.useState<AssistantTurn[]>([]);
  const [draft, setDraft] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [remaining, setRemaining] = React.useState<number | null>(null);
  const chat = useAssistantChat();
  const scroller = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [turns, chat.isPending]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || chat.isPending) return;
    const next: AssistantTurn[] = [...turns, { role: "user", content: question }];
    setTurns(next);
    setDraft("");
    setError(null);
    try {
      // The last 20 turns are plenty of context and keep each request small.
      const result = await chat.mutateAsync(next.slice(-20));
      setTurns([...next, { role: "assistant", content: result.reply }]);
      setRemaining(result.remainingToday);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Asistana ulaşılamadı. Lütfen tekrar deneyin.");
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <button
            type="button"
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-gradient-to-r from-navy-900 to-navy-700 px-2.5 text-xs font-semibold text-white shadow-sm ring-1 ring-teal-500/30 hover:from-navy-800 hover:to-navy-600"
          >
            <Sparkles className="size-3.5 text-teal-400" />
            <span className="hidden sm:inline">Asistan</span>
          </button>
        }
      />
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <div className="relative overflow-hidden bg-gradient-to-br from-navy-950 via-navy-900 to-navy-700 px-5 pt-5 pb-4 text-white">
          <div className="pointer-events-none absolute -top-12 -right-10 size-40 rounded-full bg-teal-500/25 blur-3xl" aria-hidden />
          <div className="relative flex items-start justify-between gap-3 pr-8">
            <div>
              <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-teal-400 uppercase">
                <Sparkles className="size-3" /> Yapay zeka · Beta
              </div>
              <SheetTitle className="mt-1 font-display text-lg font-bold text-white">Çiftlik asistanı</SheetTitle>
              <SheetDescription className="text-xs text-white/70">
                Verilerinize sorun: stok, FCR, ölüm, su kalitesi, tahmin.
              </SheetDescription>
            </div>
            {turns.length > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setTurns([]);
                  setError(null);
                }}
                className="mt-1 inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] whitespace-nowrap text-white/70 hover:bg-white/10 hover:text-white"
              >
                <RotateCcw className="size-3" /> Yeni sohbet
              </button>
            ) : null}
          </div>
        </div>

        {!has(PlanFeature.AI_ASSISTANT) ? (
          <div className="p-4">
            <PlanLocked feature={PlanFeature.AI_ASSISTANT} />
          </div>
        ) : (
          <>
            <div ref={scroller} className="flex-1 space-y-4 overflow-y-auto px-4 py-4 text-sm">
              {turns.length === 0 ? (
                <div className="space-y-3">
                  <p className="text-muted-foreground">
                    Merhaba! Çiftliklerinizin kayıtlarına bakarak sorularınızı yanıtlarım. Örneğin:
                  </p>
                  <div className="grid gap-2">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => void send(s)}
                        className="rounded-lg border border-border bg-card px-3 py-2 text-left text-[13px] text-foreground transition hover:border-teal-500/60 hover:bg-teal-500/5"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                turns.map((t, i) =>
                  t.role === "user" ? (
                    <div key={i} className="ml-8 rounded-2xl rounded-br-sm bg-navy-900 px-3.5 py-2.5 text-white">
                      {t.content}
                    </div>
                  ) : (
                    <div key={i} className="mr-4 flex gap-2.5">
                      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-teal-500/15">
                        <Sparkles className="size-3.5 text-teal-500" />
                      </span>
                      <div className="min-w-0 flex-1 leading-relaxed text-foreground">
                        <AssistantMessage text={t.content} />
                        {turns[i - 1]?.role === "user" ? (
                          <AnswerFeedback question={turns[i - 1]!.content} answer={t.content} />
                        ) : null}
                      </div>
                    </div>
                  ),
                )
              )}
              {chat.isPending ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin text-teal-500" /> Verilerinize bakıyorum…
                </div>
              ) : null}
              {error ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                  {error}
                </div>
              ) : null}
            </div>

            <form
              className="border-t border-border bg-card p-3"
              onSubmit={(e) => {
                e.preventDefault();
                void send(draft);
              }}
            >
              <div className="flex items-end gap-2 rounded-xl border border-border bg-background px-3 py-2 focus-within:border-teal-500">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send(draft);
                    }
                  }}
                  rows={1}
                  maxLength={4000}
                  placeholder="Bir soru sorun…"
                  className="max-h-32 min-h-6 flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
                <button
                  type="submit"
                  disabled={!draft.trim() || chat.isPending}
                  aria-label="Gönder"
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-lg transition",
                    draft.trim() && !chat.isPending ? "bg-teal-500 text-white hover:bg-teal-400" : "bg-muted text-muted-foreground",
                  )}
                >
                  <ArrowUp className="size-4" />
                </button>
              </div>
              <p className="mt-2 text-[10px] leading-snug text-muted-foreground">
                Yanıtlar yapay zeka tarafından kayıtlarınızdan üretilir ve hatalı olabilir; önemli kararlarda rakamları
                ilgili sayfadan kontrol edin.{remaining !== null ? ` Bugün ${remaining} soru hakkınız kaldı.` : ""}
              </p>
            </form>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
