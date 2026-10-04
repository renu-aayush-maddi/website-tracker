import { Center, Paper, Stack, Text } from '@mantine/core';
import type { ReactNode } from 'react';
import { Logo } from './AppLayout';

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <Center mih="100dvh" p="md" bg="var(--mantine-color-body)">
      <Stack w="100%" maw={420} gap="lg">
        <Center>
          <Logo />
        </Center>
        <Paper withBorder radius="md" p={{ base: 'md', sm: 'xl' }} shadow="sm">
          <Text fw={700} fz="xl">
            {title}
          </Text>
          {subtitle && (
            <Text c="dimmed" size="sm" mt={4} mb="lg">
              {subtitle}
            </Text>
          )}
          {children}
        </Paper>
      </Stack>
    </Center>
  );
}
