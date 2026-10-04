import { Button, Group, NumberInput, SegmentedControl, Select, SimpleGrid, Stack, Switch, Text, TextInput } from '@mantine/core';
import type { UseFormReturnType } from '@mantine/form';
import { HTTP_METHODS, LIMITS, isRenderHostname, keepsRenderServiceAwake, type MonitorType } from '@wt/shared';
import type { MonitorFormValues, WebsiteFormValues } from '../../types/websiteForm';
import { RenderHoursWarning } from '../MonitorPanel';
import { IntervalSelect } from './IntervalSelect';

interface MonitorFieldsProps {
  form: UseFormReturnType<WebsiteFormValues>;
  envIndex: number;
  type: MonitorType;
}

export function MonitorFields({ form, envIndex, type }: MonitorFieldsProps) {
  const isHealth = type === 'HEALTH_CHECK';
  const key = isHealth ? 'healthCheck' : 'wakeUp';
  const path = `environments.${envIndex}.${key}`;
  const env = form.values.environments[envIndex]!;
  const values: MonitorFormValues = env[key];
  const field = (name: keyof MonitorFormValues) => `${path}.${name}`;

  const suggestion = isHealth
    ? env.backendUrl
      ? { label: 'Use backend URL + /health', url: `${env.backendUrl.replace(/\/$/, '')}/health` }
      : null
    : env.healthCheck.url
      ? { label: 'Same as health check URL', url: env.healthCheck.url }
      : null;

  return (
    <Stack gap="sm">
      <Switch
        label={isHealth ? 'Enable health monitoring' : 'Enable wake-up'}
        description={
          isHealth
            ? 'Checks run on the server on a schedule; the status reflects the response.'
            : 'Sends periodic requests so an idle service (e.g. on Render free) stays awake. Does not measure health.'
        }
        {...form.getInputProps(field('enabled'), { type: 'checkbox' })}
      />
      <TextInput
        label={isHealth ? 'Health check URL' : 'Wake-up URL'}
        placeholder="https://my-api.onrender.com/health"
        description="Must be a public address — localhost and private networks are blocked."
        {...form.getInputProps(field('url'))}
        rightSectionWidth={suggestion && !values.url ? 'auto' : undefined}
        rightSection={
          suggestion && !values.url ? (
            <Button variant="subtle" size="compact-xs" mr={4} onClick={() => form.setFieldValue(field('url'), suggestion.url)}>
              {suggestion.label}
            </Button>
          ) : null
        }
      />
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
        <div>
          <Text size="sm" fw={500} mb={4}>
            HTTP method
          </Text>
          <SegmentedControl
            fullWidth
            data={[...HTTP_METHODS]}
            value={values.method}
            onChange={(v) => form.setFieldValue(field('method'), v)}
            aria-label="HTTP method"
          />
        </div>
        <IntervalSelect
          label="Interval"
          value={values.intervalSeconds}
          onChange={(v) => form.setFieldValue(field('intervalSeconds'), v)}
          error={form.errors[field('intervalSeconds')]}
        />
        <NumberInput
          label="Timeout"
          suffix=" s"
          min={LIMITS.timeoutMs.min / 1000}
          max={LIMITS.timeoutMs.max / 1000}
          allowDecimal={false}
          value={values.timeoutMs / 1000}
          onChange={(v) => form.setFieldValue(field('timeoutMs'), (Number(v) || 0) * 1000)}
          error={form.errors[field('timeoutMs')]}
          description={isHealth ? 'Sleeping free-tier services may need 30–60 s to wake.' : undefined}
        />
        <NumberInput
          label={isHealth ? 'Mark down after' : 'Alert after'}
          suffix=" consecutive failures"
          min={LIMITS.failureThreshold.min}
          max={LIMITS.failureThreshold.max}
          allowDecimal={false}
          {...form.getInputProps(field('failureThreshold'))}
        />
        {isHealth && (
          <>
            <NumberInput
              label="Degraded when slower than"
              suffix=" ms"
              step={100}
              min={LIMITS.degradedThresholdMs.min}
              max={LIMITS.degradedThresholdMs.max}
              allowDecimal={false}
              thousandSeparator=","
              {...form.getInputProps(field('degradedThresholdMs'))}
            />
            <Select
              label="Healthy status codes"
              data={[
                { value: '2xx', label: '200–299 (recommended)' },
                { value: '2xx-3xx', label: '200–399' },
              ]}
              allowDeselect={false}
              {...form.getInputProps(field('expectedStatus'))}
            />
          </>
        )}
      </SimpleGrid>
      {!isHealth && values.enabled && isRenderHostname(values.url) && keepsRenderServiceAwake(values.intervalSeconds) && <RenderHoursWarning />}
      {!isHealth &&
        values.enabled &&
        env.healthCheck.enabled &&
        values.url &&
        values.url === env.healthCheck.url &&
        env.healthCheck.intervalSeconds <= values.intervalSeconds && (
          <Group gap={6}>
            <Text size="xs" c="dimmed">
              The health check already requests this URL at least as often, so this wake-up adds no extra traffic.
            </Text>
          </Group>
        )}
    </Stack>
  );
}
