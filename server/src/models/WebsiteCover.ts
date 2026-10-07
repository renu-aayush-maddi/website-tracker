import { Schema, model, type Types } from 'mongoose';

/**
 * Card background image, kept apart from `websites` so list queries never load image bytes.
 * One per website; the browser re-encodes it to a small JPEG before upload.
 */
export interface WebsiteCoverDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  websiteId: Types.ObjectId;
  contentType: string;
  data: Buffer;
  updatedAt: Date;
}

const coverSchema = new Schema<WebsiteCoverDoc>(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    websiteId: { type: Schema.Types.ObjectId, required: true, unique: true },
    contentType: { type: String, required: true },
    data: { type: Buffer, required: true },
    updatedAt: { type: Date, required: true },
  },
  { versionKey: false, collection: 'websiteCovers' },
);

export const WebsiteCover = model<WebsiteCoverDoc>('WebsiteCover', coverSchema);
