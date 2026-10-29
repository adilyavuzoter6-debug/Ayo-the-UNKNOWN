import { INestApplication, ValidationPipe, VersioningType } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AppModule } from "../../src/app.module";
import { TOKEN_VERIFIER } from "../../src/modules/auth/token-verifier";
import { DEMO_ACCOUNTS } from "../../src/modules/demo/demo-accounts";
import { FakeDemoAccounts } from "./fake-demo-accounts";
import { ASSISTANT_MODEL } from "../../src/modules/assistant/assistant-model";
import { FakeAssistantModel } from "./fake-assistant-model";
import { FakeTokenVerifier } from "./fake-token-verifier";

/**
 * Boots the real AppModule (real guard chain, real Prisma against the test database — see
 * .env.test.example) with only the token verifier, the demo-account provider and the assistant's model swapped for fakes. Mirrors the
 * versioning/prefix/pipe setup in src/main.ts, since tests drive the app via `app.init()` +
 * supertest rather than `app.listen()`.
 */
export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(TOKEN_VERIFIER)
    .useClass(FakeTokenVerifier)
    .overrideProvider(DEMO_ACCOUNTS)
    .useClass(FakeDemoAccounts)
    .overrideProvider(ASSISTANT_MODEL)
    .useClass(FakeAssistantModel)
    .compile();

  const app = moduleRef.createNestApplication({ rawBody: true });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  await app.init();
  return app;
}
