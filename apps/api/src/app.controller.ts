import { Controller, Get } from "@nestjs/common";
import { Public } from "./common/decorators/public.decorator";
import { PrismaService } from "./prisma/prisma.service";

@Controller()
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get("health")
  health(): { status: "ok"; timestamp: string } {
    return { status: "ok", timestamp: new Date().toISOString() };
  }

  /**
   * Separate from /health on purpose: Render's own healthCheckPath (render.yaml) stays
   * DB-free so a Neon hiccup never causes Render to restart a healthy container. This route
   * exists only for the Cloudflare keep-warm worker, which needs to touch the database —
   * Neon's serverless compute autosuspends on its own idle timer independently of whether the
   * Render web service is awake, so pinging plain /health does nothing to prevent it.
   */
  @Public()
  @Get("health/db")
  async healthDb(): Promise<{ status: "ok"; timestamp: string }> {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: "ok", timestamp: new Date().toISOString() };
  }
}
