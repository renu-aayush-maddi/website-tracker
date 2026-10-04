import { Anchor, Badge, Group, Table, Text, Tooltip } from '@mantine/core';
import { IconCircleCheckFilled, IconCircleXFilled } from '@tabler/icons-react';
import { Link } from 'react-router';
import { MONITOR_TYPE_LABELS, PROBE_ERROR_LABELS, formatResponseTime, type LogDto } from '@wt/shared';
import { usePreferences } from '../context/PreferencesContext';
import { STATUS_COLORS } from '../utils/status';

export function ResultLabel({ success }: { success: boolean }) {
  const Icon = success ? IconCircleCheckFilled : IconCircleXFilled;
  return (
    <Group gap={6} wrap="nowrap">
      <Icon size={16} color={success ? STATUS_COLORS.good : STATUS_COLORS.critical} aria-hidden />
      <Text size="sm">{success ? 'Success' : 'Failed'}</Text>
    </Group>
  );
}

export function LogTable({ logs, showWebsite = true }: { logs: LogDto[]; showWebsite?: boolean }) {
  const { fmt } = usePreferences();
  return (
    <Table.ScrollContainer minWidth={showWebsite ? 980 : 820}>
      <Table striped highlightOnHover verticalSpacing="xs" fz="sm" className="tabular-nums">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Time</Table.Th>
            {showWebsite && <Table.Th>Website</Table.Th>}
            <Table.Th>Type</Table.Th>
            <Table.Th>Request</Table.Th>
            <Table.Th ta="right">Status</Table.Th>
            <Table.Th ta="right">Response</Table.Th>
            <Table.Th>Result</Table.Th>
            <Table.Th>Error</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {logs.map((log) => (
            <Table.Tr key={log.id}>
              <Table.Td style={{ whiteSpace: 'nowrap' }}>{fmt.dateTime(log.startedAt)}</Table.Td>
              {showWebsite && (
                <Table.Td>
                  {log.websiteName ? (
                    <Anchor component={Link} to={`/websites/${log.websiteId}`} size="sm">
                      {log.websiteName}
                    </Anchor>
                  ) : (
                    <Text c="dimmed" size="sm">Deleted</Text>
                  )}
                  {log.environmentLabel && (
                    <Text size="xs" c="dimmed">
                      {log.environmentLabel}
                    </Text>
                  )}
                </Table.Td>
              )}
              <Table.Td>
                <Badge variant="light" color={log.type === 'HEALTH_CHECK' ? 'blue' : 'grape'} size="sm" tt="none">
                  {MONITOR_TYPE_LABELS[log.type]}
                </Badge>
                {log.trigger === 'MANUAL' && (
                  <Text size="xs" c="dimmed">
                    manual
                  </Text>
                )}
              </Table.Td>
              <Table.Td maw={280}>
                <Tooltip label={log.url} openDelay={300}>
                  <Text size="sm" truncate="end">
                    <Text span fw={600} size="xs" mr={6}>
                      {log.method}
                    </Text>
                    {log.url}
                  </Text>
                </Tooltip>
              </Table.Td>
              <Table.Td ta="right">{log.statusCode ?? '—'}</Table.Td>
              <Table.Td ta="right">{formatResponseTime(log.responseMs)}</Table.Td>
              <Table.Td>
                <ResultLabel success={log.success} />
              </Table.Td>
              <Table.Td maw={260}>
                {log.errorCode ? (
                  <Tooltip label={log.errorMessage ?? ''} disabled={!log.errorMessage} multiline maw={360} openDelay={200}>
                    <Text size="sm" truncate="end">
                      {PROBE_ERROR_LABELS[log.errorCode]}
                      {log.errorMessage && log.errorCode !== 'HTTP_STATUS' ? ` — ${log.errorMessage}` : ''}
                    </Text>
                  </Tooltip>
                ) : (
                  <Text c="dimmed" size="sm">—</Text>
                )}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
