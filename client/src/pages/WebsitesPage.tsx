import {
  Badge,
  Button,
  Group,
  MultiSelect,
  Pagination,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconFilterOff, IconPlus, IconSearch, IconWorldPlus } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import {
  ENVIRONMENT_LABELS,
  ENVIRONMENT_TYPES,
  LIFECYCLE_LABELS,
  LIFECYCLE_STATUSES,
  formatResponseTime,
  type WebsiteSummaryDto,
} from '@wt/shared';
import { RelativeTime } from '../components/DateTime';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { Empty, ErrorState, LoadingState } from '../components/States';
import { useTags, useToggleMonitor, useWebsites } from '../hooks/queries';
import { errorMessage } from '../services/api';
import { statusMeta } from '../utils/status';

const PAGE_SIZE = 20;
const FILTER_KEYS = ['q', 'health', 'environment', 'lifecycle', 'tags', 'monitoring', 'wakeUp'] as const;

const HEALTH_OPTIONS = (['UP', 'DEGRADED', 'DOWN', 'UNKNOWN', 'PAUSED'] as const).map((s) => ({ value: s, label: statusMeta(s).label }));
const SORT_OPTIONS = [
  { value: 'name', label: 'Name (A–Z)' },
  { value: '-name', label: 'Name (Z–A)' },
  { value: 'status', label: 'Status (worst first)' },
  { value: 'responseTime', label: 'Response time' },
  { value: '-updatedAt', label: 'Recently updated' },
];
const TOGGLE_OPTIONS = [
  { value: 'enabled', label: 'Enabled' },
  { value: 'disabled', label: 'Disabled' },
];

function MonitorSwitch({ monitorId, checked, label }: { monitorId: string | null; checked: boolean; label: string }) {
  const toggle = useToggleMonitor();
  return (
    <Tooltip label={monitorId ? `${label} for the primary environment` : 'No environment'} openDelay={400}>
      <Switch
        size="sm"
        checked={checked}
        disabled={!monitorId || toggle.isPending}
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          const enabled = e.currentTarget.checked;
          if (!monitorId) return;
          toggle.mutate(
            { id: monitorId, enabled },
            {
              onSuccess: () => notifications.show({ message: `${label} ${enabled ? 'enabled' : 'disabled'}`, color: 'green' }),
              onError: (err) => notifications.show({ title: `Could not change ${label.toLowerCase()}`, message: errorMessage(err), color: 'red' }),
            },
          );
        }}
      />
    </Tooltip>
  );
}

function WebsiteRow({ site }: { site: WebsiteSummaryDto }) {
  const navigate = useNavigate();
  const env = site.primaryEnvironment;
  const open = () => navigate(`/websites/${site.id}`);
  return (
    <Table.Tr className="clickable-row" tabIndex={0} onClick={open} onKeyDown={(e) => e.key === 'Enter' && open()}>
      <Table.Td maw={280}>
        <Text fw={600} size="sm" truncate>
          {site.name}
        </Text>
        <Text size="xs" c="dimmed" truncate>
          {env?.websiteUrl ?? LIFECYCLE_LABELS[site.lifecycleStatus]}
        </Text>
        {site.tags.length > 0 && (
          <Group gap={4} mt={4}>
            {site.tags.slice(0, 4).map((t) => (
              <Badge key={t} size="xs" variant="light" color="gray" tt="none">
                {t}
              </Badge>
            ))}
            {site.tags.length > 4 && (
              <Text size="xs" c="dimmed">
                +{site.tags.length - 4}
              </Text>
            )}
          </Group>
        )}
      </Table.Td>
      <Table.Td>
        <Group gap={4}>
          {site.environmentTypes.map((t, i) => (
            <Badge key={`${t}-${i}`} size="sm" variant={t === 'PRODUCTION' ? 'light' : 'outline'} color={t === 'PRODUCTION' ? 'blue' : 'gray'} tt="none">
              {ENVIRONMENT_LABELS[t]}
            </Badge>
          ))}
        </Group>
      </Table.Td>
      <Table.Td>
        <StatusBadge status={site.healthStatus} size="sm" />
      </Table.Td>
      <Table.Td ta="right" className="tabular-nums">
        {site.monitoringEnabled ? formatResponseTime(site.lastResponseMs) : '—'}
      </Table.Td>
      <Table.Td>
        <Text size="sm">{env?.backendHostingProvider ?? env?.frontendHostingProvider ?? '—'}</Text>
        {env?.frontendHostingProvider && env.backendHostingProvider && env.frontendHostingProvider !== env.backendHostingProvider && (
          <Text size="xs" c="dimmed">
            Frontend: {env.frontendHostingProvider}
          </Text>
        )}
      </Table.Td>
      <Table.Td>
        <Text size="sm">{env?.databaseProvider ?? '—'}</Text>
      </Table.Td>
      <Table.Td>
        <MonitorSwitch monitorId={site.primaryHealthMonitorId} checked={site.monitoringEnabled} label="Health monitoring" />
      </Table.Td>
      <Table.Td>
        <MonitorSwitch monitorId={site.primaryWakeUpMonitorId} checked={site.wakeUpEnabled} label="Wake-up" />
      </Table.Td>
      <Table.Td ta="right">
        <RelativeTime value={site.lastCheckedAt} size="sm" fallback="—" />
      </Table.Td>
    </Table.Tr>
  );
}

