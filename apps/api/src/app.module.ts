import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AppController } from "./app.controller";
import { PrismaModule } from "./prisma/prisma.module";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { ResponseEnvelopeInterceptor } from "./common/interceptors/response-envelope.interceptor";
import { TenantContextGuard } from "./common/guards/tenant-context.guard";
import { PermissionsGuard } from "./common/guards/permissions.guard";
import { AuthModule } from "./modules/auth/auth.module";
import { ClerkAuthGuard } from "./modules/auth/guards/clerk-auth.guard";
import { CompaniesModule } from "./modules/companies/companies.module";
import { UsersModule } from "./modules/users/users.module";
import { FarmsModule } from "./modules/farms/farms.module";
import { FarmSectionsModule } from "./modules/farm-sections/farm-sections.module";
import { TanksModule } from "./modules/tanks/tanks.module";
import { FishSpeciesModule } from "./modules/fish-species/fish-species.module";
import { FishBatchesModule } from "./modules/fish-batches/fish-batches.module";
import { FeedProductsModule } from "./modules/feed-products/feed-products.module";
import { WarehousesModule } from "./modules/warehouses/warehouses.module";
import { FeedInventoryModule } from "./modules/feed-inventory/feed-inventory.module";
import { FeedingModule } from "./modules/feeding/feeding.module";
import { AlertsModule } from "./modules/alerts/alerts.module";
import { FarmStatsModule } from "./modules/farm-stats/farm-stats.module";
import { WebhooksModule } from "./modules/webhooks/webhooks.module";
import { MortalityModule } from "./modules/mortality/mortality.module";
import { WeightSamplingModule } from "./modules/weight-sampling/weight-sampling.module";
import { BiomassModule } from "./modules/biomass/biomass.module";
import { BatchPerformanceModule } from "./modules/batch-performance/batch-performance.module";
import { WaterQualityModule } from "./modules/water-quality/water-quality.module";
import { HarvestModule } from "./modules/harvest/harvest.module";
import { TreatmentsModule } from "./modules/treatments/treatments.module";
import { CostsModule } from "./modules/costs/costs.module";
import { InspectionModule } from "./modules/inspection/inspection.module";
import { AuditModule } from "./modules/audit/audit.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    PrismaModule,
    AuditModule,
    AuthModule,
    UsersModule,
    CompaniesModule,
    FarmsModule,
    FarmSectionsModule,
    TanksModule,
    AlertsModule,
    FishSpeciesModule,
    FishBatchesModule,
    FeedProductsModule,
    WarehousesModule,
    FeedInventoryModule,
    FeedingModule,
    FarmStatsModule,
    WebhooksModule,
    MortalityModule,
    WeightSamplingModule,
    BiomassModule,
    BatchPerformanceModule,
    WaterQualityModule,
    HarvestModule,
    TreatmentsModule,
    CostsModule,
    InspectionModule,
  ],
  controllers: [AppController],
  providers: [
    // Global guard/interceptor/filter registration order matters and is centralized here
    // (rather than scattered as APP_GUARD in individual feature modules) specifically because
    // Nest runs every APP_GUARD, in registration order, before any APP_INTERCEPTOR — see
    // docs/architecture/01-system-architecture.md §1.3 for the intended request lifecycle:
    //   1. ThrottlerGuard        — reject abusive request volume before doing any real work
    //   2. ClerkAuthGuard        — verify bearer token (via injected TOKEN_VERIFIER, see
    //                              modules/auth/token-verifier.ts), resolve request.authUser
    //   3. TenantContextGuard    — resolve request.tenant from authUser + X-Company-Id header
    //   4. PermissionsGuard      — check the route's @RequirePermission() against tenant.role
    //
    // Integration tests fake auth by overriding the TOKEN_VERIFIER provider (a plain DI token),
    // not by swapping ClerkAuthGuard itself — overriding a guard bound through the APP_GUARD
    // multi-provider token is not reliably supported by Nest's testing module. See
    // test/tenant-isolation.integration-spec.ts.
    //
    // ClerkAuthGuard is bound with `useExisting` (not `useClass`) so Nest reuses the single
    // instance already resolved inside AuthModule (where TOKEN_VERIFIER is visible) rather than
    // instantiating a second copy scoped to AppModule, where TOKEN_VERIFIER is not exported and
    // therefore unresolvable.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useExisting: ClerkAuthGuard },
    { provide: APP_GUARD, useClass: TenantContextGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
  ],
})
export class AppModule {}
