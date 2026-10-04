import { Schema, model, type Types } from 'mongoose';
import {
  ACCOUNT_PROVIDER_VALUES,
  DATABASE_PROVIDER_VALUES,
  ENVIRONMENT_TYPES,
  HOSTING_PROVIDER_VALUES,
  LIFECYCLE_STATUSES,
  REPOSITORY_PROVIDER_VALUES,
  type EnvironmentType,
  type LifecycleStatus,
} from '@wt/shared';

export interface HostingSub {
  provider?: string;
  customProvider?: string;
  url?: string;
  region?: string;
}

export interface DatabaseSub {
  provider?: string;
  customProvider?: string;
  databaseName?: string;
  projectName?: string;
  cluster?: string;
  region?: string;
  accountProvider?: string;
  accountIdentifier?: string;
  dashboardUrl?: string;
  notes?: string;
}

export interface EnvironmentSub {
  _id: Types.ObjectId;
  type: EnvironmentType;
  label?: string;
  websiteUrl?: string;
  backendUrl?: string;
  branch?: string;
  frontendHosting: HostingSub;
  backendHosting: HostingSub;
  database: DatabaseSub;
}

export interface WebsiteDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  name: string;
  description?: string;
  lifecycleStatus: LifecycleStatus;
  tags: string[];
  repository: {
    provider?: string;
    customProvider?: string;
    url?: string;
    defaultBranch?: string;
  };
  notes?: string;
  environments: EnvironmentSub[];
  createdAt: Date;
  updatedAt: Date;
}

const hostingSchema = new Schema<HostingSub>(
  {
    provider: { type: String, enum: HOSTING_PROVIDER_VALUES },
    customProvider: String,
    url: String,
    region: String,
  },
  { _id: false },
);

const databaseSchema = new Schema<DatabaseSub>(
  {
    provider: { type: String, enum: DATABASE_PROVIDER_VALUES },
    customProvider: String,
    databaseName: String,
    projectName: String,
    cluster: String,
    region: String,
    accountProvider: { type: String, enum: ACCOUNT_PROVIDER_VALUES },
    accountIdentifier: String,
    dashboardUrl: String,
    notes: String,
  },
  { _id: false },
);

const environmentSchema = new Schema<EnvironmentSub>({
  type: { type: String, enum: ENVIRONMENT_TYPES, required: true },
  label: String,
  websiteUrl: String,
  backendUrl: String,
  branch: String,
  frontendHosting: { type: hostingSchema, default: () => ({}) },
  backendHosting: { type: hostingSchema, default: () => ({}) },
  database: { type: databaseSchema, default: () => ({}) },
});

const websiteSchema = new Schema<WebsiteDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true },
    description: String,
    lifecycleStatus: { type: String, enum: LIFECYCLE_STATUSES, default: 'ACTIVE' },
    tags: { type: [String], default: [] },
    repository: {
      provider: { type: String, enum: REPOSITORY_PROVIDER_VALUES },
      customProvider: String,
      url: String,
      defaultBranch: String,
    },
    notes: String,
    environments: { type: [environmentSchema], default: [] },
  },
  { timestamps: true },
);

websiteSchema.index({ userId: 1, name: 1 });
websiteSchema.index({ userId: 1, tags: 1 });
websiteSchema.index({ userId: 1, updatedAt: -1 });

export const Website = model<WebsiteDoc>('Website', websiteSchema);
