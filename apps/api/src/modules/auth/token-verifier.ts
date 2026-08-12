export interface VerifiedTokenClaims {
  sub: string;
  email?: string;
  name?: string;
}

/**
 * Injection token for the JWT-verification dependency. Kept as a narrow interface (not the
 * concrete `jose`-based implementation) specifically so integration tests can swap in a fake
 * verifier via `overrideProvider(TOKEN_VERIFIER)` — a plain DI token override, unlike trying to
 * override a guard bound through the `APP_GUARD` multi-provider token, which Nest's testing
 * module does not support reliably. See test/tenant-isolation.integration-spec.ts.
 */
export const TOKEN_VERIFIER = Symbol("TOKEN_VERIFIER");

export interface TokenVerifier {
  verify(token: string): Promise<VerifiedTokenClaims>;
}
