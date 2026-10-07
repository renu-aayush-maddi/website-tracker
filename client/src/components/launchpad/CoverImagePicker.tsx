import { Alert, Button, FileButton, Group, Loader, Stack, Text } from '@mantine/core';
import { IconAlertCircle, IconPhoto, IconPhotoPlus, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { COVER_IMAGE } from '@wt/shared';
import { ImageError, prepareCoverImage, type PreparedImage } from '../../utils/image';
import { CardArtwork } from './CardArtwork';
import classes from './launchpad.module.css';

interface CoverImagePickerProps {
  name: string;
  url: string | null;
  /** Image currently shown in the preview (existing, newly chosen, or none). */
  imageSrc: string | null;
  onPick: (image: PreparedImage) => void;
  onRemove: () => void;
}

/** Live card preview plus "choose / change / remove" controls. `accept="image/*"` lets phones offer camera or gallery. */
export function CoverImagePicker({ name, url, imageSrc, onPick, onRemove }: CoverImagePickerProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      onPick(await prepareCoverImage(file));
    } catch (err) {
      setError(err instanceof ImageError ? err.message : 'Could not use that image. Try a different one.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack gap="xs">
      <Text size="sm" fw={500}>
        Background image
      </Text>
      <div className={classes.preview}>
        <CardArtwork name={name} url={url} imageSrc={imageSrc} />
        {busy && (
          <Group justify="center" pos="absolute" inset={0} bg="rgba(2,6,23,0.55)" style={{ zIndex: 2 }}>
            <Loader color="white" size="sm" aria-label="Processing image" />
          </Group>
        )}
      </div>
      <Group gap="xs" grow preventGrowOverflow={false}>
        <FileButton onChange={handleFile} accept={COVER_IMAGE.contentTypes.join(',') + ',image/heic,image/heif'}>
          {(props) => (
            <Button {...props} variant="default" size="md" leftSection={imageSrc ? <IconPhoto size={18} /> : <IconPhotoPlus size={18} />} loading={busy}>
              {imageSrc ? 'Change image' : 'Choose image'}
            </Button>
          )}
        </FileButton>
        {imageSrc && (
          <Button variant="subtle" color="red" size="md" leftSection={<IconTrash size={18} />} onClick={onRemove} disabled={busy}>
            Remove
          </Button>
        )}
      </Group>
      <Text size="xs" c="dimmed">
        Optional. Large photos are resized automatically. Without one, a colour background is used.
      </Text>
      {error && (
        <Alert color="red" variant="light" icon={<IconAlertCircle size={16} />} p="xs" role="alert">
          {error}
        </Alert>
      )}
    </Stack>
  );
}
