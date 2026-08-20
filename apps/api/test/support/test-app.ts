import { INestApplication, ValidationPipe, VersioningType } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AppModule } from "../../src/app.module";
import { TOKEN_VERIFIER } from "../../src/modules/auth/token-verifier";
import { FakeTokenVerifier } from "./fake-token-verifier";

/**
 * Boots the real AppModule (real guard chain, real Prisma against the test database — see
 * .env.test.example) with only the token verifier swapped for a fake one. Mirrors the
 * versioning/prefix/pipe setup in src/main.ts, since tests drive the app via `app.init()` +
 * supertest rather than `app.listen()`.
 */
export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(TOKEN_VERIFIER)
    .useClass(FakeTokenVerifier)
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
