import {
  analysisStatusSchema,
  type AnalysisFailureCode,
  type AnalysisModelMetadata,
  type AnalysisStatus,
  type OperationMetadata,
  type ShipmentExtraction,
  type ValidationIssue,
} from '@email-ai/contracts';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Email } from '../emails/email.entity.js';

/**
 * One analysis run against one email.
 *
 * The relation is intentionally one-directional (analysis knows its email, not
 * the reverse): several runs per email are expected over time, and `Email`
 * stays free of a collection that would invite accidental eager loading.
 */
@Entity('analyses')
@Index('idx_analyses_email_id', ['emailId'])
@Index('idx_analyses_status', ['status'])
// At most one unfinished analysis per email. This is what makes concurrent
// POST .../analyze requests safe: the second insert is rejected by the database
// rather than racing. Declared here so `migration:generate` tracks it.
@Index('uq_analyses_email_in_flight', ['emailId'], {
  unique: true,
  where: "status IN ('pending', 'processing')",
})
export class Analysis {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'pk_analyses' })
  id!: string;

  @Column({ name: 'email_id', type: 'uuid' })
  emailId!: string;

  @ManyToOne(() => Email, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'email_id', foreignKeyConstraintName: 'fk_analyses_email' })
  email?: Email;

  @Column({
    name: 'status',
    type: 'enum',
    enum: analysisStatusSchema.options,
    enumName: 'analysis_status',
    default: 'pending',
  })
  status!: AnalysisStatus;

  /** Validated extraction. Written only when the output satisfied the schema. */
  @Column({ name: 'extracted_data', type: 'jsonb', nullable: true })
  extractedData!: ShipmentExtraction | null;

  /** Why the model's output failed the shared schema, when it did. */
  @Column({ name: 'validation_errors', type: 'jsonb', nullable: true })
  validationErrors!: ValidationIssue[] | null;

  /**
   * Accounting for the operation that produced the result (today:
   * `extraction`). Kept for backward compatibility with clients that read a
   * single model per analysis; `operationMetadata` is the complete record.
   */
  @Column({ name: 'model_metadata', type: 'jsonb', nullable: true })
  modelMetadata!: AnalysisModelMetadata | null;

  /**
   * One record per model call, in the order they ran, so an analysis that uses
   * several operations does not have the last one overwrite the rest.
   */
  @Column({ name: 'operation_metadata', type: 'jsonb', nullable: true })
  operationMetadata!: OperationMetadata[] | null;

  @Column({ name: 'failure_code', type: 'varchar', length: 64, nullable: true })
  failureCode!: AnalysisFailureCode | null;

  /** Operator-facing explanation. Never holds email content or credentials. */
  @Column({ name: 'failure_message', type: 'text', nullable: true })
  failureMessage!: string | null;

  @Column({ name: 'model_name', type: 'varchar', length: 128, nullable: true })
  modelName!: string | null;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
