import { Module } from "@nestjs/common";
import { InspectionService } from "./inspection.service";
import { InspectionController } from "./inspection.controller";

@Module({
  providers: [InspectionService],
  controllers: [InspectionController],
})
export class InspectionModule {}
