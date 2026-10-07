import { COVER_IMAGE } from '@wt/shared';

export const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
/** Re-encode until the result is comfortably under the server limit. */
const TARGET_BYTES = Math.floor(COVER_IMAGE.maxBytes * 0.7);

export interface PreparedImage {
  blob: Blob;
  /** data: URL for the preview (blob: URLs are blocked by the site's CSP). */
  dataUrl: string;
}

export class ImageError extends Error {}

export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new ImageError('Could not read the file'));
    reader.readAsDataURL(blob);
  });
}

async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; release: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      // Honour the camera's rotation so phone photos aren't sideways.
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      // fall through to the <img> path
    }
  }
  const dataUrl = await readAsDataUrl(file);
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new ImageError('This image could not be opened. Try a JPEG, PNG or WebP file.'));
    img.src = dataUrl;
  });
  return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => undefined };
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new ImageError('Could not process the image'))), 'image/jpeg', quality);
  });
}

/**
 * Downscales and re-encodes any picture to a small JPEG. This keeps uploads fast on
 * mobile data, stays under the server limit, and drops camera metadata (such as GPS).
 */
export async function prepareCoverImage(file: File): Promise<PreparedImage> {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
    throw new ImageError('Choose a JPEG, PNG or WebP image.');
  }
  if (file.size > MAX_SOURCE_BYTES) throw new ImageError('That image is too large. Choose one under 25 MB.');

  const decoded = await decode(file);
  try {
    let { width, height } = fitWithin(decoded.width, decoded.height, COVER_IMAGE.maxDimension);
    for (let attempt = 0; attempt < 4; attempt++) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new ImageError('Your browser cannot process images.');
      ctx.fillStyle = '#ffffff'; // JPEG has no transparency
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(decoded.source, 0, 0, width, height);
      for (const quality of [0.85, 0.75, 0.65, 0.5]) {
        const blob = await toJpeg(canvas, quality);
        if (blob.size <= TARGET_BYTES) return { blob, dataUrl: await readAsDataUrl(blob) };
      }
      width = Math.max(1, Math.round(width * 0.75));
      height = Math.max(1, Math.round(height * 0.75));
    }
    throw new ImageError('Could not make this image small enough. Try a different one.');
  } finally {
    decoded.release();
  }
}
