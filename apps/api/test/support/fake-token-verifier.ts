import type { TokenVerifier, VerifiedTokenClaims } from "../../src/modules/auth/token-verifier";

/** Sentinel bearer token that always fails verification, simulating an expired/tampered JWT. */
export const INVALID_TOKEN = "invalid-token";

/**
 * Stands in for ClerkTokenVerifierService in integration tests (injected via
 * `overrideProvider(TOKEN_VERIFIER)` — see test-app.ts). The bearer token IS the user's
 * `authProviderId`, so a test authenticates as a given seeded user just by sending that user's
 * authProviderId as the token — no real JWT signing/JWKS needed.
 */
export class FakeTokenVerifier implements TokenVerifier {
  async verify(token: string): Promise<VerifiedTokenClaims> {
    if (token === INVALID_TOKEN) {
      throw new Error("simulated invalid/expired token");
    }
    return { sub: token };
  }
}
