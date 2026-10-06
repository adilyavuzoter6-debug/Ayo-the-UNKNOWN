import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "../../prisma/tenant-prisma.service";
import { AuditService } from "../audit/audit.service";
import type { CreateColdStorageEntryDto, UpdateColdStorageEntryDto } from "./dto/cold-storage.dto";

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** How many entries the page lists. The balance always counts every live entry. */
const RECENT_LIMIT = 50;

interface EntryLike {
  kind: "IN" | "OUT";
  disposal: "PIT" | "RENDERING";
  weightKg: unknown;
  destination: string | null;
}

/**
 * The cold room's balance: only dead fish held for the rendering machine. Fish buried in the pit are
 * recorded but are not in the room, and a shipment to the plant always comes from the room.
 */
function balanceOf(entries: EntryLike[]): number {
  return round3(
    entries
      .filter((e) => e.disposal === "RENDERING")
      .reduce((sum, e) => sum + (e.kind === "IN" ? 1 : -1) * Number(e.weightKg), 0),
  );
}

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

  /** Live entries of one farm, newest first. */
  private async liveEntries(companyId: string, farmId: string) {
    return this.tenantPrisma.forTenant(companyId).coldStorageEntry.findMany({
      where: { farmId, deletedAt: null },
      orderBy: { occurredAt: "desc" },
    });
  }

  /**
   * Dead fish records of a farm: what is in the cold room now (for the rendering machine), what has been
   * buried in the pit in total, and the most recent entries of either kind.
   */
  async list(companyId: string, farmId: string) {
    await this.assertFarm(companyId, farmId);
    const entries = await this.liveEntries(companyId, farmId);
    const pitKg = round3(
      entries
        .filter((e) => e.kind === "IN" && e.disposal === "PIT")
        .reduce((sum, e) => sum + Number(e.weightKg), 0),
    );
    return { balanceKg: balanceOf(entries), pitKg, entries: entries.slice(0, RECENT_LIMIT) };
  }

  async add(companyId: string, userId: string, farmId: string, dto: CreateColdStorageEntryDto) {
    await this.assertFarm(companyId, farmId);
    const destination = dto.destination?.trim() || null;
    // A shipment to the plant always comes from the rendering stock; only intakes choose a disposal.
    const disposal = dto.kind === "OUT" ? "RENDERING" : (dto.disposal ?? "RENDERING");

    if (dto.kind === "OUT") {
      if (!destination) {
        throw new BadRequestException("Sevkte fabrika adı girilmeli.");
      }
      const balanceKg = balanceOf(await this.liveEntries(companyId, farmId));
      if (dto.weightKg > balanceKg) {
        throw new BadRequestException(`Soğuk hava deposunda yalnızca ${balanceKg} kg var.`);
      }
    }

    const entry = await this.tenantPrisma.forTenant(companyId).coldStorageEntry.create({
      data: {
        companyId,
        farmId,
        kind: dto.kind,
        disposal,
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
      newValue: {
        farmId,
        kind: entry.kind,
        disposal: entry.disposal,
        weightKg: entry.weightKg.toString(),
        destination: entry.destination,
      },
    });
    return entry;
  }

  private async findEntry(companyId: string, farmId: string, entryId: string) {
    const entry = await this.tenantPrisma.forTenant(companyId).coldStorageEntry.findFirst({
      where: { id: entryId, farmId, deletedAt: null },
    });
    if (!entry) {
      throw new NotFoundException("Cold storage entry not found.");
    }
    return entry;
  }

  /** Corrects an entry. The room's balance after the change must not go below zero. */
  async update(companyId: string, userId: string, farmId: string, entryId: string, dto: UpdateColdStorageEntryDto) {
    const current = await this.findEntry(companyId, farmId, entryId);
    const destination =
      dto.destination !== undefined ? dto.destination.trim() || null : current.destination;
    if (current.kind === "OUT" && !destination) {
      throw new BadRequestException("Sevkte fabrika adı girilmeli.");
    }
    const weightKg = dto.weightKg !== undefined ? round3(dto.weightKg) : Number(current.weightKg);
    // Only intakes change disposal; a shipment is always rendering stock.
    const disposal = current.kind === "IN" && dto.disposal !== undefined ? dto.disposal : current.disposal;

    const others = (await this.liveEntries(companyId, farmId)).filter((e) => e.id !== entryId);
    const balanceAfter = balanceOf([...others, { kind: current.kind, disposal, weightKg, destination }]);
    if (balanceAfter < 0) {
      throw new BadRequestException(`Bu değişiklik sonrası depo ${balanceAfter} kg olur; kayıt yapılmadı.`);
    }

    const updated = await this.tenantPrisma.forTenant(companyId).coldStorageEntry.update({
      where: { id: entryId },
      data: {
        weightKg,
        disposal,
        destination,
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : current.occurredAt,
        note: dto.note !== undefined ? dto.note.trim() || null : current.note,
      },
    });
    await this.auditService.record({
      companyId,
      userId,
      action: "UPDATE",
      entityType: "ColdStorageEntry",
      entityId: entryId,
      previousValue: {
        weightKg: current.weightKg.toString(),
        disposal: current.disposal,
        destination: current.destination,
      },
      newValue: {
        weightKg: updated.weightKg.toString(),
        disposal: updated.disposal,
        destination: updated.destination,
      },
    });
    return updated;
  }

  /** Removes an entry. Refused if the room's balance would then go below zero. */
  async remove(companyId: string, userId: string, farmId: string, entryId: string) {
    const current = await this.findEntry(companyId, farmId, entryId);
    const others = (await this.liveEntries(companyId, farmId)).filter((e) => e.id !== entryId);
    const balanceAfter = balanceOf(others);
    if (balanceAfter < 0) {
      throw new BadRequestException(`Bu kayıt silinirse depo ${balanceAfter} kg olur; silinmedi.`);
    }

    await this.tenantPrisma.forTenant(companyId).coldStorageEntry.update({
      where: { id: entryId },
      data: { deletedAt: new Date() },
    });
    await this.auditService.record({
      companyId,
      userId,
      action: "DELETE",
      entityType: "ColdStorageEntry",
      entityId: entryId,
      previousValue: { kind: current.kind, disposal: current.disposal, weightKg: current.weightKg.toString() },
    });
    return { deleted: true as const };
  }
}
