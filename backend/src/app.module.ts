import { Module, type ModuleMetadata } from '@nestjs/common';
import { AiModule } from './ai/index.js';
import { AnalysesModule } from './analyses/index.js';
import { ConfigModule, loadApiConfig } from './config/index.js';
import { DatabaseModule } from './database/index.js';
import { EmailsModule } from './emails/index.js';
import { HealthModule } from './health/index.js';

/**
 * Features that cannot work without PostgreSQL.
 *
 * With `DATABASE_ENABLED=false` the API still boots and serves health checks
 * (useful for front-end work), and these routes are simply absent rather than
 * failing at request time with a connection error.
 */
function persistenceFeatures(): NonNullable<ModuleMetadata['imports']> {
  return loadApiConfig().database.enabled ? [EmailsModule, AnalysesModule] : [];
}

/**
 * Modules for attachments, ingestion, the review queue, business records,
 * audit logs, auth and users are registered here as they are implemented;
 * their directories are currently placeholders.
 */
@Module({
  imports: [
    ConfigModule,
    DatabaseModule.forRoot(),
    // Global: the one route from this API to the Python AI service.
    AiModule,
    HealthModule,
    ...persistenceFeatures(),
  ],
})
export class AppModule {}
