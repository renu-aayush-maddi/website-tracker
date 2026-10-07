import type { Types } from 'mongoose';
import { COVER_IMAGE } from '@wt/shared';
import { Website, WebsiteCover, type WebsiteCoverDoc } from '../models/index.js';
import { AppError, badRequest, notFound } from '../utils/errors.js';

/** Identifies the real format from the file's leading bytes — the declared Content-Type is not trusted. */
export function sniffImageType(data: Buffer): (typeof COVER_IMAGE.contentTypes)[number] | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg';
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (data.length >= 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

async function assertOwnsWebsite(userId: Types.ObjectId, websiteId: Types.ObjectId) {
  if (!(await Website.exists({ _id: websiteId, userId }))) throw notFound('Website');
}

export async function saveCover(userId: Types.ObjectId, websiteId: Types.ObjectId, body: unknown): Promise<string> {
  await assertOwnsWebsite(userId, websiteId);
  if (!Buffer.isBuffer(body) || body.length === 0) {
    throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', `Send the image as the request body (${COVER_IMAGE.contentTypes.join(', ')}).`);
  }
  if (body.length > COVER_IMAGE.maxBytes) {
    throw new AppError(413, 'PAYLOAD_TOO_LARGE', `Image must be at most ${Math.round(COVER_IMAGE.maxBytes / 1024)} KB.`);
  }
  const contentType = sniffImageType(body);
  if (!contentType) throw badRequest('The file is not a JPEG, PNG or WebP image');

  const updatedAt = new Date();
  await WebsiteCover.updateOne({ websiteId }, { $set: { userId, contentType, data: body, updatedAt } }, { upsert: true });
  // timestamps:false keeps the website's own updatedAt meaning "its details changed".
  await Website.updateOne({ _id: websiteId, userId }, { $set: { coverUpdatedAt: updatedAt } }, { timestamps: false });
  return updatedAt.toISOString();
}

export async function getCover(userId: Types.ObjectId, websiteId: Types.ObjectId): Promise<WebsiteCoverDoc> {
  const cover = await WebsiteCover.findOne({ websiteId, userId }).lean<WebsiteCoverDoc>();
  if (!cover) throw notFound('Image');
  // lean() hands back a BSON Binary for Buffer fields; normalise so callers always get a real Buffer.
  const { buffer } = cover.data as unknown as { buffer: Uint8Array };
  return { ...cover, data: Buffer.from(buffer) };
}

export async function removeCover(userId: Types.ObjectId, websiteId: Types.ObjectId): Promise<void> {
  await assertOwnsWebsite(userId, websiteId);
  await WebsiteCover.deleteOne({ websiteId, userId });
  await Website.updateOne({ _id: websiteId, userId }, { $unset: { coverUpdatedAt: 1 } }, { timestamps: false });
}
