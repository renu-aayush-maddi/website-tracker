import { Types } from 'mongoose';
import { notFound } from './errors.js';

/** Parses a route id; malformed ids are reported as "not found" rather than leaking validation details. */
export function parseId(id: string | string[] | undefined, what = 'Resource'): Types.ObjectId {
  if (typeof id !== 'string' || !/^[a-f0-9]{24}$/i.test(id)) throw notFound(what);
  return new Types.ObjectId(id);
}

export const iso = (date: Date | null | undefined): string | null => (date ? date.toISOString() : null);
