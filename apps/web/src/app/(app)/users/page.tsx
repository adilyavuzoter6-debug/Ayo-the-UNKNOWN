"use client";

import { toast } from "sonner";
import { Mail, X } from "lucide-react";
import { PanelCard } from "@/components/shared/panel-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InviteMemberDialog } from "@/components/users/invite-member-dialog";
import {
  useCompanyInvitations,
  useCompanyMembers,
  useRevokeInvitation,
  useRevokeMember,
  useUpdateMemberRole,
} from "@/hooks/use-members";
import { ApiError } from "@/lib/api-error";
import { INVITABLE_ROLES, ROLE_LABEL } from "@/lib/roles";
import type { Role } from "@aquai/types";

export default function UsersPage() {
  const { data: members, isLoading: membersLoading } = useCompanyMembers();
  const { data: invitations, isLoading: invitationsLoading } = useCompanyInvitations();
  const updateRole = useUpdateMemberRole();
  const revokeMember = useRevokeMember();
  const revokeInvitation = useRevokeInvitation();

  async function handleRoleChange(membershipId: string, role: string | null) {
    if (!role) return;
    try {
      await updateRole.mutateAsync({ membershipId, role: role as Role });
      toast.success("Rol güncellendi.");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Rol güncellenirken bir sorun oluştu.");
    }
  }

  async function handleRevokeMember(membershipId: string) {
    try {
      await revokeMember.mutateAsync(membershipId);
      toast.success("Kullanıcının erişimi kaldırıldı.");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Erişim kaldırılırken bir sorun oluştu.");
    }
  }

  async function handleRevokeInvitation(invitationId: string) {
    try {
      await revokeInvitation.mutateAsync(invitationId);
      toast.success("Davet iptal edildi.");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Davet iptal edilirken bir sorun oluştu.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-bold tracking-tight text-foreground">Kullanıcılar</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Şirketindeki kullanıcıları ve rollerini yönet.</p>
        </div>
        <InviteMemberDialog />
      </div>

      <PanelCard title={`Aktif Kullanıcılar${members ? ` (${members.length})` : ""}`}>
        {membersLoading ? (
          <div className="p-4">
            <Skeleton className="h-32 rounded" />
          </div>
        ) : members && members.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kullanıcı</TableHead>
                  <TableHead>E-posta</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead className="text-right">İşlem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.user.fullName}</TableCell>
                    <TableCell className="text-muted-foreground">{m.user.email}</TableCell>
                    <TableCell>
                      <Select
                        value={m.role}
                        onValueChange={(v) => handleRoleChange(m.id, v)}
                      >
                        <SelectTrigger className="w-44">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {INVITABLE_ROLES.map((role) => (
                            <SelectItem key={role} value={role}>
                              {ROLE_LABEL[role]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={revokeMember.isPending}
                        onClick={() => handleRevokeMember(m.id)}
                      >
                        Erişimi kaldır
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="px-4.5 py-10 text-center text-sm text-muted-foreground">Henüz kullanıcı yok.</p>
        )}
      </PanelCard>

      <PanelCard title={`Bekleyen Davetler${invitations ? ` (${invitations.length})` : ""}`}>
        {invitationsLoading ? (
          <div className="p-4">
            <Skeleton className="h-20 rounded" />
          </div>
        ) : invitations && invitations.length > 0 ? (
          <ul className="divide-y divide-border">
            {invitations.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 px-4.5 py-2.5 text-xs">
                <div className="flex min-w-0 items-center gap-2">
                  <Mail className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate text-foreground">{inv.email}</span>
                  <span className="shrink-0 text-muted-foreground">· {ROLE_LABEL[inv.role]}</span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-muted-foreground">
                    {new Date(inv.expiresAt).toLocaleDateString("tr")} tarihinde sona erer
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    disabled={revokeInvitation.isPending}
                    onClick={() => handleRevokeInvitation(inv.id)}
                    aria-label="Daveti iptal et"
                  >
                    <X className="size-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4.5 py-10 text-center text-sm text-muted-foreground">Bekleyen davet yok.</p>
        )}
      </PanelCard>
    </div>
  );
}
