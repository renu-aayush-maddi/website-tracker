import { Grid, Group, Paper, Select, SegmentedControl, SimpleGrid, Stack, Switch, Text } from '@mantine/core';
import { useState } from 'react';
import { formatPercent, formatResponseTime, type MonitorType } from '@wt/shared';
import { AvailabilityChart, ChartDataTable, ResponseTimeChart } from '../components/Charts';
import { PageHeader } from '../components/PageHeader';
import { RangePicker, presetRange, type TimeRange } from '../components/RangePicker';
import { SectionCard } from '../components/SectionCard';
import { StatCard } from '../components/StatCard';
import { ErrorState, LoadingState } from '../components/States';
import { useStatsSummary, useTimeseries, useWebsiteOptions } from '../hooks/queries';

export default function MonitoringPage() {
  const websites = useWebsiteOptions();
  const [websiteId, setWebsiteId] = useState<string | null>(null);
  const [type, setType] = useState<MonitorType>('HEALTH_CHECK');
  const [result, setResult] = useState<string | null>(null);
  const [range, setRange] = useState<TimeRange>(() => presetRange('7d'));
  const [showTable, setShowTable] = useState(false);

  const isHealth = type === 'HEALTH_CHECK';
  const params = { websiteId, type, result, from: range.from, to: range.to };
  const ready = range.preset !== 'custom' || Boolean(range.from);
  const summary = useStatsSummary(params, ready);
  const series = useTimeseries(params, ready);
  const s = summary.data;

  return (
    <Stack gap="md">
      <PageHeader title="Monitoring" description="Availability and response-time history across your websites." />

      <Paper withBorder radius="md" p="sm">
        <Group gap="sm" wrap="wrap">
          <Select
            placeholder="All websites"
            data={websites.data ?? []}
            value={websiteId}
            onChange={setWebsiteId}
            searchable
            clearable
            w={{ base: '100%', sm: 240 }}
            aria-label="Website"
          />
          <SegmentedControl
            value={type}
            onChange={(v) => setType(v as MonitorType)}
            data={[
              { value: 'HEALTH_CHECK', label: 'Health checks' },
              { value: 'WAKE_UP', label: 'Wake-ups' },
            ]}
            aria-label="Check type"
          />
          <Select
            placeholder="All results"
            data={[
              { value: 'success', label: 'Successful only' },
              { value: 'failure', label: 'Failed only' },
            ]}
            value={result}
            onChange={setResult}
            clearable
            w={{ base: '100%', sm: 170 }}
            aria-label="Result"
          />
          <RangePicker value={range} onChange={setRange} />
        </Group>
      </Paper>

      {summary.error ? (
        <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
      ) : !s ? (
        <LoadingState rows={3} />
      ) : (
        <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
          <StatCard label={isHealth ? 'Availability' : 'Delivered'} value={formatPercent(s.successRate)} />
          <StatCard label="Total checks" value={s.total.toLocaleString()} />
          <StatCard label="Successful" value={s.successes.toLocaleString()} />
          <StatCard label="Failed" value={s.failures.toLocaleString()} />
          <StatCard label="Avg response" value={formatResponseTime(s.avgResponseMs)} />
          <StatCard label="Min response" value={formatResponseTime(s.minResponseMs)} />
          <StatCard label="Max response" value={formatResponseTime(s.maxResponseMs)} />
          <StatCard label="p95 response" value={formatResponseTime(s.p95ResponseMs)} />
        </SimpleGrid>
      )}

      {series.error ? (
        <ErrorState error={series.error} onRetry={() => void series.refetch()} />
      ) : !series.data ? (
        <LoadingState rows={2} />
      ) : (
        <>
          <Grid gap="md">
            <Grid.Col span={{ base: 12, lg: 7 }}>
              <SectionCard title="Response time" description="Average and maximum per period">
                <ResponseTimeChart series={series.data} />
              </SectionCard>
            </Grid.Col>
            <Grid.Col span={{ base: 12, lg: 5 }}>
              <SectionCard title={isHealth ? 'Availability' : 'Wake-up delivery'} description="Share of successful checks per period">
                <AvailabilityChart series={series.data} height={260} />
              </SectionCard>
            </Grid.Col>
          </Grid>
          {series.data.points.length > 0 && (
            <Paper withBorder radius="md" p="md">
              <Switch label="Show chart data as a table" checked={showTable} onChange={(e) => setShowTable(e.currentTarget.checked)} />
              {showTable && (
                <div style={{ marginTop: 12 }}>
                  <ChartDataTable series={series.data} />
                </div>
              )}
            </Paper>
          )}
        </>
      )}
      <Text size="xs" c="dimmed">
        Periods are grouped in your time zone. History older than your log-retention setting is removed automatically.
      </Text>
    </Stack>
  );
}
