import {
  type AnalysisDetail,
  type EmailDetail,
  type ShipmentExtraction,
} from '@email-ai/contracts';

/**
 * Synthetic records for demo mode.
 *
 * These exist for one reason: the live database can hold emails whose analyses
 * have never run (the AI service is optional), and a reviewer cannot evaluate
 * the extraction workspace against an empty state. The extractions below are
 * the repository's own contract fixtures from `test/fixtures/extraction/`,
 * widened with the email bodies the evidence spans were quoted from, so
 * evidence highlighting behaves exactly as it does on real data.
 *
 * Nothing here is ever written anywhere, no request is sent while demo mode is
 * on, and every surface that renders it is marked. Demo ids are deliberately
 * not UUIDs so a demo record can never be mistaken for a stored one.
 */

const DAY_MS = 86_400_000;

/** Demo timestamps are relative to load so the activity chart is never empty. */
function daysAgo(days: number, hour = 9, minute = 0): string {
  const date = new Date(Date.now() - days * DAY_MS);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

export const DEMO_ID_PREFIX = 'demo-';

export function isDemoId(id: string): boolean {
  return id.startsWith(DEMO_ID_PREFIX);
}

function evidenced(value: string | null, evidence: string | null = null) {
  return { value, evidence };
}

const empty = evidenced(null, null);

const COMPLETE_BODY = `Dear Operations,

Please find below the shipment confirmation for order PO 4821.

Supplier:       Acme Logistics
Container:      MSCU7654321
Bill of lading: ACME-BL-558201
Vessel:         MV Northern Star, voyage 118E
Port of load:   Rotterdam (NLRTM)
Port of discharge: Singapore (SGSIN)
Departed:       2 February 2026
ETA:            24 February 2026

The carrier has not confirmed which line will handle the inland leg; we will
follow up separately.

Kind regards,
Dispatch
Acme Logistics`;

/** `test/fixtures/extraction/complete.json`. */
const COMPLETE_EXTRACTION: ShipmentExtraction = {
  classification: 'shipment_update',
  summary: 'Container MSCU7654321 departed Rotterdam for Singapore.',
  supplierOrganization: evidenced('Acme Logistics', 'Acme Logistics'),
  shipmentReference: evidenced('PO 4821', 'order PO 4821'),
  originPort: evidenced('Rotterdam', 'Port of load:   Rotterdam (NLRTM)'),
  destinationPort: evidenced('Singapore', 'Port of discharge: Singapore (SGSIN)'),
  containerNumber: evidenced('MSCU7654321', 'Container:      MSCU7654321'),
  billOfLadingNumber: evidenced('ACME-BL-558201', 'Bill of lading: ACME-BL-558201'),
  shippingLine: empty,
  vesselName: evidenced('MV Northern Star', 'MV Northern Star, voyage 118E'),
  voyageNumber: evidenced('118E', 'voyage 118E'),
  estimatedDeparture: evidenced('2026-02-02', 'Departed:       2 February 2026'),
  estimatedArrival: evidenced('2026-02-24', 'ETA:            24 February 2026'),
  freeTime: empty,
  missingFields: [{ field: 'shippingLine', reason: 'not stated in the email' }],
  conflicts: [],
};

const CONFLICTING_BODY = `Hi team,

Correcting our earlier message for reference GF-5521 ex Hamburg.

The booking confirmation shows container TGHU1234567, but the warehouse
paperwork we received this morning lists TGHU7654321.

Our systems also disagree on the arrival date: the carrier portal says
11 April 2026, while the booking note attached to the PO says 18 April 2026.

Please advise which set of details to use before we file customs.

Global Freight`;

/** `test/fixtures/extraction/conflicting.json`. */
const CONFLICTING_EXTRACTION: ShipmentExtraction = {
  classification: 'shipment_update',
  summary: 'The email states two different containers and two different arrival dates.',
  supplierOrganization: evidenced('Global Freight', 'Global Freight'),
  shipmentReference: evidenced('GF-5521', 'reference GF-5521'),
  originPort: evidenced('Hamburg', 'ex Hamburg'),
  destinationPort: empty,
  containerNumber: empty,
  billOfLadingNumber: empty,
  shippingLine: empty,
  vesselName: empty,
  voyageNumber: empty,
  estimatedDeparture: empty,
  estimatedArrival: empty,
  freeTime: empty,
  missingFields: [{ field: 'billOfLadingNumber', reason: 'not stated' }],
  conflicts: [
    {
      field: 'containerNumber',
      values: ['TGHU1234567', 'TGHU7654321'],
      note: 'booking confirmation and warehouse paperwork disagree',
    },
    { field: 'estimatedArrival', values: ['2026-04-11', '2026-04-18'], note: null },
  ],
};

const INCOMPLETE_BODY = `Hello,

Quick update on order 7719 — it should ship soon. The supplier says the goods
are ready and they are arranging a booking with the line this week.

I will send the container and the dates as soon as I have them.

Thanks,
Priya
Northwind Trading`;

/** Shaped like `test/fixtures/extraction/nothing-stated.json`. */
const INCOMPLETE_EXTRACTION: ShipmentExtraction = {
  classification: 'shipment_update',
  summary: 'Order 7719 is said to be ready, with no shipment details stated.',
  supplierOrganization: evidenced('Northwind Trading', 'Northwind Trading'),
  shipmentReference: evidenced('7719', 'order 7719'),
  originPort: empty,
  destinationPort: empty,
  containerNumber: empty,
  billOfLadingNumber: empty,
  shippingLine: empty,
  vesselName: empty,
  voyageNumber: empty,
  estimatedDeparture: empty,
  estimatedArrival: empty,
  freeTime: empty,
  missingFields: [
    { field: 'containerNumber', reason: 'promised in a later message' },
    { field: 'estimatedDeparture', reason: 'not stated' },
    { field: 'estimatedArrival', reason: 'not stated' },
    { field: 'originPort', reason: 'not stated' },
    { field: 'destinationPort', reason: 'not stated' },
  ],
  conflicts: [],
};

const ARRIVAL_BODY = `ARRIVAL NOTICE

Consignee:      Meridian Imports BV
Reference:      BK-77214
Container:      HLXU8812349
Bill of lading: HLCU-SHA-4471920
Carrier:        Hapag-Lloyd
Vessel:         MV Atlantic Trader, voyage 44W
Port of load:   Shanghai (CNSHA)
Port of discharge: Rotterdam (NLRTM)
ETA:            28 March 2026
Free time:      14 days at destination

Please arrange collection within the free time stated above.`;

const ARRIVAL_EXTRACTION: ShipmentExtraction = {
  classification: 'arrival_notice',
  summary: 'Container HLXU8812349 arrives in Rotterdam on 28 March 2026.',
  supplierOrganization: evidenced('Meridian Imports BV', 'Consignee:      Meridian Imports BV'),
  shipmentReference: evidenced('BK-77214', 'Reference:      BK-77214'),
  originPort: evidenced('Shanghai', 'Port of load:   Shanghai (CNSHA)'),
  destinationPort: evidenced('Rotterdam', 'Port of discharge: Rotterdam (NLRTM)'),
  containerNumber: evidenced('HLXU8812349', 'Container:      HLXU8812349'),
  billOfLadingNumber: evidenced('HLCU-SHA-4471920', 'Bill of lading: HLCU-SHA-4471920'),
  shippingLine: evidenced('Hapag-Lloyd', 'Carrier:        Hapag-Lloyd'),
  vesselName: evidenced('MV Atlantic Trader', 'MV Atlantic Trader, voyage 44W'),
  voyageNumber: evidenced('44W', 'voyage 44W'),
  estimatedDeparture: empty,
  estimatedArrival: evidenced('2026-03-28', 'ETA:            28 March 2026'),
  freeTime: evidenced('14 days at destination', 'Free time:      14 days at destination'),
  missingFields: [{ field: 'estimatedDeparture', reason: 'not stated on an arrival notice' }],
  conflicts: [],
};

interface DemoRecord {
  email: EmailDetail;
  analysis: AnalysisDetail;
}

function demoRecord(input: {
  n: number;
  sender: string;
  subject: string;
  body: string;
  receivedAt: string;
  processingStatus: EmailDetail['processingStatus'];
  analysis: {
    status: AnalysisDetail['status'];
    extraction?: ShipmentExtraction;
    failureCode?: AnalysisDetail['failureCode'];
    failureMessage?: string;
    validationErrors?: AnalysisDetail['validationErrors'];
    model?: string;
    latencyMs?: number;
    inputTokens?: number | null;
    outputTokens?: number | null;
    cachedInputTokens?: number | null;
    reasoningTokens?: number | null;
  };
}): DemoRecord {
  /** `null` is a meaningful token value (the provider reported none), so it
   * must survive rather than fall back to the default. */
  const or = <T>(value: T | undefined, fallback: T): T => (value === undefined ? fallback : value);
  const inputTokens = or(input.analysis.inputTokens, 1180);
  const outputTokens = or(input.analysis.outputTokens, 430);
  const cachedInputTokens = or(input.analysis.cachedInputTokens, 0);
  const reasoningTokens = or(input.analysis.reasoningTokens, 0);
  const emailId = `${DEMO_ID_PREFIX}email-${String(input.n).padStart(2, '0')}`;
  const analysisId = `${DEMO_ID_PREFIX}analysis-${String(input.n).padStart(2, '0')}`;
  const ran = input.analysis.status === 'completed' || input.analysis.status === 'failed';

  const startedAt = ran
    ? new Date(new Date(input.receivedAt).getTime() + 90_000).toISOString()
    : null;
  const completedAt =
    ran && startedAt
      ? new Date(new Date(startedAt).getTime() + (input.analysis.latencyMs ?? 4200)).toISOString()
      : null;

  const model = input.analysis.model ?? 'gpt-6-sol-2026-09-01';

  const analysis: AnalysisDetail = {
    id: analysisId,
    emailId,
    status: input.analysis.status,
    extractedData: input.analysis.extraction ?? null,
    validationErrors: input.analysis.validationErrors ?? null,
    modelName: ran ? model : null,
    modelMetadata: ran
      ? {
          provider: 'openai',
          model,
          inputTokens,
          outputTokens,
          cacheReadInputTokens: cachedInputTokens,
          latencyMs: input.analysis.latencyMs ?? 4200,
          stopReason: input.analysis.status === 'completed' ? 'completed' : null,
        }
      : null,
    operations: ran
      ? [
          {
            operation: 'extraction',
            provider: 'openai',
            model,
            status: input.analysis.status === 'completed' ? 'succeeded' : 'failed',
            failureCode: input.analysis.failureCode ?? null,
            inputTokens,
            outputTokens,
            cachedInputTokens,
            reasoningTokens,
            latencyMs: input.analysis.latencyMs ?? 4200,
            stopReason: input.analysis.status === 'completed' ? 'completed' : null,
            completedAt: completedAt ?? input.receivedAt,
          },
        ]
      : null,
    failureCode: input.analysis.failureCode ?? null,
    failureMessage: input.analysis.failureMessage ?? null,
    startedAt,
    completedAt,
    createdAt: input.receivedAt,
    updatedAt: completedAt ?? input.receivedAt,
  };

  const email: EmailDetail = {
    id: emailId,
    externalMessageId: `<demo-${input.n}@example.invalid>`,
    emailAccountId: null,
    sender: input.sender,
    subject: input.subject,
    bodyText: input.body,
    receivedAt: input.receivedAt,
    processingStatus: input.processingStatus,
    createdAt: input.receivedAt,
    updatedAt: analysis.updatedAt,
    latestAnalysis: {
      id: analysis.id,
      status: analysis.status,
      createdAt: analysis.createdAt,
    },
  };

  return { email, analysis };
}

const RECORDS: readonly DemoRecord[] = [
  demoRecord({
    n: 1,
    sender: 'Global Freight Ops <ops@globalfreight.example>',
    subject: 'Corrected details - PO 4822 - container TGHU1234567',
    body: CONFLICTING_BODY,
    receivedAt: daysAgo(0, 8, 12),
    processingStatus: 'needs_review',
    analysis: {
      status: 'completed',
      extraction: CONFLICTING_EXTRACTION,
      latencyMs: 5120,
      inputTokens: 1442,
      outputTokens: 612,
      cachedInputTokens: 128,
      reasoningTokens: 96,
    },
  }),
  demoRecord({
    n: 2,
    sender: 'Acme Logistics <dispatch@acme-logistics.example>',
    subject: 'Shipment confirmation - PO 4821 / container MSCU7654321',
    body: COMPLETE_BODY,
    receivedAt: daysAgo(0, 7, 30),
    processingStatus: 'analyzed',
    analysis: {
      status: 'completed',
      extraction: COMPLETE_EXTRACTION,
      latencyMs: 4210,
      inputTokens: 1234,
      outputTokens: 567,
      cachedInputTokens: 128,
      reasoningTokens: 64,
    },
  }),
  demoRecord({
    n: 3,
    sender: 'Priya Raman <priya@northwind-trading.example>',
    subject: 'Re: order 7719 - shipping soon',
    body: INCOMPLETE_BODY,
    receivedAt: daysAgo(1, 14, 5),
    processingStatus: 'needs_review',
    analysis: {
      status: 'completed',
      extraction: INCOMPLETE_EXTRACTION,
      latencyMs: 3180,
      inputTokens: 890,
      outputTokens: 402,
    },
  }),
  demoRecord({
    n: 4,
    sender: 'Hapag-Lloyd Notices <notices@hlag.example>',
    subject: 'Arrival notice - HLXU8812349 - Rotterdam',
    body: ARRIVAL_BODY,
    receivedAt: daysAgo(2, 6, 45),
    processingStatus: 'analyzed',
    analysis: {
      status: 'completed',
      extraction: ARRIVAL_EXTRACTION,
      latencyMs: 3890,
      inputTokens: 1102,
      outputTokens: 528,
      cachedInputTokens: 256,
    },
  }),
  demoRecord({
    n: 5,
    sender: 'Shenzhen Parts Co <sales@sz-parts.example>',
    subject: 'Quotation request - 3 x 40HC Shenzhen to Felixstowe',
    body: `Good afternoon,

Could you quote for three 40HC containers from Shenzhen to Felixstowe,
departing in the second half of May? Cargo is palletised electronics,
roughly 18 tonnes per container.

We would also like your demurrage terms.

Best regards,
Wei Zhang`,
    receivedAt: daysAgo(3, 11, 20),
    processingStatus: 'failed',
    analysis: {
      status: 'failed',
      failureCode: 'timeout',
      failureMessage: 'Provider did not answer within the configured model timeout.',
      latencyMs: 30_000,
      inputTokens: 980,
      outputTokens: null,
      cachedInputTokens: null,
      reasoningTokens: null,
    },
  }),
  demoRecord({
    n: 6,
    sender: 'Baltic Lines <booking@balticlines.example>',
    subject: 'Booking confirmation 88-4421 / MV Gdansk Pioneer',
    body: `Booking 88-4421 confirmed.

Vessel MV Gdansk Pioneer, voyage 09N, loading Gdansk 14 May 2026,
discharge Immingham 17 May 2026. Two 20GP containers under BL BAL-991203.`,
    receivedAt: daysAgo(4, 9, 15),
    processingStatus: 'failed',
    analysis: {
      status: 'failed',
      failureCode: 'invalid_output',
      failureMessage: 'Model output failed the shared extraction schema.',
      validationErrors: [
        {
          path: 'containerNumber.evidence',
          message: 'A value was recorded without the evidence span it came from.',
        },
        {
          path: 'conflicts.0',
          message: 'Field reported as conflicting but a single value was also returned.',
        },
      ],
      latencyMs: 6420,
      inputTokens: 1310,
      outputTokens: 702,
    },
  }),
  demoRecord({
    n: 7,
    sender: 'Customs Broker <declarations@portclear.example>',
    subject: 'Entry accepted - MRN 26GB0912AB4471920',
    body: `Entry for MRN 26GB0912AB4471920 has been accepted. Duty and VAT will be
posted to the deferment account on the next cycle. No further action required.`,
    receivedAt: daysAgo(6, 16, 40),
    processingStatus: 'received',
    analysis: { status: 'pending' },
  }),
  demoRecord({
    n: 8,
    sender: 'Meridian Imports <ops@meridian-imports.example>',
    subject: 'Invoice MI-2026-0481 for BK-77214',
    body: `Please find invoice MI-2026-0481 for booking BK-77214, payable in 30 days.
Freight, THC and documentation are itemised. Container HLXU8812349.`,
    receivedAt: daysAgo(9, 10, 5),
    processingStatus: 'received',
    analysis: { status: 'pending' },
  }),
  demoRecord({
    n: 9,
    sender: 'Maersk Updates <updates@maersk.example>',
    subject: 'Schedule change - MV Northern Star voyage 118E',
    body: `The Singapore call for MV Northern Star voyage 118E has moved.
Revised ETA is 26 February 2026. Container MSCU7654321 is unaffected otherwise.`,
    receivedAt: daysAgo(12, 13, 25),
    processingStatus: 'analyzed',
    analysis: {
      status: 'completed',
      extraction: {
        ...COMPLETE_EXTRACTION,
        summary: 'The Singapore call moved; revised ETA is 26 February 2026.',
        originPort: empty,
        destinationPort: evidenced('Singapore', 'The Singapore call'),
        billOfLadingNumber: empty,
        estimatedDeparture: empty,
        estimatedArrival: evidenced('2026-02-26', 'Revised ETA is 26 February 2026'),
        missingFields: [
          { field: 'estimatedDeparture', reason: 'not restated in this update' },
          { field: 'shippingLine', reason: 'not stated in the email' },
          { field: 'billOfLadingNumber', reason: 'not restated in this update' },
        ],
        conflicts: [],
      },
      latencyMs: 2980,
      inputTokens: 760,
      outputTokens: 388,
    },
  }),
  demoRecord({
    n: 10,
    sender: 'Felixstowe Terminal <gate@portfelixstowe.example>',
    subject: 'Gate-out confirmation TGHU7654321',
    body: `Container TGHU7654321 gated out at 06:12 today. Haulier reference FX-99120.
Demurrage clock stopped. Reference GF-5521.`,
    receivedAt: daysAgo(15, 7, 5),
    processingStatus: 'received',
    analysis: { status: 'pending' },
  }),
];

export const demoEmails: readonly EmailDetail[] = RECORDS.map((record) => record.email);

export const demoAnalyses: readonly AnalysisDetail[] = RECORDS.map((record) => record.analysis);

export function findDemoEmail(id: string): EmailDetail | undefined {
  return demoEmails.find((email) => email.id === id);
}

export function findDemoAnalysis(id: string): AnalysisDetail | undefined {
  return demoAnalyses.find((analysis) => analysis.id === id);
}
