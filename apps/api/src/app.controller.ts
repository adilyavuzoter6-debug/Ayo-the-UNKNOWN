import { Controller, Get } from "@nestjs/common";
import { Public } from "./common/decorators/public.decorator";

@Controller()
export class AppController {
  @Public()
  @Get("health")
  health(): { status: "ok"; timestamp: string } {
    return { status: "ok", timestamp: new Date().toISOString() };
  }
}
