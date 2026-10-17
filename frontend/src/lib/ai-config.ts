import { type AiOperation } from '@email-ai/contracts';

/**
 * Documented AI configuration, for display only.
 *
 * No endpoint exposes this deployment's model routing, timeouts or credentials
 * to the browser — deliberately, and the dashboard does not ask for one. These
 * are the defaults and variable names from `docs/api.md` and `.env.example`, so
 * every surface that shows them must label them as defaults rather than as the
 * values actually in force.
 */

export interface OperationRouting {
  operation: AiOperation;
  variable: string;
  defaultModel: string;
  implemented: boolean;
}

/**
 * Keyed by operation so the compiler rejects an incomplete table: adding an
 * operation to the contract breaks the build here rather than silently hiding
 * it in Settings. `AiOperation` is imported as a type only — importing a value
 * from the contracts package would pull its Zod schemas into the browser
 * bundle for nothing.
 */
const ROUTING: Record<AiOperation, Omit<OperationRouting, 'operation'>> = {
  classification: {
    variable: 'OPENAI_MODEL_CLASSIFICATION',
    defaultModel: 'gpt-6-luna',
    implemented: false,
  },
  extraction: {
    variable: 'OPENAI_MODEL_EXTRACTION',
    defaultModel: 'gpt-6-sol',
    implemented: true,
  },
  summarization: {
    variable: 'OPENAI_MODEL_SUMMARIZATION',
    defaultModel: 'gpt-6-luna',
    implemented: false,
  },
  conflict_resolution: {
    variable: 'OPENAI_MODEL_CONFLICT_RESOLUTION',
    defaultModel: 'gpt-6-astra',
    implemented: false,
  },
};

export const OPERATION_ROUTING: readonly OperationRouting[] = (
  Object.keys(ROUTING) as AiOperation[]
).map((operation) => ({ operation, ...ROUTING[operation] }));

export interface TuningKnob {
  variable: string;
  owner: 'backend' | 'ai-service';
  purpose: string;
}

export const TUNING_KNOBS: readonly TuningKnob[] = [
  {
    variable: 'AI_SERVICE_REQUEST_TIMEOUT_MS',
    owner: 'backend',
    purpose: 'Deadline for the AI service to answer. Sits above the model timeout.',
  },
  {
    variable: 'AI_SERVICE_CONNECT_TIMEOUT_MS',
    owner: 'backend',
    purpose: 'Deadline for reaching the AI service at all.',
  },
  {
    variable: 'LLM_TIMEOUT_MS',
    owner: 'ai-service',
    purpose: 'Deadline for the model call. Exceeding it records failureCode=timeout.',
  },
  {
    variable: 'LLM_MAX_OUTPUT_TOKENS',
    owner: 'ai-service',
    purpose: 'Output ceiling for a single call.',
  },
  {
    variable: 'LLM_MAX_RETRIES',
    owner: 'ai-service',
    purpose: 'Provider SDK retries on 429 and 5xx responses.',
  },
  {
    variable: 'LLM_MAX_INPUT_CHARS',
    owner: 'ai-service',
    purpose: 'Prompt ceiling. Oversized input is rejected, never truncated.',
  },
  {
    variable: 'LLM_STALE_PROCESSING_MS',
    owner: 'backend',
    purpose: 'When an analysis stuck in processing may be reclaimed.',
  },
];

export interface SecretSetting {
  variable: string;
  owner: 'backend' | 'ai-service';
  note: string;
}

export const SECRET_SETTINGS: readonly SecretSetting[] = [
  {
    variable: 'OPENAI_API_KEY',
    owner: 'ai-service',
    note: 'Provider credential. Held only by the AI service; the API never sees it.',
  },
  {
    variable: 'AI_SERVICE_TOKEN',
    owner: 'backend',
    note: 'Bearer token the API presents to the AI service. Optional on loopback.',
  },
  {
    variable: 'POSTGRES_PASSWORD',
    owner: 'backend',
    note: 'Database credential.',
  },
];
