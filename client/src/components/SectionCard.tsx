import { Group, Paper, Text } from '@mantine/core';
import type { ReactNode } from 'react';

export function SectionCard({ title, icon, actions, children, description }: { title: ReactNode; icon?: ReactNode; actions?: ReactNode; children: ReactNode; description?: ReactNode }) {
  return (
    <Paper withBorder radius="md" p={{ base: 'sm', sm: 'md' }}>
      <Group justify="space-between" mb="sm" gap="xs" wrap="nowrap">
        <Group gap={8} wrap="nowrap" style={{ minWidth: 0 }}>
          {icon}
          <div style={{ minWidth: 0 }}>
            <Text fw={600}>{title}</Text>
            {description && (
              <Text size="xs" c="dimmed">
                {description}
              </Text>
            )}
          </div>
        </Group>
        {actions}
      </Group>
      {children}
    </Paper>
  );
}
