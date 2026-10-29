import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * Minimal `.env` loader (no `dotenv` dependency — the api app doesn't otherwise need it, since
 * ConfigModule.forRoot loads `.env` on its own via `@nestjs/config`'s bundled dotenv). Runs as a
 * jest `setupFiles` entry, so it executes before any test file (and therefore before AppModule)
 * is imported — env vars must be in `process.env` before PrismaService/ConfigModule read them.
 *
 * Never overwrites a var the shell/CI already set, so `DATABASE_URL` etc. can still be
 * overridden per-invocation without editing `.env.test`.
 */
function loadEnvFile(path: string): void {
  let contents: string;
  try {
    contents = readFileSync(path, "utf-8");
  } catch {
    throw new Error(
      `${path} not found. Copy .env.test.example to .env.test and point it at a scratch ` +
        "database before running `pnpm test:integration`.",
    );
  }

  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(resolve(__dirname, "../../.env.test"));
