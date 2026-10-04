import { useMantineColorScheme } from '@mantine/core';
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { DEFAULT_SETTINGS, type UserSettings } from '@wt/shared';
import { useSettings } from '../hooks/queries';
import { createFormatters, type Formatters } from '../utils/time';
import { useAuth } from './AuthContext';

interface PreferencesValue {
  settings: UserSettings;
  fmt: Formatters;
}

const PreferencesContext = createContext<PreferencesValue | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { data } = useSettings(Boolean(user));
  const settings = data?.settings ?? (DEFAULT_SETTINGS as UserSettings);
  const { setColorScheme } = useMantineColorScheme();

  useEffect(() => {
    if (data) setColorScheme(data.settings.theme === 'system' ? 'auto' : data.settings.theme);
  }, [data, setColorScheme]);

  const value = useMemo(() => ({ settings, fmt: createFormatters(settings) }), [settings]);
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used inside PreferencesProvider');
  return ctx;
}
