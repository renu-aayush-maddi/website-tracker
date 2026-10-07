import { Skeleton } from '@mantine/core';
import type { ReactNode } from 'react';
import classes from './launchpad.module.css';

export function WebsiteCardGrid({ children }: { children: ReactNode }) {
  return <ul className={classes.grid}>{children}</ul>;
}

export function GridCell({ children }: { children: ReactNode }) {
  return <li className={classes.cell}>{children}</li>;
}

export function WebsiteGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <ul className={classes.grid} aria-busy="true" aria-label="Loading websites">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className={classes.cell}>
          <Skeleton className={classes.skeleton} />
        </li>
      ))}
    </ul>
  );
}
