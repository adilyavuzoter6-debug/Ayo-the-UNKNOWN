import type { DemoAccounts } from "../../src/modules/demo/demo-accounts";

/**
 * Stands in for ClerkDemoAccounts in integration tests. The "sign-in token" is the account's
 * authProviderId, which FakeTokenVerifier accepts as a bearer token, so a test can act as the
 * demo visitor with the ticket it got back.
 */
export class FakeDemoAccounts implements DemoAccounts {
  static removed: string[] = [];
  private static seq = 0;

  async create() {
    const authProviderId = `demo-visitor-${Date.now()}-${FakeDemoAccounts.seq++}`;
    return { authProviderId, email: `${authProviderId}@demo.test` };
  }

  async signInToken(authProviderId: string) {
    return authProviderId;
  }

  async remove(authProviderId: string) {
    FakeDemoAccounts.removed.push(authProviderId);
  }
}
