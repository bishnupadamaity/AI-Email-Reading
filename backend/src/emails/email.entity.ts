import { emailStatusSchema, type EmailStatus } from '@email-ai/contracts';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * An ingested email, stored verbatim apart from trimming.
 *
 * Analysis output lives in a separate table so re-running a workflow never
 * mutates the source record.
 */
@Entity('emails')
@Index('idx_emails_received_at', ['receivedAt'])
@Index('idx_emails_processing_status', ['processingStatus'])
// De-duplication scope. Declared here so `migration:generate` knows the index
// exists and does not propose dropping it; the migration additionally applies
// `NULLS NOT DISTINCT`, which TypeORM has no way to express.
@Index('uq_emails_account_external_message_id', ['emailAccountId', 'externalMessageId'], {
  unique: true,
  where: 'external_message_id IS NOT NULL',
})
export class Email {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'pk_emails' })
  id!: string;

  /**
   * Account the message arrived on. Nullable, and without a foreign key, until
   * the email-account model exists — see the unique index in the migration for
   * how de-duplication is scoped in the meantime.
   */
  @Column({ name: 'email_account_id', type: 'uuid', nullable: true })
  emailAccountId!: string | null;

  /** Provider message id. Not globally unique; unique per account. */
  @Column({ name: 'external_message_id', type: 'varchar', length: 998, nullable: true })
  externalMessageId!: string | null;

  @Column({ name: 'sender', type: 'varchar', length: 320 })
  sender!: string;

  @Column({ name: 'subject', type: 'varchar', length: 998 })
  subject!: string;

  @Column({ name: 'body_text', type: 'text' })
  bodyText!: string;

  /** When the provider received the message, not when we ingested it. */
  @Column({ name: 'received_at', type: 'timestamptz' })
  receivedAt!: Date;

  @Column({
    name: 'processing_status',
    type: 'enum',
    enum: emailStatusSchema.options,
    enumName: 'email_processing_status',
    default: 'received',
  })
  processingStatus!: EmailStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
