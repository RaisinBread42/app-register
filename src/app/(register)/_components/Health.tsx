import {Badge} from '@astryxdesign/core/Badge';
import {Tooltip} from '@astryxdesign/core/Tooltip';
import {HEALTH_STATUS, type HealthStatus} from '@/lib/constants';
import type {DimensionHealth, Health} from '@/lib/ui/api-client';
import {HEALTH_STATUS_LABEL, HEALTH_STATUS_VARIANT, NOTHING_TO_CHECK, NOT_SET, type StatusVariant} from '@/lib/ui/copy';
import {PendingPill} from './AppIdentity';

/** Text colour of a status, for the big score number. */
export const STATUS_TEXT_COLOR: Record<StatusVariant, string> = {
  green: 'var(--color-text-green)',
  yellow: 'var(--color-text-yellow)',
  red: 'var(--color-text-red)',
  neutral: 'var(--color-text-secondary)',
};

/** The grey "—" pill for a check with nothing recorded to look at. */
function NothingToCheckPill() {
  return (
    <Tooltip content={NOTHING_TO_CHECK}>
      <Badge label={NOT_SET} variant="neutral" />
    </Tooltip>
  );
}

/** The prototype's score pill: the number on green, amber or red; a grey "—" when there is no score. */
export function ScorePill({health}: {health: Health}) {
  if (health.score === null) {
    return <NothingToCheckPill />;
  }
  return <Badge label={String(health.score)} variant={HEALTH_STATUS_VARIANT[health.status]} />;
}

/** The prototype's check pill: "✓ OK", "! Attention", "! Critical", or a grey "—". */
export function CheckPill({status}: {status: HealthStatus}) {
  if (status === HEALTH_STATUS.na) {
    return <NothingToCheckPill />;
  }
  return <Badge label={HEALTH_STATUS_LABEL[status]} variant={HEALTH_STATUS_VARIANT[status]} />;
}

/** One dimension's pill; a dimension that is not monitored yet keeps the coming-soon pill. */
export function DimensionPill({dimension}: {dimension: DimensionHealth | null}) {
  return dimension ? <CheckPill status={dimension.status} /> : <PendingPill />;
}
