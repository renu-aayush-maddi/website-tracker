import { Button } from '@mantine/core';
import { IconMapPinOff } from '@tabler/icons-react';
import { Link } from 'react-router';
import { Empty } from '../components/States';

export default function NotFoundPage() {
  return (
    <Empty
      icon={<IconMapPinOff size={28} />}
      title="Page not found"
      description="The page you were looking for does not exist."
      action={
        <Button component={Link} to="/" variant="default" mt="md">
          Back to dashboard
        </Button>
      }
    />
  );
}
