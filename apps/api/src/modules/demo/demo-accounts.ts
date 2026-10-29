import { Injectable, Logger } from "@nestjs/common";
import { randomBytes } from "node:crypto";

/** Sign-in accounts for demo visitors, so nobody has to register to try the app. */
export interface DemoAccounts {
  /** A new account; returns its id at the identity provider (our users' authProviderId). */
  create(): Promise<{ authProviderId: string; email: string }>;
  /** A short-lived, single-use token that signs the account in. */
  signInToken(authProviderId: string): Promise<string>;
  remove(authProviderId: string): Promise<void>;
}

export const DEMO_ACCOUNTS = Symbol("DEMO_ACCOUNTS");

const CLERK_API = "https://api.clerk.com/v1";

/** Clerk users created through its Backend API with the instance's secret key. */
@Injectable()
export class ClerkDemoAccounts implements DemoAccounts {
  private readonly logger = new Logger(ClerkDemoAccounts.name);

  private async call(method: string, path: string, body?: unknown) {
    const key = process.env.CLERK_SECRET_KEY;
    if (!key) throw new Error("CLERK_SECRET_KEY is not set.");
    const res = await fetch(`${CLERK_API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    return { ok: res.ok, status: res.status, json };
  }

  async create() {
    const tag = randomBytes(5).toString("hex");
    const email = `demo-${tag}@demo.piscatiotechnologies.com`;
    const base = {
      email_address: [email],
      first_name: "Demo",
      last_name: "Ziyaretçi",
      skip_password_requirement: true,
      public_metadata: { demo: true },
    };
    let res = await this.call("POST", "/users", base);
    // Instances that require a username refuse the first attempt; give it one.
    if (!res.ok && JSON.stringify(res.json).includes("username")) {
      res = await this.call("POST", "/users", { ...base, username: `demo_${tag}` });
    }
    if (!res.ok) throw new Error(`Clerk user create failed (${res.status}): ${JSON.stringify(res.json)}`);
    return { authProviderId: String(res.json!.id), email };
  }

  async signInToken(authProviderId: string) {
    const res = await this.call("POST", "/sign_in_tokens", { user_id: authProviderId, expires_in_seconds: 600 });
    if (!res.ok) throw new Error(`Clerk sign-in token failed (${res.status}): ${JSON.stringify(res.json)}`);
    return String(res.json!.token);
  }

  async remove(authProviderId: string) {
    const res = await this.call("DELETE", `/users/${encodeURIComponent(authProviderId)}`);
    if (!res.ok && res.status !== 404) this.logger.warn(`Clerk user delete failed (${res.status}) for ${authProviderId}`);
  }
}
