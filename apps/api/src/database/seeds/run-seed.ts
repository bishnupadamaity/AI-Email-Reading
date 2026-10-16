import 'reflect-metadata';

import { ConflictException, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { createEmailSchema } from '@email-ai/contracts';
import { AppModule } from '../../app.module.js';
import { loadApiConfig } from '../../config/index.js';
import { EmailsService } from '../../emails/index.js';
import { SAMPLE_EMAILS } from './sample-emails.js';

/**
 * Loads development fixtures through the real `EmailsService`, so seeded rows
 * are byte-for-byte what the API would have produced — no second ingestion
 * path to drift.
 *
 * Idempotent: each sample carries an `externalMessageId`, so re-running is
 * rejected by the unique index and reported as "skipped".
 */
async function main(): Promise<void> {
  const logger = new Logger('Seed');

  // Fixtures must never reach a production database.
  if (process.env['NODE_ENV'] === 'production') {
    logger.error('Refusing to seed: NODE_ENV is "production".');
    process.exitCode = 1;
    return;
  }

  if (!loadApiConfig().database.enabled) {
    logger.error('Refusing to seed: DATABASE_ENABLED is false.');
    process.exitCode = 1;
    return;
  }

  console.log(`Seeding ${SAMPLE_EMAILS.length} sample emails...`);

  const app = await NestFactory.createApplicationContext(AppModule, {
    // Quiet: the script reports its own progress on stdout. Duplicate
    // rejections are still logged by EmailsService at warn level.
    logger: ['error'],
  });

  try {
    const emails = app.get(EmailsService);
    let created = 0;
    let skipped = 0;

    for (const sample of SAMPLE_EMAILS) {
      // Validate the fixture with the same schema the endpoint uses, so a
      // malformed sample fails here rather than producing an odd row.
      const input = createEmailSchema.parse(sample);

      try {
        const email = await emails.create(input);
        created += 1;
        console.log(`  created  ${email.id}  ${email.subject}`);
      } catch (error: unknown) {
        if (error instanceof ConflictException) {
          skipped += 1;
          console.log(`  skipped  (already present)                        ${input.subject}`);
          continue;
        }
        throw error;
      }
    }

    console.log(`\nSeed complete: ${created} created, ${skipped} skipped.`);
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  new Logger('Seed').error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
