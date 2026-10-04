import { BarChart, LineChart } from '@mantine/charts';
import { Center, Table, Text } from '@mantine/core';
import { formatPercent, formatResponseTime, type TimeseriesResponse } from '@wt/shared';
import { usePreferences } from '../context/PreferencesContext';

function useChartRows(series: TimeseriesResponse) {
  const { fmt } = usePreferences();
  return series.points.map((p) => ({
    label: fmt.chartLabel(p.bucket, series.bucketUnit),
    avg: p.avgResponseMs,
    max: p.maxResponseMs,
    uptime: p.successRate === null ? null : Math.round(p.successRate * 10_000) / 100,
    total: p.total,
    successes: p.successes,
  }));
}

function NoData({ height }: { height: number }) {
  return (
    <Center h={height}>
      <Text c="dimmed" size="sm">
        No checks in this period
      </Text>
    </Center>
  );
}

/** Two series (average and maximum) — legend shown, crosshair tooltip on hover. */
export function ResponseTimeChart({ series, height = 260 }: { series: TimeseriesResponse; height?: number }) {
  const rows = useChartRows(series);
  if (rows.length === 0) return <NoData height={height} />;
  return (
    <LineChart
      h={height}
      data={rows}
      dataKey="label"
      series={[
        { name: 'avg', label: 'Average', color: 'var(--wt-series-1)' },
        { name: 'max', label: 'Maximum', color: 'var(--wt-series-2)' },
      ]}
      curveType="monotone"
      withDots={rows.length < 40}
      dotProps={{ r: 4 }}
      strokeWidth={2}
      gridAxis="y"
      withLegend
      legendProps={{ verticalAlign: 'top', height: 36 }}
      valueFormatter={(v) => formatResponseTime(v)}
      yAxisProps={{ width: 64 }}
      xAxisProps={{ minTickGap: 24 }}
    />
  );
}

/** Single series — no legend; the card title names it. */
export function AvailabilityChart({ series, height = 220 }: { series: TimeseriesResponse; height?: number }) {
  const rows = useChartRows(series);
  if (rows.length === 0) return <NoData height={height} />;
  return (
    <BarChart
      h={height}
      data={rows}
      dataKey="label"
      series={[{ name: 'uptime', label: 'Availability', color: 'var(--wt-series-1)' }]}
      gridAxis="y"
      valueFormatter={(v) => `${v.toFixed(2)}%`}
      yAxisProps={{ domain: [0, 100], width: 56 }}
      xAxisProps={{ minTickGap: 24 }}
      barProps={{ radius: [4, 4, 0, 0] }}
      maxBarWidth={28}
    />
  );
}

/** Accessible table view of the same buckets the charts draw. */
export function ChartDataTable({ series }: { series: TimeseriesResponse }) {
  const rows = useChartRows(series);
  if (rows.length === 0) return null;
  return (
    <Table.ScrollContainer minWidth={520} mah={320}>
      <Table striped stickyHeader fz="sm" className="tabular-nums">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Period</Table.Th>
            <Table.Th ta="right">Checks</Table.Th>
            <Table.Th ta="right">Successful</Table.Th>
            <Table.Th ta="right">Availability</Table.Th>
            <Table.Th ta="right">Average</Table.Th>
            <Table.Th ta="right">Maximum</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((r) => (
            <Table.Tr key={r.label}>
              <Table.Td>{r.label}</Table.Td>
              <Table.Td ta="right">{r.total}</Table.Td>
              <Table.Td ta="right">{r.successes}</Table.Td>
              <Table.Td ta="right">{formatPercent(r.uptime === null ? null : r.uptime / 100)}</Table.Td>
              <Table.Td ta="right">{formatResponseTime(r.avg)}</Table.Td>
              <Table.Td ta="right">{formatResponseTime(r.max)}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
