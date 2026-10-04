import { Alert, Anchor, Button, Grid, Group, Paper, SimpleGrid, Stack, Table, Text } from '@mantine/core';
import { IconAlertTriangle, IconCircleCheckFilled, IconCircleXFilled, IconClockPause, IconPlus, IconWorldPlus } from '@tabler/icons-react';
import { Link, useNavigate } from 'react-router';
import { MONITOR_TYPE_LABELS, PROBE_ERROR_LABELS, formatPercent, formatResponseTime, type DashboardDto } from '@wt/shared';
import { RelativeTime } from '../components/DateTime';
import { PageHeader } from '../components/PageHeader';
import { SectionCard } from '../components/SectionCard';
import { StatCard } from '../components/StatCard';
import { StatusBadge, StatusIcon } from '../components/StatusBadge';
import { Empty, ErrorState, LoadingState } from '../components/States';
import { useDashboard } from '../hooks/queries';
import { STATUS_COLORS, degradedReasonShort } from '../utils/status';

function SchedulerAlert({ scheduler }: { scheduler: DashboardDto['scheduler'] }) {
  return (
    <Alert color="red" variant="light" icon={<IconClockPause size={18} />} title="Scheduled checks are not running">
      <Text size="sm">
        {scheduler.lastTickAt ? (
          <>
            The scheduler last ran <RelativeTime value={scheduler.lastTickAt} fw={600} /> (via {scheduler.lastTickSource}).
          </>
        ) : (
          'The scheduler has never run.'
        )}{' '}
        Check that your external cron (cron-job.org / GitHub Actions) is calling the tick endpoint with the right secret. Statuses below
        may be out of date.
      </Text>
    </Alert>
  );
}

