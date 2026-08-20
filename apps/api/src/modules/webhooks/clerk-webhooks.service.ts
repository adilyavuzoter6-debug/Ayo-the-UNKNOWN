import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

export interface ClerkUserEventData {
  id: string;
  email_addresses?: { email_address: string }[];
  first_name?: string | null;
  last_name?: string | null;
}

/**
 * Keeps `User.email`/`fullName` accurate from Clerk's own record, independent of whether a
 * given deployment's Clerk JWT template carries custom email/name claims (see
 * UsersService.findOrProvisionByAuthProviderId's doc-comment — that JIT-provisioning path is
 * the eventually-consistent fallback for the race where a first request arrives before this
 * webhook does; this service is the authoritative source once it fires).
 *
 * Injects PrismaService directly — same sanctioned exception as UsersService/CompaniesService
 * (User is a global identity, not tenant-scoped), see eslint.nestjs.js's exemption list.
 */
@Injectable()
export class ClerkWebhooksService {
  private readonly logger = new Logger(ClerkWebhooksService.name);

  constructor(private readonly prisma: PrismaService) {}

  async handleUserUpserted(data: ClerkUserEventData): Promise<void> {
    const email = data.email_addresses?.[0]?.email_address;
    const fullName = `${data.first_name ?? ""} ${data.last_name ?? ""}`.trim();

    if (!email) {
      this.logger.warn(`user.created/updated webhook for ${data.id} carried no email address.`);
      return;
    }

    await this.prisma.user.upsert({
      where: { authProviderId: data.id },
      create: {
        authProviderId: data.id,
        email,
        fullName: fullName || "Unnamed User",
      },
      update: {
        email,
        fullName: fullName || undefined,
      },
    });
  }

  async handleUserDeleted(data: { id: string }): Promise<void> {
    await this.prisma.user.updateMany({
      where: { authProviderId: data.id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }
}
