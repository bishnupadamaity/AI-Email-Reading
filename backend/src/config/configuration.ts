import { loadEnv } from '@email-ai/config';
import { apiEnvSchema, type ApiEnv } from './env.schema.js';

export interface ApiConfig {
  readonly nodeEnv: ApiEnv['NODE_ENV'];
  readonly isProduction: boolean;
  readonly port: number;
  readonly globalPrefix: string;
  readonly corsOrigins: readonly string[];
  readonly swaggerEnabled: boolean;
  readonly database: {
    readonly enabled: boolean;
    readonly host: string;
    readonly port: number;
    readonly username: string;
    readonly password: string;
    readonly database: string;
    readonly logging: boolean;
  };
  /**
   * The AI service this API delegates every AI operation to. No provider
   * credential, model name or prompt appears here: `ai-service` owns all
   * three.
   */
  readonly aiService: {
    /** When false, AI requests fail with an explicit configuration error. */
    readonly enabled: boolean;
    readonly baseUrl: string;
    /** Never logged. Absent is valid for loopback development. */
    readonly token?: string;
    readonly requestTimeoutMs: number;
    readonly connectTimeoutMs: number;
  };
  /** Analysis lifecycle: how long a `processing` row may sit before reclaim. */
  readonly staleProcessingMs: number;
}

/** Maps the validated environment onto the shape the modules consume. */
export function buildApiConfig(env: ApiEnv): ApiConfig {
  return {
    nodeEnv: env.NODE_ENV,
    isProduction: env.NODE_ENV === 'production',
    port: env.API_PORT,
    globalPrefix: env.API_GLOBAL_PREFIX,
    corsOrigins: env.CORS_ORIGINS,
    // Swagger is opt-out everywhere, but never implicitly on in production.
    swaggerEnabled: env.SWAGGER_ENABLED && env.NODE_ENV !== 'production',
    database: {
      enabled: env.DATABASE_ENABLED,
      host: env.POSTGRES_HOST,
      port: env.POSTGRES_PORT,
      username: env.POSTGRES_USER,
      password: env.POSTGRES_PASSWORD,
      database: env.POSTGRES_DB,
      logging: env.DATABASE_LOGGING,
    },
    aiService: {
      enabled: env.AI_SERVICE_ENABLED,
      baseUrl: env.AI_SERVICE_URL,
      ...(env.AI_SERVICE_TOKEN ? { token: env.AI_SERVICE_TOKEN } : {}),
      requestTimeoutMs: env.AI_SERVICE_REQUEST_TIMEOUT_MS,
      connectTimeoutMs: env.AI_SERVICE_CONNECT_TIMEOUT_MS,
    },
    staleProcessingMs: env.LLM_STALE_PROCESSING_MS,
  };
}

let cached: ApiConfig | undefined;

/**
 * Resolves the configuration once per process: `main.ts` needs it before Nest
 * boots (port, CORS) and `ConfigModule` needs it during DI.
 */
export function loadApiConfig(): ApiConfig {
  cached ??= buildApiConfig(loadEnv(apiEnvSchema, { appName: 'api' }));
  return cached;
}

/** Clears the memoised configuration. Intended for tests only. */
export function resetApiConfigCache(): void {
  cached = undefined;
}
