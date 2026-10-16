import { type DocumentKind } from '../types.js';

/** MIME types accepted for each supported attachment kind. */
export const SUPPORTED_MIME_TYPES: Readonly<
  Record<Exclude<DocumentKind, 'unsupported'>, readonly string[]>
> = {
  pdf: ['application/pdf'],
  image: ['image/jpeg', 'image/png', 'image/tiff', 'image/webp'],
  spreadsheet: [
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ],
};

/** Classifies an attachment by MIME type, without reading its content. */
export function classifyMimeType(mimeType: string): DocumentKind {
  const normalised = mimeType.trim().toLowerCase();

  for (const [kind, mimeTypes] of Object.entries(SUPPORTED_MIME_TYPES)) {
    if (mimeTypes.includes(normalised)) {
      return kind as DocumentKind;
    }
  }

  return 'unsupported';
}
