import { Button, Group, Paper, Select, SegmentedControl, Stack, Text } from '@mantine/core';
import { IconChevronLeft, IconChevronRight, IconFileOff } from '@tabler/icons-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { LogTable } from '../components/LogTable';
import { PageHeader } from '../components/PageHeader';
import { RangePicker, presetRange, type TimeRange } from '../components/RangePicker';
import { Empty, ErrorState, LoadingState } from '../components/States';
import { useLogs, useWebsiteOptions } from '../hooks/queries';

export default function LogsPage() {
  const [params] = useSearchParams();
  const websites = useWebsiteOptions();
  const [websiteId, setWebsiteId] = useState<string | null>(params.get('websiteId'));
  const [type, setType] = useState<string>(params.get('type') ?? 'all');
  const [result, setResult] = useState<string | null>(null);
  const [range, setRange] = useState<TimeRange>(() => presetRange('all'));
  const [limit, setLimit] = useState('25');
  // Keyset pagination: a stack of cursors for the pages visited so far.
  const [cursors, setCursors] = useState<string[]>([]);

  const resetPaging = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setCursors([]);
  };

  const query = {
    websiteId,
    type: type === 'all' ? undefined : type,
    result,
    from: range.from,
    to: range.to,
    limit,
    cursor: cursors.at(-1),
  };
  const { data, isPending, error, refetch, isFetching } = useLogs(query);
  const page = cursors.length + 1;

  return (
    <Stack gap="md">
      <PageHeader title="Logs" description="Every health check and wake-up request, newest first." />

      <Paper withBorder radius="md" p="sm">
        <Group gap="sm" wrap="wrap">
          <Select
            placeholder="All websites"
            data={websites.data ?? []}
            value={websiteId}
            onChange={resetPaging(setWebsiteId)}
            searchable
            clearable
            w={{ base: '100%', sm: 240 }}
            aria-label="Website"
          />
          <SegmentedControl
            value={type}
            onChange={resetPaging(setType)}
            data={[
              { value: 'all', label: 'All' },
              { value: 'HEALTH_CHECK', label: 'Health checks' },
              { value: 'WAKE_UP', label: 'Wake-ups' },
            ]}
            aria-label="Type"
          />
          <Select
            placeholder="All results"
            data={[
              { value: 'success', label: 'Successful' },
              { value: 'failure', label: 'Failed' },
            ]}
            value={result}
            onChange={resetPaging(setResult)}
            clearable
            w={{ base: '100%', sm: 150 }}
            aria-label="Result"
          />
          <RangePicker value={range} onChange={resetPaging(setRange)} allowAll />
        </Group>
      </Paper>

      {isPending ? (
        <LoadingState rows={8} />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : data.items.length === 0 && page === 1 ? (
        <Empty icon={<IconFileOff size={28} />} title="No logs found" description="Nothing matches these filters yet." />
      ) : (
        <Paper withBorder radius="md" style={{ opacity: isFetching ? 0.7 : 1, transition: 'opacity 120ms' }}>
          <LogTable logs={data.items} />
          <Group justify="space-between" p="sm" gap="xs">
            <Group gap="xs">
              <Text size="sm" c="dimmed">
                Page {page}
              </Text>
              <Select
                size="xs"
                w={110}
                data={['25', '50', '100'].map((v) => ({ value: v, label: `${v} / page` }))}
                value={limit}
                onChange={(v) => v && resetPaging(setLimit)(v)}
                allowDeselect={false}
                aria-label="Rows per page"
              />
            </Group>
            <Group gap="xs">
              <Button
                variant="default"
                size="xs"
                leftSection={<IconChevronLeft size={14} />}
                disabled={page === 1}
                onClick={() => setCursors((c) => c.slice(0, -1))}
              >
                Newer
              </Button>
              <Button
                variant="default"
                size="xs"
                rightSection={<IconChevronRight size={14} />}
                disabled={!data.nextCursor}
                onClick={() => data.nextCursor && setCursors((c) => [...c, data.nextCursor!])}
              >
                Older
              </Button>
            </Group>
          </Group>
        </Paper>
      )}
    </Stack>
  );
}
