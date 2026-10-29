import { Controller, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { Public } from "../../common/decorators/public.decorator";
import { SkipTenantContext } from "../../common/decorators/skip-tenant-context.decorator";
import { DemoService } from "./demo.service";

@ApiTags("demo")
@Controller({ path: "demo", version: "1" })
export class DemoController {
  constructor(private readonly demoService: DemoService) {}

  /** Opens a demo for an anonymous visitor and returns a sign-in ticket for it. */
  @Post()
  @Public()
  @SkipTenantContext()
  @Throttle({ default: { limit: 5, ttl: 60 * 60 * 1000 } })
  start() {
    return this.demoService.start();
  }
}
