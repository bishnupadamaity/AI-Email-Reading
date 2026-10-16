import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the result columns the first AI analysis flow writes, plus the
 * concurrency guard it depends on.
 *
 * `uq_analyses_email_in_flight` permits at most one `pending`/`processing`
 * analysis per email. It is what makes two simultaneous analyze requests safe:
 * the loser is rejected by the database instead of both runs proceeding and
 * overwriting each other. Completed and failed rows are outside the index, so
 * an email can accumulate a full run history.
 *
 * Existing rows already satisfy it — ingestion creates exactly one pending
 * analysis per email — so no backfill is required.
 */

export class AddAnalysisResultColumns1792000453919 implements MigrationInterface {
  name = 'AddAnalysisResultColumns1792000453919';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "analyses" ADD "model_metadata" jsonb`);
    await queryRunner.query(`ALTER TABLE "analyses" ADD "failure_code" character varying(64)`);
    await queryRunner.query(`ALTER TABLE "analyses" ADD "failure_message" text`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_analyses_email_in_flight" ON "analyses"  ("email_id") WHERE status IN ('pending', 'processing')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."uq_analyses_email_in_flight"`);
    await queryRunner.query(`ALTER TABLE "analyses" DROP COLUMN "failure_message"`);
    await queryRunner.query(`ALTER TABLE "analyses" DROP COLUMN "failure_code"`);
    await queryRunner.query(`ALTER TABLE "analyses" DROP COLUMN "model_metadata"`);
  }
}
