import { Text, Tooltip, type TextProps } from '@mantine/core';
import { usePreferences } from '../context/PreferencesContext';

/** Relative time with the absolute time (in the user's zone) on hover. */
export function RelativeTime({ value, fallback = 'never', ...props }: { value: string | null | undefined; fallback?: string } & TextProps) {
  const { fmt } = usePreferences();
  // Inherit the surrounding font size unless a size is given explicitly.
  const inherit = props.size === undefined;
  if (!value) return <Text span c="dimmed" inherit={inherit} {...props}>{fallback}</Text>;
  return (
    <Tooltip label={fmt.dateTime(value)} withArrow openDelay={200}>
      <Text span inherit={inherit} {...props}>
        {fmt.relative(value)}
      </Text>
    </Tooltip>
  );
}
