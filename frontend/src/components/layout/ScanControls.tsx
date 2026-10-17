import { RefreshCw } from 'lucide-react';
import { SCAN_LIMITS, type WorkspaceScan } from '../../hooks/use-workspace-scan';
import { Button } from '../ui/Button';
import { Select } from '../ui/inputs';
import { Tooltip } from '../ui/Tooltip';

/**
 * Depth and refresh controls for the pages built on a workspace scan.
 *
 * The request cost is shown because a deeper scan is not free: the API has no
 * aggregate endpoint, so each additional email costs two requests.
 */
export function ScanControls({
  limit,
  onLimitChange,
  scan,
  onRefresh,
  refreshing,
}: {
  limit: number;
  onLimitChange: (limit: number) => void;
  scan: WorkspaceScan | undefined;
  onRefresh: () => void;
  refreshing?: boolean;
}) {
  return (
    <div className="inline inline--sm">
      <Tooltip label="How many of the most recent emails to load with their analyses" wrap>
        <Select
          label="Scan depth"
          hideLabel
          value={String(limit)}
          onChange={(event) => onLimitChange(Number(event.target.value))}
          options={SCAN_LIMITS.map((value) => ({ value: String(value), label: `Scan ${value}` }))}
          style={{ width: 'auto' }}
        />
      </Tooltip>
      <Tooltip
        label={
          scan
            ? `${scan.requestCount} requests on the last scan${scan.failed ? `, ${scan.failed} email(s) unreadable` : ''}`
            : 'Reload emails and analyses'
        }
        wrap
      >
        <Button
          size="sm"
          iconOnly
          icon={<RefreshCw size={14} aria-hidden="true" />}
          onClick={onRefresh}
          loading={refreshing}
          aria-label="Refresh scan"
        />
      </Tooltip>
    </div>
  );
}
