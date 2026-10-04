import { Group, SegmentedControl } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useState } from 'react';
import { usePreferences } from '../context/PreferencesContext';
import { dayjs } from '../utils/time';

export type RangePreset = '24h' | '7d' | '30d' | '90d' | 'all' | 'custom';

export interface TimeRange {
  preset: RangePreset;
  from?: string;
  to?: string;
}

const PRESET_MS: Record<Exclude<RangePreset, 'all' | 'custom'>, number> = {
  '24h': 24 * 3_600_000,
  '7d': 7 * 86_400_000,
  '30d': 30 * 86_400_000,
  '90d': 90 * 86_400_000,
};

/** Resolves a preset to concrete ISO bounds once, so query keys stay stable between renders. */
export function presetRange(preset: Exclude<RangePreset, 'custom'>): TimeRange {
  if (preset === 'all') return { preset };
  return { preset, from: new Date(Date.now() - PRESET_MS[preset]).toISOString() };
}

export function RangePicker({ value, onChange, allowAll = false }: { value: TimeRange; onChange: (range: TimeRange) => void; allowAll?: boolean }) {
  const { settings } = usePreferences();
  const [dates, setDates] = useState<[string | null, string | null]>([null, null]);

  const presets = [
    { value: '24h', label: '24h' },
    { value: '7d', label: '7d' },
    { value: '30d', label: '30d' },
    { value: '90d', label: '90d' },
    ...(allowAll ? [{ value: 'all', label: 'All' }] : []),
    { value: 'custom', label: 'Custom' },
  ];

  return (
    <Group gap="xs" wrap="wrap">
      <SegmentedControl
        size="sm"
        data={presets}
        value={value.preset}
        onChange={(v) => {
          if (v === 'custom') onChange({ ...value, preset: 'custom' });
          else onChange(presetRange(v as Exclude<RangePreset, 'custom'>));
        }}
        aria-label="Time range"
      />
      {value.preset === 'custom' && (
        <DatePickerInput
          type="range"
          placeholder="Pick dates"
          value={dates}
          maxDate={new Date()}
          allowSingleDateInRange
          miw={220}
          aria-label="Custom date range"
          onChange={(next) => {
            const [start, end] = next as [string | null, string | null];
            setDates([start, end]);
            if (start && end) {
              // Whole days in the user's time zone, end-exclusive.
              const tz = settings.timezone;
              onChange({
                preset: 'custom',
                from: dayjs.tz(start, tz).startOf('day').toISOString(),
                to: dayjs.tz(end, tz).add(1, 'day').startOf('day').toISOString(),
              });
            }
          }}
        />
      )}
    </Group>
  );
}
