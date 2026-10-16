import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { HealthService, type LivenessResult, type ReadinessResult } from './health.service.js';

@ApiTags('health')
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Liveness probe: succeeds whenever the process accepts requests.' })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ok' },
        service: { type: 'string', example: 'email-ai-api' },
        version: { type: 'string', example: '0.1.0' },
        uptimeSeconds: { type: 'number', example: 12.4 },
        timestamp: { type: 'string', format: 'date-time' },
      },
    },
  })
  live(): LivenessResult {
    return this.health.liveness();
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe: reports dependency status.' })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ok' },
        dependencies: {
          type: 'object',
          additionalProperties: { type: 'string', enum: ['up', 'down', 'disabled'] },
        },
        timestamp: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiServiceUnavailableResponse({ description: 'At least one dependency is unreachable.' })
  ready(): Promise<ReadinessResult> {
    return this.health.readiness();
  }
}
