import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  analysisDetailSchema,
  apiErrorSchema,
  createEmailSchema,
  emailDetailSchema,
  emailSummarySchema,
  idSchema,
  paginationQuerySchema,
  type CreateEmail,
  type EmailDetail,
  type EmailSummary,
  type AnalysisDetail,
  type Paginated,
  type PaginationQuery,
} from '@email-ai/contracts';
import { AnalysisRunnerService } from '../analyses/index.js';
import { ZodValidationPipe, openApiPaginated, openApiSchema } from '../common/index.js';
import { EmailsService } from './emails.service.js';

/** HTTP concerns only: validation, status codes and documentation. */
@ApiTags('emails')
@Controller({ path: 'emails', version: '1' })
export class EmailsController {
  constructor(
    private readonly emails: EmailsService,
    private readonly analysisRunner: AnalysisRunnerService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Ingest an email',
    description:
      'Validates and stores an email, together with a pending analysis record. ' +
      'No analysis is executed: that arrives with the workflow pipeline.',
  })
  @ApiBody({ schema: openApiSchema(createEmailSchema, 'input') })
  @ApiCreatedResponse({ schema: openApiSchema(emailDetailSchema) })
  @ApiBadRequestResponse({
    description: 'The payload failed validation; `details` lists each problem.',
    schema: openApiSchema(apiErrorSchema),
  })
  @ApiConflictResponse({
    description: 'An email with this externalMessageId already exists for this account.',
    schema: openApiSchema(apiErrorSchema),
  })
  create(@Body(new ZodValidationPipe(createEmailSchema)) body: CreateEmail): Promise<EmailDetail> {
    return this.emails.create(body);
  }

  @Get()
  @ApiOperation({ summary: 'List emails, most recently received first' })
  @ApiQuery({ name: 'page', required: false, schema: { type: 'integer', minimum: 1, default: 1 } })
  @ApiQuery({
    name: 'pageSize',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
  })
  @ApiOkResponse({ schema: openApiPaginated(emailSummarySchema) })
  @ApiBadRequestResponse({ schema: openApiSchema(apiErrorSchema) })
  list(
    @Query(new ZodValidationPipe(paginationQuerySchema)) query: PaginationQuery,
  ): Promise<Paginated<EmailSummary>> {
    return this.emails.findPaginated(query);
  }

  @Post(':id/analyze')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Analyse an email with the configured LLM',
    description:
      'Runs extraction synchronously and stores the result. Idempotent once an ' +
      'analysis has completed: the stored result is returned without spending ' +
      'tokens again. A failed analysis is retried as a new run.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ schema: openApiSchema(analysisDetailSchema) })
  @ApiBadRequestResponse({ description: 'Malformed UUID.', schema: openApiSchema(apiErrorSchema) })
  @ApiNotFoundResponse({ description: 'No such email.', schema: openApiSchema(apiErrorSchema) })
  @ApiConflictResponse({
    description: 'An analysis for this email is already in progress.',
    schema: openApiSchema(apiErrorSchema),
  })
  @ApiServiceUnavailableResponse({
    description: 'No LLM provider is configured, or the provider rejected the credentials.',
    schema: openApiSchema(apiErrorSchema),
  })
  analyze(@Param('id', new ZodValidationPipe(idSchema)) id: string): Promise<AnalysisDetail> {
    return this.analysisRunner.run(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Retrieve one email, including its body' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ schema: openApiSchema(emailDetailSchema) })
  @ApiBadRequestResponse({ description: 'Malformed UUID.', schema: openApiSchema(apiErrorSchema) })
  @ApiNotFoundResponse({ schema: openApiSchema(apiErrorSchema) })
  findOne(@Param('id', new ZodValidationPipe(idSchema)) id: string): Promise<EmailDetail> {
    return this.emails.findById(id);
  }
}
