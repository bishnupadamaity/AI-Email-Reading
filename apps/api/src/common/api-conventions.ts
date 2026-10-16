import { VersioningType, type INestApplication } from '@nestjs/common';
import { AllExceptionsFilter } from './http-exception.filter.js';

/**
 * HTTP conventions shared by the running application and the e2e tests, so the
 * two cannot drift: URI versioning, the global prefix and the error filter.
 *
 * Feature controllers declare `version: '1'` and are served under
 * `/{prefix}/v1`. `/health` opts out with `VERSION_NEUTRAL` because probes
 * should not have to track an API version.
 */
export function applyApiConventions(app: INestApplication, globalPrefix: string): void {
  app.setGlobalPrefix(globalPrefix);
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalFilters(new AllExceptionsFilter());
}
