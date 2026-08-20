import { BadRequestException, Controller, Post, Req, type RawBodyRequest } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import type { Request } from "express";
import { Webhook } from "svix";
import { Public } from "../../common/decorators/public.decorator";
import { ClerkWebhooksService, type ClerkUserEventData } from "./clerk-webhooks.service";

interface ClerkWebhookEvent {
  type: string;
  data: Record<string, unknown>;
}

/**
 * Verified via svix (the signing mechanism every official Clerk `verifyWebhook` adapter wraps —
 * see docs/architecture, no NestJS-specific Clerk package exists, so this follows the
 * clerk-webhooks skill's "other frameworks" guidance directly rather than rolling something
 * unverified). Deliberately @Public() — see common/decorators/public.decorator.ts, which named
 * this exact use case before it was built.
 */
@ApiExcludeController()
@Controller({ path: "webhooks/clerk", version: "1" })
export class ClerkWebhooksController {
  constructor(private readonly clerkWebhooksService: ClerkWebhooksService) {}

  @Public()
  @Post()
  async handle(@Req() req: RawBodyRequest<Request>): Promise<{ received: true }> {
    const secret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;
    if (!secret) {
      throw new BadRequestException("Webhook signing secret is not configured.");
    }
    if (!req.rawBody) {
      throw new BadRequestException("Missing raw request body.");
    }

    const svixId = req.headers["svix-id"];
    const svixTimestamp = req.headers["svix-timestamp"];
    const svixSignature = req.headers["svix-signature"];
    if (
      typeof svixId !== "string" ||
      typeof svixTimestamp !== "string" ||
      typeof svixSignature !== "string"
    ) {
      throw new BadRequestException("Missing svix signature headers.");
    }

    let event: ClerkWebhookEvent;
    try {
      event = new Webhook(secret).verify(req.rawBody, {
        "svix-id": svixId,
        "svix-timestamp": svixTimestamp,
        "svix-signature": svixSignature,
      }) as ClerkWebhookEvent;
    } catch {
      throw new BadRequestException("Invalid webhook signature.");
    }

    switch (event.type) {
      case "user.created":
      case "user.updated":
        await this.clerkWebhooksService.handleUserUpserted(
          event.data as unknown as ClerkUserEventData,
        );
        break;
      case "user.deleted":
        await this.clerkWebhooksService.handleUserDeleted(event.data as { id: string });
        break;
      default:
        break;
    }

    return { received: true };
  }
}
