import { Alert, Button, Group, Stack, Switch, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconActivityHeartbeat, IconBolt, IconInfoCircle, IconPlayerPlay } from '@tabler/icons-react';
import { useState } from 'react';
import {
  PROBE_ERROR_LABELS,
  formatInterval,
  formatPercent,
  formatResponseTime,
  isRenderHostname,
  keepsRenderServiceAwake,
  type MonitorDto,
} from '@wt/shared';
import { useRunMonitor, useStatsSummary, useToggleMonitor } from '../hooks/queries';
import { useNow } from '../hooks/useNow';
import { errorMessage } from '../services/api';
import { degradedReasonText } from '../utils/status';
import { RelativeTime } from './DateTime';
import { ExternalLink } from './ExternalLink';
import { KeyValueList } from './KeyValueList';
import { SectionCard } from './SectionCard';
import { StatusBadge } from './StatusBadge';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function RenderHoursWarning() {
  return (
    <Alert variant="light" color="yellow" icon={<IconInfoCircle size={18} />} p="xs">
      <Text size="xs">
        This interval keeps a Render free service running all month (~744 h). Render gives each workspace 750 free hours, so a
        second always-on service will exhaust them and get suspended until the month resets.
      </Text>
    </Alert>
  );
}

export function MonitorPanel({ monitor }: { monitor: MonitorDto }) {
  const isHealth = monitor.type === 'HEALTH_CHECK';
  const toggle = useToggleMonitor();
  const run = useRunMonitor();
  const [since] = useState(() => new Date(Date.now() - WEEK_MS).toISOString());
  const stats = useStatsSummary({ monitorId: monitor.id, type: monitor.type, from: since }, Boolean(monitor.state.lastRunAt));
  const s = monitor.state;
  const now = useNow();

  const onToggle = (enabled: boolean) =>
    toggle.mutate(
      { id: monitor.id, enabled },
      {
        onSuccess: () =>
          notifications.show({ message: `${isHealth ? 'Health monitoring' : 'Wake-up'} ${enabled ? 'enabled' : 'disabled'}`, color: 'green' }),
        onError: (err) => notifications.show({ title: 'Could not update', message: errorMessage(err), color: 'red' }),
      },
    );

  const onRun = () =>
    run.mutate(monitor.id, {
      onSuccess: ({ log }) => {
        const result = log.statusCode !== null ? `HTTP ${log.statusCode} in ${formatResponseTime(log.responseMs)}` : PROBE_ERROR_LABELS[log.errorCode ?? 'UNKNOWN'];
        notifications.show({
          title: log.success ? (isHealth ? 'Health check passed' : 'Wake-up delivered') : isHealth ? 'Health check failed' : 'Wake-up failed',
          message: log.success ? result : `${result}${log.errorMessage && log.errorCode !== 'HTTP_STATUS' ? ` — ${log.errorMessage}` : ''}`,
          color: log.success ? 'green' : 'red',
        });
      },
      onError: (err) => notifications.show({ title: 'Request could not be run', message: errorMessage(err), color: 'red' }),
    });

  const lastResult =
    s.lastRunAt === null
      ? null
      : s.lastStatusCode !== null
        ? `HTTP ${s.lastStatusCode} · ${formatResponseTime(s.lastResponseMs)}`
        : s.lastErrorCode
          ? PROBE_ERROR_LABELS[s.lastErrorCode]
          : null;

  return (
    <SectionCard
      title={isHealth ? 'Health monitoring' : 'Wake-up'}
      description={isHealth ? 'Is this website healthy?' : 'Sends periodic traffic to keep the service awake'}
      icon={isHealth ? <IconActivityHeartbeat size={20} /> : <IconBolt size={20} />}
      actions={
        <Switch
          checked={monitor.enabled}
          onChange={(e) => onToggle(e.currentTarget.checked)}
          disabled={toggle.isPending || (!monitor.enabled && !monitor.url)}
          label={monitor.enabled ? 'On' : 'Off'}
          aria-label={`${isHealth ? 'Health monitoring' : 'Wake-up'} enabled`}
        />
      }
    >
      <Stack gap="sm">
        <Group gap="xs">
          <StatusBadge status={s.status} type={monitor.type} />
          {degradedReasonText(s.degradedReason, s.consecutiveFailures, monitor.failureThreshold) && (
            <Text size="xs" c="dimmed">
              {degradedReasonText(s.degradedReason, s.consecutiveFailures, monitor.failureThreshold)}
            </Text>
          )}
        </Group>

        <KeyValueList
          items={[
            { label: 'URL', value: monitor.url ? <ExternalLink href={monitor.url} /> : 'Not configured' },
            { label: 'Request', value: `${monitor.method} · ${formatInterval(monitor.intervalSeconds).toLowerCase()} · ${monitor.timeoutMs / 1000}s timeout` },
            {
              label: isHealth ? 'Down after' : 'Alert after',
              value: `${monitor.failureThreshold} consecutive failure${monitor.failureThreshold === 1 ? '' : 's'}`,
            },
            {
              label: 'Degraded above',
              value: monitor.degradedThresholdMs ? formatResponseTime(monitor.degradedThresholdMs) : null,
              hidden: !isHealth,
            },
            {
              label: 'Accepted status',
              value: monitor.expectedStatus === '2xx-3xx' ? '200–399' : '200–299',
              hidden: !isHealth,
            },
            { label: isHealth ? 'Last check' : 'Last wake-up', value: <RelativeTime value={s.lastRunAt} /> },
            { label: 'Last result', value: lastResult },
            { label: 'Last error', value: s.lastErrorMessage, hidden: !s.lastErrorMessage || s.consecutiveFailures === 0 },
            { label: isHealth ? 'Next check' : 'Next wake-up', value: !monitor.enabled ? (
                'Disabled'
              ) : monitor.nextRunAt && new Date(monitor.nextRunAt).getTime() <= now ? (
                'Due now'
              ) : (
                <RelativeTime value={monitor.nextRunAt} fallback="soon" />
              ),
            },
            {
              label: 'Avg response (7d)',
              value: stats.data ? formatResponseTime(stats.data.avgResponseMs) : null,
            },
            {
              label: isHealth ? 'Uptime (7d)' : 'Delivered (7d)',
              value: stats.data && stats.data.total > 0 ? `${formatPercent(stats.data.successRate)} of ${stats.data.total} ${stats.data.total === 1 ? 'check' : 'checks'}` : null,
            },
          ]}
        />

        {!isHealth && monitor.enabled && isRenderHostname(monitor.url) && keepsRenderServiceAwake(monitor.intervalSeconds) && (
          <RenderHoursWarning />
        )}

        <Group justify="space-between" gap="xs">
          {!isHealth ? (
            <Text size="xs" c="dimmed" maw={360}>
              A delivered wake-up only means the server answered — it does not mean the site is healthy.
            </Text>
          ) : (
            <span />
          )}
          <Button
            variant="default"
            size="xs"
            leftSection={<IconPlayerPlay size={14} />}
            onClick={onRun}
            loading={run.isPending}
            disabled={!monitor.url}
          >
            {isHealth ? 'Run health check now' : 'Wake up now'}
          </Button>
        </Group>
      </Stack>
    </SectionCard>
  );
}
