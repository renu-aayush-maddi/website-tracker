import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Code,
  Group,
  NumberInput,
  PasswordInput,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Tabs,
  Text,
  TextInput,
} from '@mantine/core';
import { useForm, type UseFormReturnType } from '@mantine/form';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { IconBell, IconCheck, IconDeviceDesktop, IconMail, IconSend, IconUser, IconActivityHeartbeat } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import {
  DATE_FORMATS,
  LIMITS,
  RETENTION_OPTIONS,
  accountUpdateSchema,
  changePasswordSchema,
  estimateLogStorageBytes,
  formatBytes,
  settingsSchema,
  type AccountUpdateInput,
  type SettingsInput,
  type SettingsResponse,
} from '@wt/shared';
import { IntervalSelect } from '../components/form/IntervalSelect';
import { PageHeader } from '../components/PageHeader';
import { SectionCard } from '../components/SectionCard';
import { ErrorState, LoadingState } from '../components/States';
import { useAuth } from '../context/AuthContext';
import { usePreferences } from '../context/PreferencesContext';
import { useNotifications, useSettings, useUpdateSettings } from '../hooks/queries';
import { api, errorMessage } from '../services/api';
import { serverFieldErrors, zodValidate } from '../utils/forms';
import { browserTimeZones, dayjs } from '../utils/time';

type SettingsForm = UseFormReturnType<SettingsInput>;

function ProfileSection() {
  const { user, setUser } = useAuth();
  const form = useForm<AccountUpdateInput>({
    initialValues: { name: user?.name ?? '', email: user?.email ?? '', currentPassword: '' },
    validate: zodValidate(accountUpdateSchema),
  });
  const emailChanged = form.values.email.trim().toLowerCase() !== user?.email;
  const save = useMutation({
    mutationFn: (input: AccountUpdateInput) => api.account.update(input),
    onSuccess: (updated) => {
      setUser(updated);
      form.setValues({ name: updated.name, email: updated.email, currentPassword: '' });
      form.resetDirty();
      notifications.show({ message: 'Profile updated', color: 'green' });
    },
    onError: (err) => {
      const fields = serverFieldErrors(err);
      if (fields) form.setErrors(fields);
      notifications.show({ title: 'Could not update profile', message: errorMessage(err), color: 'red' });
    },
  });

  return (
    <SectionCard title="Profile">
      <form onSubmit={form.onSubmit((v) => save.mutate({ ...v, currentPassword: emailChanged ? v.currentPassword : undefined }))} noValidate>
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <TextInput label="Name" autoComplete="name" {...form.getInputProps('name')} />
          <TextInput label="Email" type="email" autoComplete="email" {...form.getInputProps('email')} />
          {emailChanged && (
            <PasswordInput label="Current password" description="Required to change your email" autoComplete="current-password" {...form.getInputProps('currentPassword')} />
          )}
        </SimpleGrid>
        <Group justify="flex-end" mt="md">
          <Button type="submit" loading={save.isPending} disabled={!form.isDirty()}>
            Save profile
          </Button>
        </Group>
      </form>
    </SectionCard>
  );
}

function PasswordSection() {
  const form = useForm({
    initialValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
    validate: (values) => {
      const errors = zodValidate(changePasswordSchema)(values);
      if (values.newPassword !== values.confirmPassword) errors.confirmPassword = 'Passwords do not match';
      return errors;
    },
  });
  const change = useMutation({
    mutationFn: ({ currentPassword, newPassword }: typeof form.values) => api.auth.changePassword({ currentPassword, newPassword }),
    onSuccess: () => {
      form.reset();
      notifications.show({ message: 'Password changed. Other devices have been signed out.', color: 'green' });
    },
    onError: (err) => {
      const fields = serverFieldErrors(err);
      if (fields) form.setErrors(fields);
      notifications.show({ title: 'Could not change password', message: errorMessage(err), color: 'red' });
    },
  });
  return (
    <SectionCard title="Change password" description={`At least ${LIMITS.passwordMin} characters. Changing it signs out every other session.`}>
      <form onSubmit={form.onSubmit((v) => change.mutate(v))} noValidate>
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
          <PasswordInput label="Current password" autoComplete="current-password" {...form.getInputProps('currentPassword')} />
          <PasswordInput label="New password" autoComplete="new-password" {...form.getInputProps('newPassword')} />
          <PasswordInput label="Confirm new password" autoComplete="new-password" {...form.getInputProps('confirmPassword')} />
        </SimpleGrid>
        <Group justify="flex-end" mt="md">
          <Button type="submit" loading={change.isPending}>
            Change password
          </Button>
        </Group>
      </form>
    </SectionCard>
  );
}

