import type { CostCategory } from "@/lib/types";

export const COST_CATEGORY_LABEL: Record<CostCategory, string> = {
  FEED: "Yem",
  EGGS: "Yumurta",
  FINGERLINGS: "Yavru Balık",
  MEDICINE: "İlaç",
  VACCINATION: "Aşı",
  LABOR: "İşçilik",
  ELECTRICITY: "Elektrik",
  OXYGEN: "Oksijen",
  FUEL: "Yakıt",
  TRANSPORTATION: "Nakliye",
  OVERHEAD: "Genel Gider",
  DEPRECIATION: "Amortisman",
  OTHER: "Diğer",
};

export const COST_CATEGORIES = Object.keys(COST_CATEGORY_LABEL) as CostCategory[];
