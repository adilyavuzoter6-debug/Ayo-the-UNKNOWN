import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "../../prisma/tenant-prisma.service";
import { AuditService } from "../audit/audit.service";
import type { CreateColdStorageEntryDto } from "./dto/cold-storage.dto";

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** How many entries the page lists. The balance always counts every entry. */
const RECENT_LIMIT = 50;

@Injectable()
export class ColdStorageService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly auditService: AuditService,
  ) {}

  private async assertFarm(companyId: string, farmId: string) {
    const farm = await this.tenantPrisma
      .forTenant(companyId)
      .farm.findFirst({ where: { id: farmId, deletedAt: null } });
    if (!farm) {
      throw new NotFoundException("Farm not found.");
    }
  }

  /** Dead fish now in the cold room at a farm, and its most recent entries. */
  async list(companyId: string, farmId: string) {
    await this.assertFarm(companyId, farmId);
    const entries = await this.tenantPrisma.forTenant(companyId).coldStorageEntry.findMany({
      where: { farmId },
      orderBy: { occurredAt: "desc" },
    });
    const balanceKg = round3(
      entries.reduce((sum, e) => sum + (e.kind === "IN" ? 1 : -1) * Number(e.weightKg), 0),
    );
    return { balanceKg, entries: entries.slice(0, RECENT_LIMIT) };
  }

  async add(companyId: string, userId: string, farmId: string, dto: CreateColdStorageEntryDto) {
    await this.assertFarm(companyId, farmId);
    const destination = dto.destination?.trim() || null;

    if (dto.kind === "OUT") {
      if (!destination) {
        throw new BadRequestException("Sevkte fabrika adı girilmeli.");
      }
      const { balanceKg } = await this.list(companyId, farmId);
      if (dto.weightKg > balanceKg) {
        throw new BadRequestException(`Soğuk hava deposunda yalnızca ${balanceKg} kg var.`);
      }
    }

    const entry = await this.tenantPrisma.forTenant(companyId).coldStorageEntry.create({
      data: {
        companyId,
        farmId,
        kind: dto.kind,
        weightKg: round3(dto.weightKg),
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
        destination: dto.kind === "OUT" ? destination : null,
        note: dto.note?.trim() || null,
        createdById: userId,
      },
    });
    await this.auditService.record({
      companyId,
      userId,
      action: "CREATE",
      entityType: "ColdStorageEntry",
      entityId: entry.id,
      newValue: { farmId, kind: entry.kind, weightKg: entry.weightKg.toString(), destination: entry.destination },
    });
    return entry;
  }
}