function SessionsSection() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const confirm = () =>
    modals.openConfirmModal({
      title: 'Sign out everywhere?',
      children: <Text size="sm">Every session, including this one, will be signed out.</Text>,
      labels: { confirm: 'Sign out everywhere', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          await api.auth.logoutAll();
        } finally {
          await logout().catch(() => undefined);
          navigate('/login');
        }
      },
    });
  return (
    <SectionCard title="Sessions" description="Sessions expire after 7 days of inactivity and 30 days at most.">
      <Button variant="default" color="red" onClick={confirm}>
        Sign out of all devices
      </Button>
    </SectionCard>
  );
}

function SaveBar({ form, saving }: { form: SettingsForm; saving: boolean }) {
  return (
    <Group justify="flex-end">
      <Button type="submit" loading={saving} disabled={!form.isDirty()} leftSection={<IconCheck size={16} />}>
        Save settings
      </Button>
    </Group>
  );
}

function MonitoringSection({ form, data }: { form: SettingsForm; data: SettingsResponse }) {
  const v = form.values;
  const estimate = estimateLogStorageBytes(data.storage.enabledMonitorIntervals, v.logRetentionDays);
  return (
    <Stack gap="md">
      <SectionCard title="Defaults for new monitors" description="Pre-filled when you add a website or environment. Existing monitors are not changed.">
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <IntervalSelect
            label="Default interval"
            value={v.monitoringDefaults.intervalSeconds}
            onChange={(s) => form.setFieldValue('monitoringDefaults.intervalSeconds', s)}
            error={form.errors['monitoringDefaults.intervalSeconds']}
          />
          <NumberInput
            label="Default timeout"
            suffix=" s"
            min={1}
            max={60}
            allowDecimal={false}
            value={v.monitoringDefaults.timeoutMs / 1000}
            onChange={(n) => form.setFieldValue('monitoringDefaults.timeoutMs', (Number(n) || 0) * 1000)}
            error={form.errors['monitoringDefaults.timeoutMs']}
          />
          <NumberInput
            label="Default failure threshold"
            suffix=" consecutive failures"
            min={LIMITS.failureThreshold.min}
            max={LIMITS.failureThreshold.max}
            allowDecimal={false}
            {...form.getInputProps('monitoringDefaults.failureThreshold')}
          />
          <NumberInput
            label="Default degraded threshold"
            suffix=" ms"
            step={100}
            min={LIMITS.degradedThresholdMs.min}
            max={LIMITS.degradedThresholdMs.max}
            thousandSeparator=","
            allowDecimal={false}
            {...form.getInputProps('monitoringDefaults.degradedThresholdMs')}
          />
        </SimpleGrid>
      </SectionCard>

      <SectionCard title="Log retention" description="Older monitoring logs are deleted automatically by a MongoDB TTL index.">
        <Stack gap="sm">
          <Select
            label="Keep monitoring logs for"
            w={{ base: '100%', sm: 280 }}
            data={RETENTION_OPTIONS.map((d) => ({ value: String(d), label: d === 0 ? 'Unlimited' : d === 365 ? '1 year' : `${d} days` }))}
            value={String(v.logRetentionDays)}
            onChange={(d) => d && form.setFieldValue('logRetentionDays', Number(d) as SettingsInput['logRetentionDays'])}
            allowDeselect={false}
          />
          <Text size="sm">
            Currently storing <b>{data.storage.logCount.toLocaleString()}</b> logs from {data.storage.enabledMonitorIntervals.length} active monitor
            {data.storage.enabledMonitorIntervals.length === 1 ? '' : 's'}.{' '}
            {estimate === null ? (
              <>With unlimited retention, storage grows without bound.</>
            ) : (
              <>
                At this retention, expect about <b>{formatBytes(estimate)}</b> of logs.
              </>
            )}
          </Text>
          {(estimate === null || estimate > 200 * 1024 * 1024) && (
            <Alert color="yellow" variant="light" p="xs">
              <Text size="xs">MongoDB Atlas free clusters hold 512 MB in total. Keep retention short or intervals longer to stay within it.</Text>
            </Alert>
          )}
        </Stack>
      </SectionCard>
    </Stack>
  );
}

