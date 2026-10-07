import { ActionIcon, AppShell, Avatar, Burger, Group, Menu, NavLink, ScrollArea, Text, Tooltip, UnstyledButton, useComputedColorScheme, useMantineColorScheme } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconActivity,
  IconFileText,
  IconHome2,
  IconLayoutDashboard,
  IconLogout,
  IconMoon,
  IconSettings,
  IconSun,
  IconTable,
} from '@tabler/icons-react';
import { Suspense } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';
import { LoadingState } from '../components/States';
import { useAuth } from '../context/AuthContext';

const NAV = [
  { to: '/', label: 'Home', icon: IconHome2, exact: true },
  { to: '/dashboard', label: 'Dashboard', icon: IconLayoutDashboard },
  { to: '/websites', label: 'Inventory', icon: IconTable },
  { to: '/monitoring', label: 'Monitoring', icon: IconActivity },
  { to: '/logs', label: 'Logs', icon: IconFileText },
  { to: '/settings', label: 'Settings', icon: IconSettings },
];

export function Logo() {
  return (
    <Group gap={8} wrap="nowrap">
      <img src="/favicon.svg" width={26} height={26} alt="" />
      <Text fw={700} fz={{ base: 'md', xs: 'lg' }} style={{ whiteSpace: 'nowrap' }}>
        Website Tracker
      </Text>
    </Group>
  );
}

export function AppLayout() {
  const [opened, { toggle, close }] = useDisclosure();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { setColorScheme } = useMantineColorScheme();
  const scheme = useComputedColorScheme('light');

  const isActive = (to: string, exact?: boolean) => (exact ? pathname === to : pathname === to || pathname.startsWith(`${to}/`));

  return (
    <AppShell header={{ height: 56 }} navbar={{ width: 232, breakpoint: 'sm', collapsed: { mobile: !opened } }} padding={{ base: 'sm', sm: 'lg' }}>
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" aria-label="Toggle navigation" />
            <UnstyledButton component={Link} to="/" aria-label="Website Tracker home">
              <Logo />
            </UnstyledButton>
          </Group>
          <Group gap="xs" wrap="nowrap">
            <Tooltip label={scheme === 'dark' ? 'Light mode' : 'Dark mode'}>
              <ActionIcon variant="default" size="lg" onClick={() => setColorScheme(scheme === 'dark' ? 'light' : 'dark')} aria-label="Toggle colour scheme">
                {scheme === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
              </ActionIcon>
            </Tooltip>
            <Menu position="bottom-end" width={220}>
              <Menu.Target>
                <UnstyledButton aria-label="Account menu">
                  <Avatar radius="xl" size={34} color="blue" name={user?.name} />
                </UnstyledButton>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>
                  <Text size="sm" fw={600} c="var(--mantine-color-text)" truncate>
                    {user?.name}
                  </Text>
                  <Text size="xs" truncate>
                    {user?.email}
                  </Text>
                </Menu.Label>
                <Menu.Item leftSection={<IconSettings size={16} />} component={Link} to="/settings">
                  Settings
                </Menu.Item>
                <Menu.Item
                  leftSection={<IconLogout size={16} />}
                  onClick={async () => {
                    await logout();
                    navigate('/login');
                  }}
                >
                  Sign out
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="sm">
        <AppShell.Section grow component={ScrollArea}>
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              component={Link}
              to={item.to}
              label={item.label}
              leftSection={<item.icon size={18} stroke={1.7} />}
              active={isActive(item.to, item.exact)}
              onClick={close}
              variant="light"
              style={{ borderRadius: 'var(--mantine-radius-md)' }}
              mb={2}
            />
          ))}
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main>
        <div style={{ maxWidth: 1360, margin: '0 auto' }}>
          <Suspense fallback={<LoadingState />}>
            <Outlet />
          </Suspense>
        </div>
      </AppShell.Main>
    </AppShell>
  );
}
