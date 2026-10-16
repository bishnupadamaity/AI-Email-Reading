import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { applyApiConventions } from './common/index.js';
import { loadApiConfig } from './config/index.js';

async function bootstrap(): Promise<void> {
  // Resolved (and validated) before Nest starts, so misconfiguration fails here.
  const config = loadApiConfig();
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule);

  applyApiConventions(app, config.globalPrefix);
  app.enableCors({ origin: [...config.corsOrigins], credentials: true });
  app.enableShutdownHooks();

  if (config.swaggerEnabled) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Email AI Platform API')
        .setDescription('Email ingestion, AI analysis and human review.')
        .setVersion('0.1.0')
        .build(),
    );
    SwaggerModule.setup(`${config.globalPrefix}/docs`, app, document);
  }

  await app.listen(config.port);

  const url = await app.getUrl();
  logger.log(`API listening on ${url}/${config.globalPrefix}`);
  logger.log(`Health: ${url}/${config.globalPrefix}/health`);
  logger.log(`Emails: ${url}/${config.globalPrefix}/v1/emails`);
  if (config.swaggerEnabled) {
    logger.log(`Swagger: ${url}/${config.globalPrefix}/docs`);
  }
  logger.log(`Database: ${config.database.enabled ? 'enabled' : 'disabled'}`);
}

bootstrap().catch((error: unknown) => {
  // Configuration and bind failures must stop the process with a clear signal.
  new Logger('Bootstrap').error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