export default function WebsitesPage() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [debounced] = useDebouncedValue(search, 300);
  const tags = useTags();

  const set = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (!('page' in changes)) next.delete('page');
    setParams(next, { replace: true });
  };

  useEffect(() => {
    if ((params.get('q') ?? '') !== debounced) set({ q: debounced || null });
    // Only the debounced search text should drive this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const page = Number(params.get('page') ?? '1') || 1;
  const query = {
    ...Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) ?? undefined])),
    sort: params.get('sort') ?? 'name',
    page,
    pageSize: PAGE_SIZE,
  };
  const { data, isPending, error, refetch } = useWebsites(query);
  const hasFilters = FILTER_KEYS.some((k) => params.get(k));

  const clearFilters = () => {
    setSearch('');
    setParams(new URLSearchParams(params.get('sort') ? { sort: params.get('sort')! } : {}), { replace: true });
  };

  const addButton = (
    <Button component={Link} to="/websites/new" leftSection={<IconPlus size={16} />}>
      Add website
    </Button>
  );

  return (
    <>
      <PageHeader title="Websites" description="Everything you have deployed, where it runs and how it is monitored." actions={addButton} />

      <Paper withBorder radius="md" p="sm" mb="md">
        <Stack gap="sm">
          <TextInput
            placeholder="Search by name, URL, hosting or database provider, account…"
            leftSection={<IconSearch size={16} />}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            aria-label="Search websites"
          />
          <SimpleGrid cols={{ base: 2, sm: 3, lg: 7 }} spacing="xs">
            <Select placeholder="Health" data={HEALTH_OPTIONS} value={params.get('health')} onChange={(v) => set({ health: v })} clearable aria-label="Filter by health" />
            <Select
              placeholder="Environment"
              data={ENVIRONMENT_TYPES.map((t) => ({ value: t, label: ENVIRONMENT_LABELS[t] }))}
              value={params.get('environment')}
              onChange={(v) => set({ environment: v })}
              clearable
              aria-label="Filter by environment"
            />
            <Select
              placeholder="Project status"
              data={LIFECYCLE_STATUSES.map((s) => ({ value: s, label: LIFECYCLE_LABELS[s] }))}
              value={params.get('lifecycle')}
              onChange={(v) => set({ lifecycle: v })}
              clearable
              aria-label="Filter by project status"
            />
            <Select placeholder="Monitoring" data={TOGGLE_OPTIONS} value={params.get('monitoring')} onChange={(v) => set({ monitoring: v })} clearable aria-label="Filter by monitoring" />
            <Select placeholder="Wake-up" data={TOGGLE_OPTIONS} value={params.get('wakeUp')} onChange={(v) => set({ wakeUp: v })} clearable aria-label="Filter by wake-up" />
            <MultiSelect
              placeholder={params.get('tags') ? undefined : 'Tags'}
              data={tags.data ?? []}
              value={params.get('tags')?.split(',').filter(Boolean) ?? []}
              onChange={(v) => set({ tags: v.join(',') || null })}
              searchable
              clearable
              aria-label="Filter by tags"
            />
            <Select data={SORT_OPTIONS} value={params.get('sort') ?? 'name'} onChange={(v) => set({ sort: v })} allowDeselect={false} aria-label="Sort" />
          </SimpleGrid>
        </Stack>
      </Paper>

      {isPending ? (
        <LoadingState rows={6} />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : data.total === 0 && !hasFilters ? (
        <Empty
          icon={<IconWorldPlus size={28} />}
          title="No websites yet"
          description="Add your first website to track its hosting, database and monitoring in one place."
          action={<Group mt="md" justify="center">{addButton}</Group>}
        />
      ) : data.total === 0 ? (
        <Empty
          icon={<IconFilterOff size={28} />}
          title="No websites match these filters"
          action={
            <Button mt="md" variant="default" onClick={clearFilters}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <Paper withBorder radius="md">
          <Table.ScrollContainer minWidth={1080}>
            <Table highlightOnHover verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Website</Table.Th>
                  <Table.Th>Environments</Table.Th>
                  <Table.Th>Health</Table.Th>
                  <Table.Th ta="right">Response</Table.Th>
                  <Table.Th>Hosting</Table.Th>
                  <Table.Th>Database</Table.Th>
                  <Table.Th>Monitoring</Table.Th>
                  <Table.Th>Wake-up</Table.Th>
                  <Table.Th ta="right">Last check</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {data.items.map((site) => (
                  <WebsiteRow key={site.id} site={site} />
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          <Group justify="space-between" p="sm">
            <Text size="sm" c="dimmed">
              {data.total} website{data.total === 1 ? '' : 's'}
            </Text>
            {data.total > PAGE_SIZE && (
              <Pagination total={Math.ceil(data.total / PAGE_SIZE)} value={page} onChange={(p) => set({ page: String(p) })} size="sm" />
            )}
          </Group>
        </Paper>
      )}
    </>
  );
}
