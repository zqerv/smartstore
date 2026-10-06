import { Prisma, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHash, randomBytes, randomInt } from 'crypto';
import { getMessageProvider } from '../lib/providers/messaging';
import { AppError } from '../utils/errorHandler';
import { config } from '../lib/config';
import { db } from './_db';

const SALT_ROUNDS = 12;
const TOKEN_LIFETIME = '7d';
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

function hashToken(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export interface LoginResult {
  user: {
    id: string;
    email: string;
    phone: string;
    firstName: string;
    lastName: string;
    role: UserRole;
    storeId: string | null;
  };
  token: string;
}

export type RegisterResult = LoginResult;

type AuthUser = {
  id: string;
  email: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  role: UserRole;
  storeId: string | null;
  tokenVersion?: number;
};

function signToken(user: AuthUser): string {
  if (config.jwtSecret.length < 32) {
    throw new AppError('Authentication is not configured', 500);
  }

  return jwt.sign(
    { userId: user.id, role: user.role, storeId: user.storeId ?? undefined, tv: user.tokenVersion ?? 0 },
    config.jwtSecret,
    { expiresIn: TOKEN_LIFETIME }
  );
}

function toLoginResult(user: AuthUser): LoginResult {
  return {
    user: {
      id: user.id,
      email: user.email ?? '',
      phone: user.phone ?? '',
      firstName: user.firstName ?? '',
      lastName: user.lastName ?? '',
      role: user.role,
      storeId: user.storeId,
    },
    token: signToken(user),
  };
}

export class AuthService {
  async register(input: {
    email?: string;
    phone: string;
    password: string;
    firstName?: string;
    lastName?: string;
    storeId?: string;
  }): Promise<RegisterResult> {
    if (config.jwtSecret.length < 32) {
      throw new AppError('Authentication is not configured', 500);
    }

    const email = input.email?.trim().toLowerCase() || undefined;
    const phone = input.phone.trim();
    if (!phone) throw new AppError('Phone is required', 400);

    const password = await bcrypt.hash(input.password, SALT_ROUNDS);
    let user;
    try {
      user = await db.$transaction(async (tx) => {
        if (input.storeId) {
          const store = await tx.store.findUnique({
            where: { id: input.storeId },
            select: { id: true, status: true },
          });
          if (!store || store.status !== 'ACTIVE') {
            throw new AppError('Store not found or inactive', 404);
          }
        }

        const createdUser = await tx.user.create({
          data: {
            email,
            phone,
            password,
            firstName: input.firstName?.trim(),
            lastName: input.lastName?.trim(),
            role: UserRole.CUSTOMER,
          },
        });

        await tx.customer.create({
          data: {
            id: createdUser.id,
            phone,
            email,
            firstName: createdUser.firstName,
            lastName: createdUser.lastName,
          },
        });

        if (input.storeId) {
          await tx.customerStore.create({
            data: { userId: createdUser.id, storeId: input.storeId },
          });
        }

        return createdUser;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError('An account already exists with this email or phone', 409);
      }
      throw error;
    }

    return toLoginResult(user);
  }

  async login(input: {
    email?: string;
    phone?: string;
    password: string;
  }): Promise<LoginResult> {
    const email = input.email?.trim().toLowerCase();
    const phone = input.phone?.trim();
    if (!email && !phone) throw new AppError('Email or phone is required', 400);

    const user = await db.user.findFirst({
      where: email && phone ? { email, phone } : email ? { email } : { phone },
    });

    if (!user || !(await bcrypt.compare(input.password, user.password))) {
      throw new AppError('Invalid credentials', 401);
    }
    if (!user.isActive) throw new AppError('Account is inactive', 403);

    const updatedUser = await db.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    return toLoginResult(updatedUser);
  }

  async platformAdminLogin(input: { email: string; password: string }) {
    const result = await this.login({
      email: input.email,
      password: input.password,
    });
    if (result.user.role !== UserRole.PLATFORM_ADMIN) {
      throw new AppError('Invalid credentials', 401);
    }
    return result;
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<string> {
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('User not found', 404);
    if (!(await bcrypt.compare(currentPassword, user.password))) {
      throw new AppError('Current password is incorrect', 400);
    }
    if (currentPassword === newPassword) {
      throw new AppError('New password must be different from current password', 400);
    }

    await db.user.update({
      where: { id: userId },
      data: {
        password: await bcrypt.hash(newPassword, SALT_ROUNDS),
        tokenVersion: { increment: 1 },
      },
    });
    const refreshed = await db.user.findUniqueOrThrow({ where: { id: userId } });
    return signToken(refreshed);
  }

  async logout(userId: string): Promise<void> {
    await db.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } });
  }

  async refresh(userId: string): Promise<string> {
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) throw new AppError('Invalid token', 401);
    return signToken(user);
  }

  // Creates a single-use reset token. Only its SHA-256 hash is stored.
  async issuePasswordResetToken(identifier: string): Promise<{ token: string; userId: string; email: string | null; phone: string | null } | null> {
    const value = identifier.trim();
    if (!value) return null;
    const user = await db.user.findFirst({
      where: { OR: [{ email: value.toLowerCase() }, { phone: value }], isActive: true },
    });
    if (!user) return null;
    await db.authToken.deleteMany({ where: { userId: user.id, type: 'PASSWORD_RESET', usedAt: null } });
    const token = randomBytes(32).toString('hex');
    await db.authToken.create({
      data: {
        userId: user.id,
        type: 'PASSWORD_RESET',
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    });
    return { token, userId: user.id, email: user.email, phone: user.phone };
  }

  async requestPasswordReset(identifier: string): Promise<void> {
    const issued = await this.issuePasswordResetToken(identifier);
    if (!issued) return;
    const channel = issued.email ? 'email' : 'sms';
    await getMessageProvider().send({
      channel,
      to: (issued.email ?? issued.phone) as string,
      subject: 'SmartStore password reset',
      body: `Your SmartStore password reset code is ${issued.token}. It expires in 30 minutes.`,
    });
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const record = await db.authToken.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!record || record.type !== 'PASSWORD_RESET' || record.usedAt || record.expiresAt < new Date()) {
      throw new AppError('Reset token is invalid or expired', 400);
    }
    const password = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await db.$transaction(async (tx) => {
      const claimed = await tx.authToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (claimed.count !== 1) throw new AppError('Reset token is invalid or expired', 400);
      await tx.user.update({
        where: { id: record.userId },
        data: { password, tokenVersion: { increment: 1 } },
      });
    });
  }

  async requestPhoneOtp(userId: string): Promise<{ delivered: boolean }> {
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user?.phone) throw new AppError('Phone number not set', 400);
    await db.authToken.deleteMany({ where: { userId, type: 'PHONE_OTP', usedAt: null } });
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await db.authToken.create({
      data: {
        userId,
        type: 'PHONE_OTP',
        tokenHash: hashToken(`${userId}:${code}`),
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
      },
    });
    const result = await getMessageProvider().send({
      channel: 'sms',
      to: user.phone,
      body: `Your SmartStore verification code is ${code}. It expires in 10 minutes.`,
    });
    return { delivered: result.delivered };
  }

  async verifyPhoneOtp(userId: string, code: string): Promise<void> {
    const record = await db.authToken.findFirst({
      where: { userId, type: 'PHONE_OTP', usedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!record || record.expiresAt < new Date() || record.attempts >= OTP_MAX_ATTEMPTS) {
      throw new AppError('Verification code is invalid or expired', 400);
    }
    if (record.tokenHash !== hashToken(`${userId}:${code}`)) {
      await db.authToken.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } });
      throw new AppError('Verification code is invalid or expired', 400);
    }
    await db.$transaction([
      db.authToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      db.user.update({ where: { id: userId }, data: { isPhoneVerified: true } }),
    ]);
  }

  async getUserById(userId: string) {
    return db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        avatar: true,
        role: true,
        storeId: true,
        isActive: true,
        isEmailVerified: true,
        isPhoneVerified: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }
}

export const authService = new AuthService();
