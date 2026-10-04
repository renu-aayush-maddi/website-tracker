import { Button, Center, Loader, Stack, Text } from '@mantine/core';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../services/api';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading, error, retry } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <Center mih="100dvh">
        <Loader aria-label="Loading" />
      </Center>
    );
  }
  if (error) {
    return (
      <Center mih="100dvh" p="md">
        <Stack align="center" gap="sm" maw={420} ta="center">
          <Text fw={600}>Cannot reach the server</Text>
          <Text c="dimmed" size="sm">
            {errorMessage(error)} Free-tier servers can take up to a minute to start.
          </Text>
          <Button variant="default" onClick={retry}>
            Try again
          </Button>
        </Stack>
      </Center>
    );
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}
