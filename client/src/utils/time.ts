import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import type { DateFormat, TimeFormat } from '@wt/shared';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(relativeTime);

export interface TimePreferences {
  timezone: string;
  dateFormat: DateFormat;
  timeFormat: TimeFormat;
}

/** All timestamps arrive as UTC ISO strings; these render them in the user's chosen zone. */
export function createFormatters(prefs: TimePreferences) {
  const timePattern = prefs.timeFormat === '12h' ? 'hh:mm:ss A' : 'HH:mm:ss';
  const shortTime = prefs.timeFormat === '12h' ? 'hh:mm A' : 'HH:mm';
  const inZone = (iso: string | Date) => dayjs(iso).tz(prefs.timezone);
  return {
    dateTime: (iso: string | Date | null | undefined) => (iso ? inZone(iso).format(`${prefs.dateFormat} ${timePattern}`) : '—'),
    date: (iso: string | Date | null | undefined) => (iso ? inZone(iso).format(prefs.dateFormat) : '—'),
    time: (iso: string | Date | null | undefined) => (iso ? inZone(iso).format(shortTime) : '—'),
    /** Compact label for chart axes. */
    chartLabel: (iso: string, unit: 'minute' | 'hour' | 'day' | 'week') =>
      unit === 'minute' || unit === 'hour' ? inZone(iso).format(`DD MMM ${shortTime}`) : inZone(iso).format('DD MMM'),
    relative: (iso: string | Date | null | undefined) => (iso ? dayjs(iso).fromNow() : 'never'),
  };
}

export type Formatters = ReturnType<typeof createFormatters>;

export function browserTimeZones(): string[] {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return ['UTC', 'Asia/Kolkata'];
  }
}

export { dayjs };
