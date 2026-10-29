import { Inject, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { DEMO_ACCOUNTS, type DemoAccounts } from "./demo-accounts";
import { DemoCloneService } from "./demo-clone.service";

/** How long a visitor's demo lives. */
export const DEMO_LIFETIME_MS = 24 * 60 * 60 * 1000;
/** Demos open at once; past this, new visitors are asked to come back shortly. */
const MAX_OPEN_DEMOS = 300;
/** Expired demos removed per request, so one visitor never waits on a long cleanup. */
const CLEANUP_BATCH = 10;

/**
 * "Try the demo": each visitor gets an account and a private copy of the sample farm company,
 * signs straight in, can change anything, and both are removed after a day. Expired demos are
 * cleaned up as new ones are opened, so no scheduler is needed.
 */
@Injectable()
export class DemoService {
  private readonly logger = new Logger(DemoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clone: DemoCloneService,
    @Inject(DEMO_ACCOUNTS) private readonly accounts: DemoAccounts,
  ) {}

  async cleanupExpired(now = new Date()) {
    const expired = await this.prisma.company.findMany({
      where: { demoKind: "VISITOR", createdAt: { lt: new Date(now.getTime() - DEMO_LIFETIME_MS) } },
      select: { id: true },
      orderBy: { createdAt: "asc" },
      take: CLEANUP_BATCH,
    });
    for (const company of expired) {
      const users = await this.clone.deleteCompany(company.id);
      for (const user of users) await this.accounts.remove(user.authProviderId);
    }
    return expired.length;
  }

  async start(): Promise<{ ticket: string }> {
    await this.cleanupExpired().catch((error) => this.logger.warn(`Demo cleanup failed: ${error}`));

    const open = await this.prisma.company.count({ where: { demoKind: "VISITOR" } });
    if (open >= MAX_OPEN_DEMOS) {
      throw new ServiceUnavailableException("Şu anda çok sayıda demo açık. Birkaç dakika sonra tekrar deneyin.");
    }
    const template = await this.prisma.company.findFirst({
      where: { demoKind: "TEMPLATE", deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (!template) {
      throw new ServiceUnavailableException("Demo şu anda hazırlanıyor. Lütfen daha sonra tekrar deneyin.");
    }

    const account = await this.accounts.create();
    let userId: string | undefined;
    try {
      const user = await this.prisma.user.create({
        data: { authProviderId: account.authProviderId, email: account.email, fullName: "Demo Ziyaretçi", locale: "tr" },
      });
      userId = user.id;
      await this.clone.cloneTemplate(template.id, user.id);
      return { ticket: await this.accounts.signInToken(account.authProviderId) };
    } catch (error) {
      if (userId) await this.prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
      await this.accounts.remove(account.authProviderId);
      throw error;
    }
  }
}
