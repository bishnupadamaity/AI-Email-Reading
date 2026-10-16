import { DataSource } from 'typeorm';
import { loadApiConfig } from '../config/index.js';
import { buildTypeOrmOptions } from './typeorm-options.js';

/**
 * Used only by the TypeORM CLI (`pnpm --filter @email-ai/api migration:*`).
 * The running application obtains its connection through `DatabaseModule`.
 */
export default new DataSource(buildTypeOrmOptions(loadApiConfig()));
