import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the `emails` and `analyses` tables.
 *
 * Generated from the entities, then extended by hand with two things TypeORM
 * cannot express:
 *
 * 1. The `uuid-ossp` extension, which backs the `uuid_generate_v4()` column
 *    default the entities declare.
 * 2. A partial unique index scoping `external_message_id` to the (future)
 *    email account. `NULLS NOT DISTINCT` (PostgreSQL 15+) is what makes this
 *    de-duplicate today while `email_account_id` is still NULL for every row:
 *    under default NULL semantics two identical message ids would both be
 *    accepted. Rows without a message id are excluded entirely.
 */

export class CreateEmailsAndAnalyses1791998813172 implements MigrationInterface {
  name = 'CreateEmailsAndAnalyses1791998813172';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(
      `CREATE TYPE "public"."email_processing_status" AS ENUM('received', 'queued', 'analyzing', 'analyzed', 'needs_review', 'failed')`,
    );
    await queryRunner.query(
      `CREATE TABLE "emails" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email_account_id" uuid, "external_message_id" character varying(998), "sender" character varying(320) NOT NULL, "subject" character varying(998) NOT NULL, "body_text" text NOT NULL, "received_at" TIMESTAMP WITH TIME ZONE NOT NULL, "processing_status" "public"."email_processing_status" NOT NULL DEFAULT 'received', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "pk_emails" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_emails_processing_status" ON "emails"  ("processing_status") `,
    );
    await queryRunner.query(`CREATE INDEX "idx_emails_received_at" ON "emails"  ("received_at") `);
    await queryRunner.query(
      `CREATE TYPE "public"."analysis_status" AS ENUM('pending', 'processing', 'completed', 'failed')`,
    );
    await queryRunner.query(
      `CREATE TABLE "analyses" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email_id" uuid NOT NULL, "status" "public"."analysis_status" NOT NULL DEFAULT 'pending', "extracted_data" jsonb, "validation_errors" jsonb, "model_name" character varying(128), "started_at" TIMESTAMP WITH TIME ZONE, "completed_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "pk_analyses" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "idx_analyses_status" ON "analyses"  ("status") `);
    await queryRunner.query(`CREATE INDEX "idx_analyses_email_id" ON "analyses"  ("email_id") `);
    await queryRunner.query(
      `ALTER TABLE "analyses" ADD CONSTRAINT "fk_analyses_email" FOREIGN KEY ("email_id") REFERENCES "emails"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_emails_account_external_message_id" ON "emails" ` +
        `("email_account_id", "external_message_id") NULLS NOT DISTINCT ` +
        `WHERE "external_message_id" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."uq_emails_account_external_message_id"`);
    await queryRunner.query(`ALTER TABLE "analyses" DROP CONSTRAINT "fk_analyses_email"`);
    await queryRunner.query(`DROP INDEX "public"."idx_analyses_email_id"`);
    await queryRunner.query(`DROP INDEX "public"."idx_analyses_status"`);
    await queryRunner.query(`DROP TABLE "analyses"`);
    await queryRunner.query(`DROP TYPE "public"."analysis_status"`);
    await queryRunner.query(`DROP INDEX "public"."idx_emails_received_at"`);
    await queryRunner.query(`DROP INDEX "public"."idx_emails_processing_status"`);
    await queryRunner.query(`DROP TABLE "emails"`);
    await queryRunner.query(`DROP TYPE "public"."email_processing_status"`);
  }
}
