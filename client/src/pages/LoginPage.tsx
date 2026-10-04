import { Alert, Button, Center, Loader, PasswordInput, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconAlertCircle } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { loginSchema, type LoginInput } from '@wt/shared';
import { useAuth } from '../context/AuthContext';
import { AuthLayout } from '../layouts/AuthLayout';
import { api, errorMessage } from '../services/api';
import { zodValidate } from '../utils/forms';

export function LoginPage() {
  const { user, login, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const [error, setError] = useState<string | null>(null);
  const setup = useQuery({ queryKey: ['setup-status'], queryFn: api.auth.setupStatus, retry: 1 });

  const form = useForm<LoginInput>({ initialValues: { email: '', password: '' }, validate: zodValidate(loginSchema) });

  if (loading) {
    return (
      <Center mih="100dvh">
        <Loader />
      </Center>
    );
  }
  if (user) return <Navigate to={from} replace />;
  if (setup.data?.needsSetup) return <Navigate to="/setup" replace />;

  const onSubmit = form.onSubmit(async (values) => {
    setError(null);
    try {
      await login(values);
      navigate(from, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    }
  });

  return (
    <AuthLayout title="Sign in" subtitle="Your infrastructure inventory and uptime monitor.">
      <form onSubmit={onSubmit} noValidate>
        <Stack>
          {error && (
            <Alert color="red" variant="light" icon={<IconAlertCircle size={18} />}>
              {error}
            </Alert>
          )}
          <TextInput label="Email" type="email" autoComplete="username" required autoFocus {...form.getInputProps('email')} />
          <PasswordInput label="Password" autoComplete="current-password" required {...form.getInputProps('password')} />
          <Button type="submit" loading={form.submitting} fullWidth mt="xs">
            Sign in
          </Button>
        </Stack>
      </form>
    </AuthLayout>
  );
}
