import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { FeedProductsService } from "./feed-products.service";
import { FeedProductsController } from "./feed-products.controller";

@Module({
  imports: [AuditModule],
  providers: [FeedProductsService],
  controllers: [FeedProductsController],
  exports: [FeedProductsService],
})
export class FeedProductsModule {}
