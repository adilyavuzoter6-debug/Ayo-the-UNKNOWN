"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Role } from "@aquai/types";
import { useActiveCompany } from "@/components/providers/active-company-provider";
import { useApiClient } from "@/lib/api-client";
import type { CompanyMember, Invitation } from "@/lib/types";

export function useCompanyMembers() {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  return useQuery({
    queryKey: ["company-members", companyId],
    queryFn: () => api.get<CompanyMember[]>("/users"),
    enabled: !!companyId,
  });
}

export function useCompanyInvitations() {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  return useQuery({
    queryKey: ["company-invitations", companyId],
    queryFn: () => api.get<Invitation[]>("/users/invitations"),
    enabled: !!companyId,
  });
}

export interface InviteMemberInput {
  email: string;
  role: Role;
}

export function useInviteMember() {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: InviteMemberInput) => api.post<Invitation>("/users/invite", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-invitations", companyId] });
    },
  });
}

export function useRevokeInvitation() {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (invitationId: string) => api.del<Invitation>(`/users/invitations/${invitationId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-invitations", companyId] });
    },
  });
}

export function useUpdateMemberRole() {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ membershipId, role }: { membershipId: string; role: Role }) =>
      api.patch<CompanyMember>(`/users/${membershipId}/role`, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-members", companyId] });
    },
  });
}

export function useRevokeMember() {
  const api = useApiClient();
  const { companyId } = useActiveCompany();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (membershipId: string) => api.del<CompanyMember>(`/users/${membershipId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-members", companyId] });
    },
  });
}
