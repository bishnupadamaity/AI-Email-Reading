import { Global, Module } from '@nestjs/common';
import { loadApiConfig, type ApiConfig } from './configuration.js';

/** Injection token for the validated, immutable API configuration. */
export const API_CONFIG = Symbol('API_CONFIG');

/**
 * Global so feature modules can inject `API_CONFIG` without re-importing this
 * module. The configuration is resolved once at startup.
 */
@Global()
@Module({
  providers: [{ provide: API_CONFIG, useFactory: (): ApiConfig => loadApiConfig() }],
  exports: [API_CONFIG],
})
export class ConfigModule {}
