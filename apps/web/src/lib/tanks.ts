import type { MortalityReason, SampleMethod, TankStatus, TankType } from "@/lib/types";

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

export const MORTALITY_REASON_LABEL: Record<MortalityReason, string> = {
  UNKNOWN: "Bilinmiyor",
  DISEASE: "Hastalık",
  OXYGEN: "Oksijen yetersizliği",
  TEMPERATURE: "Sıcaklık",
  TRANSFER_STRESS: "Transfer stresi",
  PHYSICAL_DAMAGE: "Fiziksel hasar",
  PREDATOR: "Yırtıcı",
  FEED_RELATED: "Yemle ilişkili",
  OTHER: "Diğer",
};

export const SAMPLE_METHOD_LABEL: Record<SampleMethod, string> = {
  INDIVIDUAL: "Bireysel ölçüm",
  AGGREGATE: "Toplu ölçüm",
};
