import { Module } from "@nestjs/common";
import { CostsModule } from "../costs/costs.module";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";

@Module({
  imports: [CostsModule],
  providers: [ReportsService],
  controllers: [ReportsController],
})
export class ReportsModule {}
