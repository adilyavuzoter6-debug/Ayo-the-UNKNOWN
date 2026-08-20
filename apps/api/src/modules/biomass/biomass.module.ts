import { Module } from "@nestjs/common";
import { FishBatchesModule } from "../fish-batches/fish-batches.module";
import { BiomassCalculationService } from "./biomass-calculation.service";
import { BiomassController } from "./biomass.controller";

@Module({
  imports: [FishBatchesModule],
  providers: [BiomassCalculationService],
  controllers: [BiomassController],
  exports: [BiomassCalculationService],
})
export class BiomassModule {}
