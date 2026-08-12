import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { TokenVerifier, VerifiedTokenClaims } from "./token-verifier";

/** Real Clerk JWT verification against the tenant's remote JWKS. See token-verifier.ts. */
@Injectable()
export class ClerkTokenVerifierService implements TokenVerifier {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;
  private readonly issuer: string | undefined;

  constructor(private readonly config: ConfigService) {
    const jwksUrl = this.config.get<string>("CLERK_JWKS_URL");
    if (!jwksUrl) {
      throw new Error("CLERK_JWKS_URL is not configured.");
    }
    this.jwks = createRemoteJWKSet(new URL(jwksUrl));
    this.issuer = this.config.get<string>("CLERK_ISSUER");
  }

  async verify(token: string): Promise<VerifiedTokenClaims> {
    const { payload } = await jwtVerify(token, this.jwks, this.issuer ? { issuer: this.issuer } : undefined);
    if (typeof payload.sub !== "string") {
      throw new UnauthorizedException("Token has no subject claim.");
    }
    return {
      sub: payload.sub,
      email: typeof payload.email === "string" ? payload.email : undefined,
      name: typeof payload.name === "string" ? payload.name : undefined,
    };
  }
}
