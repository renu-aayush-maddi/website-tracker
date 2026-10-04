import { Badge, Tooltip, type MantineSize } from '@mantine/core';
import {
  IconAlertTriangleFilled,
  IconCircleCheckFilled,
  IconCircleXFilled,
  IconHelpCircleFilled,
  IconPlayerPauseFilled,
} from '@tabler/icons-react';
import type { HealthStatus, MonitorType } from '@wt/shared';
import { statusMeta, type StatusMeta } from '../utils/status';

const ICONS: Record<StatusMeta['icon'], typeof IconCircleCheckFilled> = {
  up: IconCircleCheckFilled,
  degraded: IconAlertTriangleFilled,
  down: IconCircleXFilled,
  unknown: IconHelpCircleFilled,
  paused: IconPlayerPauseFilled,
};

export function StatusIcon({ status, type, size = 16 }: { status: HealthStatus; type?: MonitorType; size?: number }) {
  const meta = statusMeta(status, type);
  const Icon = ICONS[meta.icon];
  return <Icon size={size} color={meta.color} aria-hidden style={{ flexShrink: 0 }} />;
}

/** Status is always icon + text label, never colour alone. */
export function StatusBadge({
  status,
  type,
  size = 'md',
  detail,
}: {
  status: HealthStatus;
  type?: MonitorType;
  size?: MantineSize;
  detail?: string | null;
}) {
  const meta = statusMeta(status, type);
  return (
    <Tooltip label={detail ?? meta.description} withArrow openDelay={300}>
      <Badge
        variant="default"
        size={size}
        radius="sm"
        tt="none"
        fw={600}
        leftSection={<StatusIcon status={status} type={type} size={size === 'xs' || size === 'sm' ? 12 : 14} />}
      >
        {meta.label}
      </Badge>
    </Tooltip>
  );
}
