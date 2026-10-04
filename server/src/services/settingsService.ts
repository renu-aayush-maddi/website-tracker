import type { Types } from 'mongoose';
import type { SettingsInput, SettingsResponse, UserSettings } from '@wt/shared';
import { Monitor, MonitoringLog, User, type UserDoc } from '../models/index.js';
import { notFound } from '../utils/errors.js';
import type { EmailSender } from './email/emailSender.js';

export async function getUserSettings(userId: Types.ObjectId): Promise<UserSettings> {
  const user = await User.findById(userId, { settings: 1 }).lean<Pick<UserDoc, 'settings'>>();
  if (!user) throw notFound('User');
  return user.settings;
}

export async function getSettingsResponse(
  userId: Types.ObjectId,
  emailSender: EmailSender | null,
): Promise<SettingsResponse> {
  const [settings, logCount, monitors] = await Promise.all([
    getUserSettings(userId),
    MonitoringLog.countDocuments({ userId }),
    Monitor.find({ userId, enabled: true }, { intervalSeconds: 1 }).lean(),
  ]);
  return {
    settings,
    server: {
      emailDeliveryConfigured: emailSender !== null,
      emailProvider: emailSender?.provider ?? 'none',
    },
    storage: { logCount, enabledMonitorIntervals: monitors.map((m) => m.intervalSeconds) },
  };
}

export async function updateSettings(userId: Types.ObjectId, input: SettingsInput): Promise<UserSettings> {
  const user = await User.findById(userId);
  if (!user) throw notFound('User');
  const retentionChanged = user.settings.logRetentionDays !== input.logRetentionDays;
  user.settings = input;
  await user.save();

  if (retentionChanged) {
    // Apply the new retention to existing logs, not just future ones.
    if (input.logRetentionDays === 0) {
      await MonitoringLog.updateMany({ userId }, { $unset: { expiresAt: 1 } });
    } else {
      await MonitoringLog.updateMany({ userId }, [
        {
          $set: {
            expiresAt: { $dateAdd: { startDate: '$startedAt', unit: 'day', amount: input.logRetentionDays } },
          },
        },
      ], { updatePipeline: true });
    }
  }
  return user.settings;
}
