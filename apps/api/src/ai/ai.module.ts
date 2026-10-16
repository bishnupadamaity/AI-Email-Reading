import { Global, Module } from '@nestjs/common';
import { AI_SERVICE } from './ai-service.port.js';
import { HttpAiServiceClient } from './http-ai-service.client.js';

/**
 * The API's only route to AI.
 *
 * Global so the analyses module can inject `AI_SERVICE` without importing
 * this module, and so tests can replace the one provider in one place.
 */
@Global()
@Module({
  providers: [{ provide: AI_SERVICE, useClass: HttpAiServiceClient }],
  exports: [AI_SERVICE],
})
export class AiModule {}
