import { Body, Controller, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { Permission, PlanFeature } from "@aquai/types";
import { CurrentTenant } from "../../common/decorators/current-tenant.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { RequirePlanFeature } from "../../common/decorators/require-plan-feature.decorator";
import type { TenantContext } from "../../common/types/request-context";
import { AssistantService } from "./assistant.service";
import { AssistantChatDto } from "./dto/assistant-chat.dto";

@ApiTags("assistant")
@ApiBearerAuth()
@RequirePlanFeature(PlanFeature.AI_ASSISTANT)
@Controller({ path: "assistant", version: "1" })
export class AssistantController {
  constructor(private readonly assistantService: AssistantService) {}

  @Post("chat")
  @RequirePermission(Permission.FISH_BATCH_READ)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  chat(@Body() dto: AssistantChatDto, @CurrentTenant() tenant: TenantContext) {
    return this.assistantService.chat(tenant, dto.messages);
  }
}
