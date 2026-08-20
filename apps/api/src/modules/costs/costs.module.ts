import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { CostsService } from "./costs.service";
import { CostsController, CostSummaryController } from "./costs.controller";

@Module({
  imports: [AuditModule],
  providers: [CostsService],
  controllers: [CostsController, CostSummaryController],
  exports: [CostsService],
})
export class CostsModule {}
