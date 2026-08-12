import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe, VersioningType } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
  app.setGlobalPrefix("api");
  app.enableCors({ origin: process.env.CORS_ORIGINS?.split(",") ?? true, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  if (process.env.NODE_ENV !== "production") {
    const config = new DocumentBuilder()
      .setTitle("AQUAI API")
      .setDescription("Aquaculture ERP / Farm Management SaaS — backend API")
      .setVersion("1.0")
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup("api/v1/docs", app, document);
  }

  const port = process.env.PORT ? Number(process.env.PORT) : 3001;
  await app.listen(port);
  console.log(`AQUAI API listening on http://localhost:${port}/api/v1`);
}

bootstrap();
