import type {
  AccountUpdateInput,
  ApiErrorBody,
  ChangePasswordInput,
  CursorPage,
  DashboardDto,
  LoginInput,
  LogDto,
  MonitorDto,
  NotificationDto,
  Paginated,
  RunResultDto,
  SettingsInput,
  SettingsResponse,
  SetupInput,
  SetupStatus,
  StatsSummary,
  TimeseriesResponse,
  UserDto,
  WebsiteDto,
  WebsiteInput,
  WebsiteSummaryDto,
} from '@wt/shared';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Empty means same-origin: the Render rewrite (production) or Vite proxy (development). */
const BASE_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

let unauthorizedHandler: (() => void) | null = null;
export function onUnauthorized(handler: () => void) {
  unauthorizedHandler = handler;
}

export type QueryParams = Record<string, string | number | boolean | string[] | null | undefined>;

export function toQueryString(params: QueryParams = {}): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length > 0) search.set(key, value.join(','));
    } else {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  const isBlob = body instanceof Blob;
  try {
    res = await fetch(`${BASE_URL}/api${path}`, {
      method,
      credentials: 'include',
      headers: body === undefined ? undefined : { 'content-type': isBlob ? body.type : 'application/json' },
      body: body === undefined ? undefined : isBlob ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server. It may be starting up — try again in a moment.');
  }
  if (res.status === 204) return undefined as T;
  const json = (await res.json().catch(() => null)) as ({ data: T } & Partial<ApiErrorBody>) | null;
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/login')) unauthorizedHandler?.();
    const error = json?.error;
    throw new ApiError(res.status, error?.code ?? 'HTTP_ERROR', error?.message ?? `Request failed (${res.status})`, error?.fields);
  }
  return (json as { data: T }).data;
}

/** Same-origin URL of a website's card image; `version` busts the browser cache when the image changes. */
export function coverUrl(websiteId: string, version: string): string {
  return `${BASE_URL}/api/websites/${websiteId}/cover?v=${encodeURIComponent(version)}`;
}

const get = <T>(path: string, params?: QueryParams) => request<T>('GET', `${path}${toQueryString(params)}`);

export const api = {
  auth: {
    setupStatus: () => get<SetupStatus>('/auth/setup-status'),
    setup: (input: SetupInput) => request<UserDto>('POST', '/auth/setup', input),
    login: (input: LoginInput) => request<UserDto>('POST', '/auth/login', input),
    logout: () => request<void>('POST', '/auth/logout'),
    logoutAll: () => request<void>('POST', '/auth/logout-all'),
    me: () => get<UserDto>('/auth/me'),
    changePassword: (input: ChangePasswordInput) => request<void>('PUT', '/auth/password', input),
  },
  account: {
    update: (input: AccountUpdateInput) => request<UserDto>('PATCH', '/account', input),
  },
  websites: {
    list: (params: QueryParams) => get<Paginated<WebsiteSummaryDto>>('/websites', params),
    tags: () => get<string[]>('/websites/tags'),
    get: (id: string) => get<WebsiteDto>(`/websites/${id}`),
    create: (input: WebsiteInput) => request<WebsiteDto>('POST', '/websites', input),
    update: (id: string, input: WebsiteInput) => request<WebsiteDto>('PUT', `/websites/${id}`, input),
    remove: (id: string) => request<void>('DELETE', `/websites/${id}`),
    setCover: (id: string, image: Blob) => request<{ coverVersion: string }>('PUT', `/websites/${id}/cover`, image),
    removeCover: (id: string) => request<void>('DELETE', `/websites/${id}/cover`),
  },
  monitors: {
    setEnabled: (id: string, enabled: boolean) => request<MonitorDto>('PATCH', `/monitors/${id}`, { enabled }),
    run: (id: string) => request<RunResultDto>('POST', `/monitors/${id}/run`),
  },
  dashboard: () => get<DashboardDto>('/dashboard'),
  logs: (params: QueryParams) => get<CursorPage<LogDto>>('/logs', params),
  stats: {
    summary: (params: QueryParams) => get<StatsSummary>('/stats/summary', params),
    timeseries: (params: QueryParams) => get<TimeseriesResponse>('/stats/timeseries', params),
  },
  settings: {
    get: () => get<SettingsResponse>('/settings'),
    update: (input: SettingsInput) => request<SettingsResponse>('PUT', '/settings', input),
    testEmail: () => request<{ recipient: string }>('POST', '/settings/notifications/test'),
  },
  notifications: () => get<NotificationDto[]>('/notifications'),
};

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError || error instanceof Error) return error.message;
  return 'Something went wrong';
}
