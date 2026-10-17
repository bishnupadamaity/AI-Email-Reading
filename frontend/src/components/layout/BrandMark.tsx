/**
 * The MailPilot mark.
 *
 * An open envelope carrying two rules of extracted text, under a heading
 * chevron — mail being read and routed. Drawn on the same 24px grid and
 * stroke weight as the Lucide icon set so the rail reads as one family, and
 * kept monochrome so it inherits the rail's marker colour.
 */
export function BrandMark({ size = 21 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M3 8.75 12 2.5l9 6.25" />
      <path d="M3 8.75V19a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.75" />
      <path d="M7.75 13.25h8.5" />
      <path d="M7.75 16.75h5" />
    </svg>
  );
}
