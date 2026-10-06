import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { BatchPerformanceModule } from "../batch-performance/batch-performance.module";
import { CostsModule } from "../costs/costs.module";
import { CostScenariosController } from "./cost-scenarios.controller";
import { CostScenariosService } from "./cost-scenarios.service";

@Module({
  imports: [AuditModule, CostsModule, BatchPerformanceModule],
  providers: [CostScenariosService],
  controllers: [CostScenariosController],
})
export class CostScenariosModule {}
