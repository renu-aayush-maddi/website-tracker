import { Select, TextInput } from '@mantine/core';
import type { UseFormReturnType } from '@mantine/form';
import { OTHER_PROVIDER, PROVIDER_CATALOG, type ProviderCategory } from '@wt/shared';
import type { WebsiteFormValues } from '../../types/websiteForm';

interface ProviderSelectProps {
  form: UseFormReturnType<WebsiteFormValues>;
  /** Path of the object holding the provider, e.g. `environments.0.database`. */
  path: string;
  category: ProviderCategory;
  label: string;
  field?: string;
  /** Field for a free-text name when "Other" is chosen; omit to hide it. */
  customField?: string | null;
}

export function ProviderSelect({ form, path, category, label, field = 'provider', customField = 'customProvider' }: ProviderSelectProps) {
  const input = form.getInputProps(`${path}.${field}`);
  const isOther = input.value === OTHER_PROVIDER;
  return (
    <>
      <Select
        label={label}
        placeholder="Select…"
        data={PROVIDER_CATALOG[category].map((p) => ({ value: p.value, label: p.label }))}
        searchable
        clearable
        {...input}
        value={input.value || null}
        onChange={(v) => form.setFieldValue(`${path}.${field}`, v ?? '')}
      />
      {isOther && customField && <TextInput label={`${label} name`} placeholder="e.g. Hetzner" {...form.getInputProps(`${path}.${customField}`)} />}
    </>
  );
}
