import { Button, Pagination, Text } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { IconPlus, IconWorldPlus } from '@tabler/icons-react';
import { useState } from 'react';
import type { WebsiteSummaryDto } from '@wt/shared';
import { AddWebsiteTile } from '../components/launchpad/AddWebsiteTile';
import { GridCell, WebsiteCardGrid, WebsiteGridSkeleton } from '../components/launchpad/WebsiteCardGrid';
import { WebsiteCard } from '../components/launchpad/WebsiteCard';
import { WebsiteQuickForm } from '../components/launchpad/WebsiteQuickForm';
import { PageHeader } from '../components/PageHeader';
import { Empty, ErrorState } from '../components/States';
import { useDeleteWebsite, useWebsites } from '../hooks/queries';
import { errorMessage } from '../services/api';

const PAGE_SIZE = 100;

export default function HomePage() {
  const [page, setPage] = useState(1);
  const { data, isPending, error, refetch } = useWebsites({ sort: 'name', page, pageSize: PAGE_SIZE });
  const remove = useDeleteWebsite();
  // `undefined` = closed, `null` = adding, a website = editing it.
  const [formTarget, setFormTarget] = useState<WebsiteSummaryDto | null | undefined>(undefined);
  // Keep the last target while the close animation plays so the form doesn't flash empty.
  const [lastTarget, setLastTarget] = useState<WebsiteSummaryDto | null>(null);

  const openForm = (site: WebsiteSummaryDto | null) => {
    setLastTarget(site);
    setFormTarget(site);
  };

  const confirmDelete = (site: WebsiteSummaryDto) =>
    modals.openConfirmModal({
      title: `Delete ${site.name}?`,
      centered: true,
      children: (
        <Text size="sm">
          This permanently removes the website, its monitors and all of its monitoring history. This cannot be undone.
        </Text>
      ),
      withCloseButton: false,
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red', size: 'md' },
      cancelProps: { size: 'md' },
      groupProps: { grow: true },
      onConfirm: () =>
        remove.mutate(site.id, {
          onSuccess: () => notifications.show({ message: `${site.name} deleted`, color: 'green' }),
          onError: (err) => notifications.show({ title: 'Could not delete', message: errorMessage(err), color: 'red' }),
        }),
    });

  const addButton = (
    <Button size="md" leftSection={<IconPlus size={18} />} onClick={() => openForm(null)}>
      Add website
    </Button>
  );

  return (
    <>
      <PageHeader
        title="My Websites"
        description={data && data.total > 0 ? `${data.total} website${data.total === 1 ? '' : 's'}. Tap a card to open it.` : 'Your personal launchpad.'}
        actions={addButton}
      />

      {isPending ? (
        <WebsiteGridSkeleton />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : data.total === 0 ? (
        <Empty
          icon={<IconWorldPlus size={28} />}
          title="No websites yet"
          description="Add your first website with a name, a link and a background image. It becomes a card you can open with one tap."
          action={
            <Button mt="md" size="md" leftSection={<IconPlus size={18} />} onClick={() => openForm(null)}>
              Add your first website
            </Button>
          }
        />
      ) : (
        <>
          <WebsiteCardGrid>
            {data.items.map((site) => (
              <GridCell key={site.id}>
                <WebsiteCard site={site} onEdit={openForm} onDelete={confirmDelete} />
              </GridCell>
            ))}
            <GridCell>
              <AddWebsiteTile onClick={() => openForm(null)} />
            </GridCell>
          </WebsiteCardGrid>
          {data.total > PAGE_SIZE && (
            <Pagination mt="lg" total={Math.ceil(data.total / PAGE_SIZE)} value={page} onChange={setPage} />
          )}
        </>
      )}

      <WebsiteQuickForm opened={formTarget !== undefined} onClose={() => setFormTarget(undefined)} site={formTarget === undefined ? lastTarget : formTarget} />
    </>
  );
}
