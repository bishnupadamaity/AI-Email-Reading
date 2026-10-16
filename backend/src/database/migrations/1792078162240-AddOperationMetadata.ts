import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Records which model served each AI operation of an analysis.
 *
 * Purely additive and reversible: one nullable column, no backfill, no data
 * touched. Existing rows read as `null`, which the response contract models
 * explicitly as "predates per-operation accounting".
 *
 * `model_metadata` is deliberately left in place rather than migrated into the
 * new column. It keeps carrying the operation that produced the analysis
 * result, so clients reading a single model per analysis continue to work.
 */

export class AddOperationMetadata1792078162240 implements MigrationInterface {
  name = 'AddOperationMetadata1792078162240';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "analyses" ADD "operation_metadata" jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "analyses" DROP COLUMN "operation_metadata"`);
  }
}
