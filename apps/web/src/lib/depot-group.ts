import type { Farm } from "@/lib/types";

/**
 * The farm ids that pool stock with `farmId` — itself, plus every farm reachable through
 * Farm.sharesDepotWithFarmId (in either direction). Mirrors the API's SuppliesService.depotGroup,
 * so a feed lot (or supply item) received at a farm's warehouse is still offered at a pond in a
 * farm it physically shares a depot with — e.g. Ören 1 and Ören 2's one shared feed store.
 */
export function depotGroupFarmIds(farms: Farm[] | undefined, farmId: string): string[] {
  if (!farms) return [farmId];
  const self = farms.find((f) => f.id === farmId);
  const ids = new Set<string>([farmId]);
  if (self?.sharesDepotWithFarmId) ids.add(self.sharesDepotWithFarmId);
  for (const f of farms) {
    if (f.sharesDepotWithFarmId === farmId) ids.add(f.id);
  }
  return [...ids];
}
