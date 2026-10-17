import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { Button, type ButtonProps } from './Button';
import { Tooltip } from './Tooltip';

/**
 * Copies text to the clipboard. The confirmation is local and honest: it
 * reports what the browser did, not a server round-trip.
 */
export function CopyButton({
  value,
  label,
  size = 'xs',
  variant = 'ghost',
  withText,
}: {
  value: string;
  label: string;
  size?: ButtonProps['size'];
  variant?: ButtonProps['variant'];
  withText?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setFailed(false);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access can be denied; say so rather than showing success.
      setFailed(true);
      window.setTimeout(() => setFailed(false), 2600);
    }
  };

  return (
    <Tooltip label={failed ? 'Clipboard permission denied' : copied ? 'Copied' : label}>
      <Button
        variant={variant}
        size={size}
        iconOnly={!withText}
        className="copy-btn"
        onClick={(event) => {
          event.stopPropagation();
          void copy();
        }}
        icon={
          copied ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />
        }
        aria-label={label}
      >
        {withText ? (copied ? 'Copied' : withText) : null}
      </Button>
    </Tooltip>
  );
}
