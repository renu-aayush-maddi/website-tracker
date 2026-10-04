import { Group, Paper, Text, UnstyledButton } from '@mantine/core';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

interface StatCardProps {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  hint?: ReactNode;
  to?: string;
}

export function StatCard({ label, value, icon, hint, to }: StatCardProps) {
  const body = (
    <Paper withBorder radius="md" p="md" h="100%">
      <Group justify="space-between" align="flex-start" wrap="nowrap" gap="xs">
        <Text size="xs" c="dimmed" fw={600} tt="uppercase" lts={0.4}>
          {label}
        </Text>
        {icon}
      </Group>
      <Text fz={28} fw={700} lh={1.2} mt={6} style={{ fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </Text>
      {hint && (
        <Text size="xs" c="dimmed" mt={4}>
          {hint}
        </Text>
      )}
    </Paper>
  );
  if (!to) return body;
  return (
    <UnstyledButton component={Link} to={to} display="block" h="100%" aria-label={`${label}: view`}>
      {body}
    </UnstyledButton>
  );
}
