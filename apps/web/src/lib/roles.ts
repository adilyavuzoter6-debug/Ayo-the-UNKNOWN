import { ROLES, type Role } from "@aquai/types";

export const ROLE_LABEL: Record<Role, string> = {
  PLATFORM_ADMIN: "Platform Yöneticisi",
  COMPANY_OWNER: "Şirket Sahibi",
  GENERAL_MANAGER: "Genel Müdür",
  FARM_MANAGER: "Çiftlik Müdürü",
  VETERINARIAN: "Veteriner",
  FEED_MANAGER: "Yem Sorumlusu",
  ACCOUNTANT: "Muhasebeci",
  WORKER: "Saha Personeli",
  READ_ONLY: "Salt Okunur",
};

/** Mirrors the API's INVITABLE_ROLES (apps/api/src/modules/users/dto/invite-user.dto.ts) —
 * PLATFORM_ADMIN is a cross-tenant support role, never assignable from within a company. */
export const INVITABLE_ROLES: Role[] = ROLES.filter((r) => r !== "PLATFORM_ADMIN");
