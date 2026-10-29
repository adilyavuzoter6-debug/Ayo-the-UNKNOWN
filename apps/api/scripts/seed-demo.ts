/**
 * Fills a demo company with seven months of realistic trout-farm records, for sales demos,
 * screenshots and design work: three farms, ~19 tanks, daily feeding, fortnightly weighings,
 * mortality, water quality, harvests and sales, costs and treatments. Two batches carry the kind of
 * problem the anomaly panel exists for (a cage with poor FCR, a cage whose oxygen has dropped and
 * whose deaths are rising).
 *
 * Everything goes through the app's own endpoints, so stock ledgers, projections, alerts and cost
 * attribution come out exactly as real use would leave them. The app runs in-process with the
 * integration tests' fake token verifier, so the "token" is simply the owner's authProviderId.
 *
 *   DATABASE_URL=postgresql://…localhost…/db \
 *   npx ts-node --transpile-only scripts/seed-demo.ts --owner-auth-id <clerk user id> \
 *     [--owner-email demo@…] [--owner-name "Demo Kullanıcı"] [--days 210] [--allow-remote]
 *
 * DATABASE_URL must be given explicitly (never taken from .env), and a non-local database needs
 * --allow-remote. The owner may not already own a company (one company per account).
 */
import { PrismaClient } from "@prisma/client";

// ---------- arguments and safety ----------

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const OWNER_AUTH_ID = arg("owner-auth-id");
const OWNER_EMAIL = arg("owner-email") ?? "demo@piscatiotechnologies.com";
const OWNER_NAME = arg("owner-name") ?? "Demo Kullanıcı";
const DAYS = Number(arg("days") ?? 210);

if (!OWNER_AUTH_ID) {
  console.error("--owner-auth-id is required (the demo account's Clerk user id).");
  process.exit(1);
}
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("Set DATABASE_URL explicitly; this script never falls back to .env.");
  process.exit(1);
}
const host = new URL(databaseUrl).hostname;
if (!["localhost", "127.0.0.1"].includes(host) && !args.includes("--allow-remote")) {
  console.error(`DATABASE_URL points at ${host}. Pass --allow-remote to seed a non-local database.`);
  process.exit(1);
}
// No e-mails from a seed: keep .env's Resend key from being loaded.
process.env.RESEND_API_KEY = "";

// ---------- deterministic randomness ----------

