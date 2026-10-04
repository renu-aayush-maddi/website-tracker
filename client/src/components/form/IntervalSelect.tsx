import { Group, NumberInput, Select } from '@mantine/core';
import { useState } from 'react';
import { INTERVAL_PRESETS, LIMITS } from '@wt/shared';

interface IntervalSelectProps {
  label: string;
  value: number;
  onChange: (seconds: number) => void;
  error?: React.ReactNode;
}

export function IntervalSelect({ label, value, onChange, error }: IntervalSelectProps) {
  const isPreset = INTERVAL_PRESETS.some((p) => p.seconds === value);
  const [custom, setCustom] = useState(!isPreset);
  return (
    <Group grow align="flex-start" gap="xs" preventGrowOverflow={false}>
      <Select
        label={label}
        data={[...INTERVAL_PRESETS.map((p) => ({ value: String(p.seconds), label: p.label })), { value: 'custom', label: 'Custom…' }]}
        value={custom ? 'custom' : String(value)}
        allowDeselect={false}
        onChange={(v) => {
          if (v === 'custom') {
            setCustom(true);
          } else if (v) {
            setCustom(false);
            onChange(Number(v));
          }
        }}
        error={custom ? undefined : error}
      />
      {custom && (
        <NumberInput
          label="Minutes"
          min={LIMITS.intervalSeconds.min / 60}
          max={LIMITS.intervalSeconds.max / 60}
          clampBehavior="strict"
          allowDecimal={false}
          value={Math.round(value / 60)}
          onChange={(v) => onChange((Number(v) || 1) * 60)}
          error={error}
        />
      )}
    </Group>
  );
}
