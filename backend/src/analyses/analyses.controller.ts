import { Controller, Get, Param } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { analysisDetailSchema, apiErrorSchema, idSchema } from '@email-ai/contracts';
import { type AnalysisDetail } from '@email-ai/contracts';
import { ZodValidationPipe, openApiSchema } from '../common/index.js';
import { AnalysesService } from './analyses.service.js';

@ApiTags('analyses')
@Controller({ path: 'analyses', version: '1' })
export class AnalysesController {
  constructor(private readonly analyses: AnalysesService) {}

  @Get(':id')
  @ApiOperation({
    summary: 'Retrieve one analysis',
    description:
      'Analyses are created in `pending` state when an email is ingested. ' +
      '`extractedData` and `validationErrors` stay null until the workflow runs.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ schema: openApiSchema(analysisDetailSchema) })
  @ApiBadRequestResponse({ description: 'Malformed UUID.', schema: openApiSchema(apiErrorSchema) })
  @ApiNotFoundResponse({ schema: openApiSchema(apiErrorSchema) })
  findOne(@Param('id', new ZodValidationPipe(idSchema)) id: string): Promise<AnalysisDetail> {
    return this.analyses.findById(id);
  }
}
