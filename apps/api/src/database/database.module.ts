import { Module, type DynamicModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { API_CONFIG, loadApiConfig, type ApiConfig } from '../config/index.js';
import { buildTypeOrmOptions } from './typeorm-options.js';

/**
 * Registers the PostgreSQL connection.
 *
 * When `DATABASE_ENABLED=false` no connection is opened at all, which keeps the
 * API startable for front-end work and for tests that do not need persistence.
 * Entities are attached by feature modules through `TypeOrmModule.forFeature`
 * and picked up by `autoLoadEntities`.
 */
@Module({})
export class DatabaseModule {
  static forRoot(): DynamicModule {
    // Read here rather than in AppModule so the toggle stays a database
    // concern; the value is memoised, so this is not a repeated parse.
    const enabled = loadApiConfig().database.enabled;

    return {
      module: DatabaseModule,
      imports: enabled
        ? [
            TypeOrmModule.forRootAsync({
              inject: [API_CONFIG],
              useFactory: (config: ApiConfig) => ({
                ...buildTypeOrmOptions(config),
                autoLoadEntities: true,
                // Fail fast and visibly rather than retrying behind the scenes.
                retryAttempts: 1,
              }),
            }),
          ]
        : [],
    };
  }
}
