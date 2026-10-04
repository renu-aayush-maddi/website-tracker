import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SettingsInput, WebsiteInput } from '@wt/shared';
import { api, type QueryParams } from '../services/api';

export const keys = {
  dashboard: ['dashboard'] as const,
  websites: (params?: QueryParams) => (params ? (['websites', params] as const) : (['websites'] as const)),
  website: (id: string) => ['website', id] as const,
  tags: ['tags'] as const,
  logs: (params?: QueryParams) => (params ? (['logs', params] as const) : (['logs'] as const)),
  stats: (kind?: string, params?: QueryParams) => ['stats', kind, params].filter((k) => k !== undefined),
  settings: ['settings'] as const,
  notifications: ['notifications'] as const,
};

const DASHBOARD_REFRESH_MS = 30_000;

export const useDashboard = () =>
  useQuery({ queryKey: keys.dashboard, queryFn: api.dashboard, refetchInterval: DASHBOARD_REFRESH_MS });

export const useWebsites = (params: QueryParams) =>
  useQuery({ queryKey: keys.websites(params), queryFn: () => api.websites.list(params), placeholderData: keepPreviousData });

/** Small, unpaginated list used to populate website pickers. */
export const useWebsiteOptions = () =>
  useQuery({
    queryKey: keys.websites({ pageSize: 100, sort: 'name' }),
    queryFn: () => api.websites.list({ pageSize: 100, sort: 'name' }),
    select: (page) => page.items.map((w) => ({ value: w.id, label: w.name })),
  });

export const useWebsite = (id: string | undefined) =>
  useQuery({ queryKey: keys.website(id ?? ''), queryFn: () => api.websites.get(id!), enabled: Boolean(id), refetchInterval: DASHBOARD_REFRESH_MS });

export const useTags = () => useQuery({ queryKey: keys.tags, queryFn: api.websites.tags });

export const useLogs = (params: QueryParams) =>
  useQuery({ queryKey: keys.logs(params), queryFn: () => api.logs(params), placeholderData: keepPreviousData });

export const useStatsSummary = (params: QueryParams, enabled = true) =>
  useQuery({ queryKey: keys.stats('summary', params), queryFn: () => api.stats.summary(params), enabled, placeholderData: keepPreviousData });

export const useTimeseries = (params: QueryParams, enabled = true) =>
  useQuery({ queryKey: keys.stats('timeseries', params), queryFn: () => api.stats.timeseries(params), enabled, placeholderData: keepPreviousData });

export const useSettings = (enabled = true) => useQuery({ queryKey: keys.settings, queryFn: api.settings.get, enabled });

export const useNotifications = () => useQuery({ queryKey: keys.notifications, queryFn: api.notifications });

/** Anything that changes monitoring results or configuration refreshes these views. */
function useInvalidateMonitoring() {
  const qc = useQueryClient();
  return () =>
    Promise.all(
      [keys.dashboard, keys.websites(), ['website'], keys.logs(), ['stats'], keys.tags, keys.settings].map((queryKey) =>
        qc.invalidateQueries({ queryKey }),
      ),
    );
}

export function useSaveWebsite(id?: string) {
  const invalidate = useInvalidateMonitoring();
  return useMutation({
    mutationFn: (input: WebsiteInput) => (id ? api.websites.update(id, input) : api.websites.create(input)),
    onSuccess: () => invalidate(),
  });
}

export function useDeleteWebsite() {
  const invalidate = useInvalidateMonitoring();
  return useMutation({ mutationFn: (id: string) => api.websites.remove(id), onSuccess: () => invalidate() });
}

export function useToggleMonitor() {
  const invalidate = useInvalidateMonitoring();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => api.monitors.setEnabled(id, enabled),
    onSuccess: () => invalidate(),
  });
}

export function useRunMonitor() {
  const invalidate = useInvalidateMonitoring();
  return useMutation({ mutationFn: (id: string) => api.monitors.run(id), onSuccess: () => invalidate() });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SettingsInput) => api.settings.update(input),
    onSuccess: (data) => {
      qc.setQueryData(keys.settings, data);
      void qc.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}
