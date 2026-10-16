import { join } from 'node:path';
import { type DataSourceOptions } from 'typeorm';
import { type ApiConfig } from '../config/index.js';

/**
 * Single source of truth for the TypeORM connection, shared by the Nest module
 * and the migration CLI `DataSource`.
 *
 * `synchronize` is hard-coded to `false`: the schema is owned by the explicit
 * migrations in `./migrations`, never inferred from entities.
 */
export function buildTypeOrmOptions(config: ApiConfig): DataSourceOptions {
  const { database } = config;

  return {
    type: 'postgres',
    host: database.host,
    port: database.port,
    username: database.username,
    password: database.password,
    database: database.database,
    logging: database.logging,
    synchronize: false,
    migrationsRun: false,
    // Compiled output lives next to this file, so these globs match .js at
    // runtime and .ts when the CLI runs from source. The glob is rooted at this
    // file's own directory, so src/ and dist/ never pick up each other.
    migrations: [join(import.meta.dirname, 'migrations', '*.{ts,js}')],
    entities: [join(import.meta.dirname, '..', '**', '*.entity.{ts,js}')],
  };
}
