import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { FishSpeciesService } from "./fish-species.service";
import { FishSpeciesController } from "./fish-species.controller";

@Module({
  imports: [AuditModule],
  providers: [FishSpeciesService],
  controllers: [FishSpeciesController],
  exports: [FishSpeciesService],
})
export class FishSpeciesModule {}