function NotificationsSection({ form, data }: { form: SettingsForm; data: SettingsResponse }) {
  const { user } = useAuth();
  const history = useNotifications();
  const { fmt } = usePreferences();
  const test = useMutation({
    mutationFn: api.settings.testEmail,
    onSuccess: ({ recipient }) => notifications.show({ message: `Test email sent to ${recipient}`, color: 'green' }),
    onError: (err) => notifications.show({ title: 'Test email failed', message: errorMessage(err), color: 'red' }),
  });
  const configured = data.server.emailDeliveryConfigured;

  return (
    <Stack gap="md">
      <SectionCard title="Email notifications" icon={<IconMail size={20} />}>
        <Stack gap="sm">
          {configured ? (
            <Alert color="green" variant="light" p="xs">
              <Text size="xs">
                Email delivery is configured on the server (<Code>{data.server.emailProvider}</Code>).
              </Text>
            </Alert>
          ) : (
            <Alert color="yellow" variant="light" p="xs">
              <Text size="xs">
                Email delivery is not configured. Set <Code>EMAIL_PROVIDER</Code>, <Code>EMAIL_FROM</Code> and the provider's key on the API
                service to send emails.
              </Text>
            </Alert>
          )}
          <Switch label="Send email notifications" {...form.getInputProps('notifications.emailEnabled', { type: 'checkbox' })} />
          <TextInput
            label="Send to"
            placeholder={user?.email}
            description="Leave empty to use your account email"
            w={{ base: '100%', sm: 360 }}
            {...form.getInputProps('notifications.recipient')}
          />
          <Text size="sm" fw={500} mt="xs">
            Notify me when
          </Text>
          <Checkbox label="A website goes down (failure threshold reached)" {...form.getInputProps('notifications.onDown', { type: 'checkbox' })} />
          <Checkbox label="A website comes back online" {...form.getInputProps('notifications.onRecovery', { type: 'checkbox' })} />
          <Checkbox label="Wake-up requests keep failing" {...form.getInputProps('notifications.onWakeUpFailure', { type: 'checkbox' })} />
          <Text size="xs" c="dimmed">
            Emails are sent only when a status changes — never for every failed request.
          </Text>
          <Group>
            <Button variant="default" leftSection={<IconSend size={16} />} onClick={() => test.mutate()} loading={test.isPending} disabled={!configured}>
              Send test email
            </Button>
          </Group>
        </Stack>
      </SectionCard>

      <SectionCard title="Recent notifications" icon={<IconBell size={20} />}>
        {history.data && history.data.length > 0 ? (
          <Table.ScrollContainer minWidth={640}>
            <Table fz="sm" verticalSpacing="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Time</Table.Th>
                  <Table.Th>Subject</Table.Th>
                  <Table.Th>Status</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {history.data.map((n) => (
                  <Table.Tr key={n.id}>
                    <Table.Td style={{ whiteSpace: 'nowrap' }}>{fmt.dateTime(n.createdAt)}</Table.Td>
                    <Table.Td>{n.subject}</Table.Td>
                    <Table.Td>
                      <Badge variant="light" color={n.status === 'SENT' ? 'green' : n.status === 'FAILED' ? 'red' : 'gray'} tt="none">
                        {n.status === 'SENT' ? 'Sent' : n.status === 'FAILED' ? `Failed: ${n.lastError ?? ''}` : 'Pending'}
                      </Badge>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        ) : (
          <Text size="sm" c="dimmed">
            No notifications sent yet.
          </Text>
        )}
      </SectionCard>
    </Stack>
  );
}

function ApplicationSection({ form }: { form: SettingsForm }) {
  const zones = useMemo(() => browserTimeZones(), []);
  const sample = new Date();
  return (
    <SectionCard title="Application" icon={<IconDeviceDesktop size={20} />}>
      <Stack gap="md">
        <div>
          <Text size="sm" fw={500} mb={4}>
            Theme
          </Text>
          <SegmentedControl
            data={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
            {...form.getInputProps('theme')}
          />
        </div>
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
          <Select
            label="Time zone"
            description="Used for every date and for grouping charts"
            data={zones}
            searchable
            limit={50}
            allowDeselect={false}
            {...form.getInputProps('timezone')}
          />
          <Select
            label="Date format"
            data={DATE_FORMATS.map((f) => ({ value: f, label: `${f} (${dayjs(sample).format(f)})` }))}
            allowDeselect={false}
            {...form.getInputProps('dateFormat')}
          />
          <div>
            <Text size="sm" fw={500} mb={4}>
              Time format
            </Text>
            <SegmentedControl
              fullWidth
              data={[
                { value: '24h', label: '24-hour' },
                { value: '12h', label: '12-hour' },
              ]}
              {...form.getInputProps('timeFormat')}
            />
          </div>
        </SimpleGrid>
      </Stack>
    </SectionCard>
  );
}

function usePreferencesForm(data: SettingsResponse) {
  const update = useUpdateSettings();
  const form = useForm<SettingsInput>({
    initialValues: { ...data.settings, notifications: { ...data.settings.notifications, recipient: data.settings.notifications.recipient ?? '' } },
    validate: zodValidate(settingsSchema),
  });
  const onSubmit = form.onSubmit((values) =>
    update.mutate(settingsSchema.parse(values), {
      onSuccess: () => {
        form.resetDirty();
        notifications.show({ message: 'Settings saved', color: 'green' });
      },
      onError: (err) => {
        const fields = serverFieldErrors(err);
        if (fields) form.setErrors(fields);
        notifications.show({ title: 'Could not save settings', message: errorMessage(err), color: 'red' });
      },
    }),
  );

  return { form, onSubmit, saving: update.isPending };
}

export default function SettingsPage() {
  const settings = useSettings();
  if (settings.isPending) return <LoadingState rows={5} />;
  if (settings.error) return <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />;
  return <SettingsTabs data={settings.data} />;
}

function SettingsTabs({ data }: { data: SettingsResponse }) {
  const { form, onSubmit, saving } = usePreferencesForm(data);
  return (
    <>
      <PageHeader title="Settings" />
      <Tabs defaultValue="account" keepMounted>
        <Tabs.List mb="md">
          <Tabs.Tab value="account" leftSection={<IconUser size={16} />}>
            Account
          </Tabs.Tab>
          <Tabs.Tab value="monitoring" leftSection={<IconActivityHeartbeat size={16} />}>
            Monitoring
          </Tabs.Tab>
          <Tabs.Tab value="notifications" leftSection={<IconBell size={16} />}>
            Notifications
          </Tabs.Tab>
          <Tabs.Tab value="application" leftSection={<IconDeviceDesktop size={16} />}>
            Application
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="account">
          <Stack gap="md">
            <ProfileSection />
            <PasswordSection />
            <SessionsSection />
          </Stack>
        </Tabs.Panel>

        <form onSubmit={onSubmit} noValidate>
          <Tabs.Panel value="monitoring">
            <Stack gap="md">
              <MonitoringSection form={form} data={data} />
              <SaveBar form={form} saving={saving} />
            </Stack>
          </Tabs.Panel>
          <Tabs.Panel value="notifications">
            <Stack gap="md">
              <NotificationsSection form={form} data={data} />
              <SaveBar form={form} saving={saving} />
            </Stack>
          </Tabs.Panel>
          <Tabs.Panel value="application">
            <Stack gap="md">
              <ApplicationSection form={form} />
              <SaveBar form={form} saving={saving} />
            </Stack>
          </Tabs.Panel>
        </form>
      </Tabs>
    </>
  );
}
