import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { WebsiteSummaryDto } from '@wt/shared';
import { WebsiteCard } from './WebsiteCard';

const site = (overrides: Partial<WebsiteSummaryDto> = {}): WebsiteSummaryDto => ({
  id: 'abc123abc123abc123abc123',
  name: 'GitHub',
  lifecycleStatus: 'ACTIVE',
  tags: [],
  healthStatus: 'PAUSED',
  primaryEnvironment: { id: 'env1', type: 'PRODUCTION', websiteUrl: 'https://www.github.com/me' },
  environmentTypes: ['PRODUCTION'],
  monitoringEnabled: false,
  wakeUpEnabled: false,
  lastResponseMs: null,
  lastCheckedAt: null,
  primaryHealthMonitorId: null,
  primaryWakeUpMonitorId: null,
  coverVersion: null,
  updatedAt: '2026-10-01T00:00:00.000Z',
  ...overrides,
});

function setup(overrides: Partial<WebsiteSummaryDto> = {}) {
  const onEdit = vi.fn();
  const onDelete = vi.fn();
  const view = render(
    <MantineProvider env="test">
      <MemoryRouter>
        <WebsiteCard site={site(overrides)} onEdit={onEdit} onDelete={onDelete} />
      </MemoryRouter>
    </MantineProvider>,
  );
  return { onEdit, onDelete, ...view };
}

describe('WebsiteCard', () => {
  it('shows the name (not the raw URL) and a tidy hostname', () => {
    setup();
    expect(screen.getByText('GitHub')).toBeInTheDocument();
    expect(screen.getByText('github.com')).toBeInTheDocument();
    expect(screen.queryByText(/https:\/\//)).not.toBeInTheDocument();
  });

  it('is one link that opens the website safely in a new tab', () => {
    setup();
    const link = screen.getByRole('link', { name: /open github/i });
    expect(link).toHaveAttribute('href', 'https://www.github.com/me');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.getAttribute('rel')).toContain('noreferrer');
  });

  it('keeps the actions menu outside the link, so using it cannot navigate', async () => {
    const { onEdit } = setup();
    const link = screen.getByRole('link', { name: /open github/i });
    const menuButton = screen.getByRole('button', { name: /actions for github/i });
    expect(link.contains(menuButton)).toBe(false);
    expect(menuButton.contains(link)).toBe(false);

    await userEvent.click(menuButton);
    await userEvent.click(await screen.findByRole('menuitem', { name: /edit/i }));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit.mock.calls[0]![0].id).toBe('abc123abc123abc123abc123');
    // The click on the menu never reached the link.
    expect(link).toHaveAttribute('href', 'https://www.github.com/me');
  });

  it('offers Edit, Details and Delete, and Delete calls back', async () => {
    const { onDelete } = setup();
    await userEvent.click(screen.getByRole('button', { name: /actions for github/i }));
    expect(await screen.findByRole('menuitem', { name: /details/i })).toHaveAttribute('href', '/websites/abc123abc123abc123abc123');
    await userEvent.click(await screen.findByRole('menuitem', { name: /delete/i }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('shows an accessible health indicator only when monitoring is on', () => {
    const { unmount } = setup();
    expect(screen.queryByRole('img', { name: /health/i })).not.toBeInTheDocument();
    unmount();
    setup({ monitoringEnabled: true, healthStatus: 'DOWN' });
    expect(screen.getByRole('img', { name: 'Health: Down' })).toBeInTheDocument();
  });

  it('without a URL, the card opens the editor instead of linking nowhere', () => {
    const { onEdit } = setup({ primaryEnvironment: { id: 'env1', type: 'PRODUCTION' } });
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('No URL yet')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /has no url yet/i }));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('refuses to link unsafe URLs', () => {
    setup({ primaryEnvironment: { id: 'env1', type: 'PRODUCTION', websiteUrl: 'javascript:alert(1)' } });
    // Treated as having no URL: no link at all, and the card opens the editor instead.
    expect(document.querySelector('a')).toBeNull();
    expect(screen.getByText('No URL yet')).toBeInTheDocument();
  });

  it('uses the cover endpoint, cache-busted by version, as a decorative background', () => {
    const { container } = setup({ coverVersion: '2026-10-08T10:00:00.000Z' });
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('src', '/api/websites/abc123abc123abc123abc123/cover?v=2026-10-08T10%3A00%3A00.000Z');
    expect(img).toHaveAttribute('alt', '');
  });

  it('falls back to the placeholder when the image fails to load', () => {
    const { container } = setup({ coverVersion: 'v1' });
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('G', { selector: 'span' })).toBeInTheDocument();
  });
});
