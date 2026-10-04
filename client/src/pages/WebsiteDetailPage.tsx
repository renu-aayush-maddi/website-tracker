import { Anchor, Badge, Button, Grid, Group, Menu, SegmentedControl, Stack, Text } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import {
  IconBrandGit,
  IconChevronDown,
  IconDatabase,
  IconEdit,
  IconInfoCircle,
  IconServer,
  IconTrash,
} from '@tabler/icons-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  ENVIRONMENT_LABELS,
  LIFECYCLE_LABELS,
  environmentDisplayName,
  providerLabel,
  type EnvironmentDto,
  type MonitorType,
  type WebsiteDto,
} from '@wt/shared';
import { ResponseTimeChart } from '../components/Charts';
import { ExternalLink } from '../components/ExternalLink';
import { KeyValueList } from '../components/KeyValueList';
import { LogTable } from '../components/LogTable';
import { MonitorPanel } from '../components/MonitorPanel';
import { PageHeader } from '../components/PageHeader';
import { SectionCard } from '../components/SectionCard';
import { StatusBadge } from '../components/StatusBadge';
import { ErrorState, LoadingState } from '../components/States';
import { usePreferences } from '../context/PreferencesContext';
import { useDeleteWebsite, useLogs, useTimeseries, useWebsite } from '../hooks/queries';
import { ApiError, errorMessage } from '../services/api';

const DAY_MS = 24 * 60 * 60 * 1000;

function HostingCard({ env }: { env: EnvironmentDto }) {
  return (
    <SectionCard title="Hosting" icon={<IconServer size={20} />}>
      <KeyValueList
        items={[
          { label: 'Website URL', value: <ExternalLink href={env.websiteUrl} /> },
          { label: 'Backend URL', value: <ExternalLink href={env.backendUrl} /> },
          { label: 'Frontend provider', value: providerLabel('hosting', env.frontendHosting.provider, env.frontendHosting.customProvider) },
          { label: 'Frontend deployment', value: env.frontendHosting.url ? <ExternalLink href={env.frontendHosting.url} /> : null },
          { label: 'Backend provider', value: providerLabel('hosting', env.backendHosting.provider, env.backendHosting.customProvider) },
          { label: 'Backend deployment', value: env.backendHosting.url ? <ExternalLink href={env.backendHosting.url} /> : null },
          { label: 'Backend region', value: env.backendHosting.region, hidden: !env.backendHosting.region },
          { label: 'Deployed branch', value: env.branch },
        ]}
      />
    </SectionCard>
  );
}

function DatabaseCard({ env }: { env: EnvironmentDto }) {
  const db = env.database;
  return (
    <SectionCard title="Database" icon={<IconDatabase size={20} />}>
      <KeyValueList
        items={[
          { label: 'Provider', value: providerLabel('database', db.provider, db.customProvider) },
          { label: 'Database name', value: db.databaseName },
          { label: 'Project', value: db.projectName },
          { label: 'Cluster / instance', value: db.cluster, hidden: !db.cluster },
          { label: 'Region', value: db.region, hidden: !db.region },
          {
            label: 'Owner account',
            value:
              db.accountIdentifier || db.accountProvider ? (
                <>
                  {db.accountIdentifier ?? '—'}
                  {db.accountProvider && (
                    <Text span c="dimmed" size="sm">
                      {' '}
                      via {providerLabel('account', db.accountProvider)}
                    </Text>
                  )}
                </>
              ) : null,
          },
          { label: 'Dashboard', value: db.dashboardUrl ? <ExternalLink href={db.dashboardUrl} /> : null },
          { label: 'Notes', value: db.notes ? <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>{db.notes}</Text> : null, hidden: !db.notes },
        ]}
      />
    </SectionCard>
  );
}

function OverviewCards({ site }: { site: WebsiteDto }) {
  const { fmt } = usePreferences();
  return (
    <Grid gap="md">
      <Grid.Col span={{ base: 12, md: 7 }}>
        <SectionCard title="Overview" icon={<IconInfoCircle size={20} />}>
          <KeyValueList
            items={[
              { label: 'Description', value: site.description ? <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>{site.description}</Text> : null },
              { label: 'Project status', value: LIFECYCLE_LABELS[site.lifecycleStatus] },
              {
                label: 'Environments',
                value: site.environments.map((e) => environmentDisplayName(e)).join(', '),
              },
              {
                label: 'Tags',
                value: site.tags.length ? (
                  <Group gap={4}>
                    {site.tags.map((t) => (
                      <Badge key={t} variant="light" color="gray" tt="none" component={Link} to={`/websites?tags=${encodeURIComponent(t)}`} style={{ cursor: 'pointer' }}>
                        {t}
                      </Badge>
                    ))}
                  </Group>
                ) : null,
              },
              { label: 'Notes', value: site.notes ? <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>{site.notes}</Text> : null },
              { label: 'Added', value: fmt.dateTime(site.createdAt) },
              { label: 'Last updated', value: fmt.dateTime(site.updatedAt) },
            ]}
          />
        </SectionCard>
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 5 }}>
        <SectionCard title="Repository" icon={<IconBrandGit size={20} />}>
          <KeyValueList
            items={[
              { label: 'Provider', value: providerLabel('repository', site.repository.provider, site.repository.customProvider) },
              { label: 'Repository', value: site.repository.url ? <ExternalLink href={site.repository.url} /> : null },
              { label: 'Default branch', value: site.repository.defaultBranch },
            ]}
          />
        </SectionCard>
      </Grid.Col>
    </Grid>
  );
}

