import { describe, expect, it } from '@jest/globals';
import { createEmailSchema, emailSummarySchema } from './emails.js';

const VALID_ID = '3f1b6f8a-2c2a-4f5e-9f0c-7d0a9b1e2c3d';

describe('createEmailSchema', () => {
  const valid = {
    sender: 'orders@acme-logistics.example',
    subject: 'Purchase order 4821',
    bodyText: 'Please ship 12 pallets to Rotterdam.',
    receivedAt: '2026-01-15T09:30:00.000Z',
  };

  it('accepts a minimal payload and leaves optional fields absent', () => {
    const parsed = createEmailSchema.parse(valid);
    expect(parsed.subject).toBe('Purchase order 4821');
    expect(parsed.externalMessageId).toBeUndefined();
  });

  it('accepts an explicit null for the optional identifiers', () => {
    const parsed = createEmailSchema.parse({
      ...valid,
      externalMessageId: null,
      emailAccountId: null,
    });
    expect(parsed.externalMessageId).toBeNull();
  });

  it('trims surrounding whitespace on the sender and subject', () => {
    const parsed = createEmailSchema.parse({ ...valid, sender: '  a@b.example  ' });
    expect(parsed.sender).toBe('a@b.example');
  });

  it('rejects a missing body', () => {
    const { bodyText: _bodyText, ...withoutBody } = valid;
    expect(createEmailSchema.safeParse(withoutBody).success).toBe(false);
  });

  it('rejects a non-ISO receivedAt', () => {
    expect(createEmailSchema.safeParse({ ...valid, receivedAt: '15/01/2026' }).success).toBe(false);
  });

  it('rejects a malformed emailAccountId', () => {
    expect(createEmailSchema.safeParse({ ...valid, emailAccountId: 'not-a-uuid' }).success).toBe(
      false,
    );
  });
});

describe('emailSummarySchema', () => {
  const valid = {
    id: VALID_ID,
    externalMessageId: null,
    emailAccountId: null,
    sender: 'orders@acme-logistics.example',
    subject: 'Purchase order 4821',
    receivedAt: '2026-01-15T09:30:00.000Z',
    processingStatus: 'received',
    createdAt: '2026-01-15T09:30:01.000Z',
  };

  it('accepts a well-formed summary', () => {
    expect(emailSummarySchema.parse(valid)).toMatchObject({ processingStatus: 'received' });
  });

  it('rejects an unknown processing status', () => {
    expect(emailSummarySchema.safeParse({ ...valid, processingStatus: 'archived' }).success).toBe(
      false,
    );
  });
});
