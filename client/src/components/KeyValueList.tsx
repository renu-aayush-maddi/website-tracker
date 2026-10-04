import { Table, Text } from '@mantine/core';
import type { ReactNode } from 'react';

export interface KeyValueItem {
  label: string;
  value: ReactNode;
  hidden?: boolean;
}

export function KeyValueList({ items }: { items: KeyValueItem[] }) {
  return (
    <Table variant="vertical" layout="fixed" verticalSpacing={6} withRowBorders={false}>
      <Table.Tbody>
        {items
          .filter((i) => !i.hidden)
          .map((item) => (
            <Table.Tr key={item.label}>
              <Table.Th w={{ base: 130, sm: 170 }} bg="transparent" fw={500} c="dimmed" fz="sm" style={{ verticalAlign: 'top' }}>
                {item.label}
              </Table.Th>
              <Table.Td fz="sm" style={{ wordBreak: 'break-word' }}>
                {item.value === undefined || item.value === null || item.value === '' ? <Text c="dimmed" size="sm">—</Text> : item.value}
              </Table.Td>
            </Table.Tr>
          ))}
      </Table.Tbody>
    </Table>
  );
}
