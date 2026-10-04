import { Alert, Button, EmptyState, Paper, Skeleton, Stack } from '@mantine/core';
import { IconAlertCircle, IconRefresh } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { errorMessage } from '../services/api';

export function LoadingState({ rows = 4 }: { rows?: number }) {
  return (
    <Stack gap="sm" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} height={i === 0 ? 36 : 56} radius="md" />
      ))}
    </Stack>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <Alert color="red" variant="light" icon={<IconAlertCircle size={18} />} title="Could not load data">
      {errorMessage(error)}
      {onRetry && (
        <Button mt="sm" size="xs" variant="default" leftSection={<IconRefresh size={14} />} onClick={onRetry}>
          Try again
        </Button>
      )}
    </Alert>
  );
}

export function Empty({ title, description, icon, action }: { title: string; description?: ReactNode; icon?: ReactNode; action?: ReactNode }) {
  return (
    <Paper withBorder radius="md" p="xl">
      <EmptyState title={title} description={description} icon={icon}>
        {action}
      </EmptyState>
    </Paper>
  );
}