let seed = 20261029;
function rand(): number {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (a: number, b: number) => a + (b - a) * rand();
const noise = (pct: number) => 1 + (rand() * 2 - 1) * pct;
const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

// ---------- calendar ----------

const DAY_MS = 86_400_000;
const today = new Date();
today.setUTCHours(0, 0, 0, 0);
const dayDate = (d: number) => new Date(today.getTime() + d * DAY_MS);
/** A timestamp on day `d` (negative = past) at a local Istanbul (UTC+3) hour. */
const at = (d: number, hour: number, minute = 0) =>
  new Date(dayDate(d).getTime() + ((hour - 3) * 60 + minute) * 60_000).toISOString();
const isoDay = (d: number) => dayDate(d).toISOString().slice(0, 10);
const latest = Date.now() - 20 * 60_000;
/** Like `at`, but today's records stop shortly before the script runs. */
const atPast = (d: number, hour: number, minute = 0) =>
  new Date(Math.min(new Date(at(d, hour, minute)).getTime(), latest)).toISOString();

/** Water temperature through the year: ~9 °C in February, ~18 °C in August. */
function waterTemp(d: number): number {
  const doy = (dayDate(d).getTime() - Date.UTC(dayDate(d).getUTCFullYear(), 0, 0)) / DAY_MS;
  return 13.5 + 4.5 * Math.sin((2 * Math.PI * (doy - 125)) / 365);
}

// ---------- the farm plan ----------

type Product = "start" | "grow3" | "grow6";
const PRODUCTS: Record<Product, { name: string; pellet: string; protein: number; fat: number; priceTry: number }> = {
  start: { name: "Alabalık Başlangıç 1,5 mm", pellet: "1.5", protein: 54, fat: 16, priceTry: 58 },
  grow3: { name: "Alabalık Büyütme 3 mm", pellet: "3", protein: 46, fat: 20, priceTry: 47 },
  grow6: { name: "Alabalık Büyütme 6 mm", pellet: "6", protein: 42, fat: 24, priceTry: 41 },
};
/** Water volume by unit type, for stocking density (kg/m³). */
const VOLUME_M3: Record<TankPlan["type"], number> = { TANK: 100, POND: 450, CAGE: 1500, RACEWAY: 180 };
const productFor = (w: number): Product => (w < 15 ? "start" : w < 120 ? "grow3" : "grow6");

interface TankPlan {
  code: string;
  type: "TANK" | "POND" | "CAGE" | "RACEWAY";
  maxBiomassKg: number;
  /** First stocking: day offset, fish, weight. */
  stockDay: number;
  count: number;
  weightG: number;
  fcr: number;
  mortalityDaily: number;
  /** Oxygen falls and deaths climb over the last week. */
  troubled?: boolean;
}
interface FarmPlan {
  name: string;
  code: string;
  sections: { name: string; tanks: TankPlan[] }[];
  monthlyCosts: { category: string; amount: number; notes: string }[];
}

const t = (
  code: string,
  type: TankPlan["type"],
  maxBiomassKg: number,
  stockDay: number,
  count: number,
  weightG: number,
  fcr: number,
  mortalityDaily = 0.0004,
  troubled = false,
): TankPlan => ({ code, type, maxBiomassKg, stockDay, count, weightG, fcr, mortalityDaily, troubled });

const FARMS: FarmPlan[] = [
  {
    name: "Merkez Tesis",
    code: "MRK",
    sections: [
      {
        name: "Yavru ve Ön Büyütme",
        tanks: [
          t("Y-01", "TANK", 4500, -205, 24000, 6, 0.95, 0.0007),
          t("Y-02", "TANK", 4500, -170, 22000, 8, 0.98, 0.0007),
          t("Y-03", "TANK", 4500, -120, 25000, 5, 0.96, 0.0008),
          t("Y-04", "TANK", 4500, -60, 26000, 4, 0.97, 0.0009),
        ],
      },
      {
        name: "Büyütme Havuzları",
        tanks: [
          t("H-01", "POND", 9000, -208, 16000, 95, 1.08),
          t("H-02", "POND", 9000, -200, 15000, 110, 1.12),
          t("H-03", "POND", 9000, -185, 17000, 70, 1.1),
          t("H-04", "POND", 9000, -150, 15500, 60, 1.06),
        ],
      },
    ],
    monthlyCosts: [
      { category: "LABOR", amount: 96000, notes: "Personel maaşları" },
      { category: "ELECTRICITY", amount: 27500, notes: "Pompa ve aeratör elektriği" },
      { category: "OXYGEN", amount: 12400, notes: "Sıvı oksijen" },
      { category: "OVERHEAD", amount: 6500, notes: "Genel giderler" },
    ],
  },
  {
    name: "Kuzey Baraj Kafesleri",
    code: "KZY",
    sections: [
      {
        name: "Baraj Gölü",
        tanks: [
          t("K-01", "CAGE", 14000, -210, 20000, 130, 1.12, 0.0004),
          t("K-02", "CAGE", 14000, -195, 21000, 120, 1.15, 0.0004),
          t("K-03", "CAGE", 14000, -160, 19000, 85, 1.14, 0.0005, true),
          t("K-04", "CAGE", 14000, -150, 20000, 90, 1.58, 0.0005),
          t("K-05", "CAGE", 14000, -100, 22000, 60, 1.1, 0.0005),
          t("K-06", "CAGE", 14000, -75, 21000, 45, 1.09, 0.0006),
        ],
      },
    ],
    monthlyCosts: [
      { category: "LABOR", amount: 64000, notes: "Personel maaşları" },
      { category: "FUEL", amount: 8200, notes: "Bot yakıtı" },
      { category: "OVERHEAD", amount: 4800, notes: "Genel giderler" },
    ],
  },
  {
    name: "Dere Yanı Tesis",
    code: "DRE",
    sections: [
      {
        name: "Akarsu Havuzları",
        tanks: [
          t("D-01", "RACEWAY", 6000, -198, 12000, 55, 1.05),
          t("D-02", "RACEWAY", 6000, -180, 11500, 40, 1.07),
          t("D-03", "RACEWAY", 6000, -140, 12500, 30, 1.04),
          t("D-04", "RACEWAY", 6000, -110, 12000, 25, 1.08),
          t("D-05", "RACEWAY", 6000, -45, 13000, 12, 1.0, 0.0008),
        ],
      },
    ],
    monthlyCosts: [
      { category: "LABOR", amount: 48000, notes: "Personel maaşları" },
      { category: "ELECTRICITY", amount: 13800, notes: "Pompa elektriği" },
      { category: "OVERHEAD", amount: 4200, notes: "Genel giderler" },
    ],
  },
];

const HARVEST_WEIGHT_G = 330;
const MEDICATION_DAY = -96;
const CUSTOMERS = ["Karadeniz Balıkçılık", "Ege Gıda Ltd.", "Anadolu Su Ürünleri", "Marmara Soğuk Zincir"];

// ---------- run ----------

async function main() {
  // The rate limit protects the public API from abuse; this in-process app has one caller.
  const { ThrottlerGuard } = await import("@nestjs/throttler");
  ThrottlerGuard.prototype.canActivate = async () => true;
  const { createTestApp } = await import("../test/support/test-app");
  const request = (await import("supertest")).default;
  const prisma = new PrismaClient();
  const app = await createTestApp();
  const server = app.getHttpServer();
  let companyId: string | undefined;
  let calls = 0;

  async function api<T = { id: string }>(method: "get" | "post", path: string, body?: unknown): Promise<T> {
    calls++;
    let req = request(server)[method](`/api/v1${path}`).set("Authorization", `Bearer ${OWNER_AUTH_ID}`);
    if (companyId) req = req.set("X-Company-Id", companyId);
    const res = body === undefined ? await req : await req.send(body as object);
    if (res.status >= 300) {
      throw new Error(`${method.toUpperCase()} ${path} → ${res.status} ${JSON.stringify(res.body?.error ?? res.body)}`);
    }
    return res.body.data as T;
  }

  const started = Date.now();
  const owner = await prisma.user.upsert({
    where: { authProviderId: OWNER_AUTH_ID! },
    create: { authProviderId: OWNER_AUTH_ID!, email: OWNER_EMAIL, fullName: OWNER_NAME, locale: "tr" },
    update: { email: OWNER_EMAIL, fullName: OWNER_NAME },
  });

  const company = await api("post", "/companies", {
    name: "Karadeniz Alabalık (Demo)",
    legalName: "Karadeniz Su Ürünleri A.Ş. — örnek veri",
    countryCode: "TR",
    timezone: "Europe/Istanbul",
  });
  companyId = company.id;
  // A demo shows everything and never runs out.
  await prisma.company.update({ where: { id: companyId }, data: { planTier: "ENTERPRISE", trialEndsAt: null } });

  const species = await api("post", "/fish-species", {
    name: "Gökkuşağı alabalığı",
    strain: "Oncorhynchus mykiss",
    criticalDoMgL: 6,
    criticalTempHighC: 21,
  });
  const products = {} as Record<Product, string>;
  for (const [key, p] of Object.entries(PRODUCTS) as [Product, (typeof PRODUCTS)[Product]][]) {
    products[key] = (
      await api("post", "/feed-products", {
        name: p.name,
        manufacturer: "Örnek Yem A.Ş.",
        pelletSizeMm: p.pellet,
        proteinPct: p.protein,
        fatPct: p.fat,
      })
    ).id;
  }

  interface LiveBatch {
    id: string;
    tankId: string;
    farm: number;
    plan: TankPlan;
    count: number;
    weightG: number;
    initialCount: number;
    pendingDeaths: number;
    deathsCarry: number;
    harvested: boolean;
    lastHarvestDay: number;
    stockedDay: number;
    noHarvestUntil: number;
    lastWeighDay: number;
  }
  interface TankInfo {
    id: string;
    farm: number;
    plan: TankPlan;
    restockDay?: number;
  }
  const tanks: TankInfo[] = [];
  const farmIds: string[] = [];
  const warehouses: string[] = [];
  // Current feed lot per farm and product, with what's left in it.
  const lots = new Map<string, { id: string; leftKg: number }>();
  const snapshots: { batchId: string; tankId: string; day: number; count: number; weightG: number }[] = [];

  for (const [fi, farm] of FARMS.entries()) {
    const f = await api("post", "/farms", { name: farm.name, code: farm.code, timezone: "Europe/Istanbul" });
    farmIds.push(f.id);
    warehouses.push((await api("post", `/farms/${f.id}/warehouses`, { name: `${farm.name} Yem Deposu` })).id);
    await api("post", `/farms/${f.id}/recurring-costs`, {
      category: "OVERHEAD",
      amount: farm.code === "KZY" ? 9500 : 4200,
      currency: "TRY",
      dayOfMonth: 5,
      startDate: isoDay(-DAYS),
      notes: farm.code === "KZY" ? "Baraj su alanı kirası" : "Su kullanım bedeli",
    });
    for (const section of farm.sections) {
      const s = await api("post", `/farms/${f.id}/sections`, { name: section.name });
      for (const plan of section.tanks) {
        const tank = await api("post", `/farm-sections/${s.id}/tanks`, {
          code: plan.code,
          type: plan.type,
          maxBiomassKg: plan.maxBiomassKg,
          volumeM3: VOLUME_M3[plan.type],
        });
        tanks.push({ id: tank.id, farm: fi, plan });
      }
    }
  }

  const live = new Map<string, LiveBatch>(); // by tank id
  let lotSeq = 1;

  async function stock(tank: TankInfo, day: number, count: number, weightG: number) {
    const lotCode = `${FARMS[tank.farm]!.code}-${isoDay(day).slice(2, 4)}${isoDay(day).slice(5, 7)}-${String(lotSeq++).padStart(3, "0")}`;
    const batch = await api("post", "/fish-batches", {
      speciesId: species.id,
      lotCode,
      tankId: tank.id,
      fishCount: count,
      avgWeightG: weightG,
      farmEntryDate: isoDay(day),
      hatcherySupplier: weightG < 20 ? "Doğu Karadeniz Kuluçkahanesi" : "Örnek Yavru Üretim",
      stockingSource: "FINGERLINGS_PURCHASED",
      stockingUnitPrice: round(2.1 + 0.032 * weightG, 2),
      stockingCurrency: "TRY",
    });
    live.set(tank.id, {
      id: batch.id,
      tankId: tank.id,
      farm: tank.farm,
      plan: tank.plan,
      count,
      weightG,
      initialCount: count,
      pendingDeaths: 0,
      deathsCarry: 0,
      harvested: false,
      lastHarvestDay: -9999,
      stockedDay: day,
      noHarvestUntil: -9999,
      lastWeighDay: day,
    });
    if (weightG < 20 && tank.plan.type === "TANK") {
      await api("post", `/tanks/${tank.id}/treatments`, {
        batchId: batch.id,
        type: "VACCINATION",
        productName: "ERM aşısı (daldırma)",
        startedAt: at(day + 3, 10),
        endedAt: at(day + 3, 11),
      });
    }
  }

  async function feedLot(farm: number, product: Product, day: number, needKg: number): Promise<string> {
    const key = `${farm}:${product}`;
    let lot = lots.get(key);
    if (!lot || lot.leftKg < needKg + 25) {
      const quantityKg = product === "start" ? 2000 : 8000;
      const received = await api("post", `/warehouses/${warehouses[farm]}/inventory-batches`, {
        feedProductId: products[product],
        quantityKg,
        supplierLotCode: `YM-${isoDay(day).replaceAll("-", "")}-${product.toUpperCase()}`,
        unitCostAmount: round(PRODUCTS[product].priceTry * noise(0.04), 2),
        unitCostCurrency: "TRY",
        occurredAt: atPast(day, 7),
      });
      lot = { id: received.id, leftKg: quantityKg };
      lots.set(key, lot);
    }
    lot.leftKg -= needKg;
    return lot.id;
  }

  for (let day = -DAYS; day <= 0; day++) {
    const temp = waterTemp(day);

    // Stock tanks whose first batch starts today, and restock harvested tanks.
    for (const tank of tanks) {
      if (live.has(tank.id)) continue;
      if (tank.plan.stockDay === day) await stock(tank, day, tank.plan.count, tank.plan.weightG);
      else if (tank.restockDay === day)
        await stock(tank, day, Math.round(tank.plan.count * noise(0.08)), round(tank.plan.weightG * noise(0.2)));
    }

    // Monthly costs on the 1st.
    if (dayDate(day).getUTCDate() === 1) {
      for (const [fi, farm] of FARMS.entries()) {
        for (const c of farm.monthlyCosts) {
          await api("post", `/farms/${farmIds[fi]}/cost-entries`, {
            category: c.category,
            amount: Math.round(c.amount * noise(0.06)),
            currency: "TRY",
            incurredAt: at(day, 12),
            notes: c.notes,
          });
        }
      }
    }

    // A medication course on a grow-out pond; its batch can't be harvested until the withdrawal ends.
    if (day === MEDICATION_DAY) {
      const pond = tanks.find((x) => x.plan.code === "H-03")!;
      const pondBatch = live.get(pond.id);
      if (pondBatch) {
        await api("post", `/tanks/${pond.id}/treatments`, {
          batchId: pondBatch.id,
          type: "MEDICATION",
          productName: "Florfenikol %50",
          dosage: "10 mg/kg/gün, yemle",
          startedAt: at(day, 9),
          endedAt: at(day + 9, 9),
          withdrawalPeriodDays: 30,
          notes: "Furunkuloz şüphesi, veteriner önerisi",
        });
        await api("post", `/farms/${farmIds[pond.farm]}/cost-entries`, {
          category: "MEDICINE",
          amount: 18400,
          currency: "TRY",
          batchId: pondBatch.id,
          incurredAt: at(day, 12),
          notes: "Florfenikol tedavisi",
        });
        pondBatch.noHarvestUntil = day + 9 + 31;
      }
    }

    for (const tank of tanks) {
      const b = live.get(tank.id);
      if (!b || b.harvested) continue;
      const age = day - b.stockedDay;
      const troubledNow = b.plan.troubled && day >= -6;

      // Growth: specific growth rate falls with size and rises with warmth.
      const sgrPct = 4.6 * Math.pow(b.weightG, -0.33) * (temp / 15) * (troubledNow ? 0.4 : 1);
      const newWeight = b.weightG * Math.exp(sgrPct / 100);
      const gainKg = (b.count * (newWeight - b.weightG)) / 1000;
      b.weightG = newWeight;

      const feedKg = round(Math.max(1, gainKg * b.plan.fcr * noise(0.06)), 1);
      const product = productFor(b.weightG);
      const lotId = await feedLot(tank.farm, product, day, feedKg);
      await api("post", `/tanks/${tank.id}/feeding-events`, {
        batchId: b.id,
        feedInventoryBatchId: lotId,
        quantityKg: feedKg,
        method: tank.plan.type === "CAGE" ? "MANUAL" : "AUTOMATIC_FEEDER",
        occurredAt: atPast(day, 9, Math.floor(rand() * 50)),
      });

      // Deaths are written up daily, as a farm's morning count would be.
      const rate = troubledNow ? 0.0045 : age < 7 ? b.plan.mortalityDaily * 4 : b.plan.mortalityDaily;
      b.deathsCarry += b.count * rate * noise(0.5);
      const whole = Math.floor(b.deathsCarry);
      b.deathsCarry -= whole;
      b.pendingDeaths += whole;
      if (b.pendingDeaths > 0) {
        const fishCount = Math.min(b.pendingDeaths, b.count - 1);
        const reason = troubledNow
          ? "OXYGEN"
          : age < 10
            ? "TRANSFER_STRESS"
            : tank.plan.type === "CAGE" && rand() < 0.15
              ? "PREDATOR"
              : rand() < 0.2
                ? "DISEASE"
                : "UNKNOWN";
        await api("post", `/tanks/${tank.id}/mortality-events`, {
          batchId: b.id,
          fishCount,
          reason,
          occurredAt: atPast(day, 17, Math.floor(rand() * 40)),
        });
        b.count -= fishCount;
        b.pendingDeaths = 0;
      }

      // Fortnightly weighing, with a biomass snapshot the same day.
      const weighToday = (age > 0 && age % 14 === 0) || (day === -1 && day - b.lastWeighDay >= 5 && age > 7);
      if (weighToday) {
        await api("post", `/tanks/${tank.id}/weight-samples`, {
          batchId: b.id,
          sampleMethod: "AGGREGATE",
          avgWeightG: round(b.weightG * noise(0.03), 1),
          sampleSize: 60,
          occurredAt: atPast(day, 11),
        });
        snapshots.push({ batchId: b.id, tankId: tank.id, day, count: b.count, weightG: b.weightG });
        b.lastWeighDay = day;
      }

      // Market-size fish go in partial harvests ten days apart, the last third in a full one.
      if (b.weightG >= HARVEST_WEIGHT_G && day - b.lastHarvestDay >= 10 && day >= b.noHarvestUntil) {
        const full = b.count < b.initialCount * 0.4;
        const fishCount = full ? b.count : Math.round(b.count * between(0.28, 0.36));
        await api("post", `/tanks/${tank.id}/harvest-records`, {
          batchId: b.id,
          type: "ACTUAL",
          fullness: full ? "FULL" : "PARTIAL",
          harvestedAt: atPast(day, 7, 30),
          fishCount,
          avgWeightG: round(b.weightG * noise(0.02), 1),
          sizeGrade: b.weightG > 380 ? "Porsiyonluk büyük" : "Porsiyonluk",
          destination: "İşleme tesisi",
          customer: CUSTOMERS[Math.floor(rand() * CUSTOMERS.length)],
          salePricePerKg: round(between(168, 186), 2),
          saleCurrency: "TRY",
        });
        await api("post", `/farms/${farmIds[tank.farm]}/cost-entries`, {
          category: "TRANSPORTATION",
          amount: Math.round(between(3800, 5200)),
          currency: "TRY",
          batchId: b.id,
          incurredAt: atPast(day, 15),
          notes: "Hasat nakliyesi",
        });
        b.count -= fishCount;
        b.lastHarvestDay = day;
        if (full || b.count <= 0) {
          b.harvested = true;
          live.delete(tank.id);
          tank.restockDay = day + Math.round(between(8, 14));
        }
      }
    }

    // Water quality every other day per tank; the troubled cage's oxygen drops in the last week.
    for (const tank of tanks) {
      if ((day + tank.plan.code.charCodeAt(2)) % 2 !== 0) continue;
      const tempHere = round(temp + (tank.plan.type === "CAGE" ? 0.6 : -0.4) + between(-0.5, 0.5), 1);
      const troubledNow = tank.plan.troubled && day >= -6;
      const oxygen = troubledNow ? between(5.1, 5.8) : 11.0 - 0.22 * tempHere + between(-0.4, 0.4);
      await api("post", `/tanks/${tank.id}/water-quality-readings`, {
        temperatureC: tempHere,
        dissolvedOxygenMgL: round(oxygen, 2),
        ph: round(between(7.2, 7.8), 2),
        ammoniaMgL: round(between(0.005, 0.03), 3),
        occurredAt: atPast(day, 8, Math.floor(rand() * 30)),
      });
    }
    if ((day + DAYS) % 30 === 0) console.log(`day ${day}: ${calls} requests, ${Math.round((Date.now() - started) / 1000)} s`);
  }

  // Biomass snapshots on the weighing days (the recalculate endpoint only writes today's).
  for (const s of snapshots) {
    await prisma.biomassSnapshot.upsert({
      where: { batchId_tankId_snapshotDate: { batchId: s.batchId, tankId: s.tankId, snapshotDate: dayDate(s.day) } },
      create: {
        companyId: companyId!,
        batchId: s.batchId,
        tankId: s.tankId,
        snapshotDate: dayDate(s.day),
        estimatedCount: s.count,
        avgWeightG: round(s.weightG, 3),
        biomassKg: round((s.count * s.weightG) / 1000, 3),
        methodology: "biomass.count_x_latest_weight.v1",
        createdById: owner.id,
      },
      update: {},
    });
  }
  for (const b of live.values()) await api("post", `/fish-batches/${b.id}/biomass/recalculate`);

  console.log(
    `Done: company ${companyId}, ${tanks.length} tanks, ${live.size} live batches, ${calls} requests in ${Math.round((Date.now() - started) / 1000)} s.`,
  );
  await app.close();
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
