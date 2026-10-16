/** Attachment kinds the platform intends to support. */
export type DocumentKind = 'pdf' | 'image' | 'spreadsheet' | 'unsupported';

export interface DocumentInput {
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly content: Buffer;
}

export interface ParsedDocument {
  readonly kind: DocumentKind;
  /** Text extracted from the document, concatenated across pages or sheets. */
  readonly text: string;
  /** Page count for paged formats, sheet count for spreadsheets. */
  readonly segments: number;
}

/**
 * Implemented per format under `parsers/` and `ocr/`. Keeping the contract here
 * lets the worker depend on the abstraction rather than a specific library.
 */
export interface DocumentParser {
  readonly kind: DocumentKind;
  supports(input: Pick<DocumentInput, 'mimeType' | 'fileName'>): boolean;
  parse(input: DocumentInput): Promise<ParsedDocument>;
}
