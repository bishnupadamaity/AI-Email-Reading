import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from '@jest/globals';
import { shipmentExtractionSchema } from './extraction.js';

const COMPLETE = {
  classification: 'shipment_update',
  summary: 'Container MSCU7654321 departed Rotterdam.',
  supplierOrganization: { value: 'Acme Logistics', evidence: 'Acme Logistics' },
  shipmentReference: { value: 'PO 4821', evidence: 'order PO 4821' },
  originPort: { value: 'Rotterdam', evidence: 'Port of load: Rotterdam' },
  destinationPort: { value: 'Singapore', evidence: 'discharge: Singapore' },
  containerNumber: { value: 'MSCU7654321', evidence: 'Container: MSCU7654321' },
  billOfLadingNumber: { value: 'ACME-BL-558201', evidence: 'Bill of lading: ACME-BL-558201' },
  shippingLine: { value: null, evidence: null },
  vesselName: { value: 'MV Northern Star', evidence: 'MV Northern Star' },
  voyageNumber: { value: '118E', evidence: 'voyage 118E' },
  estimatedDeparture: { value: '2026-02-02', evidence: 'Departed: 2 February 2026' },
  estimatedArrival: { value: '2026-02-24', evidence: 'ETA: 24 February 2026' },
  freeTime: { value: '14 days at destination', evidence: '14 days free time' },
  missingFields: [],
  conflicts: [],
};

describe('shipmentExtractionSchema', () => {
  it('accepts a complete extraction', () => {
    expect(shipmentExtractionSchema.parse(COMPLETE).classification).toBe('shipment_update');
  });

  it('accepts nulls for every absent field', () => {
    const nothingFound = Object.fromEntries(
      Object.entries(COMPLETE).map(([key, value]) =>
        value !== null && typeof value === 'object' && 'value' in value
          ? [key, { value: null, evidence: null }]
          : [key, value],
      ),
    );

    expect(shipmentExtractionSchema.safeParse(nothingFound).success).toBe(true);
  });

  it('keeps a vague date as written rather than rejecting it', () => {
    const vague = {
      ...COMPLETE,
      estimatedArrival: { value: 'mid-March', evidence: 'arriving mid-March' },
    };

    expect(shipmentExtractionSchema.parse(vague).estimatedArrival.value).toBe('mid-March');
  });

  it('records conflicting values instead of a single winner', () => {
    const conflicting = {
      ...COMPLETE,
      containerNumber: { value: null, evidence: null },
      conflicts: [
        {
          field: 'containerNumber',
          values: ['TGHU1234567', 'TGHU7654321'],
          note: 'booking confirmation and warehouse paperwork disagree',
        },
      ],
    };

    const parsed = shipmentExtractionSchema.parse(conflicting);
    expect(parsed.conflicts[0]?.values).toHaveLength(2);
    expect(parsed.containerNumber.value).toBeNull();
  });

  it('records missing fields with an optional reason', () => {
    const parsed = shipmentExtractionSchema.parse({
      ...COMPLETE,
      missingFields: [{ field: 'containerNumber', reason: null }],
    });

    expect(parsed.missingFields[0]?.field).toBe('containerNumber');
  });

  it('rejects an unknown classification', () => {
    // Not enforced during constrained decoding, so this is the backstop.
    expect(
      shipmentExtractionSchema.safeParse({ ...COMPLETE, classification: 'invented' }).success,
    ).toBe(false);
  });

  it('rejects a missing field rather than defaulting it', () => {
    const { containerNumber: _dropped, ...incomplete } = COMPLETE;
    const result = shipmentExtractionSchema.safeParse(incomplete);

    expect(result.success).toBe(false);
    expect(result.error?.issues.some((i) => i.path.join('.') === 'containerNumber')).toBe(true);
  });

  it('rejects a bare value that is missing its evidence wrapper', () => {
    expect(
      shipmentExtractionSchema.safeParse({ ...COMPLETE, containerNumber: 'MSCU7654321' }).success,
    ).toBe(false);
  });

  it('rejects a non-string extracted value', () => {
    expect(
      shipmentExtractionSchema.safeParse({
        ...COMPLETE,
        containerNumber: { value: 42, evidence: null },
      }).success,
    ).toBe(false);
  });
});

describe('shared extraction fixtures', () => {
  /**
   * The same files the Python suite validates against `ShipmentExtraction`
   * (`ai-service/tests/test_contract_fixtures.py`). Keeping both suites
   * on one set of examples is what stops the Zod schema and the Pydantic model
   * drifting apart.
   */
  const FIXTURES = join(import.meta.dirname, '..', '..', '..', 'test', 'fixtures', 'extraction');

  const names = (kind: 'valid' | 'invalid'): string[] =>
    readdirSync(FIXTURES)
      .filter((name) => name.endsWith('.json'))
      .filter((name) => (kind === 'invalid') === name.startsWith('invalid-'))
      .sort();

  const load = (name: string): unknown => JSON.parse(readFileSync(join(FIXTURES, name), 'utf8'));

  it('has fixtures of both kinds', () => {
    expect(names('valid').length).toBeGreaterThan(0);
    expect(names('invalid').length).toBeGreaterThan(0);
  });

  it.each(names('valid'))('accepts %s', (name) => {
    expect(shipmentExtractionSchema.safeParse(load(name)).success).toBe(true);
  });

  it.each(names('valid'))('round-trips %s unchanged', (name) => {
    // Byte-for-byte: this is what guarantees the API stores the same document
    // the AI service validated.
    const original = load(name);

    expect(shipmentExtractionSchema.parse(original)).toEqual(original);
  });

  it.each(names('invalid'))('rejects %s', (name) => {
    expect(shipmentExtractionSchema.safeParse(load(name)).success).toBe(false);
  });
});
