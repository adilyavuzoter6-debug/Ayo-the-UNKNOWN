"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/api-client";
import type { DataImport, ImportPreview } from "@/lib/types";

const asForm = (file: File) => {
  const form = new FormData();
  form.append("file", file);
  return form;
};

export function useImports() {
  const api = useApiClient();
  return useQuery({ queryKey: ["imports"], queryFn: () => api.get<DataImport[]>("/imports") });
}

/** Reads and checks a file; writes nothing. */
export function usePreviewImport() {
  const api = useApiClient();
  return useMutation({ mutationFn: (file: File) => api.upload<ImportPreview>("/imports/preview", asForm(file)) });
}

export function useCommitImport() {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => api.upload<ImportPreview & { id: string }>("/imports", asForm(file)),
    // An import touches nearly every page's numbers.
    onSuccess: () => queryClient.invalidateQueries(),
  });
}

export function useUndoImport() {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ id: string; undone: true }>(`/imports/${id}`),
    onSuccess: () => queryClient.invalidateQueries(),
  });
}
