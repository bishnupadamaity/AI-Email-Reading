import { type CreateEmail } from '@email-ai/contracts';

/**
 * Development fixtures covering the three cases the analysis pipeline has to
 * tell apart. They are written as real message text, not as pre-extracted
 * fields, because extraction is exactly what is being exercised later.
 *
 * `externalMessageId` is set on every sample, which makes seeding idempotent:
 * a second run is rejected by the per-account unique index and skipped.
 */
export const SAMPLE_EMAILS: readonly CreateEmail[] = [
  // 1. Complete: every shipment field a reader would need is present.
  {
    externalMessageId: '<seed-shipment-complete@acme-logistics.example>',
    emailAccountId: null,
    sender: 'Acme Logistics <dispatch@acme-logistics.example>',
    subject: 'Shipment confirmation - PO 4821 / container MSCU7654321',
    bodyText: [
      'Hello,',
      '',
      'Your order PO 4821 has been dispatched. Details below.',
      '',
      '  Container:      MSCU7654321',
      '  Bill of lading: ACME-BL-558201',
      '  Vessel:         MV Northern Star, voyage 118E',
      '  Port of load:   Rotterdam (NLRTM)',
      '  Port of discharge: Singapore (SGSIN)',
      '  Departed:       2 February 2026',
      '  ETA:            24 February 2026',
      '  Cargo:          12 pallets, 4,800 kg gross, 18.4 CBM',
      '  Incoterms:      CIF Singapore',
      '',
      'Commercial invoice INV-2026-0188 for EUR 42,350.00 is attached.',
      '',
      'Regards,',
      'Dispatch desk, Acme Logistics',
    ].join('\n'),
    receivedAt: '2026-02-02T08:14:00.000Z',
  },

  // 2. Incomplete: no container, no vessel, no dates. Should end up in review
  //    for a missing required field rather than being silently accepted.
  {
    externalMessageId: '<seed-shipment-missing-fields@northwind-trading.example>',
    emailAccountId: null,
    sender: 'procurement@northwind-trading.example',
    subject: 'Re: order 7719 - shipping soon',
    bodyText: [
      'Hi,',
      '',
      'Just to confirm we are going ahead with order 7719. Goods are being',
      'collected from the warehouse this week and will go out on the next',
      'available sailing.',
      '',
      'I do not have the container or booking reference yet - the forwarder',
      'will send those once the booking is confirmed. Quantities are as per',
      'the original purchase order.',
      '',
      'Thanks,',
      'Priya',
    ].join('\n'),
    receivedAt: '2026-02-03T15:42:00.000Z',
  },

  // 3. Conflicting: two different weights, two different ETAs and a container
  //    number that contradicts the one in the subject. Low confidence by
  //    construction.
  {
    externalMessageId: '<seed-shipment-conflicting@globalfreight.example>',
    emailAccountId: null,
    sender: 'Global Freight Ops <ops@globalfreight.example>',
    subject: 'Corrected details - PO 4822 - container TGHU1234567',
    bodyText: [
      'Team,',
      '',
      'Following up on my earlier message about PO 4822.',
      '',
      'The booking confirmation lists container TGHU1234567 with a gross',
      'weight of 6,200 kg and an ETA of 19 March 2026.',
      '',
      'However, the warehouse paperwork we received this morning shows',
      'container TGHU7654321, gross weight 5,750 kg, and the carrier portal',
      'is now showing an ETA of 22 March 2026.',
      '',
      'I have asked the carrier which set of numbers is authoritative but',
      'have not heard back. Please do not file customs paperwork against',
      'either set until this is resolved.',
      '',
      'Marcus',
    ].join('\n'),
    receivedAt: '2026-03-04T11:05:00.000Z',
  },
];
