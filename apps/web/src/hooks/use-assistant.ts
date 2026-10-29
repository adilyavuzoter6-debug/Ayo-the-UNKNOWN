"use client";

import { useMutation } from "@tanstack/react-query";
import { useApiClient } from "@/lib/api-client";

export interface AssistantTurn {
  role: "user" | "assistant";
  content: string;
}

export function useAssistantChat() {
  const api = useApiClient();
  return useMutation({
    mutationFn: (messages: AssistantTurn[]) =>
      api.post<{ reply: string; remainingToday: number }>("/assistant/chat", { messages }),
  });
}

/** A member's 👍/👎 on one answer, kept with the question and answer it is about. */
export function useAssistantFeedback() {
  const api = useApiClient();
  return useMutation({
    mutationFn: (input: { question: string; answer: string; helpful: boolean; comment?: string }) =>
      api.post<{ id: string }>("/assistant/feedback", input),
  });
}
