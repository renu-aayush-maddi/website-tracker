import { Anchor, Group, Text } from '@mantine/core';
import { IconExternalLink } from '@tabler/icons-react';
import { isSafeHttpUrl } from '@wt/shared';

/** Renders stored URLs as links only when they are plain http(s) — never javascript: or data: URLs. */
export function ExternalLink({ href, children, maxWidth }: { href: string | null | undefined; children?: string; maxWidth?: number | string }) {
  if (!href) return <Text c="dimmed">—</Text>;
  if (!isSafeHttpUrl(href)) return <Text>{href}</Text>;
  return (
    <Anchor href={href} target="_blank" rel="noopener noreferrer" size="sm" maw={maxWidth} style={{ display: 'inline-block', wordBreak: 'break-all' }}>
      <Group gap={4} wrap="nowrap" component="span" align="center">
        <span style={maxWidth ? { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } : undefined}>{children ?? href}</span>
        <IconExternalLink size={12} aria-hidden style={{ flexShrink: 0 }} />
      </Group>
    </Anchor>
  );
}
