import argon2 from 'argon2';
import { mongo, type Types } from 'mongoose';
import type { AccountUpdateInput, LoginInput, RegisterInput, SetupInput, SetupStatus, UserDto } from '@wt/shared';
import { config } from '../config/env.js';
import { SystemState, User, type UserDoc } from '../models/index.js';
import { safeEqual } from '../utils/crypto.js';
import { AppError, conflict, forbidden, notFound, unauthorized } from '../utils/errors.js';
import { createSession, revokeAllSessions } from './sessionService.js';

/** OWASP-recommended Argon2id parameters. */
const HASH_OPTIONS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;
const MAX_FAILED_LOGINS = 10;
const LOCKOUT_MS = 15 * 60 * 1000;

export const hashPassword = (password: string) => argon2.hash(password, HASH_OPTIONS);

let dummyHash: Promise<string> | null = null;
/** Verifying against a dummy hash keeps response time the same for unknown emails. */
const getDummyHash = () => (dummyHash ??= hashPassword('dummy-password-for-timing'));

export function toUserDto(user: Pick<UserDoc, '_id' | 'name' | 'email' | 'role' | 'createdAt'>): UserDto {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  };
}

export async function getSetupStatus(): Promise<SetupStatus> {
  const userCount = await User.estimatedDocumentCount();
  return {
    needsSetup: userCount === 0,
    setupEnabled: Boolean(config.SETUP_TOKEN),
    registrationOpen: config.ALLOW_REGISTRATION,
  };
}

/** Creates the first administrator. Requires SETUP_TOKEN so nobody can claim a fresh deployment. */
export async function setupAdmin(input: SetupInput, userAgent?: string) {
  if (!config.SETUP_TOKEN) throw forbidden('Initial setup is disabled. Set SETUP_TOKEN on the server to enable it.');
  if (!safeEqual(input.setupToken, config.SETUP_TOKEN)) throw forbidden('Invalid setup token');
  if ((await User.estimatedDocumentCount()) > 0) throw conflict('Setup has already been completed');
  try {
    // Unique _id makes concurrent setup attempts race-safe.
    await SystemState.create({ _id: 'setup', completedAt: new Date() });
  } catch (err) {
    if (err instanceof mongo.MongoServerError && err.code === 11000) throw conflict('Setup has already been completed');
    throw err;
  }
  const user = await User.create({
    name: input.name,
    email: input.email,
    passwordHash: await hashPassword(input.password),
    role: 'admin',
  });
  const session = await createSession(user._id, userAgent);
  return { user: toUserDto(user), ...session };
}

export async function register(input: RegisterInput, userAgent?: string) {
  if (!config.ALLOW_REGISTRATION) throw forbidden('Registration is disabled');
  if (await User.exists({ email: input.email })) throw conflict('An account with this email already exists');
  const user = await User.create({
    name: input.name,
    email: input.email,
    passwordHash: await hashPassword(input.password),
    role: 'member',
  });
  const session = await createSession(user._id, userAgent);
  return { user: toUserDto(user), ...session };
}

export async function login(input: LoginInput, userAgent?: string) {
  const user = await User.findOne({ email: input.email }).select('+passwordHash');
  if (!user) {
    await argon2.verify(await getDummyHash(), input.password);
    throw unauthorized('Invalid email or password');
  }
  if (user.lockUntil && user.lockUntil > new Date()) {
    const minutes = Math.ceil((user.lockUntil.getTime() - Date.now()) / 60_000);
    throw new AppError(429, 'ACCOUNT_LOCKED', `Too many failed attempts. Try again in ${minutes} minute(s).`);
  }
  if (!(await argon2.verify(user.passwordHash, input.password))) {
    const attempts = user.failedLoginAttempts + 1;
    const locked = attempts >= MAX_FAILED_LOGINS;
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          failedLoginAttempts: locked ? 0 : attempts,
          lockUntil: locked ? new Date(Date.now() + LOCKOUT_MS) : user.lockUntil,
        },
      },
    );
    throw unauthorized('Invalid email or password');
  }

  const update: Record<string, unknown> = { failedLoginAttempts: 0, lockUntil: null, lastLoginAt: new Date() };
  if (argon2.needsRehash(user.passwordHash, HASH_OPTIONS)) update.passwordHash = await hashPassword(input.password);
  await User.updateOne({ _id: user._id }, { $set: update });

  const session = await createSession(user._id, userAgent);
  return { user: toUserDto(user), ...session };
}

async function verifyCurrentPassword(userId: Types.ObjectId, password: string) {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) throw notFound('User');
  if (!(await argon2.verify(user.passwordHash, password))) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Current password is incorrect', {
      currentPassword: 'Current password is incorrect',
    });
  }
  return user;
}

/** Changes the password and revokes every session; returns a fresh session for the caller. */
export async function changePassword(
  userId: Types.ObjectId,
  currentPassword: string,
  newPassword: string,
  userAgent?: string,
) {
  const user = await verifyCurrentPassword(userId, currentPassword);
  user.passwordHash = await hashPassword(newPassword);
  user.passwordChangedAt = new Date();
  await user.save();
  await revokeAllSessions(user._id);
  return createSession(user._id, userAgent);
}

export async function updateAccount(userId: Types.ObjectId, input: AccountUpdateInput): Promise<UserDto> {
  const user = await User.findById(userId);
  if (!user) throw notFound('User');
  if (input.email !== user.email) {
    if (!input.currentPassword) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Enter your current password to change your email', {
        currentPassword: 'Required to change your email',
      });
    }
    await verifyCurrentPassword(userId, input.currentPassword);
    if (await User.exists({ email: input.email, _id: { $ne: userId } })) {
      throw conflict('An account with this email already exists');
    }
  }
  user.name = input.name;
  user.email = input.email;
  await user.save();
  return toUserDto(user);
}
