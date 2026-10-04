import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusBadge } from './StatusBadge';

const renderBadge = (ui: React.ReactElement) => render(<MantineProvider>{ui}</MantineProvider>);

describe('StatusBadge', () => {
  it.each([
    ['UP', 'Healthy'],
    ['DEGRADED', 'Degraded'],
    ['DOWN', 'Down'],
    ['UNKNOWN', 'Unknown'],
    ['PAUSED', 'Monitoring off'],
  ] as const)('labels %s as "%s" (never colour alone)', (status, label) => {
    renderBadge(<StatusBadge status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('uses delivery wording for wake-ups, not health wording', () => {
    renderBadge(<StatusBadge status="UP" type="WAKE_UP" />);
    expect(screen.getByText('Delivered')).toBeInTheDocument();
    expect(screen.queryByText('Healthy')).not.toBeInTheDocument();
  });
});
