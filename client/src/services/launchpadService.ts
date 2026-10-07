import type { UserSettings, WebsiteDto } from '@wt/shared';
import { applyQuickEdit, buildQuickCreateInput, type QuickValues } from '../utils/launchpad';
import { api } from './api';

export type CoverChange = { action: 'keep' } | { action: 'remove' } | { action: 'set'; blob: Blob };

export type QuickSaveRequest =
  | { mode: 'create'; values: QuickValues; cover: CoverChange; defaults: UserSettings['monitoringDefaults'] }
  | {
      mode: 'edit';
      websiteId: string;
      environmentId: string | null;
      values: QuickValues;
      cover: CoverChange;
      defaults: UserSettings['monitoringDefaults'];
    };

export interface QuickSaveResult {
  website: WebsiteDto;
  /** Set when the details were saved but the image step failed, so the caller can say exactly that. */
  coverError: unknown;
}

/**
 * Saves a website from the launchpad's quick form. The website is saved first;
 * an image failure afterwards is reported separately rather than losing the edit.
 */
export async function quickSaveWebsite(request: QuickSaveRequest): Promise<QuickSaveResult> {
  let website: WebsiteDto;
  if (request.mode === 'create') {
    website = await api.websites.create(buildQuickCreateInput(request.values, request.defaults));
  } else {
    const current = await api.websites.get(request.websiteId);
    website = await api.websites.update(
      request.websiteId,
      applyQuickEdit(current, request.environmentId, request.values, request.defaults),
    );
  }

  let coverError: unknown = null;
  try {
    if (request.cover.action === 'set') await api.websites.setCover(website.id, request.cover.blob);
    else if (request.cover.action === 'remove' && website.coverVersion) await api.websites.removeCover(website.id);
  } catch (err) {
    coverError = err;
  }
  return { website, coverError };
}
