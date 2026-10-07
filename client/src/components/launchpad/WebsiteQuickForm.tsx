import { Button, Group, Modal, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useMediaQuery } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';
import { optionalUrl, type WebsiteSummaryDto } from '@wt/shared';
import { usePreferences } from '../../context/PreferencesContext';
import { useQuickSaveWebsite } from '../../hooks/queries';
import { coverUrl, errorMessage } from '../../services/api';
import type { CoverChange } from '../../services/launchpadService';
import { serverFieldErrors } from '../../utils/forms';
import type { PreparedImage } from '../../utils/image';
import { normalizeUrl } from '../../utils/launchpad';
import { CoverImagePicker } from './CoverImagePicker';

interface QuickFormValues {
  name: string;
  url: string;
}

interface WebsiteQuickFormProps {
  opened: boolean;
  onClose: () => void;
  /** The website being edited; null when adding. */
  site: WebsiteSummaryDto | null;
}

type CoverDraft = { kind: 'keep' } | { kind: 'remove' } | { kind: 'set'; image: PreparedImage };

/** Add / edit modal. Full-screen on phones so the keyboard and pickers have room; a centred dialog elsewhere. */
export function WebsiteQuickForm({ opened, onClose, site }: WebsiteQuickFormProps) {
  const isMobile = useMediaQuery('(max-width: 47.99em)', false, { getInitialValueInEffect: false });
  const [saving, setSaving] = useState(false);
  return (
    <Modal
      opened={opened}
      onClose={saving ? () => undefined : onClose}
      title={site ? 'Edit website' : 'Add website'}
      fullScreen={isMobile}
      centered={!isMobile}
      size="lg"
      radius={isMobile ? 0 : 'lg'}
      padding={isMobile ? 'md' : 'lg'}
      closeButtonProps={{ size: 'xl', 'aria-label': 'Close' }}
      transitionProps={{ transition: isMobile ? 'slide-up' : 'pop', duration: 180 }}
      styles={{ title: { fontWeight: 700, fontSize: 'var(--mantine-font-size-lg)' } }}
    >
      {/* Mounted only while the modal is open, so every open starts from the website's current values. */}
      <QuickFormBody site={site} isMobile={isMobile} onClose={onClose} onSavingChange={setSaving} />
    </Modal>
  );
}

interface QuickFormBodyProps {
  site: WebsiteSummaryDto | null;
  isMobile: boolean;
  onClose: () => void;
  onSavingChange: (saving: boolean) => void;
}

function QuickFormBody({ site, isMobile, onClose, onSavingChange }: QuickFormBodyProps) {
  const { settings } = usePreferences();
  const save = useQuickSaveWebsite();
  const editing = site !== null;
  const initialUrl = site?.primaryEnvironment?.websiteUrl ?? '';
  const [cover, setCover] = useState<CoverDraft>({ kind: 'keep' });

  const form = useForm<QuickFormValues>({
    initialValues: { name: site?.name ?? '', url: initialUrl },
    validate: {
      name: (v) => (!v.trim() ? 'Enter a name' : v.trim().length > 100 ? 'Use at most 100 characters' : null),
      url: (v) => {
        const normalized = normalizeUrl(v);
        if (!normalized) return editing && !initialUrl ? null : 'Enter the website address';
        const result = optionalUrl.safeParse(normalized);
        return result.success ? null : (result.error.issues[0]?.message ?? 'Enter a valid web address');
      },
    },
  });

  const existingImage = site?.coverVersion ? coverUrl(site.id, site.coverVersion) : null;
  const previewSrc = cover.kind === 'set' ? cover.image.dataUrl : cover.kind === 'remove' ? null : existingImage;
  const previewUrl = normalizeUrl(form.values.url) || null;

  const onSubmit = form.onSubmit((values) => {
    const change: CoverChange =
      cover.kind === 'set' ? { action: 'set', blob: cover.image.blob } : cover.kind === 'remove' ? { action: 'remove' } : { action: 'keep' };
    const common = { values: { name: values.name.trim(), url: normalizeUrl(values.url) }, cover: change, defaults: settings.monitoringDefaults };
    const request = site
      ? ({ mode: 'edit', websiteId: site.id, environmentId: site.primaryEnvironment?.id ?? null, ...common } as const)
      : ({ mode: 'create', ...common } as const);

    onSavingChange(true);
    save.mutate(request, {
      onSuccess: ({ coverError }) => {
        if (coverError) {
          notifications.show({
            title: editing ? 'Saved, but the image was not updated' : 'Website added, but the image was not saved',
            message: errorMessage(coverError),
            color: 'yellow',
          });
        } else {
          notifications.show({ message: editing ? 'Website updated' : 'Website added', color: 'green' });
        }
        onClose();
      },
      onSettled: () => onSavingChange(false),
      onError: (err) => {
        const fields = serverFieldErrors(err);
        if (fields) {
          form.setErrors({
            name: fields.name ?? fields['environments.0.name'],
            url: fields['environments.0.websiteUrl'] ?? fields.websiteUrl,
          });
        }
        notifications.show({ title: 'Could not save', message: errorMessage(err), color: 'red' });
      },
    });
  });

  return (
      <form onSubmit={onSubmit} noValidate>
        <Stack gap="md">
          <CoverImagePicker
            name={form.values.name}
            url={previewUrl}
            imageSrc={previewSrc}
            onPick={(image) => setCover({ kind: 'set', image })}
            onRemove={() => setCover(existingImage || cover.kind === 'set' ? { kind: 'remove' } : { kind: 'keep' })}
          />
          <TextInput
            label="Website name"
            placeholder="GitHub"
            size="md"
            required
            data-autofocus={!isMobile || undefined}
            autoComplete="off"
            maxLength={100}
            {...form.getInputProps('name')}
          />
          <TextInput
            label="Website URL"
            placeholder="github.com"
            description="This is where the card takes you."
            size="md"
            required={!editing || Boolean(initialUrl)}
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="off"
            {...form.getInputProps('url')}
            onBlur={(e) => {
              form.getInputProps('url').onBlur?.(e);
              const normalized = normalizeUrl(form.values.url);
              if (normalized !== form.values.url) form.setFieldValue('url', normalized);
            }}
          />
          <Group grow={isMobile} justify="flex-end" gap="sm" mt="xs">
            <Button variant="default" size="md" onClick={onClose} disabled={save.isPending}>
              Cancel
            </Button>
            <Button type="submit" size="md" loading={save.isPending}>
              {editing ? 'Save changes' : 'Add website'}
            </Button>
          </Group>
        </Stack>
      </form>
  );
}
