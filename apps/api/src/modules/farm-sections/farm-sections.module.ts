import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { FarmSectionsService } from "./farm-sections.service";
import { FarmSectionsController, FarmSectionController } from "./farm-sections.controller";

@Module({
  imports: [AuditModule],
  providers: [FarmSectionsService],
  controllers: [FarmSectionsController, FarmSectionController],
  exports: [FarmSectionsService],
})
export class FarmSectionsModule {}
