import type { TankStatus, TankType } from "@/lib/types";

export const TANK_TYPE_LABEL: Record<TankType, string> = {
  TANK: "Tank (RAS)",
  POND: "Havuz",
  CAGE: "Kafes",
  RACEWAY: "Kanal (Raceway)",
};

export const TANK_STATUS_LABEL: Record<TankStatus, string> = {
  ACTIVE: "Aktif",
  INACTIVE: "Pasif",
  MAINTENANCE: "Bakımda",
};