function History({ env }: { env: EnvironmentDto }) {
  const [type, setType] = useState<MonitorType>('HEALTH_CHECK');
  const [since] = useState(() => new Date(Date.now() - DAY_MS).toISOString());
  const monitor = type === 'HEALTH_CHECK' ? env.healthCheck : env.wakeUp;
  const series = useTimeseries({ monitorId: monitor.id, type, from: since });
  const logs = useLogs({ monitorId: monitor.id, limit: 10 });

  return (
    <SectionCard
      title="History"
      description="Last 24 hours"
      actions={
        <SegmentedControl
          size="xs"
          value={type}
          onChange={(v) => setType(v as MonitorType)}
          data={[
            { value: 'HEALTH_CHECK', label: 'Health checks' },
            { value: 'WAKE_UP', label: 'Wake-ups' },
          ]}
        />
      }
    >
      <Stack gap="md">
        <div>
          <Text size="sm" fw={500} mb={4}>
            Response time
          </Text>
          {series.data ? <ResponseTimeChart series={series.data} height={220} /> : series.error ? <ErrorState error={series.error} /> : <LoadingState rows={1} />}
        </div>
        {logs.data && logs.data.items.length > 0 ? (
          <>
            <LogTable logs={logs.data.items} showWebsite={false} />
            <Anchor component={Link} to={`/logs?websiteId=${env.healthCheck.websiteId}&type=${type}`} size="sm">
              View all {type === 'HEALTH_CHECK' ? 'health check' : 'wake-up'} logs
            </Anchor>
          </>
        ) : (
          logs.data && (
            <Text size="sm" c="dimmed">
              No {type === 'HEALTH_CHECK' ? 'health checks' : 'wake-ups'} recorded yet.
            </Text>
          )
        )}
      </Stack>
    </SectionCard>
  );
}

export default function WebsiteDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: site, isPending, error, refetch } = useWebsite(id);
  const remove = useDeleteWebsite();
  const [envId, setEnvId] = useState<string | null>(null);

  if (isPending) return <LoadingState rows={6} />;
  if (error) {
    if (error instanceof ApiError && error.status === 404) {
      return <ErrorState error={new Error('This website does not exist or was deleted.')} />;
    }
    return <ErrorState error={error} onRetry={() => void refetch()} />;
  }

  const env = site.environments.find((e) => e.id === envId) ?? site.environments.find((e) => e.type === 'PRODUCTION') ?? site.environments[0]!;

  const confirmDelete = () =>
    modals.openConfirmModal({
      title: `Delete ${site.name}?`,
      children: (
        <Text size="sm">
          This permanently removes the website, its environments, monitors and all monitoring history. This cannot be undone.
        </Text>
      ),
      labels: { confirm: 'Delete website', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () =>
        remove.mutate(site.id, {
          onSuccess: () => {
            notifications.show({ message: `${site.name} deleted`, color: 'green' });
            navigate('/websites');
          },
          onError: (err) => notifications.show({ title: 'Could not delete', message: errorMessage(err), color: 'red' }),
        }),
    });

  return (
    <Stack gap="md">
      <PageHeader
        title={
          <Group gap="sm" component="span">
            {site.name}
            <StatusBadge status={site.healthStatus} />
          </Group>
        }
        description={
          <>
            {LIFECYCLE_LABELS[site.lifecycleStatus]}
            {env.websiteUrl && (
              <>
                {' · '}
                <ExternalLink href={env.websiteUrl} />
              </>
            )}
          </>
        }
        actions={
          <>
            <Button component={Link} to={`/websites/${site.id}/edit`} variant="default" leftSection={<IconEdit size={16} />}>
              Edit
            </Button>
            <Menu position="bottom-end">
              <Menu.Target>
                <Button variant="default" px="xs" aria-label="More actions">
                  <IconChevronDown size={16} />
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item color="red" leftSection={<IconTrash size={16} />} onClick={confirmDelete}>
                  Delete website
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </>
        }
      />

      <OverviewCards site={site} />

      {site.environments.length > 1 && (
        <Group gap="sm">
          <Text size="sm" fw={500}>
            Environment
          </Text>
          <SegmentedControl
            value={env.id}
            onChange={setEnvId}
            data={site.environments.map((e) => ({
              value: e.id,
              label: (
                <Group gap={6} wrap="nowrap" justify="center">
                  {environmentDisplayName(e)}
                  {e.healthCheck.enabled && <StatusBadge status={e.healthCheck.state.status} size="xs" />}
                </Group>
              ),
            }))}
          />
        </Group>
      )}

      <Text size="xs" c="dimmed" mt={-6}>
        Showing {ENVIRONMENT_LABELS[env.type].toLowerCase()} environment{env.label ? ` “${env.label}”` : ''}
      </Text>

      <Grid gap="md">
        <Grid.Col span={{ base: 12, md: 6 }}>
          <HostingCard env={env} />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <DatabaseCard env={env} />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <MonitorPanel monitor={env.healthCheck} />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <MonitorPanel monitor={env.wakeUp} />
        </Grid.Col>
      </Grid>

      <History key={env.id} env={env} />
    </Stack>
  );
}
