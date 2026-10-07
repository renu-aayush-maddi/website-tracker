import { useState } from 'react';
import { displayHost, initialOf, placeholderGradient } from '../../utils/launchpad';
import classes from './launchpad.module.css';

interface CardArtworkProps {
  name: string;
  url: string | null;
  /** Image URL (or data: URL while previewing). Falls back to the placeholder if missing or broken. */
  imageSrc: string | null;
}

/**
 * The visual part of a website card: background image (or a coloured placeholder),
 * a dark gradient that keeps the text readable on any picture, and the name.
 * It never receives clicks — the card's link sits underneath it.
 */
export function CardArtwork({ name, url, imageSrc }: CardArtworkProps) {
  // Remembers *which* source failed, so a new image automatically gets a fresh chance.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  const showImage = imageSrc !== null && failedSrc !== imageSrc;
  const host = displayHost(url);
  const label = name.trim() || 'Website name';

  return (
    <>
      <div className={classes.artwork} style={showImage ? undefined : { background: placeholderGradient(name || 'x') }} aria-hidden>
        {showImage ? (
          // Decorative: the name is rendered as text, so the picture adds no information for screen readers.
          <img className={classes.image} src={imageSrc} alt="" loading="lazy" decoding="async" onError={() => setFailedSrc(imageSrc)} />
        ) : (
          <span className={classes.placeholderLetter}>{initialOf(name)}</span>
        )}
        <div className={classes.overlay} />
      </div>
      <div className={classes.text}>
        <p className={classes.name}>{label}</p>
        <p className={`${classes.host} ${host ? '' : classes.hostMissing}`}>{host ?? 'No URL yet'}</p>
      </div>
    </>
  );
}
