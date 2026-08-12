import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { IS_PUBLIC_KEY } from "../../../common/decorators/public.decorator";
import { UsersService } from "../../users/users.service";
import { TOKEN_VERIFIER, type TokenVerifier } from "../token-verifier";
import type { AuthenticatedUser } from "../../../common/types/request-context";

/**
 * Global guard (registered as APP_GUARD in AppModule): verifies the bearer token on every
 * request via the injected TokenVerifier, resolves it to our own User row (auto-provisioning on
 * first sign-in), and attaches it to `request.authUser`.
 *
 * Deliberately does NOT resolve companyId/role here — that is TenantContextGuard's job
 * (docs/architecture/06-multi-tenant-security.md §6.2 Layer 1, point 1), which runs after this
 * guard and re-reads membership from the database on every request rather than trusting a JWT
 * claim, because a user's role/membership can change mid-session.
 *
 * Token verification is injected (TOKEN_VERIFIER), not hardcoded to `jose`/Clerk's JWKS, so
 * integration tests can substitute a fake verifier — see
 * test/tenant-isolation.integration-spec.ts.
 */
@Injectable()
export class ClerkAuthGuard implements CanActivate {
  private readonly logger = new Logger(ClerkAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    @Inject(TOKEN_VERIFIER) private readonly tokenVerifier: TokenVerifier,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractBearerToken(request);
    if (!token) {
      throw new UnauthorizedException("Missing bearer token.");
    }

    let claims: { sub: string; email?: string; name?: string };
    try {
      claims = await this.tokenVerifier.verify(token);
    } catch (error) {
      this.logger.warn(`Token verification failed: ${(error as Error).message}`);
      throw new UnauthorizedException("Invalid or expired token.");
    }

    const user: AuthenticatedUser = await this.usersService.findOrProvisionByAuthProviderId(
      claims.sub,
      { email: claims.email, fullName: claims.name },
    );

    (request as Request & { authUser: AuthenticatedUser }).authUser = user;
    return true;
  }

  private extractBearerToken(request: Request): string | undefined {
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) return undefined;
    return header.slice("Bearer ".length).trim();
  }
}
