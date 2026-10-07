import { ActionIcon, Menu } from '@mantine/core';
import { IconActivityHeartbeat, IconDots, IconPencil, IconTrash } from '@tabler/icons-react';
import { Link } from 'react-router';
import { isSafeHttpUrl, type WebsiteSummaryDto } from '@wt/shared';
import { coverUrl } from '../../services/api';
import { statusMeta } from '../../utils/status';
import { cardAriaLabel } from '../../utils/launchpad';
import { StatusIcon } from '../StatusBadge';
import { CardArtwork } from './CardArtwork';
import classes from './launchpad.module.css';

interface WebsiteCardProps {
  site: WebsiteSummaryDto;
  onEdit: (site: WebsiteSummaryDto) => void;
  onDelete: (site: WebsiteSummaryDto) => void;
}

export function WebsiteCard({ site, onEdit, onDelete }: WebsiteCardProps) {
  // Only plain http(s) URLs ever become links; anything else is treated as "no URL".
  const rawUrl = site.primaryEnvironment?.websiteUrl;
  const url = isSafeHttpUrl(rawUrl) ? rawUrl : null;
  const image = site.coverVersion ? coverUrl(site.id, site.coverVersion) : null;
  const health = statusMeta(site.healthStatus);

  return (
    <div className={classes.card}>
      <CardArtwork name={site.name} url={url} imageSrc={image} />

      {/* The whole card is one link. The menu below is a sibling (not a child), so using
          it can never trigger navigation. Without a URL the card opens the edit form instead. */}
      {url ? (
        <a className={classes.link} href={url} target="_blank" rel="noopener noreferrer" aria-label={cardAriaLabel(site.name, url)} />
      ) : (
        <button type="button" className={classes.link} onClick={() => onEdit(site)} aria-label={cardAriaLabel(site.name, null)} />
      )}

      {site.monitoringEnabled && (
        <span className={classes.badge} role="img" aria-label={`Health: ${health.label}`} title={`Health: ${health.label}`}>
          <StatusIcon status={site.healthStatus} size={18} />
        </span>
      )}

      <Menu position="bottom-end" withinPortal shadow="md" width={210} radius="md">
        <Menu.Target>
          <ActionIcon variant="transparent" className={classes.menuButton} aria-label={`Actions for ${site.name}`}>
            <IconDots size={20} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item leftSection={<IconPencil size={16} />} onClick={() => onEdit(site)} py={10}>
            Edit
          </Menu.Item>
          <Menu.Item leftSection={<IconActivityHeartbeat size={16} />} component={Link} to={`/websites/${site.id}`} py={10}>
            Details &amp; monitoring
          </Menu.Item>
          <Menu.Divider />
          <Menu.Item color="red" leftSection={<IconTrash size={16} />} onClick={() => onDelete(site)} py={10}>
            Delete
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </div>
  );
}
