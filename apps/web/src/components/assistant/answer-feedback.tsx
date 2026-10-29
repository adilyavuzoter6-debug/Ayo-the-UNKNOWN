"use client";

import * as React from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { useAssistantFeedback } from "@/hooks/use-assistant";
import { cn } from "@/lib/utils";

/**
 * 👍/👎 under an assistant answer. A 👎 asks, optionally, what was wrong. Kept with the question and
 * answer on the API, to see where the assistant falls short and to improve it with later.
 */
export function AnswerFeedback({ question, answer }: { question: string; answer: string }) {
  const feedback = useAssistantFeedback();
  const [state, setState] = React.useState<"idle" | "asking" | "sent" | "failed">("idle");
  const [comment, setComment] = React.useState("");

  async function submit(helpful: boolean, note?: string) {
    try {
      await feedback.mutateAsync({ question, answer, helpful, comment: note?.trim() || undefined });
      setState("sent");
    } catch {
      setState("failed");
    }
  }

  if (state === "sent") {
    return <p className="mt-1.5 text-[11px] text-muted-foreground">Teşekkürler, geri bildiriminiz kaydedildi.</p>;
  }
  if (state === "failed") {
    return <p className="mt-1.5 text-[11px] text-muted-foreground">Geri bildirim gönderilemedi.</p>;
  }
  if (state === "asking") {
    return (
      <form
        className="mt-2 flex items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(false, comment);
        }}
      >
        <input
          autoFocus
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={1000}
          placeholder="Ne yanlıştı? (isteğe bağlı)"
          className="h-7 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-teal-500"
        />
        <button
          type="submit"
          disabled={feedback.isPending}
          className="h-7 shrink-0 rounded-md bg-navy-900 px-2.5 text-[11px] font-semibold text-white hover:bg-navy-800 disabled:opacity-60"
        >
          Gönder
        </button>
      </form>
    );
  }
  return (
    <div className="mt-1.5 flex items-center gap-1">
      <FeedbackButton label="Yararlı" disabled={feedback.isPending} onClick={() => void submit(true)}>
        <ThumbsUp className="size-3.5" />
      </FeedbackButton>
      <FeedbackButton label="Yararlı değil" disabled={feedback.isPending} onClick={() => setState("asking")}>
        <ThumbsDown className="size-3.5" />
      </FeedbackButton>
    </div>
  );
}

function FeedbackButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex size-6 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground",
        disabled && "opacity-50",
      )}
    >
      {children}
    </button>
  );
}
