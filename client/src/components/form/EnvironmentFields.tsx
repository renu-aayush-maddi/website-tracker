import { Alert, Fieldset, Select, SimpleGrid, Stack, Text, TextInput, Textarea } from '@mantine/core';
import type { UseFormReturnType } from '@mantine/form';
import { IconLock } from '@tabler/icons-react';
import { ENVIRONMENT_LABELS, ENVIRONMENT_TYPES } from '@wt/shared';
import type { WebsiteFormValues } from '../../types/websiteForm';
import { MonitorFields } from './MonitorFields';
import { ProviderSelect } from './ProviderSelect';

export function EnvironmentFields({ form, index }: { form: UseFormReturnType<WebsiteFormValues>; index: number }) {
  const p = `environments.${index}`;
  return (
    <Stack gap="md">
      <Fieldset legend="Environment" radius="md">
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <Select
            label="Environment"
            data={ENVIRONMENT_TYPES.map((t) => ({ value: t, label: ENVIRONMENT_LABELS[t] }))}
            allowDeselect={false}
            {...form.getInputProps(`${p}.type`)}
          />
          <TextInput label="Label" placeholder="Optional, e.g. EU production" {...form.getInputProps(`${p}.label`)} />
          <TextInput label="Website URL" placeholder="https://expense.example.com" {...form.getInputProps(`${p}.websiteUrl`)} />
          <TextInput label="Backend / API URL" placeholder="https://expense-api.onrender.com" {...form.getInputProps(`${p}.backendUrl`)} />
          <TextInput label="Deployed branch" placeholder="main" {...form.getInputProps(`${p}.branch`)} />
        </SimpleGrid>
      </Fieldset>

      <Fieldset legend="Hosting" radius="md">
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <Stack gap="sm">
            <ProviderSelect form={form} path={`${p}.frontendHosting`} category="hosting" label="Frontend provider" />
            <TextInput label="Frontend deployment URL" placeholder="Provider dashboard or deploy URL" {...form.getInputProps(`${p}.frontendHosting.url`)} />
          </Stack>
          <Stack gap="sm">
            <ProviderSelect form={form} path={`${p}.backendHosting`} category="hosting" label="Backend provider" />
            <TextInput label="Backend deployment URL" placeholder="Provider dashboard or deploy URL" {...form.getInputProps(`${p}.backendHosting.url`)} />
            <TextInput label="Backend region" placeholder="e.g. Singapore" {...form.getInputProps(`${p}.backendHosting.region`)} />
          </Stack>
        </SimpleGrid>
      </Fieldset>

      <Fieldset legend="Database" radius="md">
        <Alert variant="light" color="gray" icon={<IconLock size={16} />} p="xs" mb="sm">
          <Text size="xs">
            Record metadata only — which provider and account owns the database. Never enter passwords, API keys, service-role keys or
            connection strings; they are rejected.
          </Text>
        </Alert>
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <ProviderSelect form={form} path={`${p}.database`} category="database" label="Database provider" />
          <TextInput label="Database name" placeholder="expense_tracker" {...form.getInputProps(`${p}.database.databaseName`)} />
          <TextInput label="Project name" placeholder="Expense Tracker" {...form.getInputProps(`${p}.database.projectName`)} />
          <TextInput label="Cluster / instance" placeholder="Cluster0" {...form.getInputProps(`${p}.database.cluster`)} />
          <TextInput label="Region" placeholder="ap-south-1" {...form.getInputProps(`${p}.database.region`)} />
          <ProviderSelect
            form={form}
            path={`${p}.database`}
            category="account"
            label="Account sign-in"
            field="accountProvider"
            customField={null}
          />
          <TextInput
            label="Account email / username"
            description="The account that created this database"
            placeholder="myproject@gmail.com"
            {...form.getInputProps(`${p}.database.accountIdentifier`)}
          />
          <TextInput label="Dashboard URL" placeholder="https://supabase.com/dashboard/project/…" {...form.getInputProps(`${p}.database.dashboardUrl`)} />
        </SimpleGrid>
        <Textarea label="Database notes" autosize minRows={2} mt="sm" {...form.getInputProps(`${p}.database.notes`)} />
      </Fieldset>

      <Fieldset legend="Health monitoring" radius="md">
        <MonitorFields form={form} envIndex={index} type="HEALTH_CHECK" />
      </Fieldset>

      <Fieldset legend="Wake-up" radius="md">
        <MonitorFields form={form} envIndex={index} type="WAKE_UP" />
      </Fieldset>
    </Stack>
  );
}
