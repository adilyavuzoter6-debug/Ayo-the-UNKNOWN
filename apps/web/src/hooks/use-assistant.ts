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
