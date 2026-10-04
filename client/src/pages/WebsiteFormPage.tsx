import {
  ActionIcon,
  Box,
  Button,
  Group,
  Indicator,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Tabs,
  TagsInput,
  Text,
  TextInput,
  Textarea,
  Tooltip,
} from '@mantine/core';
import { useForm, type UseFormReturnType } from '@mantine/form';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  LIFECYCLE_LABELS,
  LIFECYCLE_STATUSES,
  LIMITS,
  environmentDisplayName,
  websiteInputSchema,
} from '@wt/shared';
import { ProviderSelect } from '../components/form/ProviderSelect';
import { EnvironmentFields } from '../components/form/EnvironmentFields';
import { PageHeader } from '../components/PageHeader';
import { SectionCard } from '../components/SectionCard';
import { ErrorState, LoadingState } from '../components/States';
import { usePreferences } from '../context/PreferencesContext';
import { useSaveWebsite, useTags, useWebsite } from '../hooks/queries';
import { errorMessage } from '../services/api';
import {
  emptyEnvironment,
  emptyWebsite,
  nextEnvironmentType,
  websiteToForm,
  type WebsiteFormValues,
} from '../types/websiteForm';
import { serverFieldErrors, zodValidate } from '../utils/forms';

function EnvironmentsSection({ form }: { form: UseFormReturnType<WebsiteFormValues> }) {
  const { settings } = usePreferences();
  const envs = form.values.environments;
  const [active, setActive] = useState(envs[0]!.key);
  const activeKey = envs.some((e) => e.key === active) ? active : envs[0]!.key;

  const add = () => {
    const env = emptyEnvironment(settings.monitoringDefaults, nextEnvironmentType(envs.map((e) => e.type)));
    form.insertListItem('environments', env);
    setActive(env.key);
  };

  const remove = (index: number) =>
    modals.openConfirmModal({
      title: `Remove ${environmentDisplayName(envs[index]!)}?`,
      children: (
        <Text size="sm">
          Its hosting, database and monitor settings are removed when you save. Monitoring history for this environment is deleted too.
        </Text>
      ),
      labels: { confirm: 'Remove environment', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () => form.removeListItem('environments', index),
    });

  const hasErrors = (index: number) => Object.keys(form.errors).some((k) => k.startsWith(`environments.${index}.`));

  return (
    <SectionCard
      title="Environments"
      description="Hosting, database and monitoring are configured per environment. Most projects only need Production."
      actions={
        envs.length < LIMITS.environmentsPerWebsite && (
          <Button size="xs" variant="default" leftSection={<IconPlus size={14} />} onClick={add}>
            Add environment
          </Button>
        )
      }
    >
      {envs.length === 1 ? (
        <EnvironmentFields form={form} index={0} />
      ) : (
        <Tabs value={activeKey} onChange={(v) => v && setActive(v)} keepMounted={false}>
          <Tabs.List mb="md">
            {envs.map((env, i) => (
              <Tabs.Tab key={env.key} value={env.key}>
                <Indicator disabled={!hasErrors(i)} color="red" size={8} offset={-4} label={null}>
                  {environmentDisplayName(env)}
                </Indicator>
              </Tabs.Tab>
            ))}
          </Tabs.List>
          {envs.map((env, i) => (
            <Tabs.Panel key={env.key} value={env.key}>
              <Group justify="flex-end" mb="xs">
                <Tooltip label="Remove this environment">
                  <ActionIcon variant="subtle" color="red" onClick={() => remove(i)} aria-label={`Remove ${environmentDisplayName(env)}`}>
                    <IconTrash size={16} />
                  </ActionIcon>
                </Tooltip>
              </Group>
              <EnvironmentFields form={form} index={i} />
            </Tabs.Panel>
          ))}
        </Tabs>
      )}
    </SectionCard>
  );
}

function WebsiteForm({ initialValues, websiteId }: { initialValues: WebsiteFormValues; websiteId?: string }) {
  const navigate = useNavigate();
  const save = useSaveWebsite(websiteId);
  const tags = useTags();
  const form = useForm<WebsiteFormValues>({
    initialValues,
    validate: zodValidate(websiteInputSchema),
    validateInputOnBlur: true,
  });

  // Warn before discarding unsaved changes by closing or reloading the tab.
  const dirty = form.isDirty();
  useEffect(() => {
    if (!dirty || save.isSuccess) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty, save.isSuccess]);

  const onSubmit = form.onSubmit(
    (values) => {
      const input = websiteInputSchema.parse(values);
      save.mutate(input, {
        onSuccess: (site) => {
          notifications.show({ message: websiteId ? 'Website updated' : 'Website added', color: 'green' });
          navigate(`/websites/${site.id}`);
        },
        onError: (err) => {
          const fields = serverFieldErrors(err);
          if (fields) form.setErrors(fields);
          notifications.show({ title: 'Could not save', message: errorMessage(err), color: 'red' });
        },
      });
    },
    () => notifications.show({ title: 'Some fields need attention', message: 'Check the highlighted fields.', color: 'red' }),
  );

  return (
    <form onSubmit={onSubmit} noValidate>
      <Stack gap="md">
        <SectionCard title="Basic information">
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            <TextInput label="Name" placeholder="Expense Tracker" required {...form.getInputProps('name')} />
            <Select
              label="Project status"
              data={LIFECYCLE_STATUSES.map((s) => ({ value: s, label: LIFECYCLE_LABELS[s] }))}
              allowDeselect={false}
              {...form.getInputProps('lifecycleStatus')}
            />
          </SimpleGrid>
          <Textarea label="Description" autosize minRows={2} mt="sm" {...form.getInputProps('description')} />
          <TagsInput
            label="Tags"
            placeholder="Type and press Enter, e.g. Personal, MERN, Render"
            data={tags.data ?? []}
            maxTags={LIMITS.tagsPerWebsite}
            clearable
            mt="sm"
            {...form.getInputProps('tags')}
          />
        </SectionCard>

        <SectionCard title="Repository">
          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
            <ProviderSelect form={form} path="repository" category="repository" label="Provider" />
            <TextInput label="Repository URL" placeholder="https://github.com/you/project" {...form.getInputProps('repository.url')} />
            <TextInput label="Default branch" placeholder="main" {...form.getInputProps('repository.defaultBranch')} />
          </SimpleGrid>
        </SectionCard>

        <EnvironmentsSection form={form} />

        <SectionCard title="Notes">
          <Textarea autosize minRows={3} placeholder="Anything worth remembering about this project (no secrets)." {...form.getInputProps('notes')} />
        </SectionCard>

        <Paper
          withBorder
          radius="md"
          p="sm"
          style={{ position: 'sticky', bottom: 'var(--mantine-spacing-sm)', zIndex: 5, boxShadow: 'var(--mantine-shadow-md)' }}
        >
          <Group justify="flex-end" gap="xs">
            <Button variant="default" component={Link} to={websiteId ? `/websites/${websiteId}` : '/websites'}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              {websiteId ? 'Save changes' : 'Add website'}
            </Button>
          </Group>
        </Paper>
      </Stack>
    </form>
  );
}

export default function WebsiteFormPage() {
  const { id } = useParams();
  const { settings } = usePreferences();
  const website = useWebsite(id);

  if (id && website.isPending) return <LoadingState rows={6} />;
  if (id && website.error) return <ErrorState error={website.error} onRetry={() => void website.refetch()} />;

  const initialValues = id && website.data ? websiteToForm(website.data, settings.monitoringDefaults) : emptyWebsite(settings.monitoringDefaults);
  return (
    <Box maw={1040} mx="auto">
      <PageHeader
        title={id ? `Edit ${website.data?.name ?? 'website'}` : 'Add website'}
        description="Record where it runs, which database and account it uses, and how it should be monitored."
      />
      {/* Keyed so the form re-initialises if a different website is opened. */}
      <WebsiteForm key={id ?? 'new'} initialValues={initialValues} websiteId={id} />
    </Box>
  );
}