function WebsiteHealthTable({ rows }: { rows: DashboardDto['websites'] }) {
  const navigate = useNavigate();
  return (
    <Table.ScrollContainer minWidth={520}>
      <Table highlightOnHover verticalSpacing="sm" className="tabular-nums">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Website</Table.Th>
            <Table.Th>Status</Table.Th>
            <Table.Th ta="right">Response</Table.Th>
            <Table.Th ta="right">Last check</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((row) => (
            <Table.Tr
              key={row.id}
              className="clickable-row"
              tabIndex={0}
              onClick={() => navigate(`/websites/${row.id}`)}
              onKeyDown={(e) => e.key === 'Enter' && navigate(`/websites/${row.id}`)}
            >
              <Table.Td>
                <Text size="sm" fw={600}>
                  {row.name}
                </Text>
                {row.environmentLabel && (
                  <Text size="xs" c="dimmed">
                    {row.environmentLabel}
                  </Text>
                )}
              </Table.Td>
              <Table.Td>
                <StatusBadge status={row.status} size="sm" detail={degradedReasonShort(row.degradedReason)} />
              </Table.Td>
              <Table.Td ta="right">{row.status === 'PAUSED' ? '—' : formatResponseTime(row.lastResponseMs)}</Table.Td>
              <Table.Td ta="right">
                <RelativeTime value={row.lastCheckedAt} size="sm" fallback="—" />
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

function RecentActivity({ items }: { items: DashboardDto['recentActivity'] }) {
  if (items.length === 0) {
    return (
      <Text c="dimmed" size="sm">
        No checks yet. Enable health monitoring on a website, or use "Run health check now".
      </Text>
    );
  }
  return (
    <Stack gap={10}>
      {items.map((log) => {
        const Icon = log.success ? IconCircleCheckFilled : IconCircleXFilled;
        return (
          <Group key={log.id} gap="sm" wrap="nowrap" align="flex-start">
            <Icon size={18} color={log.success ? STATUS_COLORS.good : STATUS_COLORS.critical} aria-label={log.success ? 'Success' : 'Failed'} style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <Text size="sm" truncate>
                {log.websiteName ? (
                  <Anchor component={Link} to={`/websites/${log.websiteId}`} inherit fw={600}>
                    {log.websiteName}
                  </Anchor>
                ) : (
                  'Deleted website'
                )}{' '}
                {MONITOR_TYPE_LABELS[log.type].toLowerCase()}
              </Text>
              <Text size="xs" c="dimmed" truncate>
                {log.statusCode !== null ? `HTTP ${log.statusCode} · ${formatResponseTime(log.responseMs)}` : PROBE_ERROR_LABELS[log.errorCode ?? 'UNKNOWN']}
                {log.trigger === 'MANUAL' ? ' · manual' : ''}
              </Text>
            </div>
            <RelativeTime value={log.startedAt} size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }} />
          </Group>
        );
      })}
      <Anchor component={Link} to="/logs" size="sm">
        View all logs
      </Anchor>
    </Stack>
  );
}

function renderWarning(count: number): string {
  const subject = count === 1 ? 'One wake-up monitor keeps a Render free service' : `${count} wake-up monitors keep Render free services`;
  return `${subject} running continuously (~744 h/month each), and this tracker's own API runs continuously too. A Render workspace gets 750 free instance hours per month, so free services that share a workspace will be suspended before the month ends.`;
}

export default function DashboardPage() {
  const { data, isPending, error, refetch } = useDashboard();

  if (isPending) return <LoadingState rows={5} />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;

  const addButton = (
    <Button component={Link} to="/websites/new" leftSection={<IconPlus size={16} />}>
      Add website
    </Button>
  );

  if (data.counts.websites === 0) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <Empty
          icon={<IconWorldPlus size={28} />}
          title="No websites yet"
          description="Add a website to record where it is hosted, which database and account it uses, and to start monitoring it."
          action={<Group mt="md" justify="center">{addButton}</Group>}
        />
      </>
    );
  }

  const { counts, last24h } = data;
  return (
    <Stack gap="lg">
      <PageHeader
        title="Dashboard"
        description={`${counts.websites} website${counts.websites === 1 ? '' : 's'} · refreshes every 30 seconds`}
        actions={addButton}
      />

      {data.scheduler.stale && <SchedulerAlert scheduler={data.scheduler} />}
      {data.warnings.renderAlwaysOnWakeUps > 0 && (
        <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={18} />} title="Render free hours at risk">
          <Text size="sm">
            {renderWarning(data.warnings.renderAlwaysOnWakeUps)}
          </Text>
        </Alert>
      )}

      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
        <StatCard label="Websites" value={counts.websites} to="/websites" />
        <StatCard label="Healthy" value={counts.up} icon={<StatusIcon status="UP" size={18} />} to="/websites?health=UP" />
        <StatCard label="Degraded" value={counts.degraded} icon={<StatusIcon status="DEGRADED" size={18} />} to="/websites?health=DEGRADED" />
        <StatCard label="Down" value={counts.down} icon={<StatusIcon status="DOWN" size={18} />} to="/websites?health=DOWN" />
        <StatCard
          label="Monitoring"
          value={counts.monitoringEnabled}
          hint={counts.unknown > 0 ? `${counts.unknown} awaiting first check` : undefined}
          to="/websites?monitoring=enabled"
        />
        <StatCard label="Wake-up" value={counts.wakeUpEnabled} to="/websites?wakeUp=enabled" />
        <StatCard label="Uptime (24h)" value={formatPercent(last24h.successRate)} hint={`${last24h.checks.toLocaleString()} health checks`} to="/monitoring" />
        <StatCard label="Avg response (24h)" value={formatResponseTime(last24h.avgResponseMs)} to="/monitoring" />
      </SimpleGrid>

      <Grid gap="md">
        <Grid.Col span={{ base: 12, lg: 7 }}>
          <SectionCard title="Website health" description="Worst status across each website's environments">
            <WebsiteHealthTable rows={data.websites} />
          </SectionCard>
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 5 }}>
          <Paper withBorder radius="md" p="md" h="100%">
            <Text fw={600} mb="sm">
              Recent activity
            </Text>
            <RecentActivity items={data.recentActivity} />
          </Paper>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
