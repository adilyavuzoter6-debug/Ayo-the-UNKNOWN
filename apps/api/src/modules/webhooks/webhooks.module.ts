import { Module } from "@nestjs/common";
import { ClerkWebhooksService } from "./clerk-webhooks.service";
import { ClerkWebhooksController } from "./clerk-webhooks.controller";

@Module({
  providers: [ClerkWebhooksService],
  controllers: [ClerkWebhooksController],
})
export class WebhooksModule {}
