/** Turkish names for audit-log actions and record types, for the activity feed and audit table. */

export const AUDIT_ACTION_LABEL: Record<string, string> = {
  CREATE: "Oluşturuldu",
  UPDATE: "Güncellendi",
  DELETE: "Silindi",
};

export const AUDIT_ENTITY_LABEL: Record<string, string> = {
  Alert: "Uyarı",
  BatchMovement: "Parti hareketi",
  ColdStorageEntry: "Soğuk hava deposu",
  Company: "Şirket",
  CompanyMembership: "Üyelik",
  CompanyPlan: "Plan",
  CostEntry: "Maliyet kaydı",
  CostScenario: "Maliyet senaryosu",
  Farm: "Çiftlik",
  FarmSection: "Tesis",
  FeedInventoryBatch: "Yem girişi",
  FeedInventoryTransaction: "Yem stok hareketi",
  FeedProduct: "Yem ürünü",
  FeedingEvent: "Yemleme",
  FishBatch: "Parti",
  FishSpecies: "Balık türü",
  HarvestRecord: "Hasat",
  Invitation: "Davet",
  MortalityEvent: "Ölüm kaydı",
  RecurringCost: "Tekrarlayan gider",
  SupplyItem: "Malzeme",
  SupplyMovement: "Malzeme hareketi",
  Tank: "Havuz/tank",
  Treatment: "Tedavi",
  Warehouse: "Depo",
  WaterQualityReading: "Su ölçümü",
  WeightSample: "Tartım",
};

export const auditActionLabel = (action: string) => AUDIT_ACTION_LABEL[action] ?? action;
export const auditEntityLabel = (entityType: string) => AUDIT_ENTITY_LABEL[entityType] ?? entityType;
