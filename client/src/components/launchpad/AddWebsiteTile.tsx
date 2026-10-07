import { IconPlus } from '@tabler/icons-react';
import classes from './launchpad.module.css';

export function AddWebsiteTile({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className={classes.addTile} onClick={onClick}>
      <span className={classes.addIcon} aria-hidden>
        <IconPlus size={22} />
      </span>
      Add website
    </button>
  );
}
