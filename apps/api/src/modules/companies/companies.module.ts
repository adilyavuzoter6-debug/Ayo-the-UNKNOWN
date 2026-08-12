import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { CompaniesService } from "./companies.service";
import { CompaniesController } from "./companies.controller";

@Module({
  imports: [AuditModule],
  providers: [CompaniesService],
  controllers: [CompaniesController],
  exports: [CompaniesService],
})
export class CompaniesModule {}
