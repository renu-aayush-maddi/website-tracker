import { Alert, Button, Center, Code, Loader, PasswordInput, Stack, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconAlertCircle, IconInfoCircle } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { setupSchema, type SetupInput } from '@wt/shared';
import { useAuth } from '../context/AuthContext';
import { AuthLayout } from '../layouts/AuthLayout';
import { api, errorMessage } from '../services/api';
import { serverFieldErrors, zodValidate } from '../utils/forms';

type SetupForm = SetupInput & { confirmPassword: string };

export function SetupPage() {
  const { user, setup } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const status = useQuery({ queryKey: ['setup-status'], queryFn: api.auth.setupStatus });

  const form = useForm<SetupForm>({
    initialValues: { setupToken: '', name: '', email: '', password: '', confirmPassword: '' },
    validate: (values) => {
      const errors = zodValidate(setupSchema)(values);
      if (values.password !== values.confirmPassword) errors.confirmPassword = 'Passwords do not match';
      return errors;
    },
  });

  if (status.isPending) {
    return (
      <Center mih="100dvh">
        <Loader />
      </Center>
    );
  }
  if (user || (status.data && !status.data.needsSetup)) return <Navigate to="/" replace />;

  const onSubmit = form.onSubmit(async ({ confirmPassword: _confirm, ...values }) => {
    setError(null);
    try {
      await setup(values);
      navigate('/', { replace: true });
    } catch (err) {
      const fields = serverFieldErrors(err);
      if (fields) form.setErrors(fields);
      setError(errorMessage(err));
    }
  });

  return (
    <AuthLayout title="Create the admin account" subtitle="First-time setup. This page disappears once an account exists.">
      {status.data && !status.data.setupEnabled ? (
        <Alert color="yellow" variant="light" icon={<IconInfoCircle size={18} />}>
          <Text size="sm">
            Setup is locked. Set <Code>SETUP_TOKEN</Code> in the API service's environment, restart it, then enter that token here.
          </Text>
        </Alert>
      ) : (
        <form onSubmit={onSubmit} noValidate>
          <Stack>
            {error && (
              <Alert color="red" variant="light" icon={<IconAlertCircle size={18} />}>
                {error}
              </Alert>
            )}
            <PasswordInput
              label="Setup token"
              description="The SETUP_TOKEN value configured on the server"
              autoComplete="off"
              required
              {...form.getInputProps('setupToken')}
            />
            <TextInput label="Name" autoComplete="name" required {...form.getInputProps('name')} />
            <TextInput label="Email" type="email" autoComplete="username" required {...form.getInputProps('email')} />
            <PasswordInput label="Password" description="At least 12 characters" autoComplete="new-password" required {...form.getInputProps('password')} />
            <PasswordInput label="Confirm password" autoComplete="new-password" required {...form.getInputProps('confirmPassword')} />
            <Button type="submit" loading={form.submitting} fullWidth mt="xs">
              Create account
            </Button>
          </Stack>
        </form>
      )}
    </AuthLayout>
  );
}
